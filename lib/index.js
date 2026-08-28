// @wwskills/dsh-agent-evolve — Host-side plugin entry
//
// Cordis plugin descriptor for the @wwskills/dsh-agent-evolve package.
//
// Mounts:
//   • SQLite (WAL + FTS5 triggers) via openDatabase() from db.js
//   • session/event listener — user/message runs signal-word detection
//     and triggers lesson extraction. turn/end branches are no-ops:
//     the DSH harness never emits `turn/end`, so all turn-driven
//     scheduling has moved to the `agent/turn-stopping` listener
//     (P0.1 / P3.20).
//   • agent/turn-stopping listener (P0.1) — serial event, fires
//     just before a turn closes. Deduplicates by
//     `${sessionId}:${turnId}` via `state.pendingTurns` (Set) and
//     schedules memory / rule / persona extraction through the same
//     TaskQueue. Fire-and-forget: the listener returns immediately
//     so turn close is never blocked.
//   • tools/result listener (P2.15) — captures tool-execution
//     errors as `tool_error` correction rows for later rule
//     promotion.
//   • agent/error listener (P2.16) — captures harness-level
//     errors the same way.
//   • systemPrompt.context() providers (P0.4) — when the
//     `systemPrompt` service is registered, we add two providers
//     (Known Pitfalls @ order 900, User Persona @ order 950). When
//     it isn't, we drop down to the agent/pre-step waterfall
//     listener below.
//   • agent/pre-step waterfall — M1 (rules) + M2 (persona) injection.
//     Acts as fallback for systemPrompt providers. Skipped when
//     state.useSystemPrompt is true to avoid double-injection.
//   • LLM extraction queue — TaskQueue with concurrency=1 + 30s
//     per-task timeout. LLM calls go through streamLlm (the llm
//     service exposes only .stream(), not .chat()). streamLlm now
//     passes `{ provider, model, messages, signal }` per the
//     GenerateOptions interface (P0.3 — the prior `{ input: {...} }`
//     shape was rejected by the runtime as missing `provider`).
//   • Embedding auto-detect — fire-and-forget probe of local Ollama
//     (with `typeof fetch === 'function'` guard for hosts without
//     Node 18+ global fetch, P0.7). Prefers `llm.listModels()` when
//     available (P2.19). Failure silently degrades to keyword
//     matching.
//   • Daily decay timer — native setInterval (timer is a mixin, not
//     a service; the prior M0 `ctx.interval()` works on some DSH
//     builds but native setInterval is portable).
//   • Settings namespace — DSH settings service so the WebUI can
//     read/write live config that survives restart.
//   • Web API — registered via ws.register({...}). We rely on
//     `inject: ['webServer']` in the plugin descriptor so cordis
//     blocks apply() until webServer is bound; the prior
//     `internal/service` listener (P0.5) has been removed because
//     it was redundant with the inject contract and unreliable on
//     some DSH builds.
//
// All long-lived resources are tracked through ctx.effect() with
// explicit disposers. apply() is synchronous (returns undefined).

import Schema from '@deepseek-ai/schemastery';
import {
  openDatabase,
  newId,
  now,
  resolveDbPath,
  listRules,
  getRule,
  updateRule,
  approveRule,
  rejectRule,
  promoteRule,
  archiveRule,
  archiveStaleRules,
  incrementRuleHit,
  getRulesForInjection,
  countPendingCorrections,
  listPendingCorrections,
  listCorrectionsByIds,
  // M2 additions
  listMemories,
  getMemory,
  deleteMemory,
  archiveMemory,
  searchMemories,
  touchMemory,
  getPersona,
  updatePersonaKey,
  getPersonaLatestUpdatedAt,
  upsertMemories,
  markMemorySuperseded,
  getActiveMemoriesForPersona,
  isPersonaStale,
  VALID_RULE_STATUS,
  VALID_RULE_CATEGORIES,
  VALID_MEMORY_STATUS,
  VALID_MEMORY_TYPES,
  VALID_PERSONA_KEYS,
} from './db.js';
import {
  matchSignalWords,
  extractUserText,
  extractLesson,
  insertCorrection,
  markCorrectionIgnored,
  markCorrectionPromoted,
  listCorrections,
  getCorrection,
  aggregateStats,
  // P3.26 i18n extension: use the resolver + per-locale constants instead
  // of the legacy combined DEFAULT_SIGNAL_WORDS so users can opt into
  // zh-only or en-only via `signalWordsLocale`.
  resolveSignalWords,
  DEFAULT_SIGNAL_WORDS,
  DEFAULT_SIGNAL_WORDS_ZH,
  DEFAULT_SIGNAL_WORDS_EN,
  // P3.25 monthly stats: optional bumpCorrectionUsage for places where
  // we insert corrections outside the corrections.js wrapper (e.g.
  // tools/result and agent/error listeners below).
  bumpCorrectionUsage,
} from './corrections.js';
import {
  TaskQueue,
  streamLlm,
  buildMemoryPrompt,
  parseJsonResponse,
  buildRulePrompt,
  extractRule,
  buildPersonaPrompt,
  extractPersona,
} from './extract.js';

// ────────────────────────────────────────────────────────────────────────────
// Plugin descriptor
// ────────────────────────────────────────────────────────────────────────────

const name = 'agent-evolve';

// Hard deps: cordis will not call apply() until these services are
// registered in the container. `timer` is a mixin — its methods
// (ctx.interval / ctx.timeout) live directly on ctx, but we still
// list it here so cordis waits for the mixin to be applied.
const inject = ['llm', 'settings', 'webServer'];

// Web UI is mounted from lib/client.js (Client realm) — separate entry,
// separate Cordis bundle. Host side has no React.

// ────────────────────────────────────────────────────────────────────────────
// Config schema (Schemastery, for DSH settings namespace)
// ────────────────────────────────────────────────────────────────────────────

const Config = Schema.object({
  dbPath: Schema.string().default(''),
  enabled: Schema.boolean().default(true),
  batchSize: Schema.natural().default(3),
  // P0.3 fix: DSH llm.stream() requires `provider` (adapter route id)
  // AND `model`. Both are needed to select the adapter and target model.
  // `provider` defaults to '' so users without a configured provider get
  // a graceful no-op (streamLlm throws and the call is caught upstream).
  provider: Schema.string().default(''),
  model: Schema.string().default(''),
  llmTimeoutMs: Schema.natural().default(30000),
  ruleThreshold: Schema.natural().default(5),
  ruleTokenBudget: Schema.natural().default(800),
  personaEverySessions: Schema.natural().default(50),
  personaEveryMs: Schema.natural().default(604800000),
  signalWords: Schema.array(Schema.string()).default([]),
  // P3.26: signal-words locale selector. 'auto' (default) preserves the
  // combined zh+en fallback so existing installs keep working. 'zh' /
  // 'en' use the per-locale built-in defaults. `signalWords` (when
  // non-empty) still wins over the locale default.
  signalWordsLocale: Schema.string().default('auto'),
  embedding: Schema.object({
    autoDetect: Schema.boolean().default(true),
    ollamaBaseUrl: Schema.string().default('http://127.0.0.1:11434'),
    preferredModel: Schema.string().default('bge-m3'),
    timeoutMs: Schema.natural().default(1000),
  }).default({}),
});

// ────────────────────────────────────────────────────────────────────────────
// apply() — synchronous entry, mirrors dsh-web-search-providers / dsh-long-memory
// ────────────────────────────────────────────────────────────────────────────

