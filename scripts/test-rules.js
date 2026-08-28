// @wwskills/dsh-agent-evolve — rules.js (M1) smoke test
//
// Covers the M1 rule layer against the v3 design doc:
//   • DB rules CRUD: listRules / getRule / updateRule / approveRule /
//     rejectRule / promoteRule / incrementRuleHit / getRulesForInjection
//   • LLM rule extraction prompt: buildRulePrompt (extract.js)
//   • rules.status state machine
//     proposed → approved → promoted_to_agents
//     proposed → rejected
//     approved → archived            (decay — M2/M3, may not exist yet)
//     rejected ↛ proposed            (no reopen in M1)
//   • rule ↔ correction association (source_corrections ↔ corrections.rule_id)
//
// ---------------------------------------------------------------------------
// Assumed signatures (from the design doc — see docs/dsh-agent-evolve-design.md,
// §5.3 status machine, §8 Web API, §7 rules/corrections tables):
//
//   listRules(db, { status?, category?, limit? } = {})   → rule rows (array)
//   getRule(db, id)                                       → row | null
//   updateRule(db, id, { content?, category?, tags? })    → boolean (row updated)
//   approveRule(db, id)                                   → boolean (proposed → approved)
//   rejectRule(db, id)                                    → boolean (proposed → rejected)
//   promoteRule(db, id)                                   → boolean (approved → promoted_to_agents)
//   incrementRuleHit(db, id)                              → boolean (hit_count+1, last_hit_at=now)
//   getRulesForInjection(db, opts?)                       → approved rows, hit_count DESC
//   buildRulePrompt(corrections, cfg?)                    → ChatML messages; [] on empty input
//
// When a function is not implemented yet (阿码's M1 backend is being built in
// parallel), the test fails with a clear "not implemented yet" message instead
// of crashing the whole script. Re-run once the backend lands.
//
// Pure Node.js, no test framework, manual assert + try/catch — same style as
// the M0 scripts. Uses a temp SQLite file, cleaned up on exit.

import * as dbMod from '../lib/db.js';
import * as extractMod from '../lib/extract.js';
import {
  insertCorrection,
  markCorrectionPromoted,
  listCorrections,
  getCorrection,
} from '../lib/corrections.js';
import { existsSync, unlinkSync } from 'node:fs';

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(label, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
  }
}

function skip(label, reason) {
  skipped += 1;
  console.log(`  - ${label} (skipped: ${reason})`);
}

// Wrap a possibly-missing M1 function so a load-order gap reports cleanly
// instead of throwing a raw "X is not a function".
function call(fn, ...args) {
  if (typeof fn !== 'function') return { missing: true };
  try {
    return { value: fn(...args) };
  } catch (e) {
    return { error: e };
  }
}

function detail(res, label) {
  if (res.missing) return `${label} not implemented yet (M1 backend in progress)`;
  if (res.error) return `${label} threw: ${res.error?.message || res.error}`;
  return '';
}

const M1 = {
  listRules: dbMod.listRules,
  getRule: dbMod.getRule,
  updateRule: dbMod.updateRule,
  approveRule: dbMod.approveRule,
  rejectRule: dbMod.rejectRule,
  promoteRule: dbMod.promoteRule,
  incrementRuleHit: dbMod.incrementRuleHit,
  getRulesForInjection: dbMod.getRulesForInjection,
  archiveRule: dbMod.archiveRule,
  buildRulePrompt: extractMod.buildRulePrompt,
};

const { openDatabase, resolveDbPath, newId, now } = dbMod;

// ────────────────────────────────────────────────────────────────────────────
// Test DB
// ────────────────────────────────────────────────────────────────────────────

const dbPath = resolveDbPath().replace(/\.db$/, `-test-rules-${newId()}.db`);
process.on('exit', () => {
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = dbPath + suffix;
      if (existsSync(p)) unlinkSync(p);
    }
  } catch { /* best effort */ }
});
const db = openDatabase(dbPath);

