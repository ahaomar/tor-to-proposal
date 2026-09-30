---
description: CV vs ToR gap analysis with honest MATCH/GAP verdicts
allowed-tools: Bash(node:*), Read, Write
---
Analyze CV fit against a ToR. ToR: $ARGUMENTS (ask for the CV path if not obvious).

1. Extract the ToR (`pdf-extract` if needed), then `node <plugin-root>/bin/cv-gap.mjs --tor tor.txt --cv cv.txt`.
2. Present the MATCH/GAP table with page references.
3. Suggest CV bullet reordering using the ToR's verbatim terminology — facts unchanged, numbers only from the user.
4. GAP rows: state plainly these must NOT be claimed in the proposal. If a gap is disqualifying, say so as a go/no-go risk.