function apply(ctx, config = {}) {
  // Normalise / fill defaults. The cordis config object arrives already
  // merged across patch layers; we still coalesce missing keys so the
  // rest of apply() can assume a stable shape.
  const cfg = normaliseConfig(config);

  // ── 1. SQLite ────────────────────────────────────────────────────────
  const db = openDatabase(resolveDbCfgPath(cfg.dbPath));
  ctx.effect(() => () => {
    try { db.close(); } catch { /* best effort */ }
  }, 'agent-evolve: db cleanup');

  // ── 2. Shared runtime state (closure for handlers) ───────────────────
  const state = {
    cfg,
    db,
    extractQueue: null,
    embeddingProvider: null,
    settingsHandle: null,
    // P1.9: turn/event dedup is no longer counter-based. The
    // `agent/turn-stopping` listener uses `pendingTurns` (a Set keyed
    // by `${sessionId}:${turnId}`) so replayed events get a clean
    // idempotency boundary. We keep `turnCount` for the batchSize
    // gate but drop the brittle lastProcessedSeq counter.
    turnCount: 0,
    // M2 — persona rebuild tracking
    lastSessionId: null,
    personaSessionCount: 0,
    // P3.20 — concurrency control for agent/turn-stopping. Keyed by
    // `${sessionId}:${turnId}` so the same turn never queues twice
    // (the harness may emit the event on multiple listeners).
    pendingTurns: new Set(),
    // P3.21 — rule-injection cache. Bumped whenever the rules table is
    // mutated (approve / reject / promote / edit) so the next
    // agent/pre-step pulls fresh data.
    rulesCache: null,
    rulesCacheVersion: 0,
    // Convenience counter so buildPitfallsContext can short-circuit when
    // nothing changed since the last build. Monotonically increasing;
    // never decremented.
    rulesCacheDirtyTick: 0,
  };

  // ── 3. Extraction queue ──────────────────────────────────────────────
  state.extractQueue = new TaskQueue({ concurrency: 1, timeout: cfg.llmTimeoutMs });
  ctx.effect(() => () => state.extractQueue.dispose(), 'agent-evolve: extract queue');

  // ── 4. Embedding auto-detect (async, non-blocking) ───────────────────
  // P2.19: pass the llm service so resolveEmbeddingProvider can prefer
  // `llm.listModels?.()` before falling back to the Ollama probe.
  resolveEmbeddingProvider(cfg.embedding, _safeGet(ctx, 'llm')).then((result) => {
    state.embeddingProvider = result;
    if (result) {
      console.log(`[agent-evolve] embedding enabled: ${result.model} (${result.provider})`);
    } else {
      console.log('[agent-evolve] embedding not available, using keyword matching');
    }
  }).catch(() => { /* silent degrade */ });

  // ── 5. session/event listener ────────────────────────────────────────
  const offSession = ctx.on('session/event', (session, event) => {
    try {
      handleSessionEvent(ctx, state, session, event);
    } catch (e) {
      console.warn('[agent-evolve] session/event handler crashed:', e?.message || e);
    }
  }, { global: true });
  // ctx.on auto-disposes on fiber unload, but we register explicitly
  // so the dispose audit (`ctx.effect` consumers) shows the full set.
  ctx.effect(() => (typeof offSession === 'function' ? offSession : () => {}),
    'agent-evolve: session listener');

  // ── 5a. tools/result — capture tool execution errors (P2.15) ────────────────
  // Runs alongside the existing session/event listener. When a tool
  // call returns with status=error (or isFailure=true), we record a
  // correction row so the LLM extraction pipeline can later promote
  // a common pattern into a rule. Wrapped in try-catch — a bad event
  // payload must never bring down the host.
  ctx.on('tools/result', (exec, result) => {
    try {
      handleToolResult(ctx, state, exec, result);
    } catch (e) {
      console.warn('[agent-evolve] tools/result handler crashed:', e?.message || e);
    }
  }, { global: true });

  // ── 5a2. agent/error — capture agent-level errors (P2.16) ────────────────
  // The harness fires this when a step / turn throws. We persist a
  // minimal correction row keyed on the error message + step id so the
  // existing rule-extraction pipeline picks it up later. Unlike
  // tools/result, we don't have an exec description — the row is more
  // sparse but still useful for pattern detection.
  ctx.on('agent/error', (payload) => {
    try {
      handleAgentError(state, payload);
    } catch (e) {
      console.warn('[agent-evolve] agent/error handler crashed:', e?.message || e);
    }
  }, { global: true });

  // ── 5a3. agent/turn-stopping — concurrency-controlled extraction (P3.20) ────────────────
  // P0/P1 lane will eventually migrate the turn/end handling off the
  // session/event listener onto this serial event. We add the listener
  // now so the concurrency control + queue mechanics are in place when
  // that migration lands. The session/event handler still works for
  // existing installs; once both fire, the Set dedups them.
  ctx.on('agent/turn-stopping', (payload) => {
    try {
      handleTurnStopping(ctx, state, payload);
    } catch (e) {
      console.warn('[agent-evolve] agent/turn-stopping handler crashed:', e?.message || e);
    }
  }, { global: true });

  // ── 5b-pre. systemPrompt.context() provider registration (P0.4) ──
  // We prefer the `systemPrompt` service's `context()` API when
  // available — it gives DSH a single ordered view of every plugin's
  // contribution and matches the documented design (§4.4 of the
  // design doc). The provider registration is best-effort: if the
  // service is absent or `context()` rejects the shape, we set
  // `state.useSystemPrompt = false` and let the waterfall listener
  // below handle injection. This dual-path keeps the plugin
  // functional on DSH builds that don't yet expose systemPrompt
  // (some embed setups only register the Host bundle).
  let useSystemPrompt = false;
  try {
    const systemPrompt = ctx.get('systemPrompt');
    if (systemPrompt && typeof systemPrompt.context === 'function') {
      // Register the "Known Pitfalls" provider (order 900 — see
      // DSH design §4.4). Lower order numbers assemble first; the
      // harness sorts before passing to the model.
      ctx.effect(() => systemPrompt.context({
        name: 'agent-evolve-known-pitfalls',
        order: 900,
        text: (ctx2) => {
          try {
            const cfgNow = liveConfig(state);
            if (!cfgNow.enabled) return '';
            const decision = (ctx2 && ctx2.decision) || { messages: [] };
            const pitfalls = buildPitfallsContext(state, decision, cfgNow);
            if (!pitfalls) return '';
            // Bump hit_count for the rules we actually inject.
            for (const id of pitfalls.__hitIds || []) {
              try { incrementRuleHit(state.db, id); } catch { /* swallow */ }
            }
            return pitfalls.content;
          } catch (e) {
            console.warn('[agent-evolve] systemPrompt pitfalls provider failed:', e?.message || e);
            return '';
          }
        },
      }), 'agent-evolve: known-pitfalls context provider');

      // Register the "User Persona" provider (order 950 — runs after
      // pitfalls per design §4.4).
      ctx.effect(() => systemPrompt.context({
        name: 'agent-evolve-user-persona',
        order: 950,
        text: (ctx2) => {
          try {
            const cfgNow = liveConfig(state);
            if (!cfgNow.enabled) return '';
            const persona = buildPersonaContext(state, cfgNow);
            if (!persona) return '';
            return persona.content;
          } catch (e) {
            console.warn('[agent-evolve] systemPrompt persona provider failed:', e?.message || e);
            return '';
          }
        },
      }), 'agent-evolve: user-persona context provider');

      useSystemPrompt = true;
      state.useSystemPrompt = true;
    }
  } catch (e) {
    // systemPrompt not registered / runtime threw — fall back to the
    // agent/pre-step waterfall listener below. The plugin still
    // works; we just lose the unified-assembler view.
    console.warn('[agent-evolve] systemPrompt.context() unavailable, using agent/pre-step waterfall:', e?.message || e);
  }

  // ── 5b. agent/pre-step — context injection for approved rules (M1) + persona (M2) ──
  // Mirrors the waterfall-event pattern used by dsh-long-memory and
  // dsh-plan-mode: accept `(input, next)`, await `next()`, mutate the
  // decision's `messages` array, return. On any error we continue the
  // chain with `next()` so the agent is never stranded.
  //
  // P0.4: this listener is now a FALLBACK. When the systemPrompt
  // service is registered (state.useSystemPrompt === true), the
  // providers above own injection and this listener is a no-op.
  // When systemPrompt is missing, this listener still injects so the
  // plugin keeps working on builds that don't expose the service.
  //
  // M2: each injection (rules + persona) is wrapped in its OWN
  // try-catch so a failure in one section doesn't block the other.
  ctx.on('agent/pre-step', async (_input, next) => {
    try {
      const decision = await next();
      if (!decision || decision.kind === 'reject') return decision;
      // P0.4: skip waterfall injection if the systemPrompt service
      // already owns context assembly upstream.
      if (state.useSystemPrompt) return decision;
      const cfgNow = liveConfig(state);
      if (!cfgNow.enabled) return decision;

      const msgs = Array.isArray(decision.messages) ? decision.messages.slice() : [];

      // P3.24 — injection ordering. Messages pushed LATER sit closer to
      // the model's "now" point and therefore carry HIGHER priority.
      // The design wants rules (Known Pitfalls) to out-rank persona:
      //   • rules    — order: 900  (target systemPrompt.context order)
      //   • persona  — order: 950  (target systemPrompt.context order)
      // To approximate that ordering in the waterfall path we push
      // persona FIRST, then rules.
      //
      // (If/when we migrate to systemPrompt.context() the order numbers
      // above should be passed verbatim to that API. See DSH design §4.4.)

      // ── M2: inject user persona (≤ 300 token) — pushed first ─────────
      try {
        const persona = buildPersonaContext(state, cfgNow);
        if (persona) {
          msgs.push(persona);
        }
      } catch (e) {
        console.warn('[agent-evolve] persona injection failed:', e?.message || e);
      }

      // ── M1: inject approved rules as "Known Pitfalls" — pushed LAST ─────────
      try {
        const pitfalls = buildPitfallsContext(state, decision, cfgNow);
        if (pitfalls) {
          msgs.push(pitfalls);
          // Increment hit_count for rules we actually injected.
          for (const id of pitfalls.__hitIds || []) {
            try { incrementRuleHit(state.db, id); } catch { /* swallow */ }
          }
        }
      } catch (e) {
        console.warn('[agent-evolve] pitfalls injection failed:', e?.message || e);
      }

      decision.messages = msgs;
      return decision;
    } catch (e) {
      console.warn('[agent-evolve] pre-step injection failed:', e?.message || e);
      try { return await next(); } catch { return { kind: 'enter', messages: [] }; }
    }
  });

  // ── 6. Daily decay timer (native setInterval — timer mixin not available) ──
  const decayInterval = setInterval(() => {
    try { runDecayCheck(state.db); } catch (e) { /* swallow — don't crash host */ }
  }, 24 * 60 * 60 * 1000);
  ctx.effect(() => { clearInterval(decayInterval); return () => {}; },
    'agent-evolve: decay timer');

  // ── 7. Settings namespace ────────────────────────────────────────────
  ctx.inject(['settings'], (settingsCtx) => {
    try {
      const handle = settingsCtx.settings.register('agent-evolve', Config, { base: cfg });
      state.settingsHandle = handle;
    } catch (e) {
      console.warn('[agent-evolve] settings registration failed:', e?.message || e);
    }
  });

  // ── 8. Web API — register via ctx.inject so Cordis waits for webServer ──
  ctx.inject(['webServer'], (webCtx) => {
    registerWebRoutes(webCtx, state);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Config helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Defensive `ctx.get(name)` wrapper. Returns null instead of throwing
 * when the service is missing — used by listeners that fire before
 * all inject-declared services are guaranteed to be live (e.g. the
 * boot-time embedding probe runs immediately after `apply()` enters).
 */
function _safeGet(ctx, name) {
  if (!ctx || typeof ctx.get !== 'function') return null;
  try {
    const v = ctx.get(name);
    return v === undefined ? null : v;
  } catch {
    return null;
  }
}

function normaliseConfig(config) {
  const cfg = { ...(config || {}) };
  cfg.dbPath = typeof cfg.dbPath === 'string' ? cfg.dbPath : '';
  cfg.enabled = cfg.enabled !== false;
  cfg.batchSize = Number.isFinite(cfg.batchSize) ? cfg.batchSize : 3;
  cfg.provider = typeof cfg.provider === 'string' ? cfg.provider : '';
  cfg.model = typeof cfg.model === 'string' ? cfg.model : '';
  cfg.llmTimeoutMs = Number.isFinite(cfg.llmTimeoutMs) ? cfg.llmTimeoutMs : 30000;
  cfg.ruleThreshold = Number.isFinite(cfg.ruleThreshold) ? cfg.ruleThreshold : 5;
  cfg.ruleTokenBudget = Number.isFinite(cfg.ruleTokenBudget) ? cfg.ruleTokenBudget : 800;
  cfg.personaEverySessions = Number.isFinite(cfg.personaEverySessions) ? cfg.personaEverySessions : 50;
  cfg.personaEveryMs = Number.isFinite(cfg.personaEveryMs) ? cfg.personaEveryMs : 7 * 24 * 60 * 60 * 1000;
  cfg.signalWords = Array.isArray(cfg.signalWords) && cfg.signalWords.length > 0
    ? cfg.signalWords.slice()
    : DEFAULT_SIGNAL_WORDS.slice();
  // P3.26: locale selector for signal-word defaults. Accepts any string;
  // resolveSignalWords() falls back to the combined default on unknown values.
  cfg.signalWordsLocale = typeof cfg.signalWordsLocale === 'string' && cfg.signalWordsLocale.trim()
    ? cfg.signalWordsLocale.trim()
    : 'auto';
  cfg.embedding = cfg.embedding || {};
  cfg.embedding.autoDetect = cfg.embedding.autoDetect !== false;
  cfg.embedding.ollamaBaseUrl = cfg.embedding.ollamaBaseUrl || 'http://127.0.0.1:11434';
  cfg.embedding.preferredModel = cfg.embedding.preferredModel || 'bge-m3';
  cfg.embedding.timeoutMs = Number.isFinite(cfg.embedding.timeoutMs) ? cfg.embedding.timeoutMs : 1000;
  return cfg;
}

function resolveDbCfgPath(pathOrEmpty) {
  // Substitute ${DSH_HOME} (cordis doesn't expand env vars in patch yaml),
  // then fall back to db.js's own resolveDbPath() for relative paths.
  const raw = pathOrEmpty && pathOrEmpty.trim() ? pathOrEmpty : '';
  if (!raw) return resolveDbPath();
  if (raw.includes('${DSH_HOME}')) {
    const home = process.env.DSH_HOME || `${process.env.HOME || '/root'}/.dsh`;
    return raw.replace(/\$\{DSH_HOME\}/g, home);
  }
  return raw;
}

/**
 * Live config view: prefer settings-service value (reflects WebUI
 * updates) over the boot-time cordis config.
 */
function liveConfig(state) {
  try {
    if (state.settingsHandle) {
      const resolved = state.settingsHandle.get();
      if (resolved) return { ...state.cfg, ...resolved };
    }
  } catch { /* fall through */ }
  return state.cfg;
}

// ────────────────────────────────────────────────────────────────────────────
// Session event handling
// ────────────────────────────────────────────────────────────────────────────

function handleSessionEvent(ctx, state, session, event) {
  if (!event || typeof event !== 'object') return;
  const cfg = liveConfig(state);
  if (!cfg.enabled) return;

  const sessionId = readSessionId(session, event);

  // P0.1 fix: turn/end-driven extraction has moved to the
  // `agent/turn-stopping` listener registered in apply() (see
  // handleTurnStopping). The host no longer relies on the
  // (non-existent / unverified) `turn/end` session event type for
  // memory / rule / persona scheduling — that event was never part of
  // DSH's documented event vocabulary. We only handle user-message
  // signal-word detection here, which IS delivered through the
  // session/event emit bus.
  if (event.type === 'turn/end') {
    // Defensive: if any future harness does emit turn/end, ignore it
    // silently — handleTurnStopping owns this lifecycle now.
    return;
  }

  // ── user/message: check correction signal words ────────────────
  if (event.type === 'user/message' || event.type === 'user_message') {
    const text = extractUserText(event);
    if (!text) return;
    // P3.26: resolve effective signal-word list through the i18n
    // helper. Custom `signalWords` wins over locale defaults.
    const effectiveSignals = resolveSignalWords({
      configSignalWords: cfg.signalWords,
      signalWordsLocale: cfg.signalWordsLocale,
    });
    if (!matchSignalWords(text, effectiveSignals)) return;

    const context = extractRecentContext(event);

    state.extractQueue.add(async (signal) => {
      const llm = ctx.get('llm');
      if (!llm) return;
      try {
        const lesson = await extractLesson({
          text,
          context,
          sessionHint: sessionId,
          llm,
          signal,
          provider: cfg.provider || undefined,
          model: cfg.model || undefined,
        });
        if (lesson && lesson.error_summary) {
          insertCorrection(state.db, {
            trigger: 'user_correction',
            error_summary: lesson.error_summary,
            root_cause: lesson.root_cause,
            correct_action: lesson.correct_action,
            rule: lesson.rule,
            context: context && context.length ? JSON.stringify(context.slice(-3)) : null,
            sessionId,
          });
        }
      } catch (e) {
        console.warn('[agent-evolve] lesson extraction failed:', e?.message || e);
      }
    });
  }
}

function readSessionId(session, event) {
  if (session && typeof session === 'object') {
    if (typeof session.id === 'string') return session.id;
    if (typeof session.sessionId === 'string') return session.sessionId;
  }
  if (event && typeof event === 'object') {
    if (typeof event.sessionId === 'string') return event.sessionId;
    if (event.data && typeof event.data === 'object' && typeof event.data.sessionId === 'string') {
      return event.data.sessionId;
    }
  }
  return 'unknown';
}

function extractTurnData(event) {
  const data = (event && (event.data || event.payload)) || {};
  return {
    user: data.user || data.userMessage || data.user_message || '',
    assistant: data.assistant || data.assistantMessage || data.assistant_message || data.reply || '',
    toolResults: Array.isArray(data.toolResults) ? data.toolResults : [],
  };
}

function extractRecentContext(event) {
  const data = (event && (event.data || event.payload)) || {};
  const ctx = data.context || data.history || [];
  if (!Array.isArray(ctx)) return [];
  return ctx.slice(-6).map((t) => ({
    role: t.role || t.speaker,
    text: t.text || t.content || '',
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// P2.15: tools/result — capture tool execution errors as corrections
// ────────────────────────────────────────────────────────────────────────────

/**
 * Persist a tool-execution error as a `tool_error` correction row.
 *
 * Defensive against every payload shape the host might send:
 *   - result may be missing/null/undefined (treated as no-op)
 *   - result.status may be 'error' / 'ok' / missing
 *   - exec may be a tool-call object, a string id, or null
 *
 * The row stays minimal — no LLM extraction here. The existing
 * `runRuleExtraction` will promote the batch later if a common
 * pattern emerges.
 */
function handleToolResult(ctx, state, exec, result) {
  if (!state || !state.db) return;
  const isError = !result
    || result.status === 'error'
    || result.status === 'failed'
    || result.isFailure === true
    || (typeof result.error === 'string' && result.error.trim().length > 0)
    || result.ok === false;
  if (!isError) return;

  const error_summary = summarizeToolError(exec, result);
  if (!error_summary) return;

  const sessionId = readSessionIdFromExec(exec, result);
  const context = extractRecentContextFromExec(exec, result);
  insertCorrection(state.db, {
    trigger: 'tool_error',
    error_summary: error_summary.slice(0, 240),
    root_cause: null,
    correct_action: null,
    rule: null,
    context: context ? JSON.stringify(context.slice(-3)) : null,
    sessionId,
  });
  // Monthly counter is already bumped by insertCorrection (P3.25), but
  // keep this explicit so the dependency is visible at the call site.
  try { bumpCorrectionUsage(state.db, 'corrections_captured', 1); } catch { /* swallow */ }
}

/**
 * Produce a one-line error summary from a tool-call error payload.
 * Truncates aggressively to fit the `error_summary TEXT` column.
 */
function summarizeToolError(exec, result) {
  // Prefer explicit error.message / error / result.error strings.
  const candidates = [
    result && typeof result.error === 'string' ? result.error : '',
    result && result.error && typeof result.error.message === 'string' ? result.error.message : '',
    typeof result?.message === 'string' ? result.message : '',
    typeof result?.reason === 'string' ? result.reason : '',
    typeof exec?.error === 'string' ? exec.error : '',
    typeof exec?.args?.error === 'string' ? exec.args.error : '',
  ];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  // Fall back to the tool name + status.
  const toolName = exec?.name || exec?.toolName || exec?.tool || 'tool';
  const status = result?.status || (result?.ok === false ? 'failed' : 'error');
  return `${toolName}: ${status}`.slice(0, 240);
}

/**
 * Best-effort sessionId extraction from a tools/result exec payload.
 * Returns 'unknown' when nothing usable can be found — same fallback
 * `readSessionId()` uses elsewhere.
 */
function readSessionIdFromExec(exec, result) {
  const sources = [exec, result && result.context, result && result.session];
  for (const s of sources) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.sessionId === 'string' && s.sessionId) return s.sessionId;
    if (typeof s.session_id === 'string' && s.session_id) return s.session_id;
    if (s.session && typeof s.session === 'object') {
      if (typeof s.session.id === 'string' && s.session.id) return s.session.id;
      if (typeof s.session.sessionId === 'string' && s.session.sessionId) return s.session.sessionId;
    }
  }
  return 'unknown';
}

/**
 * Best-effort context extraction from a tools/result exec payload.
 * Returns an empty array when nothing usable can be found.
 */
function extractRecentContextFromExec(exec, result) {
  const candidates = [];
  const collect = (src) => {
    if (!src || typeof src !== 'object') return;
    if (Array.isArray(src.context)) candidates.push(...src.context);
    if (Array.isArray(src.history)) candidates.push(...src.history);
    if (Array.isArray(src.messages)) candidates.push(...src.messages);
  };
  collect(exec);
  collect(result && result.context);
  if (candidates.length === 0) return [];
  return candidates.slice(-6).map((t) => ({
    role: (t && (t.role || t.speaker)) || 'tool',
    text: (t && (t.text || t.content)) || '',
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// P2.16: agent/error — capture agent-level step / turn errors
// ────────────────────────────────────────────────────────────────────────────

/**
 * Persist a minimal correction row when the harness reports an
 * `agent/error` event. Trigger = 'agent_error' (added to VALID_TRIGGERS
 * in corrections.js so insertCorrection accepts it).
 *
 * The payload shape is `{ agent, turn, step, error }` — but the host
 * can't guarantee any of those keys exist, so every field is read
 * defensively.
 */
function handleAgentError(state, payload) {
  if (!state || !state.db) return;
  if (!payload || typeof payload !== 'object') return;
  const error = payload.error;
  const message = (error && (error.message || error.toString()))
    || payload.message
    || 'agent step error';
  const error_summary = String(message).slice(0, 240) || 'agent step error';
  const sessionId = (payload.agent && (payload.agent.sessionId || payload.agent.session_id))
    || (payload.session && (payload.session.id || payload.session.sessionId))
    || 'unknown';
  const step = payload.step || null;
  insertCorrection(state.db, {
    trigger: 'agent_error',
    error_summary,
    root_cause: null,
    correct_action: null,
    rule: null,
    context: step ? JSON.stringify({ step: typeof step === 'string' ? step : (step.id || 'unknown') }) : null,
    sessionId,
  });
  try { bumpCorrectionUsage(state.db, 'corrections_captured', 1); } catch { /* swallow */ }
}

// ────────────────────────────────────────────────────────────────────────────
// P3.20: agent/turn-stopping — concurrency-controlled extraction queue
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget extraction queue trigger for `agent/turn-stopping`.
 *
 * Concurrency control:
 *   - key = `${sessionId}:${turnId}`
 *   - state.pendingTurns is a Set; if the key is already present we
 *     skip — another listener (or a re-emitted event) is handling it.
 *   - the key is removed in `finally` so the next turn can run.
 *
 * The extraction work re-uses the same TaskQueue the session/event
 * listener drives, so memory + rule + persona all stay serial.
 */
function handleTurnStopping(ctx, state, payload) {
  if (!state || !state.db || !payload || typeof payload !== 'object') return;
  const agent = payload.agent || payload.session || null;
  const turn = payload.turn || null;
  const sessionId = (agent && (agent.sessionId || agent.session_id || agent.id))
    || (payload.sessionId)
    || 'unknown';
  const turnId = (turn && (turn.id || turn.turnId || turn.turn_id))
    || (typeof turn === 'string' || typeof turn === 'number' ? turn : null)
    || (payload.turnId)
    || 'unknown';
  const key = `${sessionId}:${turnId}`;
  if (state.pendingTurns && state.pendingTurns.has(key)) return;
  if (!state.pendingTurns) state.pendingTurns = new Set();
  state.pendingTurns.add(key);

  if (!state.extractQueue) {
    state.pendingTurns.delete(key);
    return;
  }

  state.extractQueue.add(async (signal) => {
    try {
      // Bump the turn counter so the existing batchSize logic still
      // gates how often we do the expensive LLM call. We share the
      // counter with the session/event path so they don't both fire.
      state.turnCount = (state.turnCount || 0) + 1;
      const cfg = liveConfig(state);
      if (!cfg.enabled) return;

      if (state.turnCount % Math.max(1, cfg.batchSize | 0 || 3) !== 0) return;

      const llm = _safeGet(ctx, 'llm');
      if (!llm) return;

      // Memory extraction. We don't have full turn data here — the
      // payload may not include messages. Best-effort: skip if missing.
      const turnData = extractTurnDataFromTurnStopping(payload);
      if (turnData && (turnData.user || turnData.assistant || (turnData.toolResults && turnData.toolResults.length))) {
        await runMemoryExtraction({
          db: state.db, llm, cfg, signal,
          sessionId, turnData,
          embeddingProvider: state.embeddingProvider || null,
        });
      }

      // Rule extraction when the pending backlog is over threshold.
      if (countPendingCorrections(state.db) >= Math.max(1, cfg.ruleThreshold | 0 || 5)) {
        await runRuleExtraction({
          db: state.db, llm, cfg, signal, sessionId,
        });
      }

      // Persona rebuild via the same gating logic as session/event.
      maybeRebuildPersona(state, ctx, cfg, sessionId);
    } catch (e) {
      console.warn('[agent-evolve] turn-stopping extraction failed:', e?.message || e);
    } finally {
      try { state.pendingTurns.delete(key); } catch { /* swallow */ }
    }
  }).catch(() => { try { state.pendingTurns.delete(key); } catch { /* swallow */ } });
}

/**
 * Best-effort turn data extraction from an `agent/turn-stopping`
 * payload. Returns null when nothing usable is present so the caller
 * can skip the call cleanly.
 */
function extractTurnDataFromTurnStopping(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const turn = payload.turn;
  if (!turn || typeof turn !== 'object') return null;
  const messages = Array.isArray(turn.messages) ? turn.messages
    : Array.isArray(turn.history) ? turn.history
    : Array.isArray(payload.messages) ? payload.messages
    : null;
  if (!messages) return null;
  const lastUser = [...messages].reverse().find((m) => m && m.role === 'user');
  const lastAssistant = [...messages].reverse().find((m) => m && m.role === 'assistant');
  const toolResults = [];
  for (const m of messages) {
    if (m && Array.isArray(m.tool_results)) toolResults.push(...m.tool_results);
    else if (m && Array.isArray(m.toolResults)) toolResults.push(...m.toolResults);
  }
  return {
    user: (lastUser && (typeof lastUser.content === 'string' ? lastUser.content : '')) || '',
    assistant: (lastAssistant && (typeof lastAssistant.content === 'string' ? lastAssistant.content : '')) || '',
    toolResults,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// LLM extraction
// ────────────────────────────────────────────────────────────────────────────

async function runMemoryExtraction({ db, llm, cfg, signal, sessionId, turnData, embeddingProvider = null }) {
  if (!db || !llm) return;
  if (!turnData.user && !turnData.assistant && !(turnData.toolResults && turnData.toolResults.length)) {
    return;
  }

  const messages = buildMemoryPrompt(turnData, cfg);
  const text = await streamLlm(llm, {
    provider: cfg.provider || undefined,
    model: cfg.model || undefined,
    messages,
    signal,
  });

  const memories = parseJsonResponse(text);
  if (!Array.isArray(memories) || memories.length === 0) return;

  // Normalise + stamp sessionId before dedup.
  const withSession = [];
  for (const m of memories) {
    if (!m || typeof m.content !== 'string' || !m.content.trim()) continue;
    const type = VALID_MEMORY_TYPES.includes(m.type) ? m.type : 'fact';
    const confidence = Number.isFinite(m.confidence) ? Number(m.confidence) : 0.5;
    withSession.push({
      type,
      content: m.content,
      confidence,
      session_id: sessionId,
    });
  }
  if (withSession.length === 0) return;

  // Dedup + insert. Wrapped in try-catch so a crash in dedup doesn't
  // poison the queue slot — the next turn can try again.
  let result = { inserted: 0, merged: 0 };
  try {
    result = upsertMemories(db, withSession, {
      embeddingProvider: embeddingProvider || null,
      dedupThreshold: 0.80,
    });
  } catch (e) {
    console.warn('[agent-evolve] upsertMemories failed:', e?.message || e);
    return;
  }

  if (result.inserted > 0) {
    bumpUsage(db, 'extractions', result.inserted);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Rule extraction (M1) — synthesise a draft rule from the pending backlog
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the "Known Pitfalls" context message from approved rules.
 *
 * Scoring: keyword overlap between the current turn's user-side text
 * (extracted from `decision.messages`) and each rule's tags + content
 * + category. With the vector provider available we defer ranking to it
 * (M3); for now keyword match is the only path.
 *
 * The result is truncated to stay within `cfg.ruleTokenBudget` chars
 * (≈ 4 chars/token). For each rule we actually emit, we increment
 * `hit_count` upstream (in the `agent/pre-step` listener).
 *
 * Returns `{ role: 'user', content: '...', __hitIds: [...] }` or null
 * when no rules qualify / context injection is disabled. The `__hitIds`
 * marker is read by the listener and stripped before the message leaves
 * the plugin boundary.
 */
function buildPitfallsContext(state, decision, cfg) {
  if (!state || !state.db) return null;
  const budgetTokens = Math.max(50, Number(cfg.ruleTokenBudget) | 0 || 800);
  // Conservative char budget: 1 token ≈ 4 chars for mixed Chinese/English.
  const budgetChars = budgetTokens * 4;

  const keywords = extractTurnKeywords(decision);
  // P3.21: cache the rule-fetch + sort so a busy session doesn't pay
  // O(N * M) on every pre-step. The cache stores the SORTED rule
  // slices — the per-turn keyword scoring still happens, but the
  // underlying SQL fetch and DB-side sort is skipped while the cache
  // is warm. Cache is invalidated by bumpRulesCache() whenever the
  // rules table is mutated (approve / reject / promote / edit).
  const sortedRules = getSortedRulesCached(state);
  if (!sortedRules || sortedRules.length === 0) return null;

  const scored = [];
  for (const r of sortedRules) {
    const score = scoreRuleAgainstKeywords(r, keywords);
    if (score > 0 || keywords.length === 0) {
      // When no keywords at all, still surface the top traffic rules
      // (proven useful by hit_count). Base score is hit_count-driven.
      const final = keywords.length === 0
        ? Math.log(1 + (r.hit_count || 0))
        : score;
      scored.push({ rule: r, score: final });
    }
  }
  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);

  const header = '## Known Pitfalls（已知陷阱）\n';
  const lines = [header];
  let used = header.length;
  const hitIds = [];
  for (const { rule } of scored) {
    const line = `- ${rule.content}`;
    // Always emit at least one rule so the section is never empty when
    // there's data. Each rule is roughly 200 chars worst case.
    if (lines.length > 1 && used + line.length + 1 > budgetChars) break;
    lines.push(line);
    used += line.length + 1;
    hitIds.push(rule.id);
  }
  if (hitIds.length === 0) return null;

  return {
    role: 'user',
    content: lines.join('\n'),
    // internal marker, stripped by the listener before returning
    __hitIds: hitIds,
  };
}

/**
 * Lightweight tokenizer for the current turn's user-side messages.
 * Strips punctuation, lowercases, and keeps tokens of length 2+ (both
 * ASCII words and CJK 2-grams). We don't try to be clever here — M3
 * will replace this with vector similarity.
 */

// ────────────────────────────────────────────────────────────────────────────
// P3.21: rules-cache primitives
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read the sorted approved-rule slice, hitting the cache when warm.
 * Returns `null` when the cache is cold AND no rules exist (caller
 * short-circuits to null cleanly).
 *
 * Cache is structured as:
 *   state.rulesCache = {
 *     version: <number>,  // bumped by bumpRulesCache()
 *     rules:   Array<{...}>,
 *   }
 */
function getSortedRulesCached(state) {
  if (!state || !state.db) return null;
  const wanted = Number(state.rulesCacheVersion || 0);
  const cached = state.rulesCache;
  if (cached && Number(cached.version || 0) === wanted && Array.isArray(cached.rules)) {
    return cached.rules;
  }
  // Cache miss or stale — fetch fresh.
  let rules;
  try {
    rules = getRulesForInjection(state.db, { limit: 50 });
  } catch { return null; }
  if (!Array.isArray(rules)) rules = [];
  state.rulesCache = { version: wanted, rules };
  return rules;
}

/**
 * Invalidate (or replace) the rules cache so the next pre-step re-fetches.
 * Cheap to call from API handlers; idempotent on repeated calls.
 */
function bumpRulesCache(state) {
  if (!state) return;
  state.rulesCacheVersion = (Number(state.rulesCacheVersion || 0) || 0) + 1;
  state.rulesCacheDirtyTick = (Number(state.rulesCacheDirtyTick || 0) || 0) + 1;
  // Drop the cached payload eagerly — saves memory and prevents the
  // version-mismatch path from returning stale data on a future read.
  state.rulesCache = null;
}

function extractTurnKeywords(decision) {
  const msgs = (decision && Array.isArray(decision.messages)) ? decision.messages : [];
  const text = msgs
    .filter((m) => m && m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');
  if (!text) return [];

  // Latin tokens: \b[\w]{2,}\b
  const latin = text.toLowerCase().match(/\b[a-z0-9_]{2,}\b/g) || [];
  // CJK bigrams (2-character windows). Covers the common case without
  // pulling in a segmentation library.
  const cjk = text.match(/[\u4e00-\u9fff]{2}/g) || [];
  const set = new Set();
  for (const t of latin) set.add(t);
  for (const t of cjk) set.add(t);
  // Stop words / signals we don't want to inflate scoring with.
  const STOP = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
    'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
    'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'let',
    'say', 'she', 'too', 'use',
  ]);
  const out = [];
  for (const w of set) {
    if (STOP.has(w)) continue;
    if (out.length >= 64) break;
    out.push(w);
  }
  return out;
}

/**
 * Score one rule against the current keyword set.
 *
 * Weighting:
 *   - exact tag match: +3
 *   - tag prefix match (rule tag starts with kw or vice-versa): +1.5
 *   - keyword substring in content / category: +1
 *   - base prior: log(1 + hit_count) * 0.4
 */
function scoreRuleAgainstKeywords(rule, keywords) {
  if (!rule) return 0;
  let tags = [];
  try { tags = JSON.parse(rule.tags || '[]'); } catch { tags = []; }
  const tagSet = new Set(tags.map((t) => String(t).toLowerCase()));
  const contentLc = String(rule.content || '').toLowerCase();
  const categoryLc = String(rule.category || '').toLowerCase();

  let score = Math.log(1 + (rule.hit_count || 0)) * 0.4;
  for (const kw of keywords) {
    if (!kw) continue;
    if (tagSet.has(kw)) { score += 3; continue; }
    let partial = false;
    for (const t of tagSet) {
      if (t && (t.startsWith(kw) || kw.startsWith(t))) { partial = true; break; }
    }
    if (partial) { score += 1.5; continue; }
    if (contentLc.includes(kw)) { score += 1; continue; }
    if (categoryLc.includes(kw)) { score += 0.5; continue; }
  }
  return score;
}

/**
 * Decide whether to run rule extraction this turn.
 *
 * The threshold check is done by the caller (`handleSessionEvent`); this
 * function is the workhorse that takes the oldest N pending corrections,
 * runs `extractRule`, inserts a `proposed` rule, and marks the source
 * corrections as `promoted`.
 *
 * Dedup: if a rule with the same `content` was proposed in the last 24h,
 * we skip insert and instead mark the corrections as `promoted` with the
 * existing rule_id — so the WebUI sees them linked, but we don't pile up
 * duplicate proposals.
 */
async function runRuleExtraction({ db, llm, cfg, signal, sessionId }) {
  if (!db || !llm) return null;

  const threshold = Number(cfg.ruleThreshold) | 0 || 5;
  // Re-check inside the queued task — another extraction may have run
  // first while this one was waiting in the queue.
  const pendingCount = countPendingCorrections(db);
  if (pendingCount < threshold) return null;

  // Only ever grab the oldest `threshold` items per extraction pass.
  // Larger backlogs will catch up on subsequent turns.
  const toProcess = listPendingCorrections(db, { limit: threshold });
  if (toProcess.length === 0) return null;

  const extracted = await extractRule({
    llm,
    corrections: toProcess,
    cfg,
    signal,
    provider: cfg.provider || undefined,
    model: cfg.model || undefined,
  });

  if (!extracted || !extracted.content) {
    // Nothing to propose — leave corrections pending so a future turn
    // can try again with more signal. We still don't want them stuck
    // forever though; the WebUI can mark them ignored manually.
    return null;
  }

  // Dedup against same-content rules proposed in the last 24h.
  const recent = db.prepare(
    `SELECT id FROM rules
      WHERE content = ? AND created_at > ? AND status = 'proposed'
      LIMIT 1`,
  ).get(extracted.content, now() - 24 * 3600 * 1000);

  let ruleId;
  if (recent && recent.id) {
    ruleId = recent.id;
  } else {
    ruleId = newId();
    db.prepare(
      `INSERT INTO rules
         (id, content, category, tags, status, source_corrections, created_at)
       VALUES (?, ?, ?, ?, 'proposed', ?, ?)`,
    ).run(
      ruleId,
      extracted.content,
      extracted.category || 'coding',
      JSON.stringify(Array.isArray(extracted.tags) ? extracted.tags : []),
      JSON.stringify(toProcess.map((c) => c.id)),
      now(),
    );
    bumpUsage(db, 'rules_proposed', 1);
  }

  // Link each source correction → this rule. markCorrectionPromoted is
  // idempotent on already-promoted rows, so re-runs are safe.
  for (const c of toProcess) {
    markCorrectionPromoted(db, c.id, ruleId);
  }

  return ruleId;
}

// ────────────────────────────────────────────────────────────────────────────
// M2: persona rebuild + context injection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether the persona needs a rebuild this turn and, if so,
 * schedule `runPersonaRebuild` on the shared extraction queue.
 *
 * Trigger conditions (any of):
 *   1. No persona rows yet (cold start)
 *   2. `sessions` distinct sessionIds seen since boot has reached
 *      `cfg.personaEverySessions` (default 50)
 *   3. The persona's `updated_at` is older than `cfg.personaEveryMs`
 *      (default 7 days)
 *
 * Sessions are tracked by `state.lastSessionId` — when a new
 * sessionId shows up in a turn/end event we increment the counter.
 *
 * Build happens in the same TaskQueue as memory/rule extraction so it
 * can't run two-at-once and never blocks the host.
 */
function maybeRebuildPersona(state, ctx, cfg, sessionId) {
  if (!state || !state.db || !ctx) return;
  const liveCfg = liveConfig(state);
  const everySessions = Math.max(1, Number(liveCfg.personaEverySessions) | 0 || 50);
  const everyMs = Math.max(60000, Number(liveCfg.personaEveryMs) | 0 || 7 * 24 * 60 * 60 * 1000);

  // Track distinct sessions.
  if (sessionId && sessionId !== state.lastSessionId) {
    state.lastSessionId = sessionId;
    state.personaSessionCount = (state.personaSessionCount || 0) + 1;
  }

  const sessions = state.personaSessionCount || 0;
  // M3: prefer the shared `isPersonaStale` helper so the staleness
  // predicate lives in one place (also used by tests + the daily
  // decay sweep). Falls back to a direct elapsed comparison when the
  // table is missing entirely (returns true).
  const staleByTime = isPersonaStale(state.db, everyMs);
  const lastUpdatedAt = getPersonaLatestUpdatedAt(state.db);
  const elapsed = lastUpdatedAt > 0 ? (now() - lastUpdatedAt) : Infinity;
  const coldStart = lastUpdatedAt === 0;

  const shouldRebuild = coldStart
    || sessions >= everySessions
    || staleByTime;
  if (!shouldRebuild) return;

  // M3: surface the trigger reason so logs make the state-machine
  // handoff (time/session/cold-start) observable. Cheap to compute
  // and helps diagnose why persona rebuilds happened in tests.
  const reason = coldStart
    ? 'cold-start'
    : (sessions >= everySessions ? `sessions>=${everySessions}` : `elapsed>=${everyMs}ms`);
  console.log(`[agent-evolve] persona rebuild queued (${reason}; sessions=${sessions}, elapsed=${elapsed}ms)`);

  // Reset the per-session counter so we wait another `everySessions`
  // sessions before the next rebuild. The time-based trigger is
  // implicit (next rebuild won't fire until elapsed >= everyMs again).
  state.personaSessionCount = 0;

  state.extractQueue.add(async (signal) => {
    const llm = (() => { try { return ctx.get('llm'); } catch { return null; } })();
    if (!llm) return;
    try {
      await runPersonaRebuild({ db: state.db, llm, cfg: liveCfg, signal });
    } catch (e) {
      console.warn('[agent-evolve] persona rebuild failed:', e?.message || e);
    }
  });
}

/**
 * Build a new persona from active memories.
 *
 * Pipeline:
 *   1. Pick the top 50 active memories ranked by access_count DESC
 *      then created_at DESC (via `getActiveMemoriesForPersona`).
 *   2. Stream a `buildPersonaPrompt` call to the LLM.
 *   3. Parse the JSON array of persona fields.
 *   4. Upsert each valid field via `updatePersonaKey` inside a tx.
 *
 * Idempotent: re-running on the same memories overwrites the existing
 * 4 rows. Returns the number of fields actually written.
 */
async function runPersonaRebuild({ db, llm, cfg, signal }) {
  if (!db || !llm) return { updated: 0 };

  const memories = getActiveMemoriesForPersona(db, { limit: 50 });
  if (memories.length === 0) return { updated: 0 };

  const messages = buildPersonaPrompt(memories, cfg);
  let response;
  try {
    response = await streamLlm(llm, {
      provider: (cfg && cfg.provider) || undefined,
      model: (cfg && cfg.model) || undefined,
      messages,
      signal,
    });
  } catch (e) {
    console.warn('[agent-evolve] runPersonaRebuild: llm.stream failed:', e?.message || e);
    return { updated: 0 };
  }

  const parsed = parseJsonResponse(response);
  if (!Array.isArray(parsed) || parsed.length === 0) return { updated: 0 };

  let updated = 0;
  const tx = db.transaction(() => {
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const key = typeof entry.key === 'string' ? entry.key : '';
      const value = typeof entry.value === 'string' ? entry.value.trim() : '';
      if (!key || !value) continue;
      const ok = updatePersonaKey(db, key, {
        value,
        confidence: Number.isFinite(entry.confidence) ? Number(entry.confidence) : 0.5,
      });
      if (ok) updated += 1;
    }
  });
  tx();

  if (updated > 0) {
    console.log(`[agent-evolve] persona rebuilt: ${updated} field(s) updated`);
  }
  return { updated };
}

/**
 * Build the "User Persona" context message for the next turn.
 *
 * Reads all persona rows (≤ 4) and emits them as a small user-side
 * message. Capped at 1200 chars (≈ 300 tokens) per design §4.4.
 *
 * Returns null when no persona is set — caller skips injection.
 *
 * The returned marker `__personaKeys` is internal and stripped by the
 * agent/pre-step listener before the message reaches the model.
 */
function buildPersonaContext(state, _cfg) {
  if (!state || !state.db) return null;
  let rows = [];
  try { rows = getPersona(state.db); } catch { return null; }
  if (!rows || rows.length === 0) return null;

  const budgetChars = 1200; // ≈ 300 tokens for mixed CJK + Latin
  const header = '## User Persona（用户画像）';
  const lines = [header];
  let used = header.length + 1;
  const keys = [];
  for (const r of rows) {
    if (!r || !r.value || !r.key) continue;
    const line = `- ${r.key}: ${r.value}`;
    if (lines.length > 1 && used + line.length + 1 > budgetChars) break;
    lines.push(line);
    used += line.length + 1;
    keys.push(r.key);
  }
  if (keys.length === 0) return null;
  return {
    role: 'user',
    content: lines.join('\n'),
    __personaKeys: keys, // internal marker, stripped by caller
  };
}

// ────────────────────────────────────────────────────────────────────────────
// P3.23: rule conflict detection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Find already-approved rules that look semantically similar to the
 * given rule. Same-category only (cross-category similarity is rarely
 * actionable). Overlap is a simple token Jaccard with a Chinese-aware
 * tokenizer — good enough to surface near-duplicates without pulling
 * in a vector stack.
 *
 * Threshold is configurable via the constant below. We picked 0.6 as
 * "obviously the same advice worded differently" — lower starts to
 * false-positive on legitimately different rules that share jargon.
 */
const RULE_CONFLICT_OVERLAP_THRESHOLD = 0.6;

/**
 * Wrapper called from the approve handler. Returns up to 5 conflicts
 * sorted by descending overlap. Each entry is
 *   { id, content, category, overlap (0..1) }
 */
function okConflicts(rule, state) {
  if (!rule || !state || !state.db) return [];
  try {
    return findConflictingRules(state.db, rule);
  } catch (e) {
    console.warn('[agent-evolve] rule conflict scan failed:', e?.message || e);
    return [];
  }
}

function findConflictingRules(db, rule) {
  if (!db || !rule || !rule.category) return [];
  const candidates = listRules(db, {
    status: 'approved',
    category: rule.category,
    limit: 100,
  });
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const newTokens = tokenizeRuleContent(rule.content);
  if (newTokens.length === 0) return [];
  const newSet = new Set(newTokens);

  const conflicts = [];
  for (const other of candidates) {
    if (!other || other.id === rule.id) continue;
    const otherTokens = tokenizeRuleContent(other.content);
    if (otherTokens.length === 0) continue;
    let intersect = 0;
    const otherSet = new Set(otherTokens);
    for (const t of newSet) if (otherSet.has(t)) intersect += 1;
    const union = newSet.size + otherSet.size - intersect;
    const overlap = union > 0 ? intersect / union : 0;
    if (overlap >= RULE_CONFLICT_OVERLAP_THRESHOLD) {
      conflicts.push({
        id: other.id,
        content: other.content,
        category: other.category,
        overlap: Number(overlap.toFixed(3)),
      });
    }
  }
  conflicts.sort((a, b) => b.overlap - a.overlap);
  return conflicts;
}

/**
 * Tokenize a rule's content for the Jaccard overlap calculation.
 *
 * Mirrors `extractTurnKeywords`'s Latin + CJK bigram split so two rules
 * that share jargon like "Ollama" or Chinese terms like "规则" score
 * high even when phrased differently.
 */
function tokenizeRuleContent(text) {
  if (!text || typeof text !== 'string') return [];
  const lc = text.toLowerCase();
  const latin = lc.match(/[a-z0-9_]{2,}/g) || [];
  const cjkChars = lc.match(/[\u4e00-\u9fff]/g) || [];
  const bigrams = [];
  for (let i = 0; i < cjkChars.length - 1; i += 1) {
    bigrams.push(cjkChars[i] + cjkChars[i + 1]);
  }
  return [...latin, ...bigrams];
}

// ────────────────────────────────────────────────────────────────────────────
// Decay
// ────────────────────────────────────────────────────────────────────────────

function localRunDecayCheck(db) {
  try {
    const result = runDecayCheck(db);
    if (result && (result.memoryWeightDecayed > 0 || result.memoriesArchived > 0 || result.rulesArchived > 0)) {
      console.log(`[agent-evolve] decay: memories weight-=${result.memoryWeightDecayed}, archived=${result.memoriesArchived}; rules archived=${result.rulesArchived}`);
    }
  } catch (e) {
    console.warn('[agent-evolve] decay check failed:', e?.message || e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Usage stats (monthly)
// ────────────────────────────────────────────────────────────────────────────

function bumpUsage(db, column, delta = 1) {
  if (!db || !column) return;
  const month = new Date().toISOString().slice(0, 7);
  // usage_stats column set is small and may not include the column we
  // want — guard by reading pragma_table_info.
  try {
    const cols = db.prepare(`PRAGMA table_info(usage_stats)`).all();
    if (!cols.some((c) => c.name === column)) return;
    db.prepare(
      `INSERT INTO usage_stats (month, ${column}) VALUES (?, ?)
       ON CONFLICT(month) DO UPDATE SET ${column} = ${column} + ?`,
    ).run(month, delta, delta);
  } catch { /* usage_stats missing column or other schema drift — ignore */ }
}

// ────────────────────────────────────────────────────────────────────────────
// Embedding
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the embedding provider. P2.19 priority:
 *
 *   1. `llm.listModels?.()` — ask the DSH llm service whether any
 *      registered adapter exposes embedding-capable models. Cheapest
 *      path; doesn't hit the network.
 *   2. Fetch Ollama `/api/tags` — local-only probe of the configured
 *      Ollama endpoint. Carries the P0.7 `typeof fetch === 'function'`
 *      guard so environments without fetch degrade silently.
 *   3. Return null (caller falls back to keyword matching).
 *
 * The optional `llm` argument is the DSH llm service (or null). When
 * null/undefined the function skips step 1 and only runs step 2.
 *
 * @param {object} cfg         — embedding subsection of plugin config
 * @param {object} [llm=null]  — DSH llm service (for listModels path)
 * @returns {Promise<{provider:string, model:string, dim:number|null}|null>}
 */
async function resolveEmbeddingProvider(cfg, llm = null) {
  if (!cfg || cfg.autoDetect === false) return null;

  // Step 1: ask the llm service (P2.19 — prefer over a direct Ollama probe).
  try {
    const fromLlm = await probeEmbeddingViaLlm(llm, cfg);
    if (fromLlm) return fromLlm;
  } catch { /* fall through to Ollama */ }

  // Step 2: Ollama `/api/tags` probe.
  //
  // P0.7 fix: `fetch` is NOT a DSH Host Builtin, so we can't assume
  // it exists. Node.js ≥ 18 (we run on 22+) provides `fetch` as a
  // global; the typeof guard below makes the call safe on engines
  // that don't (or on cordis-isolated contexts that strip globals).
  // If absent, we degrade silently to keyword matching — there's no
  // way to ask the harness for a web-fetch proxy from inside a Host
  // plugin, so a missing fetch means no embedding provider here.
  if (typeof fetch !== 'function') return null;
  const url = (cfg.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const timeoutMs = cfg.timeoutMs ?? 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${url}/api/tags`, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    if (models.length === 0) return null;
    const preferred = cfg.preferredModel || 'bge-m3';
    const exact = models.find((m) => m && m.name === preferred);
    if (exact) return { provider: 'ollama', model: exact.name, dim: 1024 };
    const partial = models.find((m) => m && typeof m.name === 'string' && m.name.startsWith(preferred));
    if (partial) return { provider: 'ollama', model: partial.name, dim: 1024 };
    const anyEmbed = models.find(
      (m) => m && typeof m.name === 'string' && /bge|nomic|embed|minilm/i.test(m.name),
    );
    if (anyEmbed) return { provider: 'ollama', model: anyEmbed.name, dim: null };
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * P2.19: ask the DSH llm service which models it knows about, and
 * pick the first one that looks like an embedding model.
 *
 * The signature is deliberately forgiving — the llm service may expose
 * `listModels()` as a method, an async method, or a function that
 * returns either an array or a `{ models: [...] }` envelope. Any
 * deviation returns null so the Ollama fallback can run.
 *
 * @param {object|null} llm
 * @param {object} cfg
 * @returns {Promise<{provider:string, model:string, dim:number|null}|null>}
 */
async function probeEmbeddingViaLlm(llm, cfg) {
  if (!llm || typeof llm.listModels !== 'function') return null;
  let raw;
  try {
    raw = llm.listModels({ capability: 'embedding' });
  } catch {
    // Some adapters throw on unknown opts — retry without args.
    try { raw = llm.listModels(); } catch { return null; }
  }
  // Accept thenable + iterable shapes (cordis proxies wrap).
  let models = raw;
  if (raw && typeof raw.then === 'function') {
    try { models = await raw; } catch { return null; }
  }
  if (!Array.isArray(models)) {
    if (models && Array.isArray(models.models)) models = models.models;
    else return null;
  }
  if (models.length === 0) return null;

  const preferred = (cfg && cfg.preferredModel) || 'bge-m3';
  const lc = String(preferred).toLowerCase();
  const matchEmbedding = (m) => {
    if (!m) return false;
    const id = String(m.id || m.name || m.model || '').toLowerCase();
    if (!id) return false;
    if (id === lc) return true;
    if (id.startsWith(lc)) return true;
    if (m.capabilities && Array.isArray(m.capabilities)
        && m.capabilities.some((c) => String(c).toLowerCase().includes('embed'))) return true;
    return /bge|nomic|embed|minilm|e5-large|text-embedding/.test(id);
  };

  const pick = models.find(matchEmbedding);
  if (!pick) return null;
  const id = String(pick.id || pick.name || pick.model || preferred);
  // dim is unknown through the abstract API; leave null so callers that
  // need an exact dim can fall back to keyword matching.
  return { provider: pick.provider || 'llm-service', model: id, dim: null };
}

// ────────────────────────────────────────────────────────────────────────────
// Web API
// ────────────────────────────────────────────────────────────────────────────

const PREFIX = '/plugins/agent-evolve';

function registerWebRoutes(webCtx, state) {
  // P0.5 fix: called inside ctx.inject(['webServer'], ...) so webServer
  // is guaranteed to be bound. webCtx is the sub-context with webServer available.
  try {
    const ws = webCtx.get ? webCtx.get('webServer') : webCtx.webServer;
    if (!ws || typeof ws.register !== 'function') return;
    registerRoutes(ws, webCtx, state);
  } catch (e) {
    console.warn('[agent-evolve] web route registration failed:', e?.message || e);
  }
}

function registerRoutes(ws, ctx, state) {
  // ── GET /api/corrections — list ───────────────────────────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/corrections`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') {
          res.writeHead(405); res.end(); return;
        }
        const url = new URL(req.url || '/', 'http://x');
        const status = url.searchParams.get('status') || undefined;
        const trigger = url.searchParams.get('trigger') || undefined;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
        const rows = listCorrections(state.db, { status, trigger, limit });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(rows));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: corrections-api');

  // ── POST /api/corrections/:id/extract | /:id/ignore — prefix handler ─
  ws.register({
    kind: 'prefix',
    path: `${PREFIX}/api/corrections/`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        const m = url.pathname.match(
          /^\/plugins\/agent-evolve\/api\/corrections\/([^/]+)\/(extract|ignore)$/,
        );
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const id = m[1];
        const action = m[2];
        if (req.method !== 'POST') {
          res.writeHead(405); res.end(); return;
        }

        if (action === 'ignore') {
          const ok = markCorrectionIgnored(state.db, id);
          res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok, id, status: ok ? 'ignored' : 'not_found' }));
          return;
        }

        // action === 'extract': create a draft rule from the correction
        const llm = (() => { try { return ctx.get('llm'); } catch { return null; } })();
        const result = await promoteCorrectionToRule({
          db: state.db, id, llm, cfg: liveConfig(state),
        });
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: corrections-action-api');

  // ── GET /api/stats — aggregate counters ───────────────────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/stats`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const stats = aggregateStats(state.db);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(stats));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: stats-api');

  // ── GET / POST /api/config — live config read / write ─────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/config`,
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          const merged = liveConfig(state);
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({
            enabled: merged.enabled,
            batchSize: merged.batchSize,
            // P0.3: `provider` (adapter route) is required by llm.stream()
            // alongside `model`. Surface it in the WebUI so users can
            // pick which adapter (deepseek / openai / ...) extraction
            // runs through.
            provider: merged.provider,
            model: merged.model,
            ruleThreshold: merged.ruleThreshold,
            ruleTokenBudget: merged.ruleTokenBudget,
            signalWords: merged.signalWords,
            embedding: merged.embedding,
            // M3 additions: expose the configuration knobs the WebUI
            // binds (LLM timeout, persona cadence) so the config section
            // can show and edit the same values the host uses.
            llmTimeoutMs: merged.llmTimeoutMs,
            personaEverySessions: merged.personaEverySessions,
            personaEveryMs: merged.personaEveryMs,
            // Surface the resolved embedding provider so the UI can
            // render an accurate status line ("bge-m3 enabled" vs
            // "keyword mode") without re-probing locally.
            embeddingStatus: state.embeddingProvider
              ? { mode: 'enabled', provider: state.embeddingProvider.provider, model: state.embeddingProvider.model }
              : { mode: merged.embedding && merged.embedding.autoDetect ? 'keyword' : 'disabled' },
          }));
          return;
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const raw = await readRequestBody(req);
          const patch = raw ? JSON.parse(raw) : {};
          // M3: allow signalWords as either array (preferred) or
          // comma-separated string (textarea convenience). Trim +
          // drop empties so users can't sneak blank tokens through.
          if (typeof patch.signalWords === 'string') {
            patch.signalWords = patch.signalWords
              .split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
          } else if (Array.isArray(patch.signalWords)) {
            patch.signalWords = patch.signalWords
              .map(function(s) { return typeof s === 'string' ? s.trim() : ''; })
              .filter(Boolean);
          }
          // M3: coerce numeric knobs so a stringified <input value>
          // from the WebUI doesn't disable the saved value.
          ['llmTimeoutMs', 'personaEverySessions', 'personaEveryMs',
           'batchSize', 'ruleThreshold', 'ruleTokenBudget'].forEach(function(k) {
            if (patch[k] !== undefined && patch[k] !== null) {
              const n = Number(patch[k]);
              if (Number.isFinite(n)) patch[k] = n;
            }
          });
          // P0.3: trim provider string so a stray space from a
          // copy/paste doesn't silently disable extraction. Empty
          // string is fine — streamLlm throws and the call is
          // caught upstream with a warn message.
          if (typeof patch.provider === 'string') {
            patch.provider = patch.provider.trim();
          }
          // Embedding test-connection: when the WebUI clicks the test
          // button we want to re-probe. We expose a `__testEmbedding`
          // sentinel (stripped before persisting) so the request stays
          // a normal config update otherwise.
          if (patch.__testEmbedding === true) {
            delete patch.__testEmbedding;
            try {
              const probed = await resolveEmbeddingProvider(state.cfg.embedding || {}, _safeGet(ctx, 'llm'));
              state.embeddingProvider = probed;
              console.log(`[agent-evolve] embedding re-probe: ${probed ? probed.model + ' (' + probed.provider + ')' : 'keyword mode'}`);
            } catch (e) {
              console.warn('[agent-evolve] embedding re-probe failed:', e?.message || e);
            }
          }
          if (state.settingsHandle) {
            try {
              state.settingsHandle.update(patch);
            } catch (e) {
              console.warn('[agent-evolve] settings update failed:', e?.message || e);
            }
          }
          // Apply patch to local cfg so subsequent reads see it even if
          // settings service isn't available.
          state.cfg = normaliseConfig({ ...state.cfg, ...patch });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            config: {
              enabled: state.cfg.enabled,
              batchSize: state.cfg.batchSize,
              // P0.3: surface provider for the WebUI to render /
              // edit. Empty string means "no provider configured
              // yet" — extraction calls will skip cleanly.
              provider: state.cfg.provider,
              model: state.cfg.model,
              ruleThreshold: state.cfg.ruleThreshold,
              ruleTokenBudget: state.cfg.ruleTokenBudget,
              signalWords: state.cfg.signalWords,
              embedding: state.cfg.embedding,
              llmTimeoutMs: state.cfg.llmTimeoutMs,
              personaEverySessions: state.cfg.personaEverySessions,
              personaEveryMs: state.cfg.personaEveryMs,
              embeddingStatus: state.embeddingProvider
                ? { mode: 'enabled', provider: state.embeddingProvider.provider, model: state.embeddingProvider.model }
                : { mode: state.cfg.embedding && state.cfg.embedding.autoDetect ? 'keyword' : 'disabled' },
            },
          }));
          return;
        }
        res.writeHead(405); res.end();
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: config-api');

  // ── GET /api/rules — list ───────────────────────────────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/rules`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url || '/', 'http://x');
        const status = url.searchParams.get('status') || undefined;
        const category = url.searchParams.get('category') || undefined;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
        const rows = listRules(state.db, { status, category, limit });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(rows));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: rules-api');

  // ── POST /api/rules/:id/approve|reject|promote — prefix handler ───
  ws.register({
    kind: 'prefix',
    path: `${PREFIX}/api/rules/`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        const m = url.pathname.match(
          /^\/plugins\/agent-evolve\/api\/rules\/([^/]+)\/(approve|reject|promote)$/,
        );
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const id = m[1];
        const action = m[2];
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        const rule = getRule(state.db, id);
        if (!rule) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, id, error: 'rule not found' }));
          return;
        }

        if (action === 'approve') {
          const conflicts = okConflicts(rule, state); // P3.23: detect before mutating
          const ok = approveRule(state.db, id);
          if (ok) {
            bumpUsage(state.db, 'rules_approved', 1);
            bumpRulesCache(state); // P3.21
          }
          const updated = getRule(state.db, id);
          const payload = { ok, id, rule: updated };
          if (ok && conflicts.length > 0) {
            payload.warning = {
              conflicts: conflicts.slice(0, 5),
              message: 'potential conflict with existing approved rule(s)',
            };
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
          return;
        }
        if (action === 'reject') {
          const ok = rejectRule(state.db, id);
          if (ok) bumpRulesCache(state); // P3.21
          const updated = getRule(state.db, id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok, id, rule: updated }));
          return;
        }
        if (action === 'promote') {
          const ok = promoteRule(state.db, id);
          if (ok) bumpRulesCache(state); // P3.21
          const updated = ok ? getRule(state.db, id) : rule;
          const agents_md = ok ? buildAgentsMdDraft(updated) : null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok, id, rule: updated, agents_md }));
          return;
        }
        // Unreachable: regex constrains action.
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unknown action' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: rules-action-api');

  // ── GET /api/rules/:id/source — source corrections ────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/rules/:id/source`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        // path param is in the URL, not params; parse from URL.
        const url = new URL(req.url || '/', 'http://x');
        const m = url.pathname.match(
          /^\/plugins\/agent-evolve\/api\/rules\/([^/]+)\/source$/,
        );
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const id = m[1];
        const rule = getRule(state.db, id);
        if (!rule) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'rule not found', id }));
          return;
        }
        let ids = [];
        try { ids = JSON.parse(rule.source_corrections || '[]'); } catch { ids = []; }
        const rows = listCorrectionsByIds(state.db, ids);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ rule_id: id, corrections: rows }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: rules-source-api');

  // ── PUT /api/rules/:id — edit content / category / tags ───────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/rules/:id`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'PUT' && req.method !== 'PATCH') {
          res.writeHead(405); res.end(); return;
        }
        const url = new URL(req.url || '/', 'http://x');
        const m = url.pathname.match(
          /^\/plugins\/agent-evolve\/api\/rules\/([^/]+)$/,
        );
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const id = m[1];
        const existing = getRule(state.db, id);
        if (!existing) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, id, error: 'rule not found' }));
          return;
        }
        const raw = await readRequestBody(req);
        let patch = {};
        try { patch = raw ? JSON.parse(raw) : {}; } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
          return;
        }
        const allowedKeys = ['content', 'category', 'tags'];
        const filtered = {};
        for (const k of allowedKeys) if (k in patch) filtered[k] = patch[k];
        const changes = updateRule(state.db, id, filtered);
        if (changes > 0) bumpRulesCache(state); // P3.21
        const updated = getRule(state.db, id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: changes > 0, id, changes, rule: updated }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: rules-edit-api');

  // ====================================================================
  // M2: memories + persona routes
  // ====================================================================

  // ── GET /api/memories — list ────────────────────────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/memories`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url || '/', 'http://x');
        const status = url.searchParams.get('status') || undefined;
        const type = url.searchParams.get('type') || undefined;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const rows = listMemories(state.db, { status, type, limit, offset });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(rows));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: memories-list-api');

  // ── GET /api/memories/search?q=... — FTS5 keyword search ──────────
  // Registered BEFORE the prefix /api/memories/ handler so the exact
  // match wins. The prefix handler also defensively rejects "search"
  // in case ordering changes.
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/memories/search`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const url = new URL(req.url || '/', 'http://x');
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'q parameter required' }));
          return;
        }
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
        const rows = searchMemories(state.db, q, { limit });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(rows));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: memories-search-api');

  // ── GET /api/memories/:id | DELETE /api/memories/:id | POST /api/memories/:id/archive ─
  // Prefix handler with regex parsing. Rejects /search defensively
  // (exact handler should already have served it).
  ws.register({
    kind: 'prefix',
    path: `${PREFIX}/api/memories/`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        // /search is owned by the exact handler above — explicit 404 if it ever falls through.
        if (url.pathname === `${PREFIX}/api/memories/search`) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        // /:id or /:id/archive
        const m = url.pathname.match(
          /^\/plugins\/agent-evolve\/api\/memories\/([^/]+)(\/(archive))?$/,
        );
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const id = m[1];
        const isArchive = m[3] === 'archive';

        if (isArchive) {
          // POST /api/memories/:id/archive
          if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
          const ok = archiveMemory(state.db, id);
          if (!ok) {
            const exists = getMemory(state.db, id);
            if (!exists) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, id, error: 'memory not found' }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, id, error: `cannot archive from status '${exists.status}'` }));
            }
            return;
          }
          const updated = getMemory(state.db, id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id, memory: updated }));
          return;
        }

        // /:id with no further segment
        if (req.method === 'GET') {
          const row = getMemory(state.db, id);
          if (!row) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'memory not found', id }));
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(row));
          return;
        }
        if (req.method === 'DELETE') {
          const ok = deleteMemory(state.db, id);
          res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok, id }));
          return;
        }
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'method not allowed' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: memories-action-api');

  // ── GET /api/persona — full persona ──────────────────────────────
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/persona`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const rows = getPersona(state.db);
        const lastUpdatedAt = getPersonaLatestUpdatedAt(state.db);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ persona: rows, last_updated_at: lastUpdatedAt || null }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: persona-list-api');

  // ── GET /api/persona/:key | PUT /api/persona/:key | POST /api/persona/rebuild ─
  // Prefix handler. /rebuild is owned first via exact match (further
  // down); here we handle GET /:key and PUT /:key.
  ws.register({
    kind: 'prefix',
    path: `${PREFIX}/api/persona/`,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://x');
        // /rebuild must go to the exact-match handler below; defend against fall-through.
        if (url.pathname === `${PREFIX}/api/persona/rebuild`) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        // /:key
        const m = url.pathname.match(
          /^\/plugins\/agent-evolve\/api\/persona\/([^/]+)$/,
        );
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        const key = decodeURIComponent(m[1]);
        if (!VALID_PERSONA_KEYS.includes(key)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: `invalid persona key '${key}'`,
            allowed: VALID_PERSONA_KEYS.slice(),
          }));
          return;
        }
        if (req.method === 'GET') {
          const all = getPersona(state.db);
          const row = all.find((r) => r.key === key) || null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ key, value: row?.value || null, confidence: row?.confidence || null }));
          return;
        }
        if (req.method === 'PUT' || req.method === 'PATCH') {
          const raw = await readRequestBody(req);
          let body = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
            return;
          }
          if (typeof body.value !== 'string' || !body.value.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'value (string) required' }));
            return;
          }
          const ok = updatePersonaKey(state.db, key, {
            value: body.value,
            confidence: Number.isFinite(body.confidence) ? Number(body.confidence) : 0.5,
          });
          if (!ok) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'update failed' }));
            return;
          }
          const all = getPersona(state.db);
          const row = all.find((r) => r.key === key) || null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, key, persona: row }));
          return;
        }
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'method not allowed' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: persona-key-api');

  // ── POST /api/persona/rebuild — trigger LLM-driven rebuild ─────────
  // Exact match, registered last so it takes precedence over the prefix
  // /api/persona/ handler above (DSH exact match wins anyway, but we
  // also defend inside the prefix handler).
  ws.register({
    kind: 'exact',
    path: `${PREFIX}/api/persona/rebuild`,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const llm = (() => { try { return ctx.get('llm'); } catch { return null; } })();
        if (!llm) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'llm service unavailable' }));
          return;
        }
        const result = await runPersonaRebuild({
          db: state.db, llm, cfg: liveConfig(state),
        });
        const persona = getPersona(state.db);
        const lastUpdatedAt = getPersonaLatestUpdatedAt(state.db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          updated: result.updated,
          persona,
          last_updated_at: lastUpdatedAt || null,
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: persona-rebuild-api');
}

