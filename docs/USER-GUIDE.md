# tor-to-proposal — Plain-Language User Guide

**For consultants who are not programmers.** No jargon assumed. If you can use
Gmail and Microsoft Word, you can use this.

---

## 1. What is this thing?

You download a document called a **ToR** (Terms of Reference — the UN/NGO's
description of a consulting job). This tool reads it with you and helps you
prepare your **bid** (your offer to do the work) — without ever inventing
facts for you.

**What it does for you:**
- Reads the ToR and pulls out what matters: deadline, what they want, how
  they will score you, how they will pay you.
- Tells you honestly whether your CV matches what they ask for — and flags
  what you must NOT claim.
- Helps you calculate a price you can defend.
- Scores your draft against their official scoring grid, so you can fix gaps
  **before** you submit, not after you lose.
- Fills in their own forms (Word/Excel) for you.
- Gives your final documents a "pre-flight check" so nothing incomplete goes out.

**What it will NEVER do:**
- Invent experience you don't have.
- Make up a price for you.
- Write "world-class consultancy" nonsense. (It actually bans those words.)

> **Why so strict?** In UN/NGO bidding, one made-up fact = disqualification,
> and sometimes blacklisting from future work. This tool would rather show you
> a yellow `[FILL]` box saying "put your real number here" than fabricate
> anything.

---

## 2. What you need before starting

Gather these four things into one folder on your computer (e.g. `Documents/bids/UNDP-2026-042/`):

| # | Item | Where you get it |
| --- | --- | --- |
| 1 | The **ToR document** (PDF or Word) | The UN/NGO procurement website (UNGM, agency site) |
| 2 | Your **CV** as a plain text or Word file | Your files — the version with your real numbers (years, countries, budgets) |
| 3 | Your **money numbers** | Your minimum acceptable yearly income, your monthly costs (this is for pricing later) |
| 4 | Your **calendar** | So you can honestly answer "can I deliver by their deadline?" |

---

## 3. Choose your path

There are two ways to use the tool. **Path A is for almost everyone.**

### Path A — Use it with an AI assistant (recommended)

You talk to Claude (or ChatGPT, Codex, or similar) in normal English. The AI
runs the tool for you and explains the results. You never see a command line
unless you want to.

**One-time setup (5 minutes, needs one paste into a terminal — someone technical
can do this for you, or follow the exact keystrokes in §4):**

1. Install the tool on your computer (one command).
2. Connect it to your AI assistant (one command).

**After setup, you just say things like:**

> *"I'm bidding on a UNDP evaluation job. The ToR is in my folder
> UNDP-2026-042. Screen it for me — should I bid?"*

The assistant will:
- read the ToR and show you a **Bid Screen** (one page: deadline, effort,
  scoring, red flags),
- ask you questions it cannot know (only you know your calendar and your
  comfort with the risk),
- and never answer those questions for you.

Then you continue in plain English:

> *"Now compare my CV against it."*
> *"Help me price this. My numbers are: I need at least $60,000 net this
> year, I can realistically bill 180 days, my costs add about 25%."*
> *"Draft the cover letter, then check it."*
> *"Score my technical draft against their grid."*
> *"Fill in their financial form."*
> *"Final check before I submit."*

**The golden rule while talking to the assistant:** when you see `[FILL]` in
anything it produces, that is a question addressed to YOU. Answer it with
real facts, or leave it and fix before submitting. Never let anyone "just
make something up" for a `[FILL]`.

### Path B — Use it directly (only if you're comfortable with a terminal)

Open the Terminal app (Mac) or PowerShell (Windows), go to the tool's folder,
and run the commands from the Technical Guide (`docs/TECHNICAL-GUIDE.md`).
Every command ends with `--help` that explains itself. If this sentence sounds
unfamiliar, use Path A — you lose nothing.

---

## 4. One-time installation (Path A)

Ask a technical friend if unsure — it is two commands. **Mac/Linux Terminal**
(Windows: use PowerShell; the commands are the same after installing Node.js
from nodejs.org).

**Step 1 — Get the tool onto your computer:**
```bash
git clone https://github.com/ahaomar/tor-to-proposal
cd tor-to-proposal
npm install
```
("npm install" downloads the tool's components. It runs once, needs the
internet, and sends nothing from your computer.)

**Step 2 — Connect it to your AI assistant (pick yours):**

