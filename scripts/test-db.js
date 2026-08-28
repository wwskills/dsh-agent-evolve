// @wwskills/dsh-agent-evolve — db.js smoke test
//
// Verifies the SQLite driver wrapper (openDatabase, inspectSchema,
// newId, now, resolveDbPath) works against node:sqlite.

import { openDatabase, newId, now, resolveDbPath, inspectSchema } from '../lib/db.js';
import { unlinkSync, existsSync } from 'node:fs';

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

console.log('— resolveDbPath / newId / now —');

const def = resolveDbPath();
ok('resolveDbPath returns a .db path', typeof def === 'string' && def.endsWith('evolve.db'));

const id1 = newId();
const id2 = newId();
ok('newId returns strings', typeof id1 === 'string' && typeof id2 === 'string');
ok('newId returns unique values', id1 !== id2);

const ts = now();
ok('now returns a positive integer', Number.isInteger(ts) && ts > 0);

console.log('— openDatabase / schema —');

const dbPath = resolveDbPath().replace(/\.db$/, `-test-db-${newId()}.db`);
const db = openDatabase(dbPath);
ok('openDatabase returns a handle', db && db.kind === 'node-builtin');

const schema = inspectSchema(db);
ok('schema has memories table', schema.tables.includes('memories'));
ok('schema has corrections table', schema.tables.includes('corrections'));
ok('schema has rules table', schema.tables.includes('rules'));
ok('schema has memories_fts', schema.tables.includes('memories_fts'));
ok('schema has FTS triggers', schema.triggers.includes('memories_fts_ai'));
ok('schema in WAL mode', schema.journalMode === 'wal',
  `got: ${schema.journalMode}`);
ok('foreign_keys ON', schema.foreignKeys === true);

console.log('— CRUD round-trip —');

db.prepare(
  `INSERT INTO corrections (id, trigger, error_summary, status, created_at)
   VALUES (?, 'user_correction', 'test', 'pending', ?)`,
).run(newId(), now());

const rows = db.prepare(`SELECT COUNT(*) AS n FROM corrections`).get();
ok('insert + count', Number(rows.n) === 1);

db.close();

console.log('— cleanup —');
for (const suffix of ['', '-wal', '-shm']) {
  const p = dbPath + suffix;
  if (existsSync(p)) unlinkSync(p);
}
ok('test db files removed', true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);