// ────────────────────────────────────────────────────────────────────────────
// Rule promotion (correction → draft rule row)
// ────────────────────────────────────────────────────────────────────────────

async function promoteCorrectionToRule({ db, id, llm, cfg }) {
  if (!db) return { ok: false, error: 'no db' };
  const corr = getCorrection(db, id);
  if (!corr) return { ok: false, error: 'correction not found' };
  if (corr.status !== 'pending') {
    return { ok: false, error: `correction already ${corr.status}`, id, status: corr.status };
  }

  const content = corr.rule || corr.correct_action || corr.error_summary || '(no rule)';
  const category = inferCategory(corr);
  const tags = inferTags(corr);

  const ruleId = newId();
  const created_at = now();
  db.prepare(
    `INSERT INTO rules
       (id, content, category, tags, status, source_corrections, created_at)
     VALUES (?, ?, ?, ?, 'proposed', ?, ?)`,
  ).run(ruleId, content, category, JSON.stringify(tags), JSON.stringify([id]), created_at);

  markCorrectionPromoted(db, id, ruleId);
  return { ok: true, id, rule_id: ruleId, status: 'promoted' };
}

function inferCategory(corr) {
  const t = ((corr.error_summary || '') + ' ' + (corr.root_cause || '')).toLowerCase();
  if (/api|endpoint|http|fetch|request/.test(t)) return 'coding';
  if (/reply|answer|message|tone|polite/.test(t)) return 'communication';
  if (/workflow|step|order|first|then/.test(t)) return 'workflow';
  if (/danger|delete|rm|secret|token|password/.test(t)) return 'safety';
  return 'coding';
}

