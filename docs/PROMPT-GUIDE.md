# tor-to-proposal — Prompt Guide for AI Assistants

For people who work **through an AI assistant** — Claude (Desktop/Code),
ChatGPT, Codex, or any agent — instead of typing CLI commands. Includes setup
per assistant and **copy-paste prompts for every step**.

The working pattern is always the same:
**you provide the evidence and the decisions; the assistant runs the tools;
the tools enforce the honesty rules.** When you see `[FILL]`, that's a
question addressed to you.

---

## 1. Setup per assistant (one-time)

### Claude Desktop (chat app)
Settings → Developer → Edit Config → add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tor-to-proposal": {
      "command": "node",
      "args": ["/absolute/path/to/tor-to-proposal/mcp/server.mjs"]
    }
  }
}
```
Restart the app. (Run `npm install` inside the tor-to-proposal folder first.)

### Claude Code (terminal)
```bash
git clone https://github.com/ahaomar/tor-to-proposal && cd tor-to-proposal && npm install
claude mcp add tor-to-proposal -- node "$(pwd)/mcp/server.mjs"
```
Or install as a plugin (skills + `/tor-*` slash commands + MCP in one):
```bash
# inside Claude Code:
/plugin marketplace add ahaomar/tor-to-proposal
/plugin install tor-to-proposal@tor-to-proposal
```

### Codex CLI
`~/.codex/config.toml`:
```toml
[mcp_servers.tor-to-proposal]
command = "node"
args = ["/absolute/path/to/tor-to-proposal/mcp/server.mjs"]
```

### ChatGPT
If your build supports local MCP connectors (desktop developer mode): point a
connector at the same `server.mjs`. **If not:** skip setup — use the
"paste-the-text" prompts in §4; everything works from pasted text except
direct PDF reading (paste the ToR text instead).

### Any other agent (generic)
Any agent that can (a) read/write local files and (b) run one shell command
can drive this repo: give it the repo path and say *"follow SKILL.md in that
folder"*. The SKILL.md is written to be followed by any capable agent.

**Test any setup with:** *"List your tor-to-proposal tools."* → you should see
`pdf_extract`, `extract_tor`, `cv_gap`, `cover_letter_lint`,
`market_rates_scaffold`, `market_rates_position`, `pricing_model`, `dossier`,
`simulate`, `template_filler`, `audit`.

---

## 2. The one-prompt start (full workflow)

Paste this, with your paths filled in:

```text
I am bidding on a consultancy. Work through the tor-to-proposal pipeline
(SKILL.md, steps 0–9) with me. My files:
- ToR: /Users/me/bids/undp-2026-042/tor.pdf
- CV: /Users/me/bids/undp-2026-042/cv.txt

Rules for you:
- Keep every ToR fact traceable to a page; anything unverified becomes [FILL].
- Never claim skills my CV lacks (the cv-gap GAP list is final).
- Before ANY pricing math, stop and ask me for my base rate, loading and
  contingency. Never propose a rate yourself.
