// @wwskills/dsh-agent-evolve — LLM extraction helpers
//
// Exports:
//   • TaskQueue          — serial work queue with per-task timeout
//   • streamLlm          — wraps llm.stream() into a single text string
//   • buildMemoryPrompt  — ChatML messages for memory extraction
//   • buildLessonPrompt  — ChatML messages for lesson extraction
//   • parseJsonResponse  — best-effort JSON recovery from LLM text
//
// The DSH llm service exposes a streaming API:
//
//   llm.stream({ model, input: { messages, stream: true }, signal })
//     → AsyncIterable<StreamChunk>
//
// Each chunk has a `type` field. Text chunks carry `delta.text`; the
// terminal chunk has `type === 'message_stop'`. We collect every
// delta.text segment and return the full assistant message.
//
// All prompts are instruction-tuned to return raw JSON so callers can
// pipe the result through parseJsonResponse() without writing custom
// parsers per prompt.

import { newId } from './db.js';

// ────────────────────────────────────────────────────────────────────────────
// TaskQueue
// ────────────────────────────────────────────────────────────────────────────

/**
 * Serial task queue with per-task timeout.
 *
 * Tasks are `(signal: AbortSignal) => Promise<T>` callbacks. `add()`
 * returns a promise that resolves when the task completes, rejects on
 * throw / timeout / disposal. `concurrency` defaults to 1 (serial);
 * higher values run that many tasks in parallel.
 *
 * After `timeoutMs` the running task's signal is aborted. The task is
 * expected to honour the signal — if it doesn't, the timeout still
 * rejects the add() promise but the underlying task keeps running
 * until it completes on its own.
 *
 * `dispose()` rejects all queued tasks with `Error('queue disposed')`
 * and blocks future `add()` calls. Call from a ctx.effect disposer.
 */
export class TaskQueue {
  constructor({ concurrency = 1, timeout = 30000 } = {}) {
    if (concurrency < 1) throw new Error('TaskQueue: concurrency must be >= 1');
    this.concurrency = concurrency;
    this.timeout = timeout;
    this._queue = [];
    this._running = 0;
    this._disposed = false;
  }

  /**
   * Schedule a task.
   *
   * @template T
   * @param {(signal: AbortSignal) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  add(fn) {
    if (this._disposed) {
      return Promise.reject(new Error('TaskQueue: queue disposed'));
    }
    if (typeof fn !== 'function') {
      return Promise.reject(new TypeError('TaskQueue.add: fn must be a function'));
    }
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    if (this._running >= this.concurrency) return;
    const item = this._queue.shift();
    if (!item) return;
    this._running += 1;
    this._runOne(item).finally(() => {
      this._running -= 1;
      // schedule next on microtask queue to avoid stack growth
      queueMicrotask(() => this._drain());
    });
  }

  async _runOne({ fn, resolve, reject }) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`TaskQueue: timed out after ${this.timeout}ms`)),
      this.timeout,
    );
    try {
      const result = await fn(controller.signal);
      resolve(result);
    } catch (e) {
      reject(e);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Dispose the queue. Rejects pending tasks; blocks future add().
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const err = new Error('TaskQueue: queue disposed');
    while (this._queue.length) {
      const item = this._queue.shift();
      item.reject(err);
    }
  }

  /** Diagnostic: number of tasks waiting. */
  get pending() {
    return this._queue.length;
  }

  /** Diagnostic: number of tasks currently running. */
  get active() {
    return this._running;
  }

