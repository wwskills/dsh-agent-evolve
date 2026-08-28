// @wwskills/dsh-agent-evolve — SQLite driver + schema bootstrap
//
// M0 scope: open the SQLite database with WAL + safe PRAGMAs, and create
// the five tables (memories, rules, corrections, persona, usage_stats)
// plus the memories_fts virtual table and its three sync triggers.
//
// Driver: node:sqlite (Node ≥ 22.5 built-in). We expose a tiny subset of
// the better-sqlite3 / node:sqlite API — { exec, prepare, transaction,
// close, pragma } — so the rest of the plugin (corrections.js, extract.js,
// decay.js, usage.js) can stay driver-agnostic.
//
// Path: $DSH_HOME/agent-evolve/evolve.db. The directory is created lazily
// if missing. Override via config.dbPath when calling apply().
//
// BigInt normalisation: node:sqlite returns rowids as BigInt. We
// recursively convert every BigInt to Number on the way out so callers
// can bind and compare results without surprises.

import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// ────────────────────────────────────────────────────────────────────────────
// Path resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the default SQLite path: $DSH_HOME/agent-evolve/evolve.db.
 * Falls back to $HOME/.dsh when DSH_HOME is unset (mirrors web-search-providers).
 *
 * @returns {string}
 */
export function resolveDbPath() {
  const home = process.env.DSH_HOME || `${process.env.HOME || '/root'}/.dsh`;
  return join(home, 'agent-evolve', 'evolve.db');
}

// ────────────────────────────────────────────────────────────────────────────
// BigInt normalisation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Recursively convert BigInt values to Number. Bounded by `depth` to avoid
 * pathological recursion on circular structures.
 */
function normaliseRow(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((v) => normaliseRow(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = normaliseRow(value[k], depth + 1);
    }
    return out;
  }
  return value;
}

// ────────────────────────────────────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────────────────────────────────────

/**
 * The full schema, applied via exec(). All statements are idempotent
 * (IF NOT EXISTS) so this can run on every plugin boot.
 *
 * Tables: memories, rules, corrections, persona, usage_stats.
 * FTS5: memories_fts (contentless sync via triggers).
 * Triggers: memories_fts_ai / _au / _ad keep the FTS index in lock-step
 * with the memories table.
 */
const SCHEMA_SQL = `
-- ── memories ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                          -- 'preference' | 'fact' | 'decision' | 'skill'
  content TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  weight REAL DEFAULT 1.0,
  origin TEXT DEFAULT 'extracted',             -- 'extracted' | 'corrected' | 'manual'
  session_id TEXT,
  created_at INTEGER NOT NULL,
  last_accessed INTEGER,
  access_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',                -- 'active' | 'superseded' | 'archived'
  tags TEXT DEFAULT '[]'                       -- JSON array
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

-- ── rules ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL,                      -- 'coding' | 'communication' | 'workflow' | 'safety'
  tags TEXT DEFAULT '[]',                      -- JSON array
  status TEXT NOT NULL DEFAULT 'proposed',     -- 'proposed' | 'approved' | 'rejected' | 'archived' | 'promoted_to_agents'
  source_corrections TEXT DEFAULT '[]',        -- JSON array of correction ids
  approved_at INTEGER,
  hit_count INTEGER DEFAULT 0,
  last_hit_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rules_status ON rules(status);
CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);

-- ── corrections ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,                       -- 'tool_error' | 'user_correction' | 'self_fix'
  error_summary TEXT NOT NULL,
  root_cause TEXT,
  correct_action TEXT,
  rule TEXT,                                   -- LLM-extracted guardrail draft
  context TEXT,                                -- 3-turn window summary
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'promoted' | 'ignored'
  rule_id TEXT,                                -- FK -> rules.id
  created_at INTEGER NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES rules(id)
);

CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_trigger ON corrections(trigger);
CREATE INDEX IF NOT EXISTS idx_corrections_created ON corrections(created_at);

-- ── persona ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persona (
  key TEXT PRIMARY KEY,                        -- 'tech_stack' | 'coding_style' | 'communication' | 'common_tasks'
  value TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  updated_at INTEGER NOT NULL
);

-- ── usage_stats ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_stats (
  month TEXT NOT NULL,                         -- 'YYYY-MM'
  extractions INTEGER DEFAULT 0,
  corrections_captured INTEGER DEFAULT 0,
  rules_proposed INTEGER DEFAULT 0,
  rules_approved INTEGER DEFAULT 0,
  PRIMARY KEY (month)
);

-- ── FTS5: memories ──────────────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, tags, content=memories, content_rowid=rowid
);

-- Sync triggers: keep memories_fts in lock-step with memories.
CREATE TRIGGER IF NOT EXISTS memories_fts_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
  INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
`;

