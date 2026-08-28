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
//
// P3.26: split the legacy combined list into per-locale buckets so plugins
// can pick the right set via `config.signalWordsLocale` (or `auto` for the
// combined fallback that worked in M0-M3). Users who want a custom list
// still set `config.signalWords` directly — that takes precedence over
// any locale default.
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SIGNAL_WORDS_ZH = Object.freeze([
  '不对',
  '应该是',
  '错了',
  '不是这样',
  '重做',
  '别这样',
  '不正确',
  '有问题',
]);

export const DEFAULT_SIGNAL_WORDS_EN = Object.freeze([
  'wrong',
  'should be',
  'not like this',
  'redo',
  'incorrect',
  "that's not right",
  'this is wrong',
]);

// Legacy combined list — kept for backwards compatibility. New code should
// use DEFAULT_SIGNAL_WORDS_ZH / EN via resolveSignalWords().
export const DEFAULT_SIGNAL_WORDS = Object.freeze([
  ...DEFAULT_SIGNAL_WORDS_ZH,
  ...DEFAULT_SIGNAL_WORDS_EN,
]);

// ────────────────────────────────────────────────────────────────────────────
// Signal-word resolution (P3.26 i18n extension point)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the effective signal-word list for a given config + locale.
 *
 * Decision tree:
 *   1. `config.signalWords` non-empty → use it verbatim (user override).
 *   2. `config.signalWordsLocale === 'zh'` → DEFAULT_SIGNAL_WORDS_ZH.
 *   3. `config.signalWordsLocale === 'en'` → DEFAULT_SIGNAL_WORDS_EN.
 *   4. Anything else (`auto`, missing, unknown) → DEFAULT_SIGNAL_WORDS
 *      (combined list — preserves M0-M3 behaviour so existing configs
 *      keep working).
 *
 * The function never throws; on bad input it falls back to the combined
 * default.
 *
 * @param {object} opts
 * @param {Array<string>|null|undefined} [opts.configSignalWords]
 * @param {string} [opts.signalWordsLocale]  — 'auto' | 'zh' | 'en'
 * @param {string} [opts.locale]              — runtime hint (client locale)
 * @returns {readonly string[]}
 */
export function resolveSignalWords({ configSignalWords, signalWordsLocale, locale } = {}) {
  if (Array.isArray(configSignalWords) && configSignalWords.length > 0) {
    return Object.freeze(configSignalWords.filter((w) => typeof w === 'string' && w.length > 0));
  }
  const wanted = (typeof signalWordsLocale === 'string' && signalWordsLocale) || '';
  const runtimeLocale = (typeof locale === 'string' && locale) || '';
  const pick =
    wanted === 'zh' || runtimeLocale.startsWith('zh')
      ? 'zh'
      : wanted === 'en' || runtimeLocale.startsWith('en')
        ? 'en'
        : null;
  if (pick === 'zh') return DEFAULT_SIGNAL_WORDS_ZH;
  if (pick === 'en') return DEFAULT_SIGNAL_WORDS_EN;
  return DEFAULT_SIGNAL_WORDS;
}

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
 * @param {string} [args.provider] — provider route id (REQUIRED — passed to llm.stream)
 * @returns {Promise<{ error_summary: string, root_cause?: string, correct_action?: string, rule?: string, confidence?: number } | null>}
 */
