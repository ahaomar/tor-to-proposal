# BUILD SPEC: tor-to-proposal (v2.0)
## Complete agent-buildable application specification

> **v2.0 changelog (mentor revision — see review notes for rationale):**
> 1. Mission repositioned: compliance + pricing + win-rate intelligence
>    engine — NOT an auto-writer. The old mission ("converts ToR into
>    bid-ready proposals") promised what the NO-INVENTION RULE forbids.
> 2. Division of labor made explicit (new §3): deterministic tools
>    parse/compute/gate/audit; the agent drafts; tools lint agent output.
>    Regex-only extraction was brittle across agency formats.
> 3. Simulator promoted from v3 → Phase 2. The highest-value feature is
>    the demo that sells the product; it cannot ship last.
> 4. NEW `template-filler.mjs`: fills the client's own .docx/.xlsx forms.
>    "Client-template-wins" was aspirational; now it is mechanical.
> 5. Data moat designed now (new §6): win/loss library + anonymized rate
>    bands. The code is cloneable in a weekend; the outcome corpus is not.
> 6. `pdf-parse` → `unpdf` (maintained pdf.js wrapper); added .xlsx ToR
>    annex parsing (evaluation grids & financial forms often arrive as
>    Excel annexes).
> 7. Local web UI promoted from "optional" → Phase 5 mandatory. A CLI
>    will never reach "every consultant"; the CLI stays as the engine.
> 8. Bid screen gains expected-value go/no-go arithmetic.
> 9. Cover-letter tool split: agent drafts, `cover-letter.mjs` LINTS
>    (superlatives / [FILL] / page tags / name-match). Fixed test typo.
> 10. Branding note: "tor" collides with the Tor anonymity network in
>     search. Ship the CLI as-is; pick a searchable brand name before v2.

---

## 1. MISSION

Build a local-first CLI (engine) + agent skill (interface #1) + local web
UI (interface #2) that turns Terms of Reference / Job Descriptions — PDF,
docx, xlsx, or pasted text — into **traceable bid intelligence**:
go/no-go decision, compliance matrix, evaluation-grid self-scoring, CV
gap analysis, honest pricing, and the client's own forms filled in.

The app does NOT write the winning content — the consultant's evidence
does. The app guarantees the bid is **complete, compliant, honestly
priced, and scored against the published grid before submission**.

**Wedge user (v1):** solo consultant bidding individual-consultant (IC /
SSA / PSA) solicitations on UNGM and agency rosters, English-language
ToRs. Team/consortium bids are a later phase, not v1.

**Positioning:** "The bid tool that refuses to lie." Every competitor's
weakness is fabrication; the four core rules are the product.

## 2. NON-NEGOTIABLE CORE RULES (embed in every output the app produces)

1. **CITATION RULE**: Every factual claim in any output must trace to:
   (a) a `[[PAGE n]]` reference from the source ToR, OR
   (b) a user-supplied input, OR
   (c) a cited external source with URL + access date.
   Otherwise output `[FILL]`.
2. **NO-INVENTION RULE**: The app NEVER fabricates rates, experience,
   dates, names, or client facts. Tools compute; the user decides.
3. **CLIENT-TEMPLATE-WINS RULE**: When generating forms, the client's
   own template/format always governs; app output restructures into it.
   `template-filler.mjs` enforces this mechanically (§4.9).
4. **HONESTY RULE**: Pricing features are input-driven forever. The app
   may suggest a number ONLY if traceable to a user floor-calculation
   or a cited benchmark (or, later, an anonymized library band with n
   and date — §6). Never gut-feel numbers.
5. **NO-FALSE-PRECISION RULE** (new): self-scores and predictions are
   coverage arithmetic over verbatim criteria, always shown with their
   method. The app never presents an estimate as an evaluator's verdict.

## 3. DIVISION OF LABOR (agent × tools)

| Layer | Does | Never does |
|---|---|---|
| Tools (deterministic .mjs) | parse, page-tag, arithmetic, gating, linting, docx/xlsx filling, schema validation | draft prose, judge quality, guess fields silently |
| Agent (per SKILL.md) | fuzzy field/table extraction, drafting cover letter + technical sections, interpreting CV evidence | emit any output that fails the lint/audit gate |

Rationale: regex alone breaks across UNOPS/UNDP/IOM/EU-PRAG template
differences; an LLM alone invents. The pair — agent drafts, tools verify
— is the product. `SKILL.md` documents this contract; `audit.mjs` is the
enforcement gate.

## 4. ARCHITECTURE

```
tor-to-proposal/
├── package.json               # type: module; deps: unpdf, mammoth,
│                              # exceljs, docx (writer), docxtemplater
├── SKILL.md                   # master workflow + agent/tool contract
├── README.md
├── bin/
│   ├── tor-to-proposal.mjs    # router CLI: routes subcommands
│   ├── pdf-extract.mjs        # PDF/docx/xlsx → page/sheet-tagged text
│   ├── extract.mjs            # ToR → structured JSON (bid screen + matrix)
│   ├── cv-gap.mjs             # CV ↔ ToR gap analyzer
│   ├── cover-letter.mjs       # cover letter LINTER (agent drafts)
│   ├── market-rates.mjs       # benchmark scaffolder + position calculator
│   ├── pricing-model.mjs      # transparent multi-format rate calculator
│   ├── dossier.mjs            # client intelligence scaffolder
│   ├── simulator.mjs          # evaluation reverse-simulator (Phase 2!)
│   ├── template-filler.mjs    # fills client .docx/.xlsx forms (NEW)
│   └── audit.mjs              # pre-submission compliance gate
├── references/
│   ├── review-rules.md        # self-review checklist
│   ├── pricing-standards.md   # rate conventions, tax/loading norms
│   └── packs/                 # donor packs: undp.md, worldbank.md,
│                              # eu-prag.md, usaid.md (Phase 6)
├── assets/
│   └── templates.md           # technical response + CV-tailoring templates
├── library/                   # win/loss corpus (§6) — schema from day one
├── test/
│   └── run-tests.mjs
└── web/                       # Phase 5 (mandatory): local-first UI
                               # wrapping the CLI over localhost HTTP
```

## 5. TOOL SPECIFICATIONS

### 5.1 pdf-extract.mjs
- Input: PDF (unpdf), .docx (mammoth), .xlsx (exceljs → sheet-tagged
  `[[SHEET name]]` rows). Extract full text.
- Tag every page/sheet: insert `[[PAGE n]]` / `[[SHEET n]]` markers.
- Output signals: totalPages, scannedLikely (thin text layer → warn
  "OCR required: tesseract file.pdf out txt"), hasEvaluationTable,
  hasAnnexes, hasFinancialForm, charCount.
- Exit 2 on scanned PDF with OCR guidance; never crash.

### 5.2 extract.mjs
- Input: page-tagged text (+ agent-assisted field extraction per §3)
  → outputs `tor-extract.json` + markdown scaffold.
- Extract (verbatim where possible, `[[PAGE n]]` on every field):
  assignment title, reference number, client name, contact, deadline,
  validity period, start date, duration, effort estimate (person-days),
  deliverables list, qualifications/JD section, evaluation criteria
  table (criterion + weight + sub-elements), GCC/no-deviation clauses,
  payment terms, submission channel, clarification cut-off date.
- Evaluation-table parsing is agent-assisted; the tool verifies every
  extracted weight parses as a number and the weights sum to their
  stated total (flag mismatches — ToRs contain typos; surface, never
  silently fix).
- Generate bid-screen with **expected-value go/no-go** (all inputs
  user-supplied per HONESTY RULE):
  `EV = P(win) × fee − bid-days × your-day-rate`, printed as a table
  for P(win) = 0.25 / 0.50 / 0.75, plus the compliance matrix table
  (Requirement | p.X | Our response | Owner | Status).

### 5.3 cv-gap.mjs
- Input: cv.txt + tor.txt. Compare against requirement patterns:
  education/degree, years of experience, domain expertise (M&E, gender,
  climate, health, governance, finance, procurement, digital, etc.),
  geographic experience, languages, client-type experience (UN/World
  Bank/USAID/FCDO/GIZ/NGO/government), soft skills (report writing,
  facilitation, training, stakeholder), certifications (PMP, PRINCE2...).
- Output `cv-gap-report.md`: match table (requirement | p.X | in CV ✔/✖ |
  action), plus CV update suggestions: re-order bullets to match top-
  weighted criteria using ToR's own verbatim terminology; quantify years;
  add metric-backed bullets as [FILL]; GAPS → never claim, flag as risk
  or reword without changing facts.

### 5.4 cover-letter.mjs (LINTER — the agent drafts the letter)
- Agent produces a draft per assets/templates.md structure: reference
  block (verbatim title + ref no. + deadline ack, p.X); understanding
  (2 sentences from Background/Objectives only, p.X); fit ("Requirement
  (p.X): [verbatim] — [FILL: your matching evidence]"); compliance
  declarations (validity, GCC, no-deviation, p.X); contact + availability
  per ToR start date (p.X).
- `cover-letter.mjs lint draft.md --cv cv.txt` then hard-checks:
  no superlatives ("leading", "world-class", "renowned" list in
  references/review-rules.md); every requirement mention carries a page
  tag; missing evidence → `[FILL]` present; sign-off name/credentials
  match CV exactly; ≤ 1 page. Exit 1 with line numbers on violation.
- If the JD names a skill absent from CV → lint failure "do not mention;
  see cv-gap report".

### 5.5 market-rates.mjs
- Commands: `scaffold` (generates market-rates-research.md — benchmark
  source table: UNDP/UNICEF fee grids, national procurement award
  notices, sector surveys, job postings with disclosed bands, peer
  consultants; each row rate + date accessed; plus context factors:
  cost-reimbursable vs lump-sum, payment delay risk, currency/inflation,
  overhead costs) and `position --your-rate N --benchmark-low N
  --benchmark-high N --currency X` (outputs BELOW/WITHIN/ABOVE band with
  % position and advisory: above-band → must justify premium with cited
  evidence; below-band → verify floor, underpricing signals low quality).
- When §6 library bands exist for agency × sector × region (n ≥ 10),
  print them as an additional cited band with n and date.
- Decision rule printed: floor = (min acceptable net income ÷ realistic
  billable days) + overhead. Quote must trace to floor or cited benchmark.

### 5.6 pricing-model.mjs
- Input: --base N --basis hour|day|week|month --currency X
  [--loading 0.25] [--contingency 0.10] [--effort days] [--weeks n]
- Constants (shown openly): 8h/day, 5d/week, 4.33 weeks/month.
- Output: every billing format (hour/day/week/month), each line showing
  its formula; loaded rate (+loading%); quote floor (+contingency%);
  lump-sum (effort × floor); assignment total (weeks × floor/week).
- Emits `pricing.json` — the single input consumed by template-filler.
- Always print warning: client's financial form governs — some templates
  forbid loading lines or require per-team-member breakdown; restructure
  into their template in reverse via §5.9.

### 5.7 dossier.mjs
- Scaffolds client-dossier.md: client type (UN/INGO/ministry/private →
  tone + registration prerequisites e.g. UNGM), payment reputation
  (search UNGM vendor disclosures, procurement award notices; record
  source + date → feeds pricing contingency), past awards for similar
  work (who won, disclosed value → calibrates rate band), evaluation
  committee info if stated.

### 5.8 simulator.mjs (Phase 2 — highest value, ships early)
- Input: tor-extract.json evaluation criteria + drafted technical
  response (markdown or docx).
- For each criterion/sub-criterion: agent judges coverage ("addresses
  sub-elements a, b; missing c — sustainability plan (p.7)"); tool
  computes at-risk points = weight × (missing sub-elements ÷ total
  sub-elements), shown with the arithmetic (NO-FALSE-PRECISION RULE).
- Output: `simulator-report.md` — per-criterion table (criterion | pts |
  covered/total sub-elements | at-risk pts | what's missing | p.X),
  ranked rewrite priorities, and total at-risk points. Report states
  plainly: coverage arithmetic against the published grid, not a
  prediction of evaluator behavior.

### 5.9 template-filler.mjs (NEW — kills the most hated manual step)
- `fill --template <client-file> --data pricing.json|tor-extract.json
  --out <filled-file>`: fills the client's own forms —
  - .docx via docxtemplater-style placeholder mapping (run `map`
    first to list detected placeholders/tables and propose field
    mappings for user confirmation);
  - .xlsx financial forms via exceljs: write values into labeled cells,
    NEVER overwrite formulas (client's totals must stay theirs).
- `check --template <file> --data <json>`: lists required fields with no
  mapped value → printed as a [FILL] checklist; exit 1 if any remain.
- Emits `fill-report.md`: every injected value + its trace (pricing.json
  line or tor-extract.json field) — CLIENT-TEMPLATE-WINS enforced
  mechanically: template structure is never altered, only populated.
- Warns when pricing.json carries loading/contingency lines the template
  has no rows for ("template forbids breakdown → show loaded figure
  only; approve to collapse").

### 5.10 audit.mjs
- Scan final proposal outputs: find every claim lacking a page tag,
  user input trace, or cited source → hard-fail list before submission.
- Verify compliance matrix rows all marked Complete; checklist items
  actually checked; simulator-report shows zero unaddressed at-risk
  items (or explicit user override, recorded).

## 6. DATA MOAT — WIN/LOSS LIBRARY (schema ships in v1)

The code is cloneable; the corpus is not. Every completed bid records
(opt-in, anonymized, local by default):

```
library/bids/<ref-no>/
├── tor-extract.json      # parsed ToR
├── outcome.json          # won | lost | withdrawn + date + fee quoted
├── feedback.md           # evaluator comments, verbatim if received
└── rate-band.json        # basis, currency, quoted rate, band used
```

Later phases aggregate (only where n ≥ 10, always with n + date) into
rate bands by agency × sector × region and evaluator feedback patterns.
Design the schema and consent question NOW so the corpus starts
accumulating from the first bid; ship the analytics later.

## 7. PIPELINE (SKILL.md master workflow)

```
0. pdf-extract        → page/sheet-tagged text; OCR flag if scanned
1. extract            → tor-extract.json + EV bid screen + compliance matrix
2. dossier            → client intelligence
3. cv-gap             → match table + CV update suggestions
4. market-rates       → cited benchmark band (scaffold + research)
5. pricing-model      → pricing.json (all formats + floor)
   ⛔ GATE: no pricing output without user-confirmed inputs
6. cover-letter       → agent drafts → cover-letter.mjs lints → fix loop
7. technical response → agent drafts one section per scored criterion,
                        in client wording; simulator.mjs scores draft →
                        rewrite loop until at-risk points ≈ 0
8. template-filler    → client's .docx/.xlsx forms filled from
                        tor-extract.json + pricing.json; check → [FILL] list
9. audit              → pre-submission hard-fail gate
10. library           → record bid + (later) outcome (§6)
```

## 8. TESTS (test/run-tests.mjs)

- extract: fixture ToR with known fields → assert ref no., deadline,
  evaluation criteria parsed with correct page tags; weights-sum check
  flags a broken fixture table.
- pricing-model: `--base 375 --basis day --loading 0.25 --contingency
  0.10 --effort 20` → assert 468.75 (loaded), 515.63 (floor),
  10312.50 (lump-sum) present + template-governs warning.
- market-rates position: above/within/below band detection; reject
  benchmark-low > benchmark-high (non-zero exit).
- cv-gap: gap honesty — assert "GAP — do not claim" appears for absent
  skills; MATCH for present ones.
- pdf-extract: clean arg-less run errors gracefully; scanned detection
  flag on thin-text fixture; .xlsx annex → [[SHEET]] tags.
- cover-letter lint: fixture with a superlative → exit 1, line cited;
  fixture with unsupported skill mention → flagged; clean letter → exit 0.
- simulator: fixture criteria (3 sub-elements, 10 pts) + response
  covering 2 → assert at-risk ≈ 3.3 pts and the missing sub-element named.
- template-filler: fixture .docx placeholders + pricing.json → values
  filled + fill-report traces; fixture .xlsx with SUM formula → formula
  preserved; unmapped required field → exit 1 with [FILL] list.
- audit: fixture proposal with one uncited claim → assert flagged.

## 9. BUILD PHASES (agent executes in order)

Phase 1: package.json + pdf-extract + extract (foundation; everything
         else inherits page-tag traceability) + library schema (§6)
Phase 2: simulator + cv-gap + cover-letter draft/lint loop
         (the demo that sells: "upload ToR + draft → at-risk points")
Phase 3: pricing-model + market-rates + template-filler
         (docx + xlsx filling wired to pricing.json)
Phase 4: dossier + audit + full test suite
Phase 5: web/ local UI wrapping the CLI (localhost, local-first; the
         surface that reaches non-CLI consultants) + outcome capture UX
Phase 6: donor packs (undp/worldbank/eu-prag/usaid) → library analytics
         (rate bands, n ≥ 10 with n + date) → milestones engine (parse
         timeline → milestones.csv + .ics; mechanical dates only) →
         French/Spanish ToR support
Phase 7 (stretch): team/consortium mode (multi-CV gap analysis, role
         matrix, per-person rate loading, JV declaration letters);
         clarification-question generator (deadline-aware, from
         ambiguities + CV gaps + payment-term gaps)

## 10. QUALITY BAR

- Every file runnable; no truncated or pseudo-code.
- All CLI tools: --help text, non-zero exits with clear messages.
- Markdown outputs use clean tables; no broken layouts.
- Node >= 18, ESM. Deps: unpdf, mammoth, exceljs, docx, docxtemplater.
- `npm test` must pass 100% before a Phase is considered complete.
- Trust statement in README: local-first, no network calls with user
  data, explicit opt-in for anything leaving the machine.

## 11. FINAL SELF-CHECK FOR THE BUILDING AGENT

Before declaring done, verify: (1) every output field has a page tag or
[FILL]; (2) no tool invents a rate, date, or fact; (3) each Phase's
tests pass; (4) README documents install → run workflow:
`npm install && node bin/tor-to-proposal.mjs <command> ...`;
(5) template-filler never alters template structure or formulas;
(6) library schema (§6) exists and captures its first bid.
