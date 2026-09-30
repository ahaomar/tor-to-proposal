# tor-to-proposal — Technical Guide

For developers, IT support, and AI engineers deploying/ extending the tool.
Companion to `USER-GUIDE.md` (end users) and `PROMPT-GUIDE.md` (agent users).

---

## 1. Architecture

```
                      ┌────────────────────────────────────────────┐
  surfaces            │  CLI (bin/tor-to-proposal.mjs router)      │
  ─────────           │  Agent skill (SKILL.md, read by the model) │
                      │  MCP stdio server (mcp/server.mjs)         │
                      │  Claude Code plugin (commands/ + .mcp.json)│
                      └───────────────┬────────────────────────────┘
                                      │ spawn
                      ┌───────────────▼────────────────────────────┐
  deterministic core  │  bin/*.mjs — parse, compute, gate, lint    │
                      │  (no LLM calls, no network; pure Node ≥18) │
                      └───────────────┬────────────────────────────┘
                                      │ reads/writes
                      ┌───────────────▼────────────────────────────┐
  data                │  [[PAGE n]]-tagged text · tor-extract.json │
                      │  pricing.json · client docx/xlsx (read-only│
                      │  structure) · library/bids/ (win/loss)     │
                      └────────────────────────────────────────────┘
```

**The agent/tool contract** (also in SKILL.md): deterministic tools parse,
compute, gate and lint; the agent drafts and does fuzzy extraction; every
agent-produced value must carry page attribution to be accepted (`extract.mjs
--json`), and every draft must pass the lint/simulate/audit gates. An LLM
alone invents; regex alone can't read a ToR; the pair is the product.

## 2. Install variants

| Variant | Command / config | Audience |
| --- | --- | --- |
| Agent skill | `npx skills add ahaomar/tor-to-proposal` (skills.sh) | Claude Code, ZCode, any skill-aware agent |
| Claude Code plugin | `/plugin marketplace add ahaomar/tor-to-proposal` → `/plugin install tor-to-proposal@tor-to-proposal` | Claude Code users (skill + `/tor-*` commands + MCP) |
| MCP server | `claude mcp add tor-to-proposal -- node /abs/path/mcp/server.mjs`; Claude Desktop JSON; Codex `~/.codex/config.toml` `[mcp_servers.tor-to-proposal]` | Claude Desktop, Codex, ChatGPT (local connectors) |
| Standalone CLI | `git clone … && npm install`; `node bin/tor-to-proposal.mjs <cmd>` | CI, scripts, terminal users |

Deps (all local, pure JS): `unpdf` (pdf.js), `mammoth` (docx), `exceljs`
(xlsx), `adm-zip` (docx zip). Node ≥ 18. No telemetry, no network calls.

## 3. CLI reference

Router: `node bin/tor-to-proposal.mjs <command> [options]` (each tool also
runs directly). Exit codes everywhere: **0** ok · **1** validation failure /
hard-fail gate · **2** cannot-process (scanned PDF, inverted band, refused
formula overwrite) · **3** dependencies missing.

| Command | Key options | Outputs |
| --- | --- | --- |
| `pdf-extract` | `file`, `--out`, `--signals`, `--allow-scanned` | `[[PAGE n]]`/`[[SHEET n]]` text; signals JSON (scannedLikely, hasEvaluationTable…) |
| `extract` | `--tor`, `--json agent.json`, `--fee/--bid-days/--day-rate`, `--out-dir` | `tor-extract.json`, `bid-screen.md` (EV table), `compliance-matrix.md` |
| `cv-gap` | `--tor`, `--cv`, `--out` | match table, MATCH / "GAP — do not claim" |
| `cover-letter lint` | `lint --draft`, `--cv`, `--gap`, `--max-words` | lint report; exit 1 lists line-numbered violations |
| `market-rates scaffold` | `--title`, `--currency` | research table — zero numbers, all `[FILL]` rows |
| `market-rates position` | `--your-rate --benchmark-low --benchmark-high` | BELOW/WITHIN/ABOVE + advisory; exit 2 if low ≥ high |
| `pricing-model` | `--base --basis hour|day|week|month --loading --contingency --effort --weeks --out-dir` | `pricing.json`, `pricing.md` (formula per line) |
| `dossier` | `--client --sector --out` | dossier scaffold with type preset |
| `simulator` | `--extract --response --sub-elements --out` | at-risk pts per criterion, missing sub-elements, priorities |
| `template-filler map/fill/check` | `--template file.docx|.xlsx --data map.json --out --report` | fill-report.md (every write + trace); check exits 1 while fields unmapped |
| `audit` | `--proposal --matrix --extras … --report` | hard-fail list + untraced-claim review; exit 1 = do not submit |

## 4. Data contracts

