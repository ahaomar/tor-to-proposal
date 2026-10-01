---
description: Run the full tor-to-proposal bid pack on a ToR (and CV)
allowed-tools: Bash(node:*), Read, Write, Glob, Grep
---
Run the complete tor-to-proposal bid pack (see the skill's SKILL.md) on: $ARGUMENTS

Follow the four bid-pack phases in order:

1. INTAKE — `bid-pack start --tor <file> [--cv <file>] --dir <bid-dir>`; review bid-screen.md with the user; go/no-go is THEIR call.
2. QUESTIONNAIRE — put EVERY question from out/questions.md to the user in ONE message. Write answers.json, then `bid-pack apply`. Repeat until 0 open. Never answer for the user.
3. DRAFT — cover letter (lint to PASS), technical response per criterion (simulator to ~0 at-risk), tailored CV (cv-tailor lint PASS), financial proposal (already rendered by apply).
4. PACK — render the four PDFs (references/render-specs.md), then `bid-pack pack --dir <bid-dir>`; deliver pack/ + submission-checklist.md.

Hard requirements:
- Pricing only from user-confirmed numbers (profile confirm or answers.json) — never assume.
- Every ToR claim carries (p.X); anything unverified stays [FILL].
- GAP skills from cv-gap must not appear anywhere, including the tailored CV.
- `bid-pack pack` must exit 0 before you call anything done; it re-audits the rendered bytes.