- **Claude Desktop** (the chat app): open Settings → Developer → Edit Config,
  and add to the JSON file:
  ```json
  {
    "mcpServers": {
      "tor-to-proposal": {
        "command": "node",
        "args": ["/FULL-PATH-TO/tor-to-proposal/mcp/server.mjs"]
      }
    }
  }
  ```
  (Replace `/FULL-PATH-TO/` with where you cloned it — find it by typing `pwd`
  in the tool's folder. Restart Claude Desktop.)

- **Claude Code / Codex CLI** (terminal AI): run
  ```bash
  claude mcp add tor-to-proposal -- node /FULL-PATH-TO/tor-to-proposal/mcp/server.mjs
  ```
  or for Codex, add the same server to `~/.codex/config.toml` (exact lines in
  the Prompt Guide).

- **ChatGPT** (web/app): if your plan shows local-connector support, point a
  connector at the same `server.mjs` file. If it doesn't, skip this — use the
  **paste-the-text** prompts in the Prompt Guide instead; everything except
  reading PDFs directly works that way.

**Step 3 — Test it.** In your AI assistant, type:
> *"List the tor-to-proposal tools you have."*
If it lists ten-ish tools with names like `extract_tor` and `pricing_model`,
you're connected.

---

## 5. Your first bid, step by step (what actually happens)

This is a real sequence, with what you'll see at each step.

**Step 1 — The screen.** You say: *"Screen this ToR: /Users/me/bids/tor.pdf"*.
You get a one-page summary: **title, reference number, deadline, how long the
work is, how they'll score you** (e.g. "70 points technical, 30 financial"),
and red flags. **You decide: go or no-go.** Nothing is written yet — this step
saves you from wasting a week on bids you should never have started.

**Step 2 — CV reality check.** *"Compare my CV."* You get a table: green
✔ MATCH lines (things your CV really shows) and red **"GAP — do not claim"**
lines (things the ToR wants that your CV doesn't show). This table protects
you: those GAP lines must not appear in your proposal, no matter how tempting.

**Step 3 — The money conversation.** The assistant will ask for YOUR numbers
(minimum income, billable days, costs). It refuses to suggest a rate until you
give them — that's a feature, not rudeness. Then it shows a price sheet where
**every line shows its own formula**, plus how your rate sits against
benchmarks you researched together (each benchmark needs a real source + date).

**Step 4 — Drafting.** The assistant drafts a one-page cover letter and a
technical response **with one section per scoring criterion**, quoting the
ToR with page numbers. Places it can't fill honestly appear as `[FILL]`.

**Step 5 — The self-score.** The tool scores your draft against their grid:
*"Criterion 3 (25 pts): 2 of 3 sub-elements covered; missing: sustainability
plan (p.7). 8.3 points at risk."* You fix, re-score, repeat until the
at-risk points are ~zero. **This is the step that wins points.**

**Step 6 — Their forms.** You upload their Word/Excel forms; the tool fills
your numbers into their exact layout — never touching their formulas.

**Step 7 — The final gate.** The audit refuses to pass while anything is
incomplete: `[FILL]` boxes left open, compliance rows unfinished, claims
without a source. When it passes, you submit — through the channel and
deadline **stated in the ToR**, in their time zone.

**Step 8 — Save the outcome.** When the client announces results, tell your
assistant *"record this bid: won/lost"*. Over months this builds your private
database of what you quoted and what happened — the most valuable pricing data
you will ever own.

---

## 6. The four honesty rules, in plain words

1. **Everything traceable.** Every fact in your documents points to a page in
   the ToR, something you supplied, or a public source with a link and date.
   Otherwise it's a yellow `[FILL]`.
2. **Nothing invented.** No fake rates, experience, dates or clients. Ever.
3. **Their template wins.** Your documents are restructured into the client's
   own forms — not the other way round.
4. **No gut-feel prices.** A price is either your own floor calculation or a
   cited market benchmark.

---

## 7. If something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| "OCR required" | The PDF is a scanned photo, not text | Ask your assistant, or run it through a free OCR tool first, then retry |
| "missing dependency … run npm install" | Setup step 1 wasn't finished | Open Terminal in the tool's folder, type `npm install`, press Enter |
| "sign-off does not match CV name" | The letter's signature differs from your CV | Use the exact same name + credentials |
| "CHECK FAILED … [FILL] list" | Their form still has empty required boxes | Give the tool the missing values, or fill those boxes by hand |
| Exit code 2 / "do not submit" | The pre-flight check caught something | Read the list it gives you; fix each item; run again |
| Assistant invents a number | (Should not happen — but all AI can slip) | Reply: *"That number has no source. Mark it [FILL] and ask me."* |

---

## 8. Little dictionary

- **ToR** — Terms of Reference: the client's document describing the job.
- **Bid / proposal** — your offer: usually a cover letter + technical document + price.
- **Compliance matrix** — a table of everything the ToR demands, with your answer and status.
- **Evaluation grid / criteria** — the official scoring table; the bid is won here.
- **`[FILL]`** — a yellow flag meaning "a real fact goes here — yours".
- **Floor rate** — the lowest daily rate that still pays your bills. Below it, you're paying the client.
- **MCP / skill / plugin** — three plumbing formats for connecting the tool to AI assistants. You only care that it's connected.
