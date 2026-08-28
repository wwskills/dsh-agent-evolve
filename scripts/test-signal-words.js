// @wwskills/dsh-agent-evolve — extract.js smoke test
//
// Verifies:
//   • TaskQueue instantiable with defaults and custom opts
//   • TaskQueue runs tasks serially (concurrency=1) by default
//   • TaskQueue rejects queued tasks on dispose
//   • TaskQueue aborts long-running tasks via AbortSignal after timeout
//   • streamLlm concatenates delta.text across chunks
//   • streamLlm breaks on message_stop
//   • parseJsonResponse recovers JSON from prose / fences / first-substring
//   • buildMemoryPrompt + buildLessonPrompt return ChatML messages

import {
  TaskQueue,
  streamLlm,
  buildMemoryPrompt,
  buildLessonPrompt,
  parseJsonResponse,
} from '../lib/extract.js';

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

console.log('— TaskQueue instantiation —');

const q1 = new TaskQueue();
ok('default TaskQueue instantiable', q1 instanceof TaskQueue);
ok('default concurrency=1', q1.concurrency === 1);
ok('default timeout=30000', q1.timeout === 30000);
ok('initial pending=0', q1.pending === 0);
ok('initial active=0', q1.active === 0);
ok('initial disposed=false', q1.disposed === false);

const q2 = new TaskQueue({ concurrency: 3, timeout: 5000 });
ok('custom concurrency/timeout', q2.concurrency === 3 && q2.timeout === 5000);

let threw = false;
try { new TaskQueue({ concurrency: 0 }); } catch { threw = true; }
ok('rejects concurrency<1', threw);

console.log('— TaskQueue serial execution —');

const q3 = new TaskQueue();
const log = [];
const promises = [];
for (let i = 0; i < 3; i += 1) {
  promises.push(q3.add(async () => {
    log.push(`start-${i}`);
    await new Promise((r) => setTimeout(r, 10));
    log.push(`end-${i}`);
    return i;
  }));
}
const results = await Promise.all(promises);
ok('all tasks resolved with values', JSON.stringify(results) === '[0,1,2]',
  `got: ${JSON.stringify(results)}`);
ok('serial ordering: 0 starts, 0 ends, then 1 starts, ...',
  log[0] === 'start-0' && log[1] === 'end-0' && log[2] === 'start-1' && log[3] === 'end-1' && log[4] === 'start-2' && log[5] === 'end-2',
  `log: ${JSON.stringify(log)}`);

console.log('— TaskQueue dispose —');

// Block the queue with a never-resolving task so subsequent adds stay
// pending long enough for us to dispose() before they drain.
const q4 = new TaskQueue();
q4.add(async () => new Promise(() => {})); // holds the single concurrency slot
const disposedPromise = q4.add(async () => 'pending');
q4.dispose();
ok('disposed queue blocks new add()',
  await q4.add(async () => 'x').then(() => false, () => true));
ok('disposed queue rejects pending tasks',
  await disposedPromise.then(() => false, (e) => e.message.includes('disposed')));

console.log('— TaskQueue timeout —');

const q5 = new TaskQueue({ timeout: 50 });
const timeoutResult = await q5.add(async (signal) => {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve('done'), 500);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason || new Error('aborted'));
    });
  });
}).then((v) => ({ ok: true, v }), (e) => ({ ok: false, msg: e.message }));
ok('aborts long task via AbortSignal',
  timeoutResult.ok === false && /timed|timeout|abort/i.test(timeoutResult.msg),
  `got: ${JSON.stringify(timeoutResult)}`);

console.log('— streamLlm —');