function inferTags(corr) {
  const text = ((corr.error_summary || '') + ' ' + (corr.rule || '') + ' ' + (corr.root_cause || '')).toLowerCase();
  const tags = new Set();
  for (const kw of ['api', 'http', 'sql', 'fs', 'file', 'env', 'git', 'web', 'image', 'tool', 'timeout', 'auth']) {
    if (text.includes(kw)) tags.add(kw);
  }
  if (tags.size === 0) tags.add('general');
  return [...tags].slice(0, 8);
}

// ────────────────────────────────────────────────────────────────────────────
// Misc helpers
// ────────────────────────────────────────────────────────────────────────────

async function readRequestBody(req) {
  if (!req || !req.readable) return '';
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// ────────────────────────────────────────────────────────────────────────────
// Exports (Cordis plugin shape: name + inject + apply, plus named re-exports
// for test scripts that import directly without going through Cordis).
// ────────────────────────────────────────────────────────────────────────────

export {
  name,
  inject,
  Config,
  apply,
};
export default apply;

// Test-friendly re-exports so scripts/test-*.js can drive modules without
// instantiating Cordis. Kept behind named exports so production DSH bundles
// don't pick them up unless they ask.
export {
  TaskQueue,
  streamLlm,
  buildMemoryPrompt,
  buildLessonPrompt,
  buildRulePrompt,
  buildPersonaPrompt,
  extractRule,
  extractPersona,
  parseJsonResponse,
} from './extract.js';
export {
  matchSignalWords,
  findSignalWords,
  extractUserText,
  extractLesson,
  insertCorrection,
  markCorrectionIgnored,
  markCorrectionPromoted,
  listCorrections,
  aggregateStats,
  DEFAULT_SIGNAL_WORDS,
} from './corrections.js';
export {
  openDatabase, newId, now, resolveDbPath,
  // M2 re-exports for test scripts
  listMemories, getMemory, deleteMemory, archiveMemory, searchMemories,
  touchMemory, getPersona, updatePersonaKey, getPersonaLatestUpdatedAt,
  upsertMemories, markMemorySuperseded, getActiveMemoriesForPersona,
  archiveRule, archiveStaleRules,
  VALID_MEMORY_STATUS, VALID_MEMORY_TYPES, VALID_PERSONA_KEYS,
} from './db.js';