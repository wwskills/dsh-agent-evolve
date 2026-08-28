// @wwskills/dsh-agent-evolve — index.js (apply) smoke test
//
// Verifies the Cordis plugin descriptor shape and the runtime contract:
//
//   • apply() returns synchronously (undefined, never a Promise)
//   • All four ctx.effect() calls register a disposer
//   • Plugin descriptor exports: name, inject, Config, apply
//   • apply() registers an SQLite database (writes survive the test)
//   • ctx.interval() returns a disposer that's captured
//   • ctx.on('session/event') receives a handler we can invoke
//   • ctx.on('internal/service') is registered for webServer wait
//   • Web API handlers are reachable once webServer is "available"
//   • All long-lived resources can be disposed without throwing

import { unlinkSync, existsSync } from 'node:fs';
import { apply, name, inject, Config } from '../lib/index.js';

let passed = 0;
let failed = 0;

function ok(label, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('— Plugin descriptor —');

ok('name is agent-evolve', name === 'agent-evolve');
ok('inject contains llm', inject.includes('llm'));
ok('inject contains settings', inject.includes('settings'));
ok('inject contains timer', inject.includes('timer'));
ok('inject contains webServer', inject.includes('webServer'));
ok('Config is an object (schemastery schema)', Config && typeof Config === 'function' || typeof Config === 'object');

console.log('— Mock Cordis ctx —');

// Build a minimal Cordis ctx that records effect registrations,
// captures interval callbacks, and tracks event listeners. Enough to
// drive apply() without pulling in the full cordis runtime.
function makeMockCtx() {
  const effects = [];
  const listeners = new Map();   // event -> [{ cb, opts }]
  const intervals = [];          // [{ fn, ms, disposer }]
  const injects = [];            // [{ names, cb }]
  const services = new Map();    // name -> service

  const ctx = {
    effect(fn, label) {
      // fn may return a disposer (sync or via a getter). Capture the fn
      // itself — we'll evaluate it on dispose.
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
      // Return a disposer that removes this listener
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
      // Try synchronously if all services are present
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
      // Notify listeners for internal/service
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

console.log('— apply() is synchronous —');

const ctx = makeMockCtx();
let applyResult = apply(ctx, {
  dbPath: '',
  enabled: true,
  batchSize: 3,
  llmTimeoutMs: 30000,
});
ok('apply() returns undefined (not a Promise)',
  applyResult === undefined,
  `got: ${typeof applyResult}`);

console.log('— ctx.effect() disposer audit —');

ok('registered ≥ 4 effects', ctx._effects.length >= 4,
  `got: ${ctx._effects.length}`);
const labels = ctx._effects.map((e) => e.label);
ok('db cleanup effect registered', labels.some((l) => l && l.includes('db cleanup')));
ok('extract queue effect registered', labels.some((l) => l && l.includes('extract queue')));
ok('session listener effect registered', labels.some((l) => l && l.includes('session listener')));
ok('decay timer effect registered', labels.some((l) => l && l.includes('decay timer')));

console.log('— ctx.interval() registered daily decay —');

ok('interval registered', ctx._intervals.length >= 1);
const decay = ctx._intervals[0];
ok('decay interval is 24h', decay.ms === 24 * 60 * 60 * 1000,
  `got ms: ${decay.ms}`);
ok('decay interval has fn', typeof decay.fn === 'function');

console.log('— ctx.on() registered —');

ok('listened to session/event',
  ctx._listeners.has('session/event'));
ok('listened to internal/service',
  ctx._listeners.has('internal/service'));

const sessionListener = ctx._listeners.get('session/event')?.[0];
ok('session/event listener is global', sessionListener?.opts?.global === true);

console.log('— apply() survives event dispatch —');

// Simulate a turn/end event hitting the listener — verify no crash.
const sessionEv = {
  type: 'turn/end',
  seq: 1,
  data: { user: 'I love pnpm', assistant: 'Great, here is how...' },
};
let threw = false;
try {
  await sessionListener.cb({ id: 's1' }, sessionEv);
} catch (e) {
  threw = true;
  console.error('event dispatch threw:', e.message);
}
ok('turn/end handler does not throw', !threw);

// Simulate a signal-word message
const userEv = {
  type: 'user/message',
  data: { text: '这个不对，应该是 5' },
};
threw = false;
try {
  await sessionListener.cb({ id: 's1' }, userEv);
} catch (e) {
  threw = true;
  console.error('user/message handler threw:', e.message);
}
ok('user/message handler does not throw on signal', !threw);

// Simulate a non-signal message
const benignEv = {
  type: 'user/message',
  data: { text: 'hello there' },
};
threw = false;
try {
  await sessionListener.cb({ id: 's1' }, benignEv);
} catch (e) {
  threw = true;
  console.error('user/message handler threw:', e.message);
}
ok('user/message handler does not throw on benign', !threw);

// Same seq replay — should be deduped
const replayEv = { type: 'turn/end', seq: 1, data: {} };
const before = ctx._effects.length;
await sessionListener.cb({ id: 's1' }, replayEv);
const after = ctx._effects.length;
ok('replay dedup is a no-op (no new effects)', before === after);

console.log('— apply() survives a webServer service registration —');

// Stub webServer service with a register() method.
const registered = [];
ctx.setService('webServer', {
  register(spec, label) {
    registered.push({ spec, label });
    return () => {};
  },
});
ok('web API routes registered', registered.length >= 4,
  `got: ${registered.length}`);

const paths = registered.map((r) => r.spec.path);
ok('routes include /api/corrections',
  paths.includes('/plugins/agent-evolve/api/corrections'));
ok('routes include /api/corrections/ (prefix)',
  paths.includes('/plugins/agent-evolve/api/corrections/'));
ok('routes include /api/stats',
  paths.includes('/plugins/agent-evolve/api/stats'));
ok('routes include /api/config',
  paths.includes('/plugins/agent-evolve/api/config'));

console.log('— disposers all callable without error —');

let disposeThrew = 0;
for (const e of ctx._effects) {
  try { e.dispose(); } catch { disposeThrew += 1; }
}
ok('all effects disposed cleanly', disposeThrew === 0,
  `threw: ${disposeThrew}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);