# tor-to-proposal

**The bid tool that refuses to lie.**

An agent skill + deterministic CLI that turns UN / NGO / government Terms of
Reference (ToR), solicitations and RFPs into traceable, compliance-checked
consultant proposals — go/no-go decision, compliance matrix, CV gap analysis,
cover letter lint, honest pricing, evaluation-grid self-scoring, the client's
own forms filled in, and a final pre-submission audit.

It does **not** write your evidence for you. Your track record wins bids; this
tool guarantees your bid is complete, compliant, honestly priced, and scored
against the published grid before you submit.

## Why it exists

Every factual claim in any output must trace to a `[[PAGE n]]` reference in the
source ToR, a user-supplied input, or a cited external source — otherwise it
stays `[FILL]`. The app never fabricates rates, experience, dates, names or
client facts. In a domain where one invented fact means disqualification (and
vendor blacklisting), that is the feature, not a limitation.

## Install

Four ways to run it — pick by audience:

| You are… | Use | Setup |
| --- | --- | --- |
| Any consultant | **AI assistant + MCP** (Claude Desktop/Code, ChatGPT, Codex) | `npm install`, then point your assistant at `mcp/server.mjs` |
| Claude Code user | **Plugin** (skill + `/tor-bid` … `/tor-audit` commands + MCP) | `/plugin marketplace add ahaomar/tor-to-proposal` → `/plugin install tor-to-proposal@tor-to-proposal` |
| Agent user (skills.sh) | **Skill** | `npx skills add ahaomar/tor-to-proposal` |
| Developer / CI | **CLI** | `git clone … && npm install` → `node bin/tor-to-proposal.mjs <command>` |

## Guides

| Guide | For |
| --- | --- |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Non-technical consultants — plain-language, step-by-step, what you'll see at every step |
| [docs/PROMPT-GUIDE.md](docs/PROMPT-GUIDE.md) | Agent users — setup for Claude/ChatGPT/Codex/any agent + a copy-paste prompt library for each workflow step |
| [docs/TECHNICAL-GUIDE.md](docs/TECHNICAL-GUIDE.md) | Developers / IT — architecture, CLI reference, data contracts, MCP/plugin internals, extension points |

## The workflow

| Step | Command | Output |
| --- | --- | --- |
| 0. Extract source | `pdf-extract.mjs tor.pdf --out tor.txt` | page-tagged text + signals |
| 1. Structure ToR | `extract.mjs --tor tor.txt --out-dir out` | tor-extract.json, bid screen (EV go/no-go), compliance matrix |
| 2. Client intel | `dossier.mjs --client "UNOPS"` | research scaffold with source+date discipline |
| 3. CV gaps | `cv-gap.mjs --tor tor.txt --cv cv.txt` | MATCH / GAP — do-not-claim table |
| 4. Rate benchmarks | `market-rates.mjs scaffold` + `position` | cited band + BELOW/WITHIN/ABOVE advisory |
| 5. Pricing ⛔ | `pricing-model.mjs --base … --basis day …` | every format, every formula, pricing.json |
| 6. Cover letter | agent drafts → `cover-letter.mjs lint` | superlative/fill/name gates |
| 7. Technical response | agent drafts per criterion → `simulator.mjs` | at-risk points vs published grid |
| 8. Client's forms | `template-filler.mjs map/fill/check` | their .docx/.xlsx filled, formulas untouched |
| 9. Audit | `audit.mjs --proposal … --matrix …` | hard-fail gate before submission |
| 10. Record | `library/bids/<ref>/` per `library/SCHEMA.md` | your win/loss corpus |

The agent-facing master workflow lives in [SKILL.md](SKILL.md).

## Trust

Local-first. No network calls carry your documents, CVs or financials. Skill
distribution (`npx skills add`) only fetches this repo. The only optional
outbound step is market-rate research you run yourself.

## Development

```bash
npm install
npm test     # full suite: extract, pricing, rates, cv-gap, pdf-extract,
             # cover-letter lint, simulator, template-filler (docx+xlsx), audit
```

Node ≥ 18. Dependencies (all local, all pure JS): `unpdf`, `mammoth`,
`exceljs`, `adm-zip`.

## License

MIT — see [LICENSE](LICENSE). Design spec: [tor-to-proposal-build-spec.md](tor-to-proposal-build-spec.md).