// ────────────────────────────────────────────────────────────────────────────
// Driver wrapper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Open the SQLite database at `path` and return a thin driver handle.
 *
 * @param {string} [path] - DB file path. Defaults to resolveDbPath().
 * @param {{ busyTimeoutMs?: number }} [opts]
 * @returns Driver handle — see apply() for the shape.
 */
export function openDatabase(path = resolveDbPath(), opts = {}) {
  const busyTimeoutMs = opts.busyTimeoutMs ?? 5000;

  // Create parent directory lazily. Better-sqlite3 / node:sqlite will create
  // the file itself, but not the directory.
  if (!existsSync(dirname(path))) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const raw = new DatabaseSync(path);

  // PRAGMAs — applied outside any transaction. journal_mode must NOT be set
  // inside a tx in node:sqlite. The other two are connection-scoped.
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA synchronous = NORMAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  // Apply schema once on boot. Idempotent.
  raw.exec(SCHEMA_SQL);

  return {
    /** Driver kind, for logging / future multi-driver fallback. */
    kind: 'node-builtin',

    /** The raw node:sqlite handle. Escape hatch for advanced callers. */
    raw,

    /** Path on disk; useful for the close() dispose audit. */
    path,

    /** Execute one or more SQL statements verbatim. */
    exec(sql) {
      raw.exec(sql);
    },

    /** Compile a statement. Returns { all, get, run, iterate, free }. */
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        all(...params) {
          return normaliseRow(stmt.all(...params));
        },
        get(...params) {
          return normaliseRow(stmt.get(...params));
        },
        run(...params) {
          const r = stmt.run(...params);
          return {
            changes: Number(r.changes),
            lastInsertRowid: Number(r.lastInsertRowid),
          };
        },
        iterate(...params) {
          return mapIterator((v) => normaliseRow(v), stmt.iterate(...params));
        },
        free() {
          // node:sqlite statements are GC-managed; no explicit free.
        },
      };
    },

    /**
     * Run `fn` inside a SAVEPOINT. Rolls back on any thrown error.
     * fn receives the same driver handle so it can call other methods.
     */
    transaction(fn) {
      return (...args) => {
        raw.exec('SAVEPOINT tx');
        try {
          const r = fn(...args);
          raw.exec('RELEASE tx');
          return r;
        } catch (e) {
          try { raw.exec('ROLLBACK TO tx'); } catch { /* tx already gone */ }
          throw e;
        }
      };
    },

    /** Read a PRAGMA value. */
    pragma(name) {
      const row = raw.prepare(`PRAGMA ${name}`).get();
      return row ? Object.values(row)[0] : null;
    },

    /** Close the database. Called from the ctx.effect disposer. */
    close() {
      try { raw.close(); } catch { /* already closed */ }
    },
  };
}

