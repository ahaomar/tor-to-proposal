---
name: tor-to-proposal
description: >
  Turn UN / NGO / government Terms of Reference (ToR), solicitations, RFPs and
  job descriptions into a complete, verified bid pack — customized cover letter,
  tailored CV, technical response, financial proposal, submission checklist —
  as PDF/docx/xlsx in minutes. MUST BE USED when the user mentions a ToR,
  tender, solicitation, RFP, RFQ, IC/SSA consultancy, UNGM bid,
  UNDP/UNOPS/UNICEF/World Bank/USAID assignment, wants a go/no-go bid decision,
  a compliance matrix, a cover letter for a consultancy, CV tailoring against a
  ToR, consultancy pricing/day rates, evaluation-criteria scoring of a draft,
  or a pre-submission audit of a proposal. Covers: bid screen, consolidated
  questionnaire, CV gap analysis + tailoring, cover letter lint, market rate
  benchmarking, pricing model, financial proposal, client dossier, evaluation
  simulator, filling the client's own docx/xlsx forms, PDF packaging with a
  final honesty audit.
---

# tor-to-proposal — the bid tool that refuses to lie

You (the agent) draft. The tools verify. Nothing ships that a tool has not
gated. Every claim traces to the ToR (p.X), a user input, or a cited source —
otherwise it stays `[FILL]`.

## The product: ToR + CV in → bid pack out

The default experience is the **bid pack**. One ToR, one CV, one consolidated
questionnaire, one verified, zipped submission folder:

```
<bid-dir>/pack/  Cover-Letter.pdf · CV.pdf · Technical-Proposal.pdf ·
                 Financial-Proposal.pdf|xlsx · submission-checklist.md ·
                 deadline.ics · audit passed on the final bytes
```

## Bootstrap (once per machine)

```bash
npx tor-to-proposal init     # preferred: profile wizard (name, rates, master CV)
# — or, from a clone:
cd <this-skill-directory> && npm install
```

All processing is local. No network calls are made with the user's documents.
The only optional outbound step is market-rate research the user approves.

## Non-negotiable rules (enforced by the tools, restated for you)

1. **CITATION** — every factual claim traces to `[[PAGE n]]` / `(p.X)` from the
   ToR, a user input, or a cited source (URL + access date). Otherwise `[FILL]`.
2. **NO INVENTION** — never fabricate rates, experience, dates, names, client
   facts. Tools compute; the user decides. The tailored CV may only reorder and
   rephrase the master CV — `cv-tailor lint` proves it line by line.
3. **CLIENT TEMPLATE WINS** — outputs restructure into the client's own forms
   via `template-filler`, never the reverse.