// P0.3 fix: DSH llm.stream() takes { provider, model, messages, signal }
// (no `input` wrapper). The mock now validates that shape so we catch
// regressions if a caller regresses to the old `{ input: { messages } }`
// layout.
const mkLlm = (chunks) => ({
  async stream(opts) {
    if (!opts || typeof opts.provider !== 'string' || !opts.provider) {
      throw new Error('opts.provider required');
    }
    if (!Array.isArray(opts.messages) || opts.messages.length === 0) {
      throw new Error('opts.messages required and non-empty');
    }
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          next() {
            if (i < chunks.length) {
              return Promise.resolve({ value: chunks[i++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  },
});

const text1 = await streamLlm(mkLlm([
  { type: 'message_start' },
  { type: 'content_block_delta', delta: { text: 'Hello ' } },
  { type: 'content_block_delta', delta: { text: 'World' } },
  { type: 'content_block_delta', delta: { text: '!' } },
  { type: 'message_stop', delta: { text: '' } },
]), { provider: 'deepseek', model: 'deepseek-chat', messages: [{ role: 'user', content: 'x' }] });
ok('concatenates delta.text across chunks', text1 === 'Hello World!');

const text2 = await streamLlm(mkLlm([
  { type: 'message_start' },
  { type: 'content_block_delta', delta: { text: 'foo' } },
  { type: 'done' },
  { type: 'content_block_delta', delta: { text: 'should not appear' } },
]), { provider: 'deepseek', messages: [{ role: 'user', content: 'x' }] });
ok('breaks on type=done', text2 === 'foo');

const text3 = await streamLlm(mkLlm([
  { type: 'text', text: 'plain text' },
  { type: 'message_stop' },
]), { provider: 'deepseek', messages: [{ role: 'user', content: 'x' }] });
ok('accepts top-level text fallback', text3 === 'plain text');

const badLlm = { async stream() { return null; } };
let streamErr = null;
try { await streamLlm(badLlm, { provider: 'deepseek', messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { streamErr = e; }
ok('rejects when stream returns non-iterable',
  streamErr && /async iterable/.test(streamErr.message));

let emptyErr = null;
try { await streamLlm(mkLlm([]), { provider: 'deepseek', messages: [] }); } catch (e) { emptyErr = e; }
ok('rejects when messages array is empty',
  emptyErr && /messages array required/.test(emptyErr.message));

const noProviderErr = null;
let noProviderErrOut = null;
try { await streamLlm(mkLlm([]), { messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { noProviderErrOut = e; }
ok('rejects when provider missing',
  noProviderErrOut && /provider.*required/i.test(noProviderErrOut.message));

const noStream = {};
let noStreamErr = null;
try { await streamLlm(noStream, { provider: 'deepseek', messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { noStreamErr = e; }
ok('rejects when llm has no stream()',
  noStreamErr && /stream\(\)/.test(noStreamErr.message));

console.log('— parseJsonResponse —');

ok('parses plain JSON array', JSON.stringify(parseJsonResponse('[{"a":1}]')) === '[{"a":1}]');
ok('parses plain JSON object', JSON.stringify(parseJsonResponse('{"a":1}')) === '{"a":1}');
ok('parses markdown-fenced JSON',
  JSON.stringify(parseJsonResponse('```json\n[{"a":1}]\n```')) === '[{"a":1}]');
ok('recovers JSON inside prose',
  JSON.stringify(parseJsonResponse('Here you go: {"a":1} cheers')) === '{"a":1}');
ok('returns null for garbage', parseJsonResponse('totally not json') === null);
ok('returns null for null', parseJsonResponse(null) === null);
ok('returns null for empty', parseJsonResponse('') === null);

console.log('— Prompt builders —');

const memPrompt = buildMemoryPrompt({ user: 'I love pnpm', assistant: 'Sure, here is pnpm' });
ok('buildMemoryPrompt returns 2 messages', memPrompt.length === 2);
ok('memory prompt contains user input',
  memPrompt.some((m) => m.content && m.content.includes('pnpm')));

const lessonPrompt = buildLessonPrompt({
  text: 'no, that is wrong',
  context: [{ role: 'assistant', text: 'used rm -rf' }],
  sessionHint: 's123',
});
ok('buildLessonPrompt returns 2 messages', lessonPrompt.length === 2);
ok('lesson prompt contains trigger text',
  lessonPrompt.some((m) => m.content && m.content.includes('no, that is wrong')));
ok('lesson prompt contains context',
  lessonPrompt.some((m) => m.content && m.content.includes('used rm -rf')));
ok('lesson prompt contains session hint',
  lessonPrompt.some((m) => m.content && m.content.includes('s123')));

const emptyLessonPrompt = buildLessonPrompt({ text: '' });
ok('buildLessonPrompt tolerates empty input', emptyLessonPrompt.length === 2);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);