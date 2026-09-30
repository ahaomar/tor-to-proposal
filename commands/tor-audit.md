---
description: Pre-submission audit — hard-fail gate before you submit a bid
allowed-tools: Bash(node:*), Read, Write
---
Audit a finished proposal before submission. Proposal: $ARGUMENTS (ask for the compliance matrix path if it exists).

1. `node <plugin-root>/bin/audit.mjs --proposal <file> --matrix <matrix> --extras <cover-letter>`.
2. HARD FAILS ([FILL] leftovers, incomplete matrix rows): list them, fix what can be fixed from the ToR, ask the user for the rest. Re-run until exit 0.
3. Review list (untraced claim-shaped sentences): for each, either add a page tag/source or delete the claim — never soften it into vagueness.
4. Close with the final pre-submission checklist from the skill's references/review-rules.md (submission channel, deadline timezone, file naming).
