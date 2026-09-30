# Pricing standards — read before step 5 (pricing-model)

## Conventions used by the tool (open constants)

- 8 hours/day, 5 days/week, 4.33 weeks/month (173.3 h/month).
- Formats interconvert from one base rate; every line prints its formula so a
  reviewer can reproduce it with a calculator.

## Loading (overhead multiplier)

Loading covers what the ToR does not pay for: insurance, professional
software, unpaid proposal time, leave without pay, pension. Common practice
for independent consultants on lump-sum UN/IFI work: 20–35%. Below 20%
usually means the consultant is subsidizing the client; above 40% needs a
written justification in your own records. These are conventions to sanity
check your own number — the number itself is the user's.

## Contingency

Contingency prices the risks you can document: payment delay reputation of the
client (from the dossier), currency/FX exposure, scope-creep-prone
deliverables, extended review cycles. 5–15% is the common band. Zero
contingency is a choice, not a virtue — make it consciously.

## Floor (decision rule — printed by every rate tool)

```
floor = (minimum acceptable net income for the period
         ÷ realistic billable days in that period) + overhead
```

A quote below floor is a subsidy to the client; a quote above your cited
benchmark band needs a premium justification (scarce expertise, faster
delivery, lower client risk).

## Cost-reimbursable vs lump-sum

- Cost-reimbursable: time actually worked is invoiced; loading shows as a rate.
- Lump-sum: you carry delivery risk; loading + contingency belong INSIDE the
  figure — which is also what most client financial forms require (a single
  daily fee or fixed deliverable prices, no visible loading lines).

## Client form discipline

- The client's financial form governs. Restructure into it (template-filler),
  never restructure it into your model.
- If the form forbids loading lines: present the loaded figure only, and keep
  the decomposition in your own pricing.json for your records.
- Per-team-member breakdowns: each person's rate must individually trace to
  their floor or a cited benchmark.
- Some forms include honorarium/DSA/transport fields — leave them [FILL]
  unless the ToR states amounts; never guess per-diems.
