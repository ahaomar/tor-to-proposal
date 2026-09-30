# Bid library schema — the win/loss corpus

Opt-in, local by default, anonymizable. This corpus is what eventually turns
rate bands and "what evaluators reward" from guesses into data. Schema ships
now so every completed bid can be recorded from day one.

```
library/bids/<reference-number>/
├── tor-extract.json   # frozen copy of out/tor-extract.json at submission time
├── outcome.json       # see below
├── feedback.md        # evaluator comments, verbatim if received (client name redactable)
└── rate-band.json     # what you quoted and which band you used
```

## outcome.json

```json
{
  "referenceNumber": "UNDP-RFP-2026-042",
  "client": "UNDP",
  "sector": "M&E",
  "region": "East Africa",
  "submittedOn": "2026-09-29",
  "outcome": "won",              // won | lost | withdrawn
  "decidedOn": "[FILL]",
  "feeQuoted": 9312.50,
  "currency": "USD",
  "basis": "day",
  "bandUsed": { "low": 380, "high": 520, "source": "market-rates-research.md row 2", "n": null },
  "winningFeeIfDisclosed": "[FILL]",
  "notes": "[FILL: anything the evaluator said, verbatim]"
}
```

## Rules

- Recording a bid is opt-in; ask the user before creating the folder.
- Never store evaluator personal data beyond their official role.
- The client may be redacted to type (UN agency / ministry / INGO) at the
  user's choice.
- Aggregate analytics (rate bands by client × sector × region) are only ever
  reported where n ≥ 10, always with n and date. Below that, no band is
  printed — no false precision, no leaking small-n identities.
- `library/bids/` is gitignored by default; if the user ever opts into a
  shared corpus, only anonymized aggregates leave the machine.