  /** Diagnostic: is the queue disposed? */
  get disposed() {
    return this._disposed;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// LLM streaming wrapper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Call llm.stream() and concatenate all text segments into one string.
 *
 * The DSH llm service API (GenerateOptions):
 *   stream({ provider, model, messages, signal?, ... })
 *
 * Both `provider` and `model` are REQUIRED by the LlmRuntime (the runtime
 * looks up the adapter via `this.adapters.get(options.provider)` and throws
 * `NO_ADAPTER` if missing). Pass them explicitly — `provider` selects which
 * adapter handles the call; `model` is the exact model id within that route.
 *
 * Each yielded chunk has a `type` field. We accept either:
 *   - { type, delta: { text: '...' } } — standard
 *   - { type, text: '...' }            — fallback
 *
 * We break on `type === 'message_stop'` or `type === 'done'`. Any other
 * chunk shape that exposes `delta.text` / `text` contributes to the
 * accumulated text.
 *
 * @param {object} llm — DSH llm service (from ctx.get('llm'))
 * @param {object} options
 * @param {string} options.provider — provider route id (e.g. 'deepseek', 'openai'); REQUIRED
 * @param {string} [options.model] — model id; '' / undefined = provider's default
 * @param {Array}  options.messages — ChatML messages array
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>}
 */
export async function streamLlm(llm, { provider, model, messages, signal } = {}) {
  if (!llm || typeof llm.stream !== 'function') {
    throw new Error('streamLlm: llm service unavailable or missing stream() method');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('streamLlm: messages array required and non-empty');
  }
  if (!provider || typeof provider !== 'string') {
    throw new Error('streamLlm: provider (string) required — DSH llm.stream() needs it to select the adapter');
  }

  // Build the GenerateOptions object. `provider` and `model` are the only
  // fields the adapter-selection path reads on this code path; everything
  // else is forwarded as-is.
  const opts = { provider, messages, signal };
  if (model) opts.model = model;

  // llm.stream may return either an AsyncIterable directly or a Promise
  // resolving to one (cordis service proxies sometimes wrap). Await when
  // we get a thenable, otherwise use the value as-is.
  const raw = llm.stream(opts);
  const iter = (raw && typeof raw.then === 'function') ? await raw : raw;
  if (!iter || typeof iter[Symbol.asyncIterator] !== 'function') {
    throw new Error('streamLlm: llm.stream() did not return an async iterable');
  }

  let text = '';
  for await (const chunk of iter) {
    if (!chunk) continue;
    if (chunk.delta && typeof chunk.delta.text === 'string') {
      text += chunk.delta.text;
    } else if (typeof chunk.text === 'string') {
      text += chunk.text;
    }
    if (chunk.type === 'message_stop' || chunk.type === 'done') break;
  }
  return text;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ────────────────────────────────────────────────────────────────────────────

/**
 * P3.22: system prompts extracted to module-level constants so they can
 * be inspected, overridden, or templated without grepping inside the
 * builder functions.
 *
 * Customisation hook (forward-compatible): pass `cfg.customPrompts` shaped
 * as `{ memory?, lesson?, rule?, persona? }` to override individual
 * constants. Falls back to the baked-in default when the override is
 * absent / not a string.
 */
export const MEMORY_PROMPT_SYSTEM = [
  'You extract durable user preferences, facts, decisions, and skills from a single conversation turn.',
  '',
  'Return a JSON array of memory objects. Each object has exactly these keys:',
  '  { "type": "preference|fact|decision|skill",',
  '    "content": "<durable knowledge, plain text>",',
  '    "confidence": 0.0-1.0,',
  '    "tags": ["<short-tag>", ...] }',
  '',
  'Rules:',
  '  - Only durable knowledge that survives across sessions.',
  '  - Skip transient task chatter, greetings, and one-off requests.',
  '  - Be conservative: prefer [] over false positives.',
  '  - If nothing durable was expressed, return [] exactly.',
  '  - Return ONLY the JSON array — no prose, no markdown fence.',
].join('\n');

export const LESSON_PROMPT_SYSTEM = [
  'You extract a structured lesson from a conversation where the agent made a mistake.',
  '',
  'Return a JSON object with exactly these keys:',
  '  {',
  '    "error_summary": "<one-line description of what went wrong, ≤ 80 chars>",',
  '    "root_cause":    "<why it went wrong, one sentence>",',
  '    "correct_action":"<what should have been done instead, one sentence>",',
  '    "rule":          "<a concise guardrail the agent should follow next time, ≤ 120 chars>",',
  '    "confidence":    0.0-1.0',
  '  }',
  '',
  'Rules:',
  '  - Be terse and specific.',
  '  - If you cannot extract a clear lesson, return exactly',
  '    { "error_summary": "<short reason>", "confidence": 0.0 }.',
  '  - Return ONLY the JSON object — no prose, no markdown fence.',
].join('\n');

export const RULE_PROMPT_SYSTEM = [
  'You synthesise a single, generalisable rule from a batch of related corrections.',
  '',
  'Each input correction is an instance where the agent made a mistake. Your job is to',
  'find the COMMON PATTERN across the batch and write ONE rule that, if followed, would',
  'have prevented every one of them.',
  '',
  'Return a JSON object with exactly these keys:',
  '  {',
  '    "content":    "<the generalisable rule, ≤ 160 chars, imperative form, e.g. \"Verify required env vars before calling <API>\">",',
  '    "category":   "coding|communication|workflow|safety",',
  '    "tags":       ["<short-tag>", "<short-tag>", ...],   // ≤ 8 tags',
  '    "confidence": 0.0-1.0',
  '  }',
  '',
  'Critical rules:',
  '  - DO NOT summarise each correction individually. Extract the COMMON PATTERN.',
  '  - The rule must be specific enough to be actionable but general enough to cover all input cases.',
  '  - Pick ONE category that fits the rule best.',
  '  - Tags should be short keywords useful for matching (lowercase, ASCII preferred).',
  '  - If the corrections share no common pattern, return exactly',
  '    { "content": "", "category": "coding", "tags": [], "confidence": 0.0 }.',
  '  - Return ONLY the JSON object — no prose, no markdown fence.',
  '  - 归纳通用规则：从多条纠正中提取共性模式，不要逐条总结。',
].join('\n');

export const PERSONA_PROMPT_SYSTEM = [
  'You construct a user persona from a list of extracted memory facts.',
  '',
  'Return a JSON array of persona fields. Each object has exactly these keys:',
  '  {',
  '    "key":         "tech_stack|coding_style|communication|common_tasks",',
  '    "value":       "<concise summary, ≤ 200 chars>",',
  '    "confidence":  0.0-1.0',
  '  }',
  '',
  'Rules:',
  '  - Cover only the keys that have clear support in the input.',
  '  - If a dimension has no evidence, OMIT it — do NOT fabricate.',
  '  - "value" must be a concise summary, NOT a verbatim quote from a memory.',
  '  - Confidence reflects how well-supported the summary is. Sparse input → lower confidence (0.3-0.5).',
  '  - Use ≤ 4 entries total (one per applicable key).',
  '  - Return ONLY the JSON array — no prose, no markdown fence.',
].join('\n');

/**
 * Internal helper: pick the customised system prompt when available,
 * fall back to the baked-in default. Centralises the override pattern
 * so the four builders stay symmetric.
 */
function pickPrompt(name, fallback, cfg) {
  const custom = cfg && cfg.customPrompts;
  if (custom && typeof custom[name] === 'string' && custom[name].trim()) {
    return custom[name];
  }
  return fallback;
}

/**
 * Build the prompt for memory extraction.
 *
 * Input shape (turn data from session/event):
 *   { user: string, assistant: string, toolResults?: Array<{name, summary}> }
 *
 * Output: ChatML messages array that, when answered, yields a JSON
 * array of memory candidates:
 *   [{ type, content, confidence, tags }]
 *
 * Empty input yields a no-op prompt (returns []).
 */
export function buildMemoryPrompt(turnData, cfg = {}) {
  const system = {
    role: 'system',
    content: pickPrompt('memory', MEMORY_PROMPT_SYSTEM, cfg),
  };

  const data = turnData && typeof turnData === 'object' ? turnData : {};
  const lines = [];
  if (data.user) lines.push(`USER: ${data.user}`);
  if (data.assistant) lines.push(`ASSISTANT: ${data.assistant}`);
  if (Array.isArray(data.toolResults)) {
    for (const tr of data.toolResults) {
      if (!tr) continue;
      const name = tr.name || '?';
      const summary = tr.summary || tr.result || '';
      lines.push(`TOOL ${name}: ${summary}`);
    }
  }

  return [
    system,
    { role: 'user', content: lines.join('\n') || '(empty turn — nothing to extract)' },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Rule extraction (M1) — synthesise ONE generalisable rule from N corrections
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the prompt for LLM-driven rule extraction.
 *
 * The system prompt explicitly forbids per-correction summarisation —
 * the model must find the COMMON PATTERN across the input batch and
 * write a single rule that, if followed, would have prevented every
 * one of them.
 *
 * Input: an array of correction objects with the same shape as the
 * `corrections` table:
 *   { trigger, error_summary, root_cause, correct_action, rule, ... }
 *
 * Output: ChatML messages that, when answered, yield a JSON object:
 *   { content, category, tags, confidence }
 *
 * The `content` field is the synthesised rule (imperative form,
 * ≤ 160 chars). The `category` is one of
 * coding / communication / workflow / safety. `tags` is a small array
 * of short keywords useful for matching. `confidence` is 0-1.
 *
 * When the corrections share no common pattern, the model should
 * return `{ content: "", category: "coding", tags: [], confidence: 0.0 }`.
 */
export function buildRulePrompt(corrections, cfg = {}) {
  const list = Array.isArray(corrections) ? corrections.filter(Boolean) : [];
  if (list.length === 0) return [];

  const system = {
    role: 'system',
    content: pickPrompt('rule', RULE_PROMPT_SYSTEM, cfg),
  };

  const lines = [];
  lines.push(`Number of corrections in this batch: ${list.length}`);
  lines.push('');
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i] || {};
    lines.push(`--- Correction ${i + 1} (trigger=${c.trigger || 'unknown'}) ---`);
    if (c.error_summary) lines.push(`Error:     ${c.error_summary}`);
    if (c.root_cause) lines.push(`Cause:     ${c.root_cause}`);
    if (c.correct_action) lines.push(`Correct:   ${c.correct_action}`);
    if (c.rule) lines.push(`Draft rule: ${c.rule}`);
    lines.push('');
  }
  if (list.length === 0) {
    lines.push('(no corrections provided — nothing to synthesise)');
  } else {
    lines.push(
      'Synthesise ONE generalisable rule (imperative form) that, if followed, would have prevented every correction above.',
    );
  }

  return [
    system,
    { role: 'user', content: lines.join('\n') },
  ];
}

/**
 * Run rule extraction via the LLM stream and return the parsed result.
 *
 * Wraps `streamLlm(llm, { provider, model, messages, signal })` with the
 * `buildRulePrompt` output, then runs `parseJsonResponse` to recover
 * the JSON object. Returns null when llm is missing, the input batch
 * is empty, or the call fails.
 *
 * The returned shape is normalised:
 *   - content: trimmed string, ≤ 500 chars (extra length preserved
 *     for tags / dedup later), default '' on absence
 *   - category: must be in VALID_RULE_CATEGORIES, else 'coding'
 *   - tags: array of lowercased short strings, capped at 8
 *   - confidence: finite number in [0, 1], default 0.5
 *
 * @param {object} args
 * @param {object} args.llm — DSH llm service (ctx.get('llm'))
 * @param {Array}  args.corrections — input correction batch
 * @param {object} [args.cfg] — config passthrough (unused for now)
 * @param {AbortSignal} [args.signal]
 * @param {string} [args.model] — model override; '' = follow current
 * @param {string} [args.provider] — provider route id (REQUIRED — passed to llm.stream)
 * @returns {Promise<{ content, category, tags, confidence } | null>}
 */
export async function extractRule({ llm, corrections, cfg = {}, signal, model, provider } = {}) {
  if (!llm) return null;
  const list = Array.isArray(corrections) ? corrections : [];
  if (list.length === 0) return null;

  const messages = buildRulePrompt(list, cfg);
  let response;
  try {
    response = await streamLlm(llm, { provider, model, messages, signal });
  } catch (e) {
    console.warn('[agent-evolve] extractRule: llm.stream failed:', e?.message || e);
    return null;
  }

  const parsed = parseJsonResponse(response);
  if (!parsed || typeof parsed !== 'object') {
    return { content: '', category: 'coding', tags: [], confidence: 0 };
  }

  const validCats = ['coding', 'communication', 'workflow', 'safety'];
  const content = typeof parsed.content === 'string' ? parsed.content.trim().slice(0, 500) : '';
  const category = validCats.includes(parsed.category) ? parsed.category : 'coding';
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.toLowerCase().trim().slice(0, 24))
      .slice(0, 8)
    : [];
  const rawConf = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConf)
    ? Math.max(0, Math.min(1, rawConf))
    : 0.5;

