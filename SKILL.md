---
name: tor-to-proposal
description: >
  Turn UN / NGO / government Terms of Reference (ToR), solicitations, RFPs and
  job descriptions into traceable, compliance-checked consultant proposals.
  MUST BE USED when the user mentions a ToR, tender, solicitation, RFP, RFQ,
  IC/SSA consultancy, UNGM bid, UNDP/UNOPS/UNICEF/World Bank/USAID assignment,
  wants a go/no-go bid decision, a compliance matrix, a cover letter for a
  consultancy, CV tailoring against a ToR, consultancy pricing/day rates,
  evaluation-criteria scoring of a draft, or a pre-submission audit of a
  proposal. Covers: bid screen, CV gap analysis, cover letter lint, market
  rate benchmarking, pricing model, client dossier, evaluation simulator,
  filling the client's own docx/xlsx forms, and a final honesty audit.
---

# tor-to-proposal — the bid tool that refuses to lie

You (the agent) draft. The tools verify. Nothing ships that a tool has not
gated. That division of labor is the whole product: an agent alone invents
facts; regex alone cannot read a ToR. Together they produce proposals in
which **every claim traces to the ToR (p.X), a user input, or a cited
source — otherwise it stays `[FILL]`**.

## Bootstrap (once per machine)

```bash
cd <this-skill-directory>
npm install        # local only; unpdf, mammoth, exceljs, adm-zip
```

All processing is local. No network calls are made with the user's documents.

## Non-negotiable rules (enforced by the tools, restated for you)

1. **CITATION** — every factual claim traces to `[[PAGE n]]` from the ToR, a user input, or a cited source (URL + access date). Otherwise `[FILL]`.
2. **NO INVENTION** — never fabricate rates, experience, dates, names, client facts. Tools compute; the user decides.
3. **CLIENT TEMPLATE WINS** — outputs restructure into the client's own forms via `template-filler`, never the reverse.
4. **HONESTY (pricing)** — numbers only from the user's floor calculation or a cited benchmark. Never gut-feel.
5. **NO FALSE PRECISION** — self-scores are coverage arithmetic over the published grid, always labeled as such. Never present an estimate as an evaluator's verdict.

If a step would force you to violate a rule, stop and tell the user what input is missing.

## Pipeline

Work these steps in order. Paths assume a working directory for this bid
(`--out-dir` defaults to `out/`). Read the ToR first; never quote it from memory.

### 0. Extract the source

```bash
node bin/pdf-extract.mjs tor.pdf --out tor.txt --signals signals.json
```

- Scanned PDF → the tool exits 2 with OCR guidance; do not improvise page numbers.
- `.docx` / `.xlsx` (ToR annexes, financial forms) also handled.
- If the tool cannot parse, and only then, you may read the document yourself —
  but every quote you take must carry the page it came from, and page numbers
  must come from the document, not your guess.

### 1. Structure the ToR

```bash
node bin/extract.mjs --tor tor.txt --json agent-fields.json --out-dir out
```

- The regex pass is the fast path. For anything it missed (ambiguous layout,
  criteria phrasing), YOU extract it verbatim into `agent-fields.json`
  (`{"deadline": {"value": "...", "page": 4}, "evaluation": {"criteria": [{"label": "...", "weight": 30, "page": 5}], ...}}`)
  — agent values are accepted only with page attribution, and conflicts are
  recorded in `tor-extract.json`, never hidden.
- Check `weightsSumCheck`. A mismatch is a clarification question, not a fix.
- Outputs: `tor-extract.json`, `bid-screen.md` (with expected-value go/no-go
  if the user supplies fee/bid-days/day-rate), `compliance-matrix.md`.

### 2. Client intelligence

```bash
node bin/dossier.mjs --client "UNOPS" --sector "M&E" --out client-dossier.md
```

Fill the scaffold only from sources you can cite (search only when the user
allows it; otherwise leave `[FILL]` rows for the user). Payment reputation
feeds pricing contingency.

### 3. CV gap analysis

```bash
node bin/cv-gap.mjs --tor tor.txt --cv cv.txt --out cv-gap-report.md
```

Present the MATCH/GAP table to the user. GAP rows are never claimed anywhere
downstream — if a JD skill is a GAP, it must not appear in the letter, and you
must not soften this. Suggest CV reordering with the ToR's verbatim terminology.

### 4. Market rates (research discipline)

```bash
node bin/market-rates.mjs scaffold --title "<title + ref>" --out market-rates-research.md
node bin/market-rates.mjs position --your-rate 450 --benchmark-low 380 --benchmark-high 520 --currency USD
```

The scaffold has no numbers — the user (or a web search they approve) fills
every row with source + date. `position` refuses a band where low ≥ high.

### 5. Pricing — ⛔ GATE

```bash
node bin/pricing-model.mjs --base 400 --basis day --currency USD --loading 0.25 --contingency 0.10 --effort 20 --out-dir out
```

Do not run pricing until the user has confirmed base, loading and contingency
as THEIR numbers. The tool prints every formula; hand the user `pricing.md`
and keep `pricing.json` for template filling.

### 6. Cover letter — draft, then lint

Draft per `assets/templates.md` (≤1 page: reference block → understanding from
Background/Objectives only → fit mapped to JD competencies → compliance
declarations → availability per ToR start date). Then:

```bash
node bin/cover-letter.mjs lint --draft cover-letter.md --cv cv.txt --gap cv-gap-report.md
```

Fix every failure; loop until PASS. No superlatives, ever.

### 7. Technical response — draft, then simulate

Write one section per scored criterion (highest weight first), in the client's
own vocabulary. Extract sub-elements verbatim from the criteria section into
`sub-elements.json`, then loop:

```bash
node bin/simulator.mjs --extract out/tor-extract.json --response technical.md --sub-elements sub-elements.json
```

Rewrite until at-risk points ≈ 0. The report is coverage arithmetic — say so
when presenting it; do not promise scores.

### 8. Client's own forms

```bash
node bin/template-filler.mjs map --template financial-form.xlsx --data out/pricing.json
node bin/template-filler.mjs fill --template financial-form.xlsx --data data.json --out out/financial-filled.xlsx
node bin/template-filler.mjs check --template technical-template.docx --data data.json
```

Build `data.json` from `pricing.json` + `tor-extract.json` (labels must match
the map output). `check` exits 1 while any required field is `[FILL]`.

### 9. Audit — final gate

```bash
node bin/audit.mjs --proposal technical.md --extras cover-letter.md --matrix out/compliance-matrix.md
```

Exit 1 = do not submit. Fix hard fails ([FILL] leftovers, incomplete matrix
rows); work the untraceable-claims review list.

### 10. Record for the library

After submission, record the bid under `library/bids/<ref-no>/` per
`library/SCHEMA.md` (opt-in; outcome + feedback verbatim + rate band). This
corpus is what eventually makes rate bands real data instead of guesses.

## Reference files — read on demand

- `references/review-rules.md` — before showing the user any draft (checklist + banned superlatives).
- `references/pricing-standards.md` — before step 5 (rate conventions, loading/contingency norms).
- `references/packs/<donor>.md` — when the client is UNDP, World Bank, EU-PRAG or USAID: where their rules live, what to verify in the ToR.
- `assets/templates.md` — structure templates for letter, technical response, compliance matrix rows, CV bullets.

## What you must never do

- Quote a ToR requirement without its page.
- Fill a `[FILL]` with anything the user did not supply or approve.
- Mention a GAP skill anywhere in the proposal.
- Let an unaudited draft leave the session marked "ready to submit".
- Present simulator output as a predicted evaluation score.
