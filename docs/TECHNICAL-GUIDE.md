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
| `bid-pack start` | `--tor file [--cv file] [--dir bid/] [--no-cv-tailor]` | runs pdf-extract → extract → cv-gap → cv-tailor; `out/questions.{json,md}` (consolidated questionnaire), `out/bid-state.json`, `out/bid-context.json` |
| `bid-pack apply` | `--answers answers.json [--dir bid/]` | records answers; runs pricing + financial proposal on user numbers; `out/cv-evidence.json`, `out/fill-answers.json`, `out/clarifications.md`; regenerates questions |
| `bid-pack pack` | `--dir bid/ [--fallback-pdf] [--no-zip]` | delegates to `package` |
| `profile` (`init`) | `init \| set k=v… \| get [k] \| path \| erase` | `~/.tor-to-proposal/profile.json` — user-supplied identity, floor math, rate defaults, master-CV path |
| `cv-tailor build` | `--cv master.txt --extract tor-extract.json [--profile p.json] [--gap r.md]` | `cv-tailored.md` (reordered master-CV material only) + `cv-tailor-report.md` (trace + terminology mirror) |
| `cv-tailor lint` | `--cv tailored.md --master master.txt [--gap] [--evidence cv-evidence.json]` | anchor table; exit 1 on unanchored bullets, altered numbers, GAP terms |
| `financial-proposal` | `--pricing pricing.json --extract tor-extract.json [--context bid-context.json] [--xlsx]` | `financial-proposal.md` (+ `.xlsx` with visible formulas: `D8=B8*C8`, `D10=SUM`) |
| `render` | `input.md --out out.pdf [--footer text]` | plain submittable PDF (fallback tier; pure JS, WinAnsi text layout) |
| `package` | `--dir bid/ [--fallback-pdf] [--no-zip]` | re-extracts rendered PDF/docx/xlsx → re-runs audit on those bytes; `pack/` + `pack-report.md` + `submission-checklist.md` + `deadline.ics` + `<ref>-bid-pack.zip`; exit 1 removes stale packs |
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

**v2 bid-pack contracts** (all under `<bid-dir>/out/`):

- **`~/.tor-to-proposal/profile.json`** — `{identity{name,credentials,…},
  rates{floor{annualIncome,billableDays,costLoading},
  defaults{base,basis,currency,loading,contingency}}, cv{masterPath}}`.
  Every value user-supplied (`profile set` validates numbers/ranges and the
  master-CV path exists). This file is the "user input" trace source.
- **`questions.json`** — `{generatedAt, dir, openCount, items:[{id, area,
  type, question, why, default?, answer, answerSource}]}`. Ids are stable:
  `Q-PRICING-BASE/LOADING/CONTINGENCY/CURRENCY`, `Q-PRICING-CONFIRM`,
  `Q-EFFORT-DAYS`, `Q-AVAILABILITY`, `Q-VALIDITY`, `Q-FILL-CONSULTANT/
  REIMBURSABLES/TAXES` (generated slots), `Q-FILL-<md5-8>` (draft fills —
  hash of file+excerpt so a fixed draft drops its question),
  `Q-CVE-<n>` (CV evidence), `Q-CLAR-*` (client clarifications).
- **`answers.json`** (user-written via the agent) — flat `{id: value}`.
- **`bid-context.json`** — derived: identity/consultantLine, refNo, title,
  deadline, currency, availabilityDate, validity, reimbursables, taxes.
  Input to financial-proposal and the pack checklist.
- **`cv-evidence.json`** — `[{id, text, source:"user-input", deleted?}]` —
  the ONLY way an unanchored line may enter the tailored CV.
- **`fill-answers.json`** — `[{id, answer, source}]` — trace of draft-fill answers.
- **`bid-state.json`** — `{steps:{torExtract,structured,cvGap,cvTailored,
  questions,pricing:{status}}, createdAt, updatedAt}` — resumability.
- **Pack outputs** — `<bid-dir>/pack/` (canonical names Cover-Letter.*,
  CV.*, Technical-Proposal.*, Financial-Proposal.* + client forms +
  submission-checklist.md + deadline.ics), `<bid-dir>/pack-report.md`,
  `<bid-dir>/<ref>-bid-pack.zip`. `pricing.md`/`pricing.json` are NEVER
  copied into the pack (floor math stays private).

**`library`** — `library/bids/<ref>/`: `tor-extract.json` (frozen),
`outcome.json`, `feedback.md`, `rate-band.json`. See `library/SCHEMA.md`;
aggregation only at n ≥ 10 with n + date.

## 5. MCP server details

`mcp/server.mjs` — dependency-free MCP **stdio** server (JSON-RPC 2.0,
newline-delimited). Methods: `initialize`, `notifications/*`, `ping`,
`tools/list` (21 tools), `tools/call`. Tool args are camelCase and mapped to
CLI flags; array args flatten to repeated flags (`audit.extras`,
`profile_set.pairs`).
`tools/call` results carry stdout + stderr and `isError: true` on any non-zero
exit (a hard-fail gate therefore surfaces as a tool error the agent must read).
Host cwd is not the repo: tool descriptions mandate absolute paths. Adding a
tool = one entry in the `TOOLS` array (name, description, JSON-schema,
`argv(a)` mapper, script). `npx tor-to-proposal mcp-server` launches the same
server for npx-installed users.

## 6. Claude Code plugin

`.claude-plugin/plugin.json` + `marketplace.json` make the repo installable
via `/plugin marketplace add`; `commands/*.md` are slash commands
(`tor-bid` — full bid pack, `tor-pack` — verify + package, `tor-screen`,
`tor-cv`, `tor-price`, `tor-audit`) that reference
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

`npm test` — zero test dependencies, spawns the real CLI (39 tests):
extraction + weights-sum, pricing arithmetic, band inversion rejection, CV-gap
honesty, lint pass/fail, simulator at-risk math, docx/xlsx fill + formula
preservation (verified by re-reading the filled files), audit gate, OCR path,
**profile set/get/erase + validation rejections (isolated $HOME), cv-tailor
build + lint (honest pass; invented number, GAP term, and evidence-rescued
lines), financial proposal md+xlsx formulas, the pure-JS PDF renderer
(round-tripped through unpdf, multipage), the full bid-pack lifecycle
(start → questions → apply → pricing → pack happy path), the pack failure
path ([FILL] survives rendering → exit 1 + stale pack removal), the profile
one-keystroke confirm path, and an MCP round-trip (handshake → tools/list
with all 10 v2 tools → profile_set/get → audit hard-fail as isError)**.
Fixtures in `test/fixtures/`; runtime binaries built into `test/.tmp/`;
profile-dependent tests run with `$HOME` pointed at the temp dir so a real
profile is never touched.

## 9. Trust model

- All parsing/computation is local; no tool makes network calls. The only
  outbound step is market-rate research, run explicitly by/for the user.
- Client templates are opened read-only in structure terms: only mapped cells
  are written; formulas are never overwritten (refused with exit 2).
- `library/bids/` is gitignored; corpus analytics are opt-in, n ≥ 10, always
  dated.
- The gates are the guarantee: a draft that skips lint/simulate/audit is, by
  definition, not produced by this workflow.
- The pack gate applies to the **rendered bytes**: `package.mjs` re-extracts
  the text of every final PDF/docx/xlsx and re-runs the audit on that text, so
  what is verified is what the client reads. On failure the previous pack/ and
  zip are deleted — a stale pack can never survive next to a failing bid.