  return { content, category, tags, confidence };
}

/**
 * Build the prompt for lesson extraction (correction triggered by user).
 *
 * Input:
 *   text      — the user message containing the correction signal
 *   context   — optional 3-turn window of { role, text }
 *   sessionHint — optional session id (logged for traceability)
 *
 * Output: ChatML messages that, when answered, yield a JSON object:
 *   { error_summary, root_cause, correct_action, rule, confidence }
 */
export function buildLessonPrompt({ text, context, sessionHint } = {}, cfg = {}) {
  const system = {
    role: 'system',
    content: pickPrompt('lesson', LESSON_PROMPT_SYSTEM, cfg),
  };

  const lines = [];
  if (sessionHint) lines.push(`SESSION: ${sessionHint}`);
  if (Array.isArray(context)) {
    for (const t of context) {
      if (!t) continue;
      const who = (t.role || t.speaker || '?').toString().toUpperCase();
      const body = (t.text || t.content || '').toString();
      if (body) lines.push(`${who}: ${body}`);
    }
  }
  lines.push(`USER (correction signal): ${text || '(no text)'}`);

  return [
    system,
    { role: 'user', content: lines.join('\n') || '(empty context)' },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Persona extraction (M2) — synthesise 4-dim persona from active memories
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the prompt for persona construction (L3 layer).
 *
 * Input: an array of memory objects (same shape as the `memories`
 * table). The caller picks the active memories ranked by usefulness
 * (we use `getActiveMemoriesForPersona` — access_count DESC then
 * created_at DESC).
 *
 * Output: ChatML messages that, when answered, yield a JSON ARRAY of
 * persona fields:
 *
 *   [
 *     { "key": "tech_stack",     "value": "<summary>", "confidence": 0.0-1.0 },
 *     { "key": "coding_style",   "value": "<summary>", "confidence": 0.0-1.0 },
 *     { "key": "communication",  "value": "<summary>", "confidence": 0.0-1.0 },
 *     { "key": "common_tasks",   "value": "<summary>", "confidence": 0.0-1.0 }
 *   ]
 *
 * Empty input yields a no-op prompt (returns []) — the caller is
 * expected to skip the LLM call when there are no memories to draw
 * from.
 *
 * Notes for the model:
 *   - Cover only the keys that have clear support in the input. If a
 *     dimension has no evidence, omit it (don't fabricate).
 *   - `value` is a CONCISE summary (≤ 200 chars), not a verbatim quote.
 *   - `confidence` reflects how well-supported the summary is — when
 *     the input is sparse, return lower numbers (0.3-0.5).
 */
export function buildPersonaPrompt(memories, cfg = {}) {
  const list = Array.isArray(memories) ? memories.filter(Boolean) : [];
  // Empty input yields a no-op prompt (mirrors buildRulePrompt). Caller
  // is expected to skip the LLM call when no memories are available.
  if (list.length === 0) return [];

  const system = {
    role: 'system',
    content: pickPrompt('persona', PERSONA_PROMPT_SYSTEM, cfg),
  };

  const lines = [];
  lines.push(`Number of memories: ${list.length}`);
  lines.push('');
  for (let i = 0; i < list.length; i += 1) {
    const m = list[i] || {};
    const type = m.type || 'fact';
    const content = m.content || '';
    const conf = Number.isFinite(m.confidence) ? Number(m.confidence).toFixed(2) : '0.5';
    const acc = Number(m.access_count || 0);
    lines.push(`${i + 1}. [${type}, conf=${conf}, accessed=${acc}x] ${content}`);
    lines.push('');
  }
  if (list.length === 0) {
    lines.push('(no memories provided — nothing to synthesise)');
  } else {
    lines.push(
      'Synthesise the user persona. Output exactly 0-4 entries, one per applicable key. Be concise and only return well-supported fields.',
    );
  }

  return [
    system,
    { role: 'user', content: lines.join('\n') },
  ];
}

/**
 * Run persona construction via the LLM stream and return the parsed
 * result.
 *
 * Wraps `streamLlm(llm, { provider, model, messages, signal })` with the
 * `buildPersonaPrompt` output, then runs `parseJsonResponse` to
 * recover the JSON array. Returns null when llm is missing, the
 * input batch is empty, or the call fails.
 *
 * The returned shape is normalised:
 *   - `key`: must be in VALID_PERSONA_KEYS (drop others)
 *   - `value`: trimmed string, ≤ 2000 chars
 *   - `confidence`: finite number in [0, 1], default 0.5
 *
 * @param {object} args
 * @param {object} args.llm — DSH llm service (ctx.get('llm'))
 * @param {Array}  args.memories — input active-memory batch
 * @param {object} [args.cfg] — config passthrough (unused for now)
 * @param {AbortSignal} [args.signal]
 * @param {string} [args.model] — model override; '' = follow current
 * @param {string} [args.provider] — provider route id (REQUIRED — passed to llm.stream)
 * @returns {Promise<Array<{ key, value, confidence }> | null>}
 */
export async function extractPersona({ llm, memories, cfg = {}, signal, model, provider } = {}) {
  if (!llm) return null;
  const list = Array.isArray(memories) ? memories : [];
  if (list.length === 0) return null;

  const messages = buildPersonaPrompt(list, cfg);
  let response;
  try {
    response = await streamLlm(llm, { provider, model, messages, signal });
  } catch (e) {
    console.warn('[agent-evolve] extractPersona: llm.stream failed:', e?.message || e);
    return null;
  }

  const parsed = parseJsonResponse(response);
  if (!Array.isArray(parsed)) return [];

  const validKeys = ['tech_stack', 'coding_style', 'communication', 'common_tasks'];
  const out = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (!validKeys.includes(key)) continue;
    const value = typeof entry.value === 'string' ? entry.value.trim().slice(0, 2000) : '';
    if (!value) continue;
    const rawConf = Number(entry.confidence);
    const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf)) : 0.5;
    out.push({ key, value, confidence });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// JSON recovery
// ────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort JSON extraction from a free-form LLM response.
 *
 * The prompt instructs the model to return raw JSON, but it sometimes
 * wraps in a markdown fence or adds prose. We try:
 *   1. Direct JSON.parse on the trimmed text
 *   2. Strip a ```json ... ``` or ``` ... ``` fence, parse inside
 *   3. Find the first JSON-looking substring ({...} or [...]), parse
 *
 * Returns the parsed value, or null if nothing usable was found.
 */
export function parseJsonResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Direct parse
  try { return JSON.parse(trimmed); } catch { /* fall through */ }

  // 2. Strip a markdown fence
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { /* fall through */ }
  }

  // 3. First JSON-looking substring
  const block = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (block) {
    try { return JSON.parse(block[1]); } catch { /* fall through */ }
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Re-exports
// ────────────────────────────────────────────────────────────────────────────

// Re-exported here so callers can build lessons + persist them with a
// single import of extract.js. corrections.js re-imports these.
export { newId };