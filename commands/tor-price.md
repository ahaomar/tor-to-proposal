---
description: Honest pricing — cited benchmark band + transparent rate model
allowed-tools: Bash(node:*), Read, Write
---
Price this assignment honestly: $ARGUMENTS

1. `node <plugin-root>/bin/market-rates.mjs scaffold` — have the user (or an approved web search) fill every benchmark row with source + date.
2. GATE: ask the user to confirm THEIR base rate, loading (0.2–0.35 typical) and contingency (0.05–0.15 typical) before running pricing-model. Never suggest a base rate.
3. `node <plugin-root>/bin/pricing-model.mjs --base N --basis day --loading L --contingency C --effort D --out-dir out` — present the table with formulas.
4. Position vs the cited band with market-rates position. Above band → premium justification needed; below band → check the floor.
5. Remind: the client's financial form governs; template-filler restructures into it.
