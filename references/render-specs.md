# Render specs — the four final documents

You render these with your own document tooling (PDF preferred, docx
acceptable). `package.mjs` then re-extracts the text of whatever you produce
and re-runs the audit — so quality here is verified, not assumed. If you have
no document tooling, `bid-pack pack --fallback-pdf` produces plain but valid
PDFs with the built-in renderer.

Shared rules for all four documents:

- A4, margins ≥ 2 cm, single column, no headers/footers that obscure text.
- Fonts: one serif or sans family; name/credentials exactly as in the profile.
- File names are fixed — `package.mjs` looks for exactly these:
  `cover-letter.pdf`, `cv-tailored.pdf`, `technical-proposal.pdf`,
  `financial-proposal.pdf` (or `.xlsx` for the financial pack).
- Page numbers bottom-center on documents longer than one page.
- No placeholders survive: `[FILL]`, `{{...}}`, lorem, or "TODO" anywhere in
  the rendered bytes is a hard fail.
- Keep citations readable: "(p.X)" stays inline in the text. `[[PAGE n]]` tags
  are for internal tools and must NOT appear in rendered output.

## Cover letter — Cover-Letter.pdf

- Exactly one page. Structure per `assets/templates.md`:
  reference block → understanding (2 sentences, cited) → fit (one block per
  core competency, requirement quoted + evidence) → compliance declarations →
  availability → sign-off matching the CV name + credentials.
- 11–12 pt body, 1.15 line spacing, date top-right or under the reference
  block, recipient block top-left.
- No letterhead invention: if the user has no letterhead, plain and clean wins.

## CV — CV.pdf

- 2–4 pages. Start with identity (name + credentials, contact), then
  "Most relevant for this assignment" (the tailor's summary block), then the
  full reordered CV, education, languages.
- Every line traces to the master CV or a user evidence answer — the lint
  already proved this for the markdown; your rendering must not add anything.
- Never include a photo, marital status, or nationality unless the ToR or the
  user requires it (many UN forms do; follow the ToR, cite the page).

## Technical response — Technical-Proposal.pdf

- One section per scored criterion, highest weight first, section numbers and
  titles verbatim from the ToR grid with weight noted ("(p.X, 30 pts)").
- 10–12 pt body. Tables for work plans / deliverable mapping are welcome —
  they survive re-extraction as text (verify with the pack report).
- Length follows the ToR: if it caps pages, obey the cap and say so in the
  compliance matrix.

## Financial proposal — Financial-Proposal.pdf / .xlsx

- Render from `out/financial-proposal.md` (or fill the client's own form with
  `template-filler` — then the client's form IS the deliverable).
- The client sees the quote: quantities, all-inclusive unit rates, amounts,
  total, payment schedule, validity, taxes. The floor math (base, loading,
  contingency decomposition) NEVER appears in any client-facing file —
  `pricing.md`/`pricing.json` stay private and are not part of the pack.
- Money format: thousands separators, 2 decimals, currency stated in the
  header and in every column heading.
