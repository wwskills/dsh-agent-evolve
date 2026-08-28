# @wwskills/dsh-agent-evolve

> Self-evolving learning plugin for DeepSeek Harness (DSH): lesson capture, rule extraction, memory accumulation, persona building.

Three parallel learning lines, all non-invasive:

- **教训线** (Lesson) — capture errors → extract rule → inject guardrail → prevent repeat
- **记忆线** (Memory) — accumulate facts/preferences/decisions → build long-term knowledge
- **画像线** (Persona) — infer user style → inject concise profile into context

Fully local: SQLite + WAL + FTS5. Optional local Ollama for vector recall, falls back to keyword search automatically.

---

## Status

| Milestone | Scope | State |
|-----------|-------|-------|
| **M0** | L0 capture + L1 extraction + SQLite + corrections table + signal-word detection + global switch | **In progress** |
| M1 | Rule extraction + human review + rule injection + rules table | Planned |
| M2 | Persona build + persona injection + decay + memories/persona tables | Planned |
| M3 | Embedding auto-detect + config UI + stats bar + tab badges | Planned |
| M4 | npm publish + docs + tests | Planned |

## Install

```bash
dsh plugin --profile web add @wwskills/dsh-agent-evolve
```

DSH reads `cordis.patch.yml` on boot and wires the plugin into the Cordis container with the default config below.

## Configuration (cordis.patch.yml)

```yaml
agent-evolve:
  config:
    dbPath: ${DSH_HOME}/agent-evolve/evolve.db
    enabled: true
    batchSize: 3
    ruleThreshold: 5
    ruleTokenBudget: 800
    signalWords: [...]                # 15 defaults, see cordis.patch.yml
    embedding:
      autoDetect: true
      ollamaBaseUrl: 'http://127.0.0.1:11434'
      preferredModel: 'bge-m3'
```

Per-profile overrides: write your own patch layer and target `agent-evolve.config.*`.

## Storage

- **Path:** `$DSH_HOME/agent-evolve/evolve.db`
- **Mode:** WAL + `busy_timeout=5000` + `foreign_keys=ON` + `synchronous=NORMAL`
- **Tables:** `memories`, `rules`, `corrections`, `persona`, `usage_stats`
- **FTS5:** `memories_fts` (contentless, three sync triggers)

Path is independent from `dsh-long-memory` (`$DSH_HOME/long-memory/long-memory.db`) — no conflicts.

## Architecture

See [`docs/dsh-agent-evolve-design.md`](../../.openclaw/workspace/docs/dsh-agent-evolve-design.md) for the full v3 design document (500+ lines, includes competitor analysis, status machine, and WebUI mockups).

### Module layout (M0)

```
lib/
  db.js            ← SQLite init + schema (this milestone)
  index.js         ← Cordis plugin entry (M0: placeholder, M1: real)
  corrections.js   ← Lesson capture + CRUD (M0: Stage 2)
  extract.js       ← LLM extraction + TaskQueue (M0: Stage 2)
  decay.js         ← Daily decay timer (M2)
  usage.js         ← Monthly token stats (M1)
scripts/
  test-db.js            ← Schema bootstrap smoke test
  test-corrections.js   ← CRUD round-trip
  test-signal-words.js  ← Signal-word regex coverage
cordis.patch.yml
package.json
LICENSE
```

## Development

Pure JavaScript ESM. No TypeScript, no JSX.

```bash
node scripts/test-db.js              # schema bootstrap
node scripts/test-corrections.js     # CRUD round-trip
node scripts/test-signal-words.js    # signal regex
```

Requires Node ≥ 22.5 (uses `node:sqlite` built-in).

## License

MIT — see [LICENSE](./LICENSE).