**Page-tag protocol** — the substrate: `[[PAGE n]]` before each PDF/docx
page's text; `[[SHEET n: Name]]` for xlsx. `lib.mjs#pageOf(text, index)`
attributes any match to its page. All citation output is `(p.n)` or
`[[PAGE n]]`; the universal placeholder is `[FILL…]`.

**`tor-extract.json`** (extract.mjs):
```jsonc
{
  "referenceNumber": { "value": "UNDP-RFP-2026-042", "page": 1 },
  "deadline": { "value": "12 October 2026", "page": 2 },
  "evaluation": {
    "criteria": [ { "label": "…", "weight": 30, "page": 3 } ],
    "weightsSum": 70, "statedTotal": 70,
    "weightsSumCheck": "ok | MISMATCH (…) — surface, never fix | not-stated"
  },
  "paymentTerms": [ { "value": "…", "page": 4 } ],
  "conflicts": []   // regex vs agent-field conflicts, recorded not hidden
}
```

**Agent field merge (`--json`)** — `{"field": {"value": …, "page": n}}`.
Agent values are accepted **only** with page attribution; arrays must be
fully attributed; conflicts land in `conflicts[]`.

**`pricing.json`** — `{inputs (userSupplied: true), constants {8h, 5d, 4.33},
rates {hour, day, week, month}, loadedDay, quoteFloorDay, lumpSum,
assignmentTotal}` — consumed by template-filler via a label-mapped `data.json`.

**`sub-elements.json`** (simulator) — `{ "criterion label": ["verbatim
sub-element", …] }` — agent-extracted from the ToR; labels must match
tor-extract criteria exactly.

**Library** — `library/bids/<ref>/`: `tor-extract.json` (frozen),
`outcome.json`, `feedback.md`, `rate-band.json`. See `library/SCHEMA.md`;
aggregation only at n ≥ 10 with n + date.

## 5. MCP server details

`mcp/server.mjs` — dependency-free MCP **stdio** server (JSON-RPC 2.0,
newline-delimited). Methods: `initialize`, `notifications/*`, `ping`,
`tools/list` (11 tools), `tools/call`. Tool args are camelCase and mapped to
CLI flags; array args flatten to repeated flags (`audit.extras`).
`tools/call` results carry stdout + stderr and `isError: true` on any non-zero
exit (a hard-fail gate therefore surfaces as a tool error the agent must read).
Host cwd is not the repo: tool descriptions mandate absolute paths. Adding a
tool = one entry in the `TOOLS` array (name, description, JSON-schema,
`argv(a)` mapper, script).

## 6. Claude Code plugin

`.claude-plugin/plugin.json` + `marketplace.json` make the repo installable
via `/plugin marketplace add`; `commands/*.md` are slash commands
(`tor-bid`, `tor-screen`, `tor-cv`, `tor-price`, `tor-audit`) that reference
`<plugin-root>` paths; `.mcp.json` registers the MCP server with
`${CLAUDE_PLUGIN_ROOT}` so npm-installed binaries resolve inside the plugin.

## 7. Extension points

- **New donor pack**: `references/packs/<donor>.md` — conventions + what to
  verify; linked from SKILL.md's read-on-demand list. No code changes.
- **New requirement pattern** (cv-gap): extend the arrays in `bin/cv-gap.mjs`
  (`DOMAINS`, `CLIENTS`, `CERTS`, `SOFT`, `LANGS`).
- **New tool**: follow `bin/pricing-model.mjs` as the pattern (lib helpers,
  `--help`, strict arg validation, exit codes, `[FILL]`-discipline) + wire into
  router `TOOLS` map, MCP `TOOLS` array, and the test suite.
- **Richer evaluation parsing**: prefer contributing ToR samples to the
  fixtures; keep the weights-sum cross-check as the integrity anchor.

## 8. Testing

`npm test` — zero test dependencies, spawns the real CLI (24 assertions):
extraction + weights-sum, pricing arithmetic, band inversion rejection, CV-gap
honesty, lint pass/fail, simulator at-risk math, docx/xlsx fill + formula
preservation (verified by re-reading the filled files), audit gate, OCR path,
and an MCP round-trip (handshake → tools/list → two tool calls). Fixtures in
`test/fixtures/`; runtime binaries built into `test/.tmp/`.

## 9. Trust model

- All parsing/computation is local; no tool makes network calls. The only
  outbound step is market-rate research, run explicitly by/for the user.
- Client templates are opened read-only in structure terms: only mapped cells
  are written; formulas are never overwritten (refused with exit 2).
- `library/bids/` is gitignored; corpus analytics are opt-in, n ≥ 10, always
  dated.
- The gates are the guarantee: a draft that skips lint/simulate/audit is, by
  definition, not produced by this workflow.
