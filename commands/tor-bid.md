---
description: Run the full tor-to-proposal bid workflow on a ToR document
allowed-tools: Bash(node:*), Read, Write, Glob, Grep
---
Run the complete tor-to-proposal pipeline (see the tor-to-proposal skill's SKILL.md) on this ToR: $ARGUMENTS

Follow steps 0–9 in order: pdf-extract → extract → dossier → cv-gap → market-rates → pricing → cover letter → technical response + simulator → template-filler → audit.

Hard requirements:
- STOP and ask the user before pricing (step 5): their base rate, loading, contingency — never assume.
- Every ToR claim carries (p.X); anything unverified stays [FILL].
- GAP skills from cv-gap must not be claimed anywhere.
- Finish with audit.mjs; if it exits non-zero, report the hard-fail list and fix it before declaring done.
