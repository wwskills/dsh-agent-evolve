// @wwskills/dsh-agent-evolve — correction detection + persistence
//
// Two responsibilities:
//   1. Signal-word matching — identify user messages that look like
//      corrections ("不对", "wrong", etc.). Substring + case-insensitive.
//   2. Lesson extraction — use LLM to pull a structured lesson
//      (error_summary / root_cause / correct_action / rule) out of the
//      session context around the triggering message, then persist to
//      the corrections table.
//
// Default signal words mirror the cordis.patch.yml defaults — 8 Chinese
// + 7 English phrases. "no" is deliberately excluded (false-positive
// rate too high; "no problem", "no questions").

import { newId, now } from './db.js';
import { streamLlm, buildLessonPrompt, parseJsonResponse } from './extract.js';

// ────────────────────────────────────────────────────────────────────────────
// Default signal words
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SIGNAL_WORDS = Object.freeze([
  // Chinese
  '不对',
  '应该是',
  '错了',
  '不是这样',
  '重做',
  '别这样',
  '不正确',
  '有问题',
  // English
  'wrong',
  'should be',
  'not like this',
  'redo',
  'incorrect',
  "that's not right",
  'this is wrong',
]);

// ────────────────────────────────────────────────────────────────────────────
// Signal-word matching
// ────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a user message contains a correction signal.
 *
 * Matching is case-insensitive and substring-based. Words are matched
 * as substrings of the message (no word-boundary enforcement). This
 * trades some precision for recall; the LLM extraction downstream
 * filters false positives via the `confidence` field.
 *
 * @param {string} text       — user message body
 * @param {string[]} [signals] — list of signal phrases; defaults to DEFAULT_SIGNAL_WORDS
 * @returns {boolean}
 */
export function matchSignalWords(text, signals) {
  if (!text || typeof text !== 'string') return false;
  const haystack = text.toLowerCase();
  const list = Array.isArray(signals) && signals.length > 0
    ? signals
    : DEFAULT_SIGNAL_WORDS;
  for (const word of list) {
    if (typeof word !== 'string' || word.length === 0) continue;
    if (haystack.includes(word.toLowerCase())) return true;
  }
  return false;
}

/**
 * Identify which signal words matched. Useful for diagnostics and for
 * the WebUI showing "why was this captured" hints.
 *
 * @param {string} text
 * @param {string[]} [signals]
 * @returns {string[]} matched signal words (lowercased), preserving order
 */