export async function extractLesson({ text, context, sessionHint, llm, signal, model, provider } = {}) {
  if (!llm) return null;
  const messages = buildLessonPrompt({ text, context, sessionHint });
  let response;
  try {
    response = await streamLlm(llm, { provider, model, messages, signal });
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

const VALID_TRIGGERS = Object.freeze([
  'tool_error',
  'user_correction',
  'self_fix',
  // P2.16: agent-level errors surfaced via the `agent/error` event
  // (step / turn exceptions that the harness couldn't recover from).
  'agent_error',
]);

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
  // P3.25: bump the monthly capture counter so the Dashboard can render
  // "本月捕捉 N 条教训". Wrapped — schema drift on `usage_stats` should
  // never poison a successful insert.
  try { bumpCorrectionUsage(db, 'corrections_captured', 1); } catch { /* swallow */ }
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
 *
 * P3.25: also reads the current month's row from `usage_stats` so the
 * Dashboard can render the "本月" subsection (本月捕捉 / 本月提炼 /
 * 本月批准 / 本月抽取). Missing columns or missing row → 0.
 */
export function aggregateStats(db, { now: nowMs = Date.now() } = {}) {
  const month = monthKey(nowMs);
  // Monthly baseline (P3.25) — populated from usage_stats below.
  const monthlyBase = {
    monthly_extractions: 0,
    monthly_corrections_captured: 0,
    monthly_rules_proposed: 0,
    monthly_rules_approved: 0,
  };
  const empty = {
    corrections_captured: 0,
    corrections_pending: 0,
    corrections_promoted: 0,
    corrections_ignored: 0,
    rules_proposed: 0,
    rules_approved: 0,
    memories_extracted: 0,
    memories_active: 0,
    persona_updated_at: null,
    month,
    ...monthlyBase,
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
    // M3: split memories by status so the WebUI can show the
    // "active" count in the Tab badge (the dedup-merge behaviour of
    // upsertMemories leaves superseded/archived rows around — only
    // `active` rows should drive the badge).
    const mActive = db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE status = 'active'`).get();
    const persona = db.prepare(`SELECT MAX(updated_at) AS ts FROM persona`).get();

    // P3.25: read the current month's counters from usage_stats.
    // Column names are whitelisted explicitly so schema drift (drop
    // / rename) can never produce a SQL injection or a runtime error
    // surfaced to the WebUI.
    const monthly = readMonthlyUsageStats(db, month);

    return {
      corrections_captured: c.total,
      corrections_pending: c.pending,
      corrections_promoted: c.promoted,
      corrections_ignored: c.ignored,
      rules_proposed: Number(rCounts?.proposed || 0),
      rules_approved: Number(rCounts?.approved || 0),
      memories_extracted: Number(mCount?.n || 0),
      memories_active: Number(mActive?.n || 0),
      persona_updated_at: persona?.ts ? Number(persona.ts) : null,
      month,
      ...monthly,
    };
  } catch (e) {
    console.warn('[agent-evolve] aggregateStats:', e?.message || e);
    return empty;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Whitelisted column names for the `usage_stats` table. The list is
 * intentionally narrow so callers can only bump real counters and the
 * index.js wrapper never has to know which columns exist.
 */
const USAGE_STATS_COLUMNS = Object.freeze([
  'extractions',
  'corrections_captured',
  'rules_proposed',
  'rules_approved',
]);

/**
 * Bump a column on the current month's `usage_stats` row by `delta`.
 *
 * Mirrors the guard style of index.js#bumpUsage so a missing column
 * (e.g. the table exists but is from an older schema) never poisons
 * the call site.
 *
 * @param {object} db — driver from openDatabase()
 * @param {string} column — one of USAGE_STATS_COLUMNS
 * @param {number} [delta=1]
 * @returns {boolean} true when the row was updated
 */
export function bumpCorrectionUsage(db, column = 'corrections_captured', delta = 1) {
  if (!db) return false;
  if (!USAGE_STATS_COLUMNS.includes(column)) return false;
  const d = Number.isFinite(delta) ? Math.trunc(delta) : 1;
  if (d === 0) return false;
  const month = monthKey(Date.now());
  try {
    // Check the column exists at the SQLite level. Older installs
    // may have an older usage_stats schema.
    const cols = db.prepare(`PRAGMA table_info(usage_stats)`).all();
    if (!cols.some((c) => c.name === column)) return false;
    db.prepare(
      `INSERT INTO usage_stats (month, ${column}) VALUES (?, ?)
       ON CONFLICT(month) DO UPDATE SET ${column} = ${column} + ?`,
    ).run(month, d, d);
    return true;
  } catch { /* schema drift / missing table — silent */ return false; }
}

/**
 * Read the current month's counters from `usage_stats`.
 *
 * Returns a stable shape with zero defaults; missing columns or a
 * missing row yield 0s (rather than throwing).
 *
 * @param {object} db
 * @param {string} month — 'YYYY-MM'
 * @returns {{
 *   monthly_extractions: number,
 *   monthly_corrections_captured: number,
 *   monthly_rules_proposed: number,
 *   monthly_rules_approved: number,
 * }}
 */
function readMonthlyUsageStats(db, month) {
  const out = {
    monthly_extractions: 0,
    monthly_corrections_captured: 0,
    monthly_rules_proposed: 0,
    monthly_rules_approved: 0,
  };
  if (!db) return out;
  try {
    const cols = db.prepare(`PRAGMA table_info(usage_stats)`).all();
    const colNames = new Set(cols.map((c) => c.name));
    const wanted = [
      ['extractions', 'monthly_extractions'],
      ['corrections_captured', 'monthly_corrections_captured'],
      ['rules_proposed', 'monthly_rules_proposed'],
      ['rules_approved', 'monthly_rules_approved'],
    ].filter(([src]) => colNames.has(src));
    if (wanted.length === 0) return out;
    const selectCols = wanted.map(([src, _]) => `${src} AS ${src}`).join(', ');
    const row = db.prepare(
      `SELECT ${selectCols} FROM usage_stats WHERE month = ?`,
    ).get(month);
    if (!row) return out;
    for (const [src, dst] of wanted) {
      const v = Number(row[src] || 0);
      if (Number.isFinite(v)) out[dst] = v;
    }
    return out;
  } catch {
    return out;
  }
}

function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}