4. **HONESTY (pricing)** — numbers only from the user's confirmed inputs
   (their profile answer, or this bid's answers.json). Never gut-feel.
5. **NO FALSE PRECISION** — simulator output is coverage arithmetic, never a
   predicted evaluator score.

If a step would force you to violate a rule, stop and tell the user what input
is missing.

## The bid pack conversation (default workflow)

Paths assume `--dir <bid-dir>` (default `bid/`); artifacts live in
`<bid-dir>/out/`. Read the ToR first; never quote it from memory.

### Phase 1 — Intake (all mechanical steps, one command)

```bash
node bin/bid-pack.mjs start --tor <tor.(pdf|docx|txt)> --cv <cv.(pdf|docx|txt)> --dir <bid-dir>
```

Runs pdf-extract → extract (bid screen, compliance matrix) → cv-gap →
cv-tailor build, then writes **`out/questions.md`**. Exit 2 on a scanned PDF →
OCR first; never improvise page numbers.

**Present the bid screen to the user** (deadline, effort, scoring, red flags).
Go/no-go is THEIR call. If no-go: stop and say so.

### Phase 2 — The ONE questionnaire (no scattered questions, ever)

`out/questions.md` consolidates every open decision: pricing, availability,
validity, draft `[FILL]`s, CV evidence. Two routes, in order of preference:

1. **Interactive wizard (non-technical users):** `node bin/bid-pack.mjs ask
   --dir <bid-dir>` — asks each open question in the terminal, saves
   answers.json and applies it. Run again; it only asks what is still open.
2. **Assistant-mediated:** put all questions to the user in one message,
   never answer one for the user, then:

```bash
# write the answers verbatim:
node bin/bid-pack.mjs apply --answers answers.json --dir <bid-dir>
```

`apply` runs pricing on the user's confirmed numbers, renders the financial
proposal, records CV evidence + fill answers, and regenerates the open list.
Repeat until `0 still open`.

### Phase 3 — Draft all four documents (you draft, tools gate)

**Non-technical users:** the tool writes ready-to-paste AI briefs at
`out/brief-cover-letter.md` and `out/brief-technical-proposal.md` after
`start` and `apply` — each is a self-contained prompt (ToR facts with page
tags, compliance rows, verified CV evidence, structure, honesty rules). The
user pastes one into any AI chat, saves the reply as `cover-letter.md` /
`technical-proposal.md` in `<bid-dir>/`, and the tool audits it. The brief is
the canonical drafting path for laymen; the manual route below is for agents
drafting directly.

Write drafts to `<bid-dir>/` as `cover-letter.md`, `technical-proposal.md`
(`cv-tailored.md` already exists from Phase 1; edit it only with master-CV
material or user evidence answers).

- **Cover letter** — structure in `assets/templates.md` (≤1 page: reference
  block → understanding from Background/Objectives → fit mapped to JD
  competencies → compliance declarations → availability). Then loop:
  `node bin/cover-letter.mjs lint --draft <bid-dir>/cover-letter.md --cv <cv.txt> --gap <bid-dir>/out/cv-gap-report.md` until PASS.
- **Technical response** — one section per scored criterion, highest weight
  first, in the client's vocabulary. Extract sub-elements verbatim into
  `sub-elements.json`, then loop:
  `node bin/simulator.mjs --extract <bid-dir>/out/tor-extract.json --response <bid-dir>/technical-proposal.md --sub-elements sub-elements.json` until at-risk ≈ 0.
  Present it as coverage arithmetic — never as a predicted score.
- **Tailored CV** — verify:
  `node bin/cv-tailor.mjs lint --cv <bid-dir>/out/cv-tailored.md --master <master-cv> --gap <bid-dir>/out/cv-gap-report.md --evidence <bid-dir>/out/cv-evidence.json`
  GAP rows are never claimed; unanchored lines fail until the user supplies
  evidence via the questionnaire.
- **Financial proposal** — already rendered by `apply` from pricing.json
  (md + xlsx, formulas visible). If the client supplied their own form:
  `template-filler.mjs map/fill/check` restructures INTO it.

### Phase 4 — Render, package, deliver

Render each final document to PDF with your own document tooling (typography:
`references/render-specs.md`). If no document tooling is available, add
`--fallback-pdf` to the command below and the built-in renderer will produce
plain, valid PDFs. Then:

```bash
node bin/bid-pack.mjs pack --dir <bid-dir>
```

`pack` re-extracts the text from every rendered PDF/docx/xlsx and **re-runs the
full audit on those bytes** — the gate applies to what the client will read.
On pass it builds `pack/`, `submission-checklist.md`, `deadline.ics` and the
zip. On fail it removes any stale pack so nothing half-finished can be
submitted. Deliver the pack folder + checklist to the user.

### After submission (opt-in, builds the moat)

Record the bid under `library/bids/<ref-no>/` per `library/SCHEMA.md`
(outcome + client feedback verbatim + rate band). This corpus is what makes
rate bands real data instead of guesses.

## Reference files — read on demand

- `references/render-specs.md` — typography/structure for the four final PDFs.
- `references/review-rules.md` — before showing the user any draft (checklist +
  banned superlatives).
- `references/pricing-standards.md` — before discussing rates (conventions,
  loading/contingency norms).
- `references/packs/<donor>.md` — when the client is UNDP, World Bank, EU-PRAG
  or USAID: where their rules live, what to verify in the ToR.
- `assets/templates.md` — letter, technical response, compliance rows, CV
  bullet upgrade, clarification questions.

## Advanced — step-by-step mode

Every stage is still directly runnable (and exposed via MCP):

```bash
node bin/pdf-extract.mjs tor.pdf --out tor.txt            # 0. page-tagged text
node bin/extract.mjs --tor tor.txt --out-dir out          # 1. screen + matrix
node bin/dossier.mjs --client "UNOPS" --sector "M&E"      # 2. client intel
node bin/cv-gap.mjs --tor tor.txt --cv cv.txt             # 3. MATCH / GAP
node bin/market-rates.mjs scaffold --title "<t + ref>"    # 4a. research scaffold
node bin/market-rates.mjs position --your-rate 450 ...    # 4b. band position
node bin/pricing-model.mjs --base 400 --basis day ...     # 5. ⛔ gated on user
node bin/cover-letter.mjs lint --draft letter.md --cv cv.txt  # 6. gate
node bin/simulator.mjs --extract ... --response ...       # 7. coverage gate
node bin/template-filler.mjs map|fill|check               # 8. client's forms
node bin/audit.mjs --proposal final.md --matrix out/compliance-matrix.md  # 9. gate
node bin/cv-tailor.mjs build | lint                       # CV generate/verify
node bin/financial-proposal.mjs --pricing ... --extract ...   # financial doc
node bin/render.mjs input.md --out output.pdf             # fallback PDFs
node bin/package.mjs --dir <bid-dir> [--fallback-pdf]     # verify + zip
node bin/profile.mjs init | set | get | path | erase      # consultant profile
```

`node bin/tor-to-proposal.mjs <command> --help` documents every one.

## What you must never do

- Quote a ToR requirement without its page.
- Fill a `[FILL]` with anything the user did not supply or approve.
- Mention a GAP skill anywhere in the proposal or tailored CV.
- Ask the user ten small questions when one consolidated questionnaire exists.
- Let an unaudited draft leave the session marked "ready to submit".
- Present simulator output as a predicted evaluation score.
- Build the pack while any verification fails — `pack` won't let you either.