// Seed helpers — insert raw rule rows so the CRUD/state-machine tests don't
// depend on an insertRule() that M1 does not expose (rules are created by
// promoteCorrectionToRule in index.js).
function seedRule(overrides = {}) {
  const id = overrides.id ?? newId();
  const content = overrides.content ?? 'always check env vars before using defaults';
  const category = overrides.category ?? 'coding';
  const tags = overrides.tags ?? [];
  const status = overrides.status ?? 'proposed';
  const sourceCorrections = overrides.source_corrections ?? [];
  const approvedAt = overrides.approved_at ?? null;
  const hitCount = overrides.hit_count ?? 0;
  const lastHitAt = overrides.last_hit_at ?? null;
  const createdAt = overrides.created_at ?? now();
  db.prepare(
    `INSERT INTO rules
       (id, content, category, tags, status, source_corrections,
        approved_at, hit_count, last_hit_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, content, category, JSON.stringify(tags), status,
    JSON.stringify(sourceCorrections), approvedAt, hitCount, lastHitAt, createdAt,
  );
  return id;
}

function readJsonArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function ruleById(id) {
  return db.prepare(
    `SELECT id, content, category, tags, status, source_corrections,
            approved_at, hit_count, last_hit_at, created_at
       FROM rules WHERE id = ?`,
  ).get(id) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// A. listRules / getRule
// ────────────────────────────────────────────────────────────────────────────

console.log('— listRules / getRule —');

{
  const res = call(M1.listRules, db);
  ok('listRules on empty table returns []',
    !res.missing && !res.error && Array.isArray(res.value) && res.value.length === 0,
    detail(res, 'listRules') || `got: ${JSON.stringify(res.value)}`);
}

{
  seedRule({ content: 'proposed rule A', status: 'proposed' });
  seedRule({ content: 'approved rule B', status: 'approved', approved_at: now() });

  const res = call(M1.listRules, db, { status: 'approved' });
  ok('listRules filters by status=approved',
    !res.missing && !res.error && Array.isArray(res.value)
      && res.value.length === 1
      && res.value.every((r) => r.status === 'approved'),
    detail(res, 'listRules') || `got: ${JSON.stringify(res.value?.map((r) => r.status))}`);

  const resAll = call(M1.listRules, db);
  ok('listRules with no filter returns ≥ 2 rows',
    !resAll.missing && !resAll.error && Array.isArray(resAll.value) && resAll.value.length >= 2,
    detail(resAll, 'listRules'));
}

{
  const id = seedRule({ content: 'unique content marker', category: 'safety', tags: ['rm', 'fs'] });
  const res = call(M1.getRule, db, id);
  ok('getRule returns the seeded row',
    !res.missing && !res.error && res.value
      && res.value.id === id
      && res.value.content === 'unique content marker',
    detail(res, 'getRule') || `got: ${JSON.stringify(res.value)}`);

  const resMiss = call(M1.getRule, db, 'does-not-exist');
  ok('getRule returns null/undefined for a missing id',
    !resMiss.missing && !resMiss.error && resMiss.value == null,
    detail(resMiss, 'getRule') || `got: ${JSON.stringify(resMiss.value)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// B. updateRule
// ────────────────────────────────────────────────────────────────────────────

console.log('— updateRule —');

{
  const id = seedRule({ content: 'before', category: 'coding', tags: ['x'] });

  const res = call(M1.updateRule, db, id, { content: 'after update' });
  const row = ruleById(id);
  ok('updateRule changes content',
    !res.missing && !res.error && res.value && row?.content === 'after update',
    detail(res, 'updateRule') || `content=${row?.content}`);

  const res2 = call(M1.updateRule, db, id, { category: 'safety', tags: ['rm', 'danger'] });
  const row2 = ruleById(id);
  const tags2 = readJsonArray(row2?.tags);
  ok('updateRule changes category and tags',
    !res2.missing && !res2.error && res2.value
      && row2?.category === 'safety'
      && tags2.includes('rm') && tags2.includes('danger'),
    detail(res2, 'updateRule')
      || `category=${row2?.category} tags=${JSON.stringify(tags2)}`);

  const resMiss = call(M1.updateRule, db, 'does-not-exist', { content: 'x' });
  ok('updateRule on a missing id is falsy',
    !resMiss.missing && !resMiss.error && !resMiss.value,
    detail(resMiss, 'updateRule') || `got: ${JSON.stringify(resMiss.value)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// C. approveRule / rejectRule
// ────────────────────────────────────────────────────────────────────────────

console.log('— approveRule / rejectRule —');

{
  const id = seedRule({ status: 'proposed' });
  const res = call(M1.approveRule, db, id);
  const row = ruleById(id);
  ok('approveRule proposed → approved',
    !res.missing && !res.error && res.value && row?.status === 'approved',
    detail(res, 'approveRule') || `status=${row?.status}`);
  ok('approveRule sets approved_at',
    Number.isInteger(row?.approved_at) && row?.approved_at > 0,
    `approved_at=${row?.approved_at}`);
}

{
  const id = seedRule({ status: 'proposed' });
  const res = call(M1.rejectRule, db, id);
  const row = ruleById(id);
  ok('rejectRule proposed → rejected',
    !res.missing && !res.error && res.value && row?.status === 'rejected',
    detail(res, 'rejectRule') || `status=${row?.status}`);
}

{
  const id = seedRule({ status: 'rejected' });
  const res = call(M1.approveRule, db, id);
  const row = ruleById(id);
  ok('approveRule on a rejected rule is rejected (no reopen)',
    !res.missing && !res.error && (!res.value || row?.status === 'rejected'),
    detail(res, 'approveRule') || `returned=${JSON.stringify(res.value)} status=${row?.status}`);
}

{
  const id = seedRule({ status: 'approved', approved_at: now() });
  const res = call(M1.rejectRule, db, id);
  const row = ruleById(id);
  ok('rejectRule on an approved rule is a no-op (guard)',
    !res.missing && !res.error && (!res.value || row?.status === 'approved'),
    detail(res, 'rejectRule') || `returned=${JSON.stringify(res.value)} status=${row?.status}`);
}

{
  const res = call(M1.approveRule, db, 'does-not-exist');
  ok('approveRule on a missing id is falsy',
    !res.missing && !res.error && !res.value,
    detail(res, 'approveRule') || `got: ${JSON.stringify(res.value)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// D. promoteRule
// ────────────────────────────────────────────────────────────────────────────

console.log('— promoteRule —');

{
  const id = seedRule({ status: 'approved', approved_at: now() });
  const res = call(M1.promoteRule, db, id);
  const row = ruleById(id);
  ok('promoteRule approved → promoted_to_agents',
    !res.missing && !res.error && res.value && row?.status === 'promoted_to_agents',
    detail(res, 'promoteRule') || `status=${row?.status}`);
}

{
  const id = seedRule({ status: 'proposed' });
  const res = call(M1.promoteRule, db, id);
  const row = ruleById(id);
  ok('promoteRule on a proposed rule is a no-op (only from approved)',
    !res.missing && !res.error && (!res.value || row?.status === 'proposed'),
    detail(res, 'promoteRule') || `returned=${JSON.stringify(res.value)} status=${row?.status}`);
}

// ────────────────────────────────────────────────────────────────────────────
// E. incrementRuleHit / getRulesForInjection
// ────────────────────────────────────────────────────────────────────────────

console.log('— incrementRuleHit / getRulesForInjection —');

{
  const id = seedRule({ status: 'approved', approved_at: now(), hit_count: 0, last_hit_at: null });
  const res = call(M1.incrementRuleHit, db, id);
  const row = ruleById(id);
  ok('incrementRuleHit bumps hit_count by 1',
    !res.missing && !res.error && res.value && row?.hit_count === 1,
    detail(res, 'incrementRuleHit') || `hit_count=${row?.hit_count}`);
  ok('incrementRuleHit sets last_hit_at',
    Number.isInteger(row?.last_hit_at) && row?.last_hit_at > 0,
    `last_hit_at=${row?.last_hit_at}`);
}

{
  // Fresh ids so the injection set is deterministic for this assertion.
  seedRule({ content: 'inject low', status: 'approved', approved_at: now(), hit_count: 2 });
  seedRule({ content: 'inject high', status: 'approved', approved_at: now(), hit_count: 9 });
  seedRule({ content: 'inject proposed', status: 'proposed', hit_count: 99 });
  seedRule({ content: 'inject rejected', status: 'rejected', hit_count: 50 });

  const res = call(M1.getRulesForInjection, db);
  const rows = res.value;
  ok('getRulesForInjection returns only approved rules',
    !res.missing && !res.error && Array.isArray(rows) && rows.length >= 2
      && rows.every((r) => r.status === 'approved'),
    detail(res, 'getRulesForInjection')
      || `got: ${JSON.stringify(rows?.map((r) => r.status))}`);

  const hitCounts = (Array.isArray(rows) ? rows : []).map((r) => Number(r.hit_count ?? 0));
  const sortedDesc = hitCounts.every((h, i) => i === 0 || hitCounts[i - 1] >= h);
  ok('getRulesForInjection sorts by hit_count DESC',
    !res.missing && !res.error && Array.isArray(rows) && sortedDesc,
    detail(res, 'getRulesForInjection') || `hit_counts=${JSON.stringify(hitCounts)}`);
}

// ────────────────────────────────────────────────────────────────────────────
// F. buildRulePrompt
// ────────────────────────────────────────────────────────────────────────────

console.log('— buildRulePrompt —');

function isChatML(messages) {
  return Array.isArray(messages)
    && messages.length > 0
    && messages.every((m) => m && (m.role === 'system' || m.role === 'user')
      && typeof m.content === 'string');
}

function promptText(messages) {
  if (!Array.isArray(messages)) return '';
  return messages.map((m) => (m && typeof m.content === 'string' ? m.content : '')).join('\n');
}

{
  const res = call(M1.buildRulePrompt, []);
  ok('buildRulePrompt([]) returns []',
    !res.missing && !res.error && Array.isArray(res.value) && res.value.length === 0,
    detail(res, 'buildRulePrompt') || `got: ${JSON.stringify(res.value)}`);
}

{
  const res = call(M1.buildRulePrompt, null);
  ok('buildRulePrompt(null/undefined) returns []',
    !res.missing && !res.error && Array.isArray(res.value) && res.value.length === 0,
    detail(res, 'buildRulePrompt') || `got: ${JSON.stringify(res.value)}`);
}

const corrA = {
  id: 'c1',
  trigger: 'user_correction',
  error_summary: 'uploaded image with wrong content-type',
  root_cause: 'used form-urlencoded instead of multipart',
  correct_action: 'use multipart/form-data with image/jpeg',
  rule: 'wechat upload must use multipart/form-data',
};
const corrB = {
  id: 'c2',
  trigger: 'tool_error',
  error_summary: 'minimax prompt too long',
  root_cause: 'exceeded 1500 char limit',
  correct_action: 'truncate prompt before calling',
  rule: 'minimax/image-01 prompt ≤ 1500 chars',
};

{
  const res = call(M1.buildRulePrompt, [corrA]);
  ok('buildRulePrompt single correction returns valid ChatML',
    !res.missing && !res.error && isChatML(res.value),
    detail(res, 'buildRulePrompt') || `got: ${JSON.stringify(res.value)}`);
}

{
  const res = call(M1.buildRulePrompt, [corrA, corrB]);
  ok('buildRulePrompt multiple corrections returns valid ChatML',
    !res.missing && !res.error && isChatML(res.value),
    detail(res, 'buildRulePrompt'));
}

{
  const res = call(M1.buildRulePrompt, [corrA, corrB]);
  const text = promptText(res.value);
  ok('buildRulePrompt includes a 通用规则 instruction',
    !res.missing && !res.error && /(归纳|通用规则)/.test(text),
    detail(res, 'buildRulePrompt'));
}

{
  const res = call(M1.buildRulePrompt, [corrA, corrB]);
  const text = promptText(res.value);
  ok('buildRulePrompt includes every input correction content',
    !res.missing && !res.error
      && text.includes(corrA.error_summary)
      && text.includes(corrB.error_summary)
      && text.includes(corrA.rule)
      && text.includes(corrB.rule),
    detail(res, 'buildRulePrompt'));
}

// ────────────────────────────────────────────────────────────────────────────
// G. rules.status state machine
// ────────────────────────────────────────────────────────────────────────────

console.log('— rules.status state machine —');

{
  const id = seedRule({ status: 'proposed' });
  call(M1.approveRule, db, id);
  const mid = ruleById(id);
  call(M1.promoteRule, db, id);
  const end = ruleById(id);
  ok('proposed → approved → promoted_to_agents',
    mid?.status === 'approved' && end?.status === 'promoted_to_agents',
    `mid=${mid?.status} end=${end?.status}`);
}

{
  const id = seedRule({ status: 'proposed' });
  call(M1.rejectRule, db, id);
  const row = ruleById(id);
  ok('proposed → rejected (state machine)',
    row?.status === 'rejected',
    `status=${row?.status}`);
}

{
  if (typeof M1.archiveRule !== 'function') {
    skip('approved → archived', 'no archiveRule in M1 scope (decay lands M2/M3)');
  } else {
    const id = seedRule({ status: 'approved', approved_at: now() });
    const res = call(M1.archiveRule, db, id);
    const row = ruleById(id);
    ok('approved → archived',
      !res.error && res.value && row?.status === 'archived',
      detail(res, 'archiveRule') || `status=${row?.status}`);
  }
}

{
  const id = seedRule({ status: 'rejected' });
  const res = call(M1.approveRule, db, id);
  const row = ruleById(id);
  ok('rejected rule does not return to proposed/approved',
    !res.error && (!res.value || row?.status === 'rejected'),
    `returned=${JSON.stringify(res.value)} status=${row?.status}`);
}

// ────────────────────────────────────────────────────────────────────────────
// H. rule ↔ correction association
// ────────────────────────────────────────────────────────────────────────────

console.log('— rule ↔ correction association —');

{
  // Simulate promoteCorrectionToRule's back-link: correction promoted with
  // rule_id, rule stores source_corrections = [correction.id].
  const corrId = insertCorrection(db, {
    trigger: 'tool_error',
    error_summary: 'association test correction',
    rule: 'rule draft for association test',
  });
  const ruleId = seedRule({ status: 'proposed', source_corrections: [corrId] });
  markCorrectionPromoted(db, corrId, ruleId);

  const row = ruleById(ruleId);
  const sources = readJsonArray(row?.source_corrections);
  ok('rule.source_corrections contains the correction id',
    sources.includes(corrId),
    `sources=${JSON.stringify(sources)}`);

  const corr = getCorrection(db, corrId);
  ok('associated correction is status=promoted with rule_id back-link',
    corr?.status === 'promoted' && corr?.rule_id === ruleId,
    `status=${corr?.status} rule_id=${corr?.rule_id}`);
}

{
  // Rejected rules must NOT demote their source corrections (design §5.3:
  // 规则被拒绝后，关联的教训保持 promoted 状态).
  const corrId = insertCorrection(db, {
    trigger: 'user_correction',
    error_summary: 'rejected rule keeps correction promoted',
  });
  const ruleId = seedRule({ status: 'proposed', source_corrections: [corrId] });
  markCorrectionPromoted(db, corrId, ruleId);

  call(M1.rejectRule, db, ruleId);
  const row = ruleById(ruleId);
  const corr = getCorrection(db, corrId);

  ok('rejecting a rule leaves its correction promoted',
    row?.status === 'rejected' && corr?.status === 'promoted',
    `rule=${row?.status} correction=${corr?.status}`);
}

db.close();

console.log(`\n${passed} passed, ${failed} failed` + (skipped ? `, ${skipped} skipped` : ''));
process.exit(failed === 0 ? 0 : 1);