export function findSignalWords(text, signals) {
  if (!text || typeof text !== 'string') return [];
  const haystack = text.toLowerCase();
  const list = Array.isArray(signals) && signals.length > 0
    ? signals
    : DEFAULT_SIGNAL_WORDS;
  const hits = [];
  for (const word of list) {
    if (typeof word !== 'string' || word.length === 0) continue;
    const needle = word.toLowerCase();
    if (haystack.includes(needle)) hits.push(needle);
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────────
// User-text extraction from session/event payloads
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pull the user-side text from a session/event payload.
 *
 * Defensive: handles `data.text` / `data.content` / `content[].text`
 * shapes that DSH session/event may produce across versions.
 *
 * @param {object} event — session/event payload (event.data may carry the message)
 * @returns {string} — '' when nothing usable
 */
export function extractUserText(event) {
  if (!event || typeof event !== 'object') return '';
  const data = event.data ?? event.payload ?? event;
  if (!data || typeof data !== 'object') return '';
  if (typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;
  if (Array.isArray(data.content)) {
    return data.content
      .map((c) => (typeof c === 'string' ? c : c?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

// ────────────────────────────────────────────────────────────────────────────
// Lesson extraction (LLM)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pull a structured lesson out of a correction-triggered message.
 *
 * Returns the parsed fields directly (no DB write). The caller decides
 * whether to persist (e.g., only on confidence > 0).
 *
 * @param {object} args
 * @param {string} args.text — the user message that triggered the signal
 * @param {Array}  [args.context] — prior turns (`{role, text}`)
 * @param {string} [args.sessionHint] — optional session id for logging
 * @param {object} args.llm — DSH llm service
 * @param {AbortSignal} [args.signal]
 * @param {string} [args.model] — model override; '' = follow current
 * @returns {Promise<{ error_summary: string, root_cause?: string, correct_action?: string, rule?: string, confidence?: number } | null>}
 */
export async function extractLesson({ text, context, sessionHint, llm, signal, model } = {}) {
  if (!llm) return null;
  const messages = buildLessonPrompt({ text, context, sessionHint });
  let response;
  try {
    response = await streamLlm(llm, { model, messages, signal });
  } catch (e) {
    console.warn('[agent-evolve] extractLesson: llm.stream failed:', e?.message || e);
    return null;
  }
  const parsed = parseJsonResponse(response);
  if (!parsed || typeof parsed !== 'object') {
    return { error_summary: 'parse failure', confidence: 0 };
  }
  if (!parsed.error_summary) return null;
  return {
    error_summary: String(parsed.error_summary || '').slice(0, 240),
    root_cause: parsed.root_cause ? String(parsed.root_cause).slice(0, 480) : null,
    correct_action: parsed.correct_action ? String(parsed.correct_action).slice(0, 480) : null,
    rule: parsed.rule ? String(parsed.rule).slice(0, 240) : null,
    confidence: Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 0.5,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Persistence (corrections + aggregate stats)
// ────────────────────────────────────────────────────────────────────────────

const VALID_TRIGGERS = Object.freeze(['tool_error', 'user_correction', 'self_fix']);

/**
 * Insert a correction row.
 *
 * @param {object} db — driver from openDatabase()
 * @param {object} c
 * @param {'tool_error' | 'user_correction' | 'self_fix'} c.trigger
 * @param {string} c.error_summary
 * @param {string} [c.root_cause]
 * @param {string} [c.correct_action]
 * @param {string} [c.rule]
 * @param {string} [c.context] — JSON string of the 3-turn window
 * @param {string} [c.sessionId]
 * @returns {string} inserted id
 */
export function insertCorrection(db, {
  trigger,
  error_summary,
  root_cause = null,
  correct_action = null,
  rule = null,
  context = null,
  sessionId = null,
} = {}) {
  if (!db) throw new Error('insertCorrection: db required');
  if (!trigger) throw new Error('insertCorrection: trigger required');
  if (!error_summary) throw new Error('insertCorrection: error_summary required');
  if (!VALID_TRIGGERS.includes(trigger)) {
    throw new Error(`insertCorrection: invalid trigger '${trigger}' (expected one of ${VALID_TRIGGERS.join(', ')})`);
  }

  const id = newId();
  db.prepare(
    `INSERT INTO corrections
       (id, trigger, error_summary, root_cause, correct_action, rule, context, session_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, trigger, error_summary, root_cause, correct_action, rule, context, sessionId, now());
  return id;
}

/**
 * Mark a pending correction as ignored. Returns true if a row was updated.
 */
export function markCorrectionIgnored(db, id) {
  if (!db || !id) return false;
  const result = db.prepare(
    `UPDATE corrections SET status = 'ignored' WHERE id = ? AND status = 'pending'`,
  ).run(id);
  return result.changes > 0;
}

/**
 * Mark a correction as promoted to a rule draft. Returns true if updated.
 *
 * The caller is responsible for inserting the rule row first (so we
 * have a valid rule_id to back-link).
 */
export function markCorrectionPromoted(db, id, ruleId) {
  if (!db || !id || !ruleId) return false;
  const result = db.prepare(
    `UPDATE corrections SET status = 'promoted', rule_id = ? WHERE id = ? AND status = 'pending'`,
  ).run(ruleId, id);
  return result.changes > 0;
}

/**
 * Fetch a single correction by id (or null when missing).
 */
export function getCorrection(db, id) {
  if (!db || !id) return null;
  return db.prepare(
    `SELECT id, trigger, error_summary, root_cause, correct_action, rule,
            context, session_id, status, rule_id, created_at
       FROM corrections
      WHERE id = ?`,
  ).get(id) || null;
}

/**
 * List corrections, newest first. Optional status / trigger filter.
 */
export function listCorrections(db, { status, trigger, limit = 100 } = {}) {
  if (!db) return [];
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (trigger) { where.push('trigger = ?'); params.push(trigger); }
  const sql = `
    SELECT id, trigger, error_summary, root_cause, correct_action, rule,
           context, session_id, status, rule_id, created_at
      FROM corrections
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC
     LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params);
}

/**
 * Count corrections by status (one row per status; absent statuses are 0).
 */
export function countCorrectionsByStatus(db) {
  if (!db) return { pending: 0, promoted: 0, ignored: 0, total: 0 };
  const rows = db.prepare(
    `SELECT status, COUNT(*) AS n FROM corrections GROUP BY status`,
  ).all();
  const out = { pending: 0, promoted: 0, ignored: 0, total: 0 };
  for (const r of rows) {
    const k = String(r.status);
    out[k] = Number(r.n || 0);
    out.total += Number(r.n || 0);
  }
  return out;
}

/**
 * Aggregate counters for the WebUI stats bar.
 *
 * Pulls corrections / rules / memories / persona counts in one call.
 * Returns a stable shape even when individual tables are empty.
 */
export function aggregateStats(db, { now: nowMs = Date.now() } = {}) {
  const empty = {
    corrections_captured: 0,
    corrections_pending: 0,
    corrections_promoted: 0,
    corrections_ignored: 0,
    rules_proposed: 0,
    rules_approved: 0,
    memories_extracted: 0,
    persona_updated_at: null,
    month: monthKey(nowMs),
  };
  if (!db) return empty;
  try {
    const c = countCorrectionsByStatus(db);
    const rCounts = db.prepare(
      `SELECT
         SUM(CASE WHEN status = 'proposed' THEN 1 ELSE 0 END) AS proposed,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
       FROM rules`,
    ).get();
    const mCount = db.prepare(`SELECT COUNT(*) AS n FROM memories`).get();
    const persona = db.prepare(`SELECT MAX(updated_at) AS ts FROM persona`).get();
    return {
      corrections_captured: c.total,
      corrections_pending: c.pending,
      corrections_promoted: c.promoted,
      corrections_ignored: c.ignored,
      rules_proposed: Number(rCounts?.proposed || 0),
      rules_approved: Number(rCounts?.approved || 0),
      memories_extracted: Number(mCount?.n || 0),
      persona_updated_at: persona?.ts ? Number(persona.ts) : null,
      month: monthKey(nowMs),
    };
  } catch (e) {
    console.warn('[agent-evolve] aggregateStats:', e?.message || e);
    return empty;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}