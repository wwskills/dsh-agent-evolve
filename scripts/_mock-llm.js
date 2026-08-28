// @wwskills/dsh-agent-evolve — Shared mock helpers for test scripts
//
// Tiny utilities used by test-m2.js (and reusable by future tests):
//   • makeMockCtx()      — minimal Cordis ctx that records effects, listeners,
//                          intervals, injects, and services
//   • setMockLlm(text)   — stub the global mock LLM response
//   • makeMockStream()   — build an async iterable that emits the configured
//                          text chunk-by-chunk and a `message_stop` terminator
//
// Keep this dependency-free so test-m2.js stays self-contained.

let mockLlmResponse = '';
let mockLlmChunks = null;

export function setMockLlm(text) {
  mockLlmResponse = typeof text === 'string' ? text : '';
  mockLlmChunks = null;
}

export function setMockLlmChunks(chunks) {
  mockLlmChunks = Array.isArray(chunks) ? chunks.slice() : null;
  mockLlmResponse = '';
}

export function resetMockLlm() {
  mockLlmResponse = '';
  mockLlmChunks = null;
}

/**
 * Build an async iterable that yields a single delta.text chunk with the
 * configured mock response, then a `message_stop` terminator. Mirrors the
 * chunk shape that `streamLlm` (extract.js) understands.
 *
 * @param {object} _opts — passed in by streamLlm; ignored by the mock
 * @returns {AsyncIterable<{ type: string, delta?: { text: string } }>}
 */
export function makeMockStream(_opts, overrideChunks = null) {
  const chunks = overrideChunks || mockLlmChunks;
  const text = mockLlmResponse;
  return {
    [Symbol.asyncIterator]: async function* () {
      if (chunks) {
        for (const c of chunks) yield c;
        return;
      }
      if (text) yield { type: 'content_block_delta', delta: { text } };
      yield { type: 'message_stop' };
    },
  };
}

/**
 * Build a mock LLM service object. Use this as the value passed to
 * `ctx.setService('llm', buildMockLlm())`. The .stream() method returns
 * a makeMockStream() iterable.
 */
export function buildMockLlm() {
  return {
    stream(opts) {
      return makeMockStream(opts);
    },
  };
}

/**
 * Construct a minimal Cordis ctx that records effects, listeners,
 * intervals, injects, and services. Mirrors what test-index.js builds
 * inline so test-m2.js (and future tests) can reuse it.
 */
export function makeMockCtx() {
  const effects = [];
  const listeners = new Map();
  const intervals = [];
  const injects = [];
  const services = new Map();

  const ctx = {
    effect(fn, label) {
      const entry = { fn, label, dispose: () => {
        try {
          const d = fn();
          if (typeof d === 'function') d();
        } catch (e) {
          console.warn(`[test] dispose error in ${label}: ${e.message}`);
        }
      } };
      effects.push(entry);
      return entry;
    },
    on(event, cb, opts) {
      const list = listeners.get(event) || [];
      list.push({ cb, opts });
      listeners.set(event, list);
      return () => {
        const cur = listeners.get(event) || [];
        const idx = cur.findIndex((l) => l.cb === cb);
        if (idx >= 0) cur.splice(idx, 1);
        listeners.set(event, cur);
      };
    },
    interval(fn, ms) {
      const disposer = () => {};
      intervals.push({ fn, ms, disposer });
      return disposer;
    },
    timeout(fn, ms) {
      const disposer = () => {};
      return disposer;
    },
    inject(names, cb) {
      injects.push({ names, cb });
      const allPresent = names.every((n) => services.has(n));
      if (allPresent) {
        try {
          const subCtx = {};
          for (const n of names) subCtx[n] = services.get(n);
          const result = cb(subCtx);
          if (typeof result === 'function') return result;
        } catch (e) {
          console.warn(`[test] inject(${names.join(',')}) sync cb error:`, e.message);
        }
      }
      return () => {};
    },
    get(name) {
      return services.get(name);
    },
    setService(name, svc) {
      services.set(name, svc);
      const isListeners = listeners.get('internal/service') || [];
      for (const l of isListeners) {
        try { l.cb(name); } catch (e) { console.warn('[test] service cb error:', e.message); }
      }
    },
    _effects: effects,
    _listeners: listeners,
    _intervals: intervals,
    _injects: injects,
    _services: services,
  };
  return ctx;
}
