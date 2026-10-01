# tor-to-proposal

**The bid tool that refuses to lie.**

ToR + CV in → **verified bid pack out** — customized cover letter, tailored CV,
technical response, financial proposal, submission checklist — as PDFs, in
minutes, for UN / NGO / government consultants.

It does **not** write your evidence for you. Your track record wins bids; this
tool guarantees your bid is complete, compliant, honestly priced, verified
against the client's scoring grid, and audited **on the final rendered bytes**
before you submit.

## Why it exists

Every factual claim in any output must trace to a page in the source ToR, a
user-supplied input, or a cited external source — otherwise it stays `[FILL]`.
The tailored CV is proven line-by-line against your master CV. Pricing runs
only on numbers you confirm. The app never fabricates rates, experience,
dates, names or client facts. In a domain where one invented fact means
disqualification (and vendor blacklisting), that is the feature, not a
limitation.

## Install — one command, once

```bash
npx tor-to-proposal init
```

That sets up your consultant profile (name, credentials, rates, master CV) at
`~/.tor-to-proposal/profile.json`. Then use it with any AI assistant (Claude
Desktop / Claude Code / Codex / ChatGPT) via the MCP server at
`mcp/server.mjs`, or install the agent skill:

```bash
npx skills add ahaomar/tor-to-proposal   # agent users
```

Local-first: no network calls carry your documents. The only optional outbound
step is market-rate research you run yourself.

## The workflow — ToR + CV in, bid pack out

```bash
tor-to-proposal bid-pack start  --tor tor.pdf --cv cv.txt --dir mybid/  # screen + gaps + draft CV
tor-to-proposal bid-pack apply  --answers answers.json --dir mybid/    # your answers -> pricing + financials
tor-to-proposal bid-pack pack   --dir mybid/                           # verify + checklist + zip
```

With an assistant, you never run these — you say *"run a bid pack on this
folder"* and answer **one consolidated questionnaire**.

| Phase | What happens | You decide |
| --- | --- | --- |
| 1. Intake | ToR structured: deadline, effort, evaluation grid, compliance matrix, bid screen. CV gap analysis (MATCH / **GAP — do not claim**). Tailored CV drafted from your master CV. | Go / no-go |
| 2. The one questionnaire | Every open item — pricing, availability, validity, missing evidence — in a single numbered list. `apply` turns answers into pricing + the financial proposal. | All of it |
| 3. Drafts | Cover letter (lint-gated), technical response per scored criterion (coverage-simulated), tailored CV (anchor-verified), financial proposal (formulas visible). | Review |
| 4. Pack | Every rendered PDF/docx/xlsx is **re-extracted and re-audited**; pack/ + submission-checklist.md + deadline.ics + zip. Stale packs are removed on failure. | Submit |

The agent-facing master workflow lives in [SKILL.md](SKILL.md). Every stage is
also directly runnable: `tor-to-proposal <command> --help` (17 commands).

## Guides

| Guide | For |
| --- | --- |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Non-technical consultants — plain-language, step-by-step, what you'll see at every step |
| [docs/PROMPT-GUIDE.md](docs/PROMPT-GUIDE.md) | Agent users — setup for Claude/ChatGPT/Codex/any agent + a copy-paste prompt library for each phase |
| [docs/TECHNICAL-GUIDE.md](docs/TECHNICAL-GUIDE.md) | Developers / IT — architecture, CLI reference, data contracts, MCP/plugin internals, extension points |

## Trust

- Local-first. Nothing about your bid leaves your machine.
- Honesty gates are mechanical, not aspirational: cover-letter lint,
  CV anchor lint, pricing gate, simulator, template-filler (client's formulas
  never touched), and a final audit that runs on the rendered bytes.
- `pricing.md` / `pricing.json` contain your floor math — the pack builder
  never includes them in what you submit.

## Development

```bash
npm install
npm test     # 39 tests: extract, pricing, rates, cv-gap, cover-letter lint,
             # simulator, template-filler (docx+xlsx), audit, profile,
             # cv-tailor build/lint, financial proposal (md+xlsx), render
             # round-trip, bid-pack start/apply/pack, MCP handshake
```

Node ≥ 18. Dependencies (all local, all pure JS): `unpdf`, `mammoth`,
`exceljs`, `adm-zip`.

## License

MIT — see [LICENSE](LICENSE). Design spec: [tor-to-proposal-build-spec.md](tor-to-proposal-build-spec.md).
