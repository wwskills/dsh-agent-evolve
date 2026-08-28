// @wwskills/dsh-agent-evolve — Host-side plugin entry
//
// Cordis plugin descriptor for the @wwskills/dsh-agent-evolve package.
//
// Mounts:
//   • SQLite (WAL + FTS5 triggers) via openDatabase() from db.js
//   • session/event listener — turn/end schedules memory extraction
//     every batchSize turns; user/message runs signal-word detection
//     and triggers lesson extraction. All handlers are wrapped in
//     try-catch so a crash in one branch doesn't poison the rest.
//   • LLM extraction queue — TaskQueue with concurrency=1 + 30s
//     per-task timeout. LLM calls go through streamLlm (the llm
//     service exposes only .stream(), not .chat()).
//   • Embedding auto-detect — fire-and-forget probe of local Ollama,
//     result cached in memory. Failure silently degrades to keyword
//     matching.
//   • Daily decay timer — ctx.interval() (timer is a mixin, not a
//     service; methods live directly on ctx).
//   • Settings namespace — DSH settings service so the WebUI can
//     read/write live config that survives restart.
//   • Web API — registered lazily via ws.register({...}). Listens for
//     internal/service 'webServer' so routes attach once the webServer
//     service is available.
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
  incrementRuleHit,
  getRulesForInjection,
  countPendingCorrections,
  listPendingCorrections,
  listCorrectionsByIds,
  VALID_RULE_STATUS,
  VALID_RULE_CATEGORIES,
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
  DEFAULT_SIGNAL_WORDS,
} from './corrections.js';
import { TaskQueue, streamLlm, buildMemoryPrompt, parseJsonResponse, buildRulePrompt, extractRule } from './extract.js';

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
  model: Schema.string().default(''),
  llmTimeoutMs: Schema.natural().default(30000),
  ruleThreshold: Schema.natural().default(5),
  ruleTokenBudget: Schema.natural().default(800),
  personaEverySessions: Schema.natural().default(50),
  personaEveryMs: Schema.natural().default(604800000),
  signalWords: Schema.array(Schema.string()).default([]),
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
    lastProcessedSeq: 0,
    turnCount: 0,
  };

  // ── 3. Extraction queue ──────────────────────────────────────────────
  state.extractQueue = new TaskQueue({ concurrency: 1, timeout: cfg.llmTimeoutMs });
  ctx.effect(() => () => state.extractQueue.dispose(), 'agent-evolve: extract queue');

  // ── 4. Embedding auto-detect (async, non-blocking) ───────────────────
  resolveEmbeddingProvider(cfg.embedding).then((result) => {
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

  // ── 5b. agent/pre-step — context injection for approved rules (M1) ───
  // Mirrors the waterfall-event pattern used by dsh-long-memory and
  // dsh-plan-mode: accept `(input, next)`, await `next()`, mutate the
  // decision's `messages` array, return. On any error we continue the
  // chain with `next()` so the agent is never stranded.
  ctx.on('agent/pre-step', async (_input, next) => {
    try {
      const decision = await next();
      if (!decision || decision.kind === 'reject') return decision;
      const cfgNow = liveConfig(state);
      if (!cfgNow.enabled) return decision;
      const augmented = buildPitfallsContext(state, decision, cfgNow);
      if (augmented) {
        const msgs = Array.isArray(decision.messages) ? decision.messages.slice() : [];
        msgs.push(augmented);
        decision.messages = msgs;
        // Increment hit_count for rules we actually injected.
        for (const id of augmented.__hitIds || []) {
          try { incrementRuleHit(state.db, id); } catch { /* swallow */ }
        }
      }
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

  // ── 8. Web API — register lazily once webServer is available ─────────
  registerWebRoutes(ctx, state);
}

// ────────────────────────────────────────────────────────────────────────────
// Config helpers
// ────────────────────────────────────────────────────────────────────────────

function normaliseConfig(config) {
  const cfg = { ...(config || {}) };
  cfg.dbPath = typeof cfg.dbPath === 'string' ? cfg.dbPath : '';
  cfg.enabled = cfg.enabled !== false;
  cfg.batchSize = Number.isFinite(cfg.batchSize) ? cfg.batchSize : 3;
  cfg.model = typeof cfg.model === 'string' ? cfg.model : '';
  cfg.llmTimeoutMs = Number.isFinite(cfg.llmTimeoutMs) ? cfg.llmTimeoutMs : 30000;
  cfg.ruleThreshold = Number.isFinite(cfg.ruleThreshold) ? cfg.ruleThreshold : 5;
  cfg.ruleTokenBudget = Number.isFinite(cfg.ruleTokenBudget) ? cfg.ruleTokenBudget : 800;
  cfg.personaEverySessions = Number.isFinite(cfg.personaEverySessions) ? cfg.personaEverySessions : 50;
  cfg.personaEveryMs = Number.isFinite(cfg.personaEveryMs) ? cfg.personaEveryMs : 7 * 24 * 60 * 60 * 1000;
  cfg.signalWords = Array.isArray(cfg.signalWords) && cfg.signalWords.length > 0
    ? cfg.signalWords.slice()
    : DEFAULT_SIGNAL_WORDS.slice();
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

  // ── turn/end: schedule memory extraction every batchSize turns ──
  if (event.type === 'turn/end') {
    const seq = Number(event.seq || 0);
    if (seq && seq <= state.lastProcessedSeq) return; // dedup replayed events
    if (seq) state.lastProcessedSeq = seq;

    state.turnCount += 1;
    if (state.turnCount % cfg.batchSize !== 0) return;

    const turnData = extractTurnData(event);

    state.extractQueue.add(async (signal) => {
      const llm = ctx.get('llm');
      if (!llm) return;
      try {
        await runMemoryExtraction({
          db: state.db, llm, cfg, signal, sessionId, turnData,
        });
      } catch (e) {
        console.warn('[agent-evolve] memory extraction failed:', e?.message || e);
      }
    });

    // M1: also schedule rule extraction when the pending-corrections
    // backlog crosses cfg.ruleThreshold. Independent of memory
    // extraction — both can run back-to-back in the same queue slot.
    if (countPendingCorrections(state.db) >= (cfg.ruleThreshold | 0 || 5)) {
      state.extractQueue.add(async (signal) => {
        const llm = ctx.get('llm');
        if (!llm) return;
        try {
          await runRuleExtraction({
            db: state.db, llm, cfg, signal, sessionId,
          });
        } catch (e) {
          console.warn('[agent-evolve] rule extraction failed:', e?.message || e);
        }
      });
    }
    return;
  }

  // ── user/message: check correction signal words ────────────────
  if (event.type === 'user/message' || event.type === 'user_message') {
    const text = extractUserText(event);
    if (!text) return;
    if (!matchSignalWords(text, cfg.signalWords)) return;

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
// LLM extraction
// ────────────────────────────────────────────────────────────────────────────

async function runMemoryExtraction({ db, llm, cfg, signal, sessionId, turnData }) {
  if (!db || !llm) return;
  if (!turnData.user && !turnData.assistant && !(turnData.toolResults && turnData.toolResults.length)) {
    return;
  }

  const messages = buildMemoryPrompt(turnData, cfg);
  const text = await streamLlm(llm, {
    model: cfg.model || undefined,
    messages,
    signal,
  });

  const memories = parseJsonResponse(text);
  if (!Array.isArray(memories) || memories.length === 0) return;

  const insert = db.prepare(
    `INSERT INTO memories
       (id, type, content, confidence, session_id, created_at, origin)
     VALUES (?, ?, ?, ?, ?, ?, 'extracted')`,
  );

  let count_ = 0;
  const tx = db.transaction(() => {
    for (const m of memories) {
      if (!m || typeof m.content !== 'string') continue;
      const type = ['preference', 'fact', 'decision', 'skill'].includes(m.type) ? m.type : 'fact';
      const confidence = Number.isFinite(m.confidence) ? Number(m.confidence) : 0.5;
      insert.run(newId(), type, m.content.slice(0, 1000), confidence, sessionId, now());
      count_ += 1;
    }
  });
  tx();

  if (count_ > 0) {
    bumpUsage(db, 'extractions', count_);
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
  const rules = getRulesForInjection(state.db, { limit: 50 });
  if (!rules || rules.length === 0) return null;

  const scored = [];
  for (const r of rules) {
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
// Decay
// ────────────────────────────────────────────────────────────────────────────

function runDecayCheck(db) {
  if (!db) return;
  try {
    const ts = now();
    const r1 = db.prepare(
      `UPDATE memories
          SET weight = MAX(0.1, weight - 0.1)
        WHERE last_accessed IS NOT NULL
          AND last_accessed < ?
          AND status = 'active'`,
    ).run(ts - 30 * 86400000);
    const r2 = db.prepare(
      `UPDATE memories SET status = 'archived'
        WHERE last_accessed IS NOT NULL
          AND last_accessed < ?
          AND status = 'active'`,
    ).run(ts - 90 * 86400000);
    if (r1.changes > 0 || r2.changes > 0) {
      console.log(`[agent-evolve] decay: weight-=${r1.changes}, archived=${r2.changes}`);
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

async function resolveEmbeddingProvider(cfg) {
  if (!cfg || cfg.autoDetect === false) return null;
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

// ────────────────────────────────────────────────────────────────────────────
// Web API
// ────────────────────────────────────────────────────────────────────────────

const PREFIX = '/plugins/agent-evolve';

function registerWebRoutes(ctx, state) {
  let registered = false;

  const tryRegister = () => {
    if (registered) return;
    const ws = ctx.get('webServer');
    if (!ws || typeof ws.register !== 'function') return;
    registered = true;

    registerRoutes(ws, ctx, state);
  };

  tryRegister();
  // Re-attempt on service registration events. internal/service is the
  // cordis emit event for new service bindings.
  ctx.on('internal/service', (serviceName) => {
    if (serviceName === 'webServer') tryRegister();
  });
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
            model: merged.model,
            ruleThreshold: merged.ruleThreshold,
            ruleTokenBudget: merged.ruleTokenBudget,
            signalWords: merged.signalWords,
            embedding: merged.embedding,
          }));
          return;
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const raw = await readRequestBody(req);
          const patch = raw ? JSON.parse(raw) : {};
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
          res.end(JSON.stringify({ ok: true, config: state.cfg }));
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
          const ok = approveRule(state.db, id);
          if (ok) bumpUsage(state.db, 'rules_approved', 1);
          const updated = getRule(state.db, id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok, id, rule: updated }));
          return;
        }
        if (action === 'reject') {
          const ok = rejectRule(state.db, id);
          const updated = getRule(state.db, id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok, id, rule: updated }));
          return;
        }
        if (action === 'promote') {
          const ok = promoteRule(state.db, id);
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
        const updated = getRule(state.db, id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: changes > 0, id, changes, rule: updated }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    },
  }, 'agent-evolve: rules-edit-api');
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
export { TaskQueue, streamLlm, buildMemoryPrompt, buildLessonPrompt, parseJsonResponse } from './extract.js';
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
export { openDatabase, newId, now, resolveDbPath } from './db.js';