function mapIterator(fn, it) {
  return {
    [Symbol.iterator]() { return this; },
    next() {
      const r = it.next();
      return r.done ? r : { value: fn(r.value), done: false };
    },
    return(v) { return it.return ? it.return(v) : { value: v, done: true }; },
    throw(e) { return it.throw ? it.throw(e) : { value: undefined, done: true }; },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ID helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a new TEXT PRIMARY KEY value. Uses crypto.randomUUID() when
 * available (always on Node ≥ 19), falling back to a v4 UUID built from
 * crypto.getRandomValues for paranoid platforms.
 *
 * @returns {string}
 */
export function newId() {
  return randomUUID();
}

/**
 * Current time as an integer millisecond timestamp. Centralised so tests
 * can mock it if needed (M3+).
 *
 * @returns {number}
 */
export function now() {
  return Date.now();
}

// ────────────────────────────────────────────────────────────────────────────
// Rules CRUD — M1 layer (L2 rule extraction + lifecycle)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Whitelist of valid rule status values. Centralised so API + DB + UI
 * never drift on spelling. Order matches the schema comment.
 */
export const VALID_RULE_STATUS = Object.freeze([
  'proposed',
  'approved',
  'rejected',
  'archived',
  'promoted_to_agents',
]);

/**
 * Whitelist of valid rule category values. The four canonical buckets
 * from the design doc §4.3. Anything else is rejected at the API edge.
 */
export const VALID_RULE_CATEGORIES = Object.freeze([
  'coding',
  'communication',
  'workflow',
  'safety',
]);

/**
 * List rules, newest first. Optional status / category filter.
 *
 * @param {object} db — driver handle
 * @param {object} [opts]
 * @param {string} [opts.status] — one of VALID_RULE_STATUS (else returns [])
 * @param {string} [opts.category] — one of VALID_RULE_CATEGORIES (else returns [])
 * @param {number} [opts.limit=100] — clamped to [1, 500]
 * @returns {Array<object>}
 */
export function listRules(db, { status, category, limit = 100 } = {}) {
  if (!db) return [];
  if (status && !VALID_RULE_STATUS.includes(status)) return [];
  if (category && !VALID_RULE_CATEGORIES.includes(category)) return [];

  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (category) { where.push('category = ?'); params.push(category); }
  const sql = `
    SELECT id, content, category, tags, status, source_corrections,
           approved_at, hit_count, last_hit_at, created_at
      FROM rules
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC
     LIMIT ?`;
  params.push(Math.max(1, Math.min(Number(limit) | 0 || 100, 500)));
  return db.prepare(sql).all(...params);
}

/**
 * Get a single rule by id, or null when missing.
 *
 * @param {object} db
 * @param {string} id
 * @returns {object|null}
 */
export function getRule(db, id) {
  if (!db || !id) return null;
  return db.prepare(
    `SELECT id, content, category, tags, status, source_corrections,
            approved_at, hit_count, last_hit_at, created_at
       FROM rules
      WHERE id = ?`,
  ).get(id) || null;
}

/**
 * Update rule fields. Only the keys present in `patch` are touched.
 * Whitelists enforced on `category`; `content` capped at 1000 chars;
 * `tags` JSON-encoded and capped at 16 entries.
 *
 * Returns the number of rows changed (0 when the id is missing or no
 * updatable keys were provided).
 *
 * @param {object} db
 * @param {string} id
 * @param {object} patch — { content?, category?, tags? }
 * @returns {number}
 */
export function updateRule(db, id, { content, category, tags } = {}) {
  if (!db || !id) return 0;
  const updates = [];
  const params = [];

  if (typeof content === 'string' && content.trim()) {
    updates.push('content = ?');
    params.push(content.slice(0, 1000));
  }
  if (typeof category === 'string') {
    if (!VALID_RULE_CATEGORIES.includes(category)) return 0;
    updates.push('category = ?');
    params.push(category);
  }
  if (Array.isArray(tags)) {
    updates.push('tags = ?');
    const cleaned = tags
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.toLowerCase().slice(0, 24))
      .slice(0, 16);
    params.push(JSON.stringify(cleaned));
  }

  if (updates.length === 0) return 0;
  params.push(id);
  return db.prepare(
    `UPDATE rules SET ${updates.join(', ')} WHERE id = ?`,
  ).run(...params).changes;
}

/**
 * Approve a proposed rule. Status → 'approved', approved_at = now().
 * Only valid from 'proposed' — idempotent no-op on other statuses.
 *
 * @returns {boolean} true when a row was updated
 */
export function approveRule(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE rules
        SET status = 'approved', approved_at = ?
      WHERE id = ? AND status = 'proposed'`,
  ).run(now(), id);
  return r.changes > 0;
}

/**
 * Reject a proposed rule. Status → 'rejected'. Only valid from
 * 'proposed' so a rejected rule can't be re-rejected.
 *
 * @returns {boolean}
 */
export function rejectRule(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE rules SET status = 'rejected' WHERE id = ? AND status = 'proposed'`,
  ).run(id);
  return r.changes > 0;
}

/**
 * Promote an approved rule to 'promoted_to_agents' (per design §4.3 /
 * §5.5). Only valid from 'approved'.
 *
 * @returns {boolean}
 */
export function promoteRule(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE rules SET status = 'promoted_to_agents' WHERE id = ? AND status = 'approved'`,
  ).run(id);
  return r.changes > 0;
}

/**
 * Increment hit_count + last_hit_at when a rule is injected into
 * context. Only counts for 'approved' rules (the others shouldn't be
 * injected — but we double-check here as a safety net).
 *
 * @returns {boolean}
 */
export function incrementRuleHit(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE rules
        SET hit_count = hit_count + 1, last_hit_at = ?
      WHERE id = ? AND status = 'approved'`,
  ).run(now(), id);
  return r.changes > 0;
}

/**
 * Fetch approved rules eligible for context injection. Ordered by
 * `hit_count DESC, approved_at DESC` so proven rules surface first.
 * Optional `category` filter (keyword-match bootstrap path).
 *
 * Result is capped at `limit` (clamped [1, 100]).
 *
 * @returns {Array<object>}
 */
export function getRulesForInjection(db, { category, limit = 20 } = {}) {
  if (!db) return [];
  if (category && !VALID_RULE_CATEGORIES.includes(category)) return [];

  const where = ["status = 'approved'"];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  const sql = `
    SELECT id, content, category, tags, status, hit_count, last_hit_at, approved_at
      FROM rules
     WHERE ${where.join(' AND ')}
     ORDER BY hit_count DESC, approved_at DESC
     LIMIT ?`;
  params.push(Math.max(1, Math.min(Number(limit) | 0 || 20, 100)));
  return db.prepare(sql).all(...params);
}

/**
 * Count pending corrections. Used by the rule-extraction trigger to
 * decide whether to fire `extractRule`.
 *
 * @returns {number}
 */
export function countPendingCorrections(db) {
  if (!db) return 0;
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM corrections WHERE status = 'pending'`,
  ).get();
  return Number(row?.n || 0);
}

/**
 * List pending corrections oldest-first. Used to feed `extractRule`
 * with the oldest batch (so proposed rules track the most stale
 * pattern, not the freshest chatter).
 *
 * @returns {Array<object>}
 */
export function listPendingCorrections(db, { limit = 50 } = {}) {
  if (!db) return [];
  return db.prepare(
    `SELECT id, trigger, error_summary, root_cause, correct_action, rule,
            context, session_id, status, rule_id, created_at
       FROM corrections
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?`,
  ).all(Math.max(1, Math.min(Number(limit) | 0 || 50, 200)));
}

/**
 * Hydrate a list of corrections by id. Used by `GET /api/rules/:id/source`
 * to render the source of a proposed rule.
 *
 * Preserves the input order so the caller can present corrections in
 * the order they appear in `rules.source_corrections`.
 *
 * @param {object} db
 * @param {string[]} ids
 * @returns {Array<object>}
 */
export function listCorrectionsByIds(db, ids) {
  if (!db || !Array.isArray(ids) || ids.length === 0) return [];
  // Build a map first, then re-assemble in input order.
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, trigger, error_summary, root_cause, correct_action, rule,
            context, session_id, status, rule_id, created_at
       FROM corrections
      WHERE id IN (${placeholders})`,
  ).all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// M2: rule archive (single + batch) — used by decay
// ────────────────────────────────────────────────────────────────────────────

/**
 * Archive a single approved rule. Returns true when a row was updated.
 *
 * State machine: `approved → archived` only. `proposed` / `rejected` /
 * `archived` / `promoted_to_agents` are no-ops (returns false).
 *
 * Re-introduces `archiveRule` from the M2 scope (was previously noted as
 * "decay lands M2/M3" in test-rules.js and skipped). Now wired into
 * `archiveStaleRules` for the daily decay timer.
 *
 * @param {object} db
 * @param {string} id
 * @returns {boolean}
 */
export function archiveRule(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE rules SET status = 'archived'
      WHERE id = ? AND status = 'approved'`,
  ).run(id);
  return r.changes > 0;
}

/**
 * Archive all approved rules that haven't been hit in `ttlMs` (default 90d).
 *
 * Uses `COALESCE(last_hit_at, approved_at)` so a freshly approved rule
 * with no injections yet counts from approval time. Without this,
 * rules approved > 90d ago but never hit would never archive.
 *
 * @returns {number} number of rows archived
 */
export function archiveStaleRules(db, ttlMs = 90 * 86400000) {
  if (!db) return 0;
  const r = db.prepare(
    `UPDATE rules SET status = 'archived'
      WHERE status = 'approved'
        AND COALESCE(last_hit_at, approved_at) < ?`,
  ).run(now() - ttlMs);
  return r.changes;
}

// ────────────────────────────────────────────────────────────────────────────
// M2: Memories CRUD + Persona CRUD + dedup helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Whitelist of valid memory status values. Centralised so API + DB + UI
 * never drift on spelling. Mirrors VALID_RULE_STATUS style.
 */
export const VALID_MEMORY_STATUS = Object.freeze([
  'active',
  'superseded',
  'archived',
]);

/**
 * Whitelist of valid memory type values. The four canonical buckets
 * from the design doc §4.2 (preference / fact / decision / skill).
 */
export const VALID_MEMORY_TYPES = Object.freeze([
  'preference',
  'fact',
  'decision',
  'skill',
]);

/**
 * Whitelist of valid persona keys. The four dimensions from the design
 * doc §4.4. Anything else is rejected at the API edge.
 */
export const VALID_PERSONA_KEYS = Object.freeze([
  'tech_stack',
  'coding_style',
  'communication',
  'common_tasks',
]);

/**
 * List memories, newest first. Optional status/type filter, pagination.
 *
 * @param {object} db
 * @param {object} [opts]
 * @param {string} [opts.status] — one of VALID_MEMORY_STATUS (else returns [])
 * @param {string} [opts.type]   — one of VALID_MEMORY_TYPES  (else returns [])
 * @param {number} [opts.limit=100]  — clamped to [1, 500]
 * @param {number} [opts.offset=0]   — clamped to [0, 99999]
 * @returns {Array<object>}
 */
export function listMemories(db, { status, type, limit = 100, offset = 0 } = {}) {
  if (!db) return [];
  if (status && !VALID_MEMORY_STATUS.includes(status)) return [];
  if (type && !VALID_MEMORY_TYPES.includes(type)) return [];

  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (type)   { where.push('type = ?');   params.push(type); }
  const sql = `
    SELECT id, type, content, confidence, weight, origin, session_id,
           created_at, last_accessed, access_count, status, tags
      FROM memories
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`;
  params.push(Math.max(1, Math.min(Number(limit) | 0 || 100, 500)));
  params.push(Math.max(0, Math.min(Number(offset) | 0 || 0, 99999)));
  return db.prepare(sql).all(...params);
}

/**
 * Get a single memory by id, or null when missing.
 *
 * @param {object} db
 * @param {string} id
 * @returns {object|null}
 */
export function getMemory(db, id) {
  if (!db || !id) return null;
  return db.prepare(
    `SELECT id, type, content, confidence, weight, origin, session_id,
            created_at, last_accessed, access_count, status, tags
       FROM memories
      WHERE id = ?`,
  ).get(id) || null;
}

/**
 * Hard-delete a memory. Returns true when a row was removed. Unlike
 * `archiveMemory` (which flips status), this also removes the FTS row
 * via the `_ad` trigger.
 *
 * @param {object} db
 * @param {string} id
 * @returns {boolean}
 */
export function deleteMemory(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  return r.changes > 0;
}

/**
 * Archive a memory (status → 'archived'). Returns true when a row was
 * updated. Valid only from 'active' or 'superseded' — already-archived
 * rows are no-ops.
 *
 * @param {object} db
 * @param {string} id
 * @returns {boolean}
 */
export function archiveMemory(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE memories SET status = 'archived'
      WHERE id = ? AND status IN ('active', 'superseded')`,
  ).run(id);
  return r.changes > 0;
}

/**
 * FTS5 keyword search across content + tags, ranked by FTS rank.
 *
 * Sanitises the input through `sanitizeFtsQuery` so user-provided
 * strings can't trigger FTS5 syntax errors (e.g. lone `"`, `*`, `:`
 * chars). On FTS5 failure (malformed query after sanitisation, or
 * transient index issue) falls back to LIKE-based search across
 * content + tags so the API still returns useful results.
 *
 * @param {object} db
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.limit=50] — clamped to [1, 200]
 * @returns {Array<object>}
 */
export function searchMemories(db, query, { limit = 50 } = {}) {
  if (!db) return [];
  if (!query || typeof query !== 'string') return [];
  const q = query.trim();
  if (!q) return [];

  const cap = Math.max(1, Math.min(Number(limit) | 0 || 50, 200));

  // Try FTS5 path first.
  const ftsQuery = sanitizeFtsQuery(q);
  if (ftsQuery) {
    try {
      return db.prepare(
        `SELECT m.id, m.type, m.content, m.confidence, m.weight, m.origin,
                m.session_id, m.created_at, m.last_accessed, m.access_count,
                m.status, m.tags
           FROM memories_fts fts
           JOIN memories m ON m.rowid = fts.rowid
          WHERE memories_fts MATCH ?
          ORDER BY fts.rank
          LIMIT ?`,
      ).all(ftsQuery, cap);
    } catch (e) {
      console.warn('[agent-evolve] searchMemories: FTS5 path failed, falling back to LIKE —', e?.message || e);
    }
  }

  // LIKE fallback: escape % and _ so user input is treated literally.
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return db.prepare(
    `SELECT id, type, content, confidence, weight, origin, session_id,
            created_at, last_accessed, access_count, status, tags
       FROM memories
      WHERE content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC
      LIMIT ?`,
  ).all(like, like, cap);
}

/**
 * FTS5 query sanitiser. Strips FTS5 operators, then quotes each token
 * so a query like `web search "fancy` doesn't blow up the parser.
 *
 * Keeps:
 *   - alphanumerics + `_` + `-`
 *   - CJK Unified Ideographs (U+4E00..U+9FFF)
 *
 * Returns `''` when no usable tokens remain (caller should treat as
 * no-result rather than throwing).
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeFtsQuery(text) {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text
    .split(/\s+/)
    .map((w) => w.replace(/[^\w\u4e00-\u9fff-]/g, ''))
    .filter((w) => w.length > 0);
  if (cleaned.length === 0) return '';
  // Quote each token to neutralise FTS5 reserved chars in the source.
  return cleaned.map((w) => `"${w}"`).join(' ');
}

/**
 * Get all persona key-value pairs as a plain object keyed by `key`.
 *
 * Shape: `{ key: { value, confidence, updated_at }, ... }`. Empty
 * object `{}` when no persona has been built yet. The 4 canonical
 * keys are always present once populated; partial populations are
 * possible mid-build.
 *
 * @param {object} db
 * @returns {Record<string, { value: string, confidence: number, updated_at: number }>}
 */
export function getPersona(db) {
  if (!db) return {};
  const rows = db.prepare(
    `SELECT key, value, confidence, updated_at
       FROM persona
      ORDER BY key`,
  ).all();
  const out = {};
  for (const r of rows) {
    if (!r || !r.key) continue;
    out[r.key] = {
      value: String(r.value || ''),
      confidence: Number(r.confidence || 0),
      updated_at: Number(r.updated_at || 0),
    };
  }
  return out;
}

/**
 * Upsert a single persona key.
 *
 * Signature: `updatePersonaKey(db, key, value, { confidence } = {})`.
 * The `confidence` is optional and defaults to 0.5; clamped to [0, 1].
 * `value` is trimmed and capped at 2000 chars.
 *
 * Returns false on bad input (key not in VALID_PERSONA_KEYS, value
 * not a string, db missing) — caller should reflect 400 instead of 500.
 *
 * @param {object} db
 * @param {string} key
 * @param {string} value
 * @param {object} [opts]
 * @param {number} [opts.confidence=0.5]
 * @returns {boolean}
 */
export function updatePersonaKey(db, key, value, { confidence } = {}) {
  if (!db || !key) return false;
  if (!VALID_PERSONA_KEYS.includes(key)) return false;
  if (typeof value !== 'string') return false;

  const conf = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, Number(confidence)))
    : 0.5;

  db.prepare(
    `INSERT INTO persona (key, value, confidence, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value       = excluded.value,
       confidence  = excluded.confidence,
       updated_at  = excluded.updated_at`,
  ).run(key, value.trim().slice(0, 2000), conf, now());
  return true;
}

/**
 * Get all `updated_at` timestamps for persona. Used by the rebuild
 * trigger to decide whether enough time has passed.
 *
 * @returns {number} latest updated_at, or 0 when persona is empty
 */
export function getPersonaLatestUpdatedAt(db) {
  if (!db) return 0;
  const row = db.prepare(`SELECT MAX(updated_at) AS ts FROM persona`).get();
  return Number(row?.ts || 0);
}

/**
 * Upsert a batch of memories, with optional dedup against existing
 * active memories.
 *
 * For each input memory:
 *   - if a similar active memory exists (token overlap ≥ threshold)
 *     → merge: access_count++, weight = MAX(existing, input.weight),
 *       last_accessed = now()
 *   - else → insert a new row.
 *
 * Dedup currently uses FTS5 + token overlap (see `findSimilarMemory`).
 * When an `embeddingProvider` is supplied the caller is responsible for
 * doing the cosine-similarity check upstream — the param is reserved
 * for M3 when we wire the vector path; for now any truthy value falls
 * through to FTS5.
 *
 * Returns the array of memory ids touched, in input order — inserted
 * ids come back as the new id, merged ids come back as the existing
 * id. Used by callers that want a quick count or audit trail.
 *
 * @param {object} db
 * @param {Array<{ type?, content, confidence?, weight?, session_id? }>} memories
 * @param {object} [opts]
 * @param {object|null} [opts.embeddingProvider=null]   reserved for M3
 * @param {number}      [opts.dedupThreshold=0.80]       token-overlap threshold
 * @returns {string[]} ids touched (inserted or merged), input order
 */
export function upsertMemories(db, memories, { embeddingProvider = null, dedupThreshold = 0.80 } = {}) {
  if (!db || !Array.isArray(memories)) return [];

  const touched = [];

  const tx = db.transaction(() => {
    for (const m of memories) {
      if (!m || typeof m.content !== 'string' || !m.content.trim()) continue;
      const type = VALID_MEMORY_TYPES.includes(m.type) ? m.type : 'fact';
      const confidence = Number.isFinite(m.confidence) ? Number(m.confidence) : 0.5;
      const inputWeight = Number.isFinite(m.weight) ? Number(m.weight) : null;
      const content = m.content.trim().slice(0, 1000);

      const dup = findSimilarMemory(db, content, type, embeddingProvider, dedupThreshold);
      if (dup && dup.existingId) {
        // Merge: bump access_count, take the higher of existing weight
        // and input weight (if provided), refresh last_accessed.
        const mergeSql = inputWeight !== null
          ? `UPDATE memories
                SET access_count   = access_count + 1,
                    weight         = MAX(weight, ?),
                    last_accessed  = ?
              WHERE id = ?`
          : `UPDATE memories
                SET access_count   = access_count + 1,
                    last_accessed  = ?
              WHERE id = ?`;
        if (inputWeight !== null) {
          db.prepare(mergeSql).run(inputWeight, now(), dup.existingId);
        } else {
          db.prepare(mergeSql).run(now(), dup.existingId);
        }
        touched.push(dup.existingId);
      } else {
        const newRowId = newId();
        // When input weight is provided, seed it; else default to 1.0
        // (schema default).
        if (inputWeight !== null) {
          db.prepare(
            `INSERT INTO memories
               (id, type, content, confidence, weight, session_id, created_at, origin)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'extracted')`,
          ).run(
            newRowId, type, content, confidence,
            Math.max(0.1, Math.min(1.0, inputWeight)),
            (typeof m.session_id === 'string' && m.session_id) ? m.session_id : null,
            now(),
          );
        } else {
          db.prepare(
            `INSERT INTO memories
               (id, type, content, confidence, session_id, created_at, origin)
             VALUES (?, ?, ?, ?, ?, ?, 'extracted')`,
          ).run(
            newRowId, type, content, confidence,
            (typeof m.session_id === 'string' && m.session_id) ? m.session_id : null,
            now(),
          );
        }
        touched.push(newRowId);
      }
    }
  });
  tx();

  return touched;
}

/**
 * Mark a memory as superseded by a newer one. Only flips status on
 * `active` rows — already-archived/superseded rows are no-ops.
 *
 * The caller is responsible for inserting the replacement row first
 * and passing its id (so we can keep a `superseded_by` audit later if
 * we add one — for now we just flip the status).
 *
 * @returns {boolean}
 */
export function markMemorySuperseded(db, id, _newId) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE memories SET status = 'superseded'
      WHERE id = ? AND status = 'active'`,
  ).run(id);
  return r.changes > 0;
}

/**
 * Get active memories for persona construction, ordered by access_count
 * DESC then created_at DESC (the proven-most-useful memories surface
 * first, breaking ties by recency).
 *
 * @param {object} db
 * @param {object} [opts]
 * @param {number} [opts.limit=50] — clamped to [1, 200]
 * @returns {Array<object>}
 */
export function getActiveMemoriesForPersona(db, { limit = 50 } = {}) {
  if (!db) return [];
  const cap = Math.max(1, Math.min(Number(limit) | 0 || 50, 200));
  return db.prepare(
    `SELECT id, type, content, confidence, weight, origin, session_id,
            created_at, last_accessed, access_count, status, tags
       FROM memories
      WHERE status = 'active'
      ORDER BY access_count DESC, created_at DESC
      LIMIT ?`,
  ).all(cap);
}

/**
 * Bump `access_count` and `last_accessed` for a memory. Used when a
 * memory is referenced (e.g. injected into context). Only counts for
 * `active` rows so archived/superseded memories don't get resurrected.
 *
 * @returns {boolean}
 */
export function touchMemory(db, id) {
  return incrementMemoryAccess(db, id);
}

/**
 * Public name for the access-counter bump. Same semantics as
 * `touchMemory`; the M2 spec (test-memories.js) calls it
 * `incrementMemoryAccess`. Both names exist so call sites can pick
 * whichever reads more naturally.
 *
 * @returns {boolean}
 */
export function incrementMemoryAccess(db, id) {
  if (!db || !id) return false;
  const r = db.prepare(
    `UPDATE memories
        SET access_count  = access_count + 1,
            last_accessed = ?
      WHERE id = ? AND status = 'active'`,
  ).run(now(), id);
  return r.changes > 0;
}

/**
 * Decide whether the persona is past the refresh threshold.
 *
 * Compares the latest `persona.updated_at` against `now - thresholdMs`.
 * Empty persona (no rows) counts as stale.
 *
 * @param {object} db
 * @param {number} [thresholdMs=7 * 86400000] — default 7d
 * @returns {boolean}
 */
export function isPersonaStale(db, thresholdMs = 7 * 86400000) {
  if (!db) return false;
  const ts = getPersonaLatestUpdatedAt(db);
  if (ts === 0) return true;
  return (now() - ts) >= thresholdMs;
}

/**
 * Daily decay sweep. Runs the three decay primitives in one
 * transactional pass so callers can rely on a single function for
 * the daily timer hook.
 *
 * Returns a summary object:
 *   {
 *     memoryWeightDecayed: number,  // memories whose weight was -0.1
 *     memoriesArchived:    number,  // memories whose status → archived
 *     rulesArchived:       number,  // rules whose status → archived
 *   }
 *
 * `null` when `db` is missing.
 *
 * @param {object} db
 * @param {object} [opts]
 * @param {number} [opts.memoryWeightDays=30]
 * @param {number} [opts.memoryArchiveDays=90]
 * @param {number} [opts.ruleArchiveDays=90]
 * @returns {{ memoryWeightDecayed: number, memoriesArchived: number, rulesArchived: number } | null}
 */
export function runDecayCheck(db, opts = {}) {
  if (!db) return null;
  const memoryWeightDays = Math.max(1, Number(opts.memoryWeightDays) | 0 || 30);
  const memoryArchiveDays = Math.max(1, Number(opts.memoryArchiveDays) | 0 || 90);
  const ruleArchiveDays = Math.max(1, Number(opts.ruleArchiveDays) | 0 || 90);

  const ts = now();
  const r1 = db.prepare(
    `UPDATE memories
        SET weight = MAX(0.1, weight - 0.1)
      WHERE last_accessed IS NOT NULL
        AND last_accessed < ?
        AND status = 'active'`,
  ).run(ts - memoryWeightDays * 86400000);
  const r2 = db.prepare(
    `UPDATE memories SET status = 'archived'
      WHERE last_accessed IS NOT NULL
        AND last_accessed < ?
        AND status = 'active'`,
  ).run(ts - memoryArchiveDays * 86400000);
  const r3 = archiveStaleRules(db, ruleArchiveDays * 86400000);

  return {
    memoryWeightDecayed: Number(r1?.changes || 0),
    memoriesArchived:    Number(r2?.changes || 0),
    rulesArchived:       Number(r3 || 0),
  };
}

/**
 * Internal dedup primitive used by `upsertMemories`.
 *
 * Strategy:
 *   1. If `embeddingProvider` is supplied, the caller is expected to
 *      pre-compute cosine similarity. (Reserved for M3.)
 *   2. Otherwise, FTS5 narrows the candidate set to ~20 active rows.
 *   3. For each candidate, compute precise token overlap between the
 *      new content and the candidate content. Overlap = (∩) / |new|.
 *      Highest overlap wins; if it meets `threshold`, return.
 *
 * Returns `null` when no candidate clears the bar.
 *
 * @param {object} db
 * @param {string} content
 * @param {string} type       — currently unused, reserved for cross-type filter
 * @param {object|null} embeddingProvider
 * @param {number} threshold
 * @returns {{ existingId: string, score: number } | null}
 */
function findSimilarMemory(db, content, _type, embeddingProvider, threshold) {
  if (!db || typeof content !== 'string' || !content) return null;
  // M3: implement vector-cosine path here when state.embeddingProvider is set.
  if (embeddingProvider) { /* fall through to FTS5 for now */ }

  const sanitized = sanitizeFtsQuery(content);
  let candidates = [];
  if (sanitized) {
    try {
      candidates = db.prepare(
        `SELECT m.id, m.content
           FROM memories_fts fts
           JOIN memories m ON m.rowid = fts.rowid
          WHERE memories_fts MATCH ? AND m.status = 'active'
          ORDER BY fts.rank
          LIMIT 20`,
      ).all(sanitized);
    } catch { /* FTS error → empty candidate set */ }
  }
  if (candidates.length === 0) return null;

  const newTokens = tokenizeForDedup(content);
  if (newTokens.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (!c || !c.content) continue;
    const cTokens = tokenizeForDedup(c.content);
    if (cTokens.length === 0) continue;
    const cSet = new Set(cTokens);
    let overlap = 0;
    for (const t of newTokens) if (cSet.has(t)) overlap += 1;
    const score = overlap / newTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best && bestScore >= threshold) {
    return { existingId: best.id, score: bestScore };
  }
  return null;
}

/**
 * Tokenise text for the dedup overlap score.
 *
 * Heuristic:
 *   - Latin words:  `[a-z0-9_]{2,}` (lowercased)
 *   - CJK:  individual chars (length 1) AND adjacent bigrams
 *
 * Returns a dedup-friendly array of tokens. Used by `findSimilarMemory`
 * to compute Jaccard-style overlap.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeForDedup(text) {
  if (!text || typeof text !== 'string') return [];
  const lc = text.toLowerCase();
  const latin = lc.match(/[a-z0-9_]{2,}/g) || [];
  const cjkChars = lc.match(/[\u4e00-\u9fff]/g) || [];
  const bigrams = [];
  for (let i = 0; i < cjkChars.length - 1; i += 1) {
    bigrams.push(cjkChars[i] + cjkChars[i + 1]);
  }
  return [...latin, ...bigrams];
}

// ────────────────────────────────────────────────────────────────────────────
// Self-check (used by scripts/test-db.js)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Verify the schema is correctly applied. Returns a small report object
 * describing the tables, triggers, and indexes that exist.
 *
 * @param {ReturnType<typeof openDatabase>} db
 */
export function inspectSchema(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);

  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
    .all()
    .map((r) => r.name);

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
    .all()
    .map((r) => r.name);

  const journalMode = db.pragma('journal_mode');
  const busyTimeout = db.pragma('busy_timeout');
  const foreignKeys = db.pragma('foreign_keys');

  return {
    tables,
    triggers,
    indexes,
    journalMode,
    busyTimeout,
    foreignKeys: foreignKeys === 1 || foreignKeys === true,
  };
}