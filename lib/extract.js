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
 * The DSH llm service API:
 *   stream({ model, input: { messages, stream: true }, signal })
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
 * @param {string} [options.model] — model id; '' / undefined = follow user's current model
 * @param {Array}  options.messages — ChatML messages array
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>}
 */
export async function streamLlm(llm, { model, messages, signal } = {}) {
  if (!llm || typeof llm.stream !== 'function') {
    throw new Error('streamLlm: llm service unavailable or missing stream() method');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('streamLlm: messages array required and non-empty');
  }

  const opts = {
    input: { messages, stream: true },
    signal,
  };
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
export function buildMemoryPrompt(turnData, _cfg = {}) {
  const system = {
    role: 'system',
    content: [
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
    ].join('\n'),
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
export function buildLessonPrompt({ text, context, sessionHint } = {}) {
  const system = {
    role: 'system',
    content: [
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
    ].join('\n'),
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