- Drafts get linted/simulated/audited with the tools; fix and loop until they pass.
- Start now with step 0 + 1 (extract + bid screen) and show me the go/no-go.
```

The assistant will run extraction, show the bid screen, and **stop to ask you
questions at every gate**. Answer in plain English; it does the tool work.

---

## 3. Step-by-step prompt library

Run them one at a time if you prefer control (recommended for your first bid).

**Screen a ToR (go/no-go):**
```text
Screen this ToR for a go/no-go decision: /path/tor.pdf. Give me the one-page
bid screen: title, reference, deadline, duration/effort, evaluation criteria
with weights, red flags. Ask me for EV inputs (expected fee, bid days, my day
rate) if you want to show expected value. No drafting yet.
```

**CV reality check:**
```text
Compare my CV (/path/cv.txt) against the extracted ToR. Show the MATCH/GAP
table with page numbers. Be blunt about GAP rows — I want to know what I must
not claim. Then suggest how to reorder my CV bullets using the ToR's own
terminology, without changing any facts.
```

**Pricing (the gated one):**
```text
Help me price this. My floor numbers: minimum net income $[X] per year,
realistic billable days [Y], overhead/loading about [Z]%. First scaffold the
benchmark table; research UNDP/UNICEF fee grids and UNGM award notices for
[this sector] in [region] and give me each band WITH source URL + access date
— no uncited numbers. Then run the pricing model with my confirmed inputs and
show every formula. Finally position my rate against the cited band.
```
*(If you don't allow web search, the assistant must leave benchmark rows as
[FILL] and give you the table to fill. That is correct behavior — don't push it.)*

**Cover letter:**
```text
Draft a one-page cover letter per assets/templates.md: verbatim title + ref +
deadline block, 2-sentence understanding from Background/Objectives only, fit
section quoting 3–5 JD requirements (p.X) with my CV evidence — mark [FILL]
where I haven't given you evidence yet — compliance declarations, availability
per the ToR start date. Then lint it with cover_letter_lint and fix everything
it flags. No superlatives.
```

**Technical response + self-score:**
```text
Draft the technical response: one section per scored criterion, highest weight
first, in the client's vocabulary, every deliverable addressed. Extract the
sub-elements of each criterion verbatim into sub-elements.json, then run
simulate and give me the at-risk points. Loop with me: rewrite the weakest
criterion, re-simulate, until at-risk ≈ 0.
```

**Their forms:**
```text
Fill the client's financial form (/path/financial-form.xlsx) using
template_filler: map first and show me every field, fill from pricing.json +
tor-extract.json (build data.json so labels match exactly), then check. If any
field stays [FILL], list what you need from me. Never touch their formulas.
```

**Final gate:**
```text
Run the audit on my final files (proposal, cover letter, compliance matrix).
If it exits non-zero, list the hard fails, fix what you can from the ToR, and
ask me for the rest. Then run it again until it passes. Finish with the
pre-submission checklist (submission channel, deadline timezone, file naming).
```

**Record the outcome (later):**
```text
Record this bid in my library per library/SCHEMA.md: outcome [won/lost],
fee quoted [X], any evaluator feedback I paste below. Local only.
```

---

## 4. Paste-the-text variant (no file access — e.g. plain ChatGPT web)

If your assistant cannot read local files, paste content directly:

```text
You are enforcing the tor-to-proposal honesty rules on the text I paste:
1) Every claim about the assignment must cite "p.X" of the ToR text below or
   stay [FILL]. 2) Never claim skills absent from my CV. 3) No pricing without
   asking me first for my floor numbers. 4) No superlatives.

=== ToR text ===
[paste the full ToR text, or use the pdf-extract output]

=== My CV ===
[paste CV]
```

Then use the same step prompts from §3, replacing file paths with "the ToR
text above". You lose automatic lint/simulate runs — so end with:

```text
Before I submit: list every sentence in my drafts that violates the rules
above, with the fix. Act as the audit tool yourself, and be harsh.
```

---

## 5. What the assistant will ask you (have answers ready)

- **Go/no-go gates:** Can you staff it by their start date? Is the EV
  positive at a realistic win probability? Any eligibility conflicts?
- **Pricing gate (mandatory):** your minimum income, billable days, loading %,
  contingency % — *your* numbers, not its suggestions.
- **[FILL] questions:** evidence for each fit claim (years, budgets, client
  names), references, registration status (UNGM etc.).
- **Form fields:** anything their template demands that no ToR section states.

If it ever fills a `[FILL]` without asking, or produces a number with no
formula or source, reply: *"No invented values — mark it [FILL] and ask me."*
Then start a fresh session if it keeps drifting; the tools, not the vibes,
are the source of truth.

---

## 6. A real exchange, so you know what "good" looks like

> **You:** Screen /Users/me/bids/tor.pdf — should I bid?
>
> **Assistant:** Extracted 4 pages, 3 evaluation criteria (weights 15/30/25,
> sum 70 matches stated total). Deadline 12 Oct 2026 (p.2), effort ~20
> person-days (p.2), UNGM registration required before award (p.4).
> Red flags: none in the weights; validity 90 days (p.2) is standard.
> EV check — I need your inputs: expected fee, days to prepare the bid, your
> day rate. I won't assume them.
>
> **You:** fee ~9,500, bid takes 3 days, my rate 400.
>
> **Assistant:** EV at P(win)=0.5 → +$3,550; at 0.25 → −$250. At your realistic
> win rate this is worth pursuing only if the CV fit is strong. Running
> cv-gap next? Note: I will not draft anything until you call go/no-go.
