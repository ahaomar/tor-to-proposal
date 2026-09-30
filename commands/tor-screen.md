---
description: Quick go/no-go screen of a ToR — extract + bid screen + compliance matrix
allowed-tools: Bash(node:*), Read, Write
---
Screen this ToR for a go/no-go decision: $ARGUMENTS

1. `node <plugin-root>/bin/pdf-extract.mjs <file> --out tor.txt` (if the source is PDF/docx/xlsx; scanned → tell the user to OCR, stop).
2. `node <plugin-root>/bin/extract.mjs --tor tor.txt --out-dir out` (add EV inputs only if the user supplies fee, bid-days, day-rate).
3. Present: title, client, deadline, duration/effort, evaluation weights + sum check, the go/no-go checklist, red flags — each with its page.

No drafting in this step. End by asking: go or no-go, and which steps to run next (cv-gap, pricing, full bid).
