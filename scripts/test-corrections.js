// @wwskills/dsh-agent-evolve — corrections.js smoke test
//
// Verifies:
//   • matchSignalWords: hits Chinese + English defaults, case-insensitive
//   • matchSignalWords: misses on neutral text and on missing input
//   • findSignalWords: returns matched signals, preserving order
//   • DEFAULT_SIGNAL_WORDS: frozen list contains expected entries
//   • extractUserText: handles data.text / data.content / data.content[] shapes
//   • insertCorrection + listCorrections round-trip on a real DB
//   • markCorrectionIgnored updates status
//   • aggregateStats returns the expected shape with sane counters

import {
  matchSignalWords,
  findSignalWords,
  extractUserText,
  extractLesson,
  insertCorrection,
  markCorrectionIgnored,
  listCorrections,
  aggregateStats,
  DEFAULT_SIGNAL_WORDS,
} from '../lib/corrections.js';
import { openDatabase, resolveDbPath, newId } from '../lib/db.js';

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

console.log('— matchSignalWords —');

ok('hits Chinese: 不对', matchSignalWords('这个结果不对啊'));
ok('hits English: wrong', matchSignalWords('That is wrong'));
ok('hits case-insensitive WRONG', matchSignalWords('WRONG answer'));
ok('hits 应该是', matchSignalWords('应该是 5 不是 3'));
ok('hits redo', matchSignalWords('please redo this'));
ok('hits custom signal list', matchSignalWords('foo bar', ['bar']));
ok('misses neutral text', !matchSignalWords('Hello, how are you?'));
ok('misses empty string', !matchSignalWords(''));
ok('misses non-string', !matchSignalWords(null));
ok('misses undefined', !matchSignalWords(undefined));
ok('defaults apply when no signals given', matchSignalWords('this is wrong'));
ok('does NOT hit "no"', !matchSignalWords('no problem, all good'));

console.log('— findSignalWords —');

const hits1 = findSignalWords('不对，应该是这样', DEFAULT_SIGNAL_WORDS);
ok('returns both Chinese signals', hits1.length >= 2 && hits1.includes('不对') && hits1.includes('应该是'),
  `got: ${JSON.stringify(hits1)}`);

const hits2 = findSignalWords('hello world');
ok('returns [] on neutral text', Array.isArray(hits2) && hits2.length === 0);

console.log('— extractUserText —');

ok('handles data.text',
  extractUserText({ data: { text: 'hi' } }) === 'hi');
ok('handles top-level text',
  extractUserText({ text: 'hi' }) === 'hi');
ok('handles content array',
  extractUserText({ data: { content: [{ text: 'a' }, { text: 'b' }] } }) === 'a\nb');
ok('handles string content',
  extractUserText({ data: { content: 'hi' } }) === 'hi');
ok('returns empty on garbage',
  extractUserText({ data: { foo: 1 } }) === '');
ok('returns empty on null',
  extractUserText(null) === '');

console.log('— DB round-trip —');

const dbPath = resolveDbPath().replace(/\.db$/, `-test-corrections-${newId()}.db`);
process.on('exit', () => {
  try {
    const { unlinkSync, existsSync } = require('node:fs');
    for (const suffix of ['', '-wal', '-shm']) {
      const p = dbPath + suffix;
      if (existsSync(p)) unlinkSync(p);
    }
  } catch {}
});

const db = openDatabase(dbPath);

const id1 = insertCorrection(db, {
  trigger: 'user_correction',
  error_summary: 'wrong env var',
  root_cause: 'did not check',
  correct_action: 'read process.env first',
  rule: 'always check process.env before using a default',
  context: JSON.stringify([{ role: 'user', text: 'foo' }]),
  sessionId: 's1',
});
ok('insert returns an id', typeof id1 === 'string' && id1.length > 0);

const id2 = insertCorrection(db, {
  trigger: 'tool_error',
  error_summary: 'tool failed',
});
ok('minimal insert OK', typeof id2 === 'string' && id2.length > 0);

const all = listCorrections(db);
ok('listCorrections returns ≥ 2 rows', all.length >= 2);
ok('listCorrections newest-first',
  all[0].created_at >= all[1].created_at);

const pending = listCorrections(db, { status: 'pending' });
ok('filter status=pending returns ≥ 2', pending.length >= 2);

const tool = listCorrections(db, { trigger: 'tool_error' });
ok('filter trigger=tool_error', tool.length === 1 && tool[0].id === id2);

const okIgnored = markCorrectionIgnored(db, id1);
ok('markCorrectionIgnored succeeds', okIgnored);
const okIgnored2 = markCorrectionIgnored(db, id1);
ok('markCorrectionIgnored idempotent (no-op on already ignored)', !okIgnored2);

const stats = aggregateStats(db);
ok('aggregateStats shape', stats && typeof stats.corrections_pending === 'number');
ok('aggregateStats counts pending',
  stats.corrections_pending === pending.length - 1, // we ignored one
  `pending=${stats.corrections_pending} expected=${pending.length - 1}`);
ok('aggregateStats counts captured',
  stats.corrections_captured >= 2,
  `captured=${stats.corrections_captured}`);
ok('aggregateStats has rules_proposed field', 'rules_proposed' in stats);
ok('aggregateStats has memories_extracted field', 'memories_extracted' in stats);

db.close();

console.log('— extractLesson with stub llm —');

const stubLlm = {
  async stream() {
    return {
      [Symbol.asyncIterator]() {
        const text = '{"error_summary":"bad json parsing","root_cause":"used eval","correct_action":"use JSON.parse","rule":"never use eval on user input","confidence":0.9}';
        const chunks = [
          { type: 'message_start' },
          { type: 'content_block_delta', delta: { text } },
          { type: 'message_stop', delta: { text: '' } },
        ];
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
};

const lesson = await extractLesson({
  text: 'no, that is wrong',
  context: [{ role: 'assistant', text: 'eval(input)' }],
  llm: stubLlm,
});
ok('extractLesson parses structured output',
  lesson && lesson.error_summary === 'bad json parsing' && lesson.confidence === 0.9);

const lessonBad = await extractLesson({
  text: 'foo',
  llm: {
    async stream() {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ value: undefined, done: true }) };
        },
      };
    },
  },
});
ok('extractLesson returns parse-failure object on empty LLM response',
  lessonBad && lessonBad.error_summary === 'parse failure' && lessonBad.confidence === 0,
  `got: ${JSON.stringify(lessonBad)}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);