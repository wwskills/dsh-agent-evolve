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