---
description: Verify and package a finished bid into the submittable bid pack
allowed-tools: Bash(node:*), Read, Write, Glob, Grep
---
Package the finished bid directory into the verified submission pack: $ARGUMENTS

1. Confirm the four documents exist as markdown in the bid dir (cover-letter.md, cv-tailored.md, technical-proposal.md, financial-proposal.md) and the lints pass (cover-letter lint, cv-tailor lint, simulator ~0 at-risk).
2. Render each to PDF with your document tooling per references/render-specs.md (cover-letter.pdf, cv-tailored.pdf, technical-proposal.pdf, financial-proposal.pdf). If you have no document tooling, let --fallback-pdf do it.
3. Run `bid-pack pack --dir <bid-dir>` (add --fallback-pdf only if needed).
4. If it exits non-zero: fix every hard fail in pack-report.md, re-render, re-run. It removes stale packs on failure — never submit an old pack.
5. Deliver pack/ + submission-checklist.md + the zip; remind the user pricing.md/pricing.json stay private.
