# tor-to-proposal — Plain-Language User Guide

**For consultants who are not programmers.** No jargon assumed. If you can use
Gmail and Microsoft Word, you can use this.

---

## 1. What is this thing?

You download a document called a **ToR** (Terms of Reference — the UN/NGO's
description of a consulting job). Together with your **CV**, this tool turns it
into a **complete bid pack** — the documents you actually submit:

- a customized **cover letter** (one page, checked),
- a **tailored CV** (your real CV, re-ordered for this assignment — never
  improved with facts you don't have),
- a **technical response** written one section per scoring criterion,
- a **financial proposal** (with an Excel version where every formula shows),
- a **submission checklist** and a calendar reminder for the deadline.

All of it arrives in one folder, checked, ready to submit.

**What it will NEVER do:**
- Invent experience you don't have. (Your tailored CV is verified line-by-line
  against your real CV.)
- Make up a price for you.
- Write "world-class consultancy" nonsense. (It actually bans those words.)

> **Why so strict?** In UN/NGO bidding, one made-up fact = disqualification,
> and sometimes blacklisting from future work. This tool would rather show you
> a yellow `[FILL]` box saying "put your real number here" than fabricate
> anything.

---

## 2. What you need before starting

Gather these into one folder on your computer (e.g. `Documents/bids/UNDP-2026-042/`):

| # | Item | Where you get it |
| --- | --- | --- |
| 1 | The **ToR document** (PDF or Word) | The UN/NGO procurement website (UNGM, agency site) |
| 2 | Your **master CV** as a text or Word file | Your files — the version with your real numbers (years, countries, budgets) |
| 3 | Your **money numbers** | Your minimum acceptable yearly income, your monthly costs (for pricing) |
| 4 | Your **calendar** | So you can honestly answer "can I start when they need me?" |

---

## 3. How you use it (one conversation)

You talk to Claude (or ChatGPT, Codex, or similar) in normal English. The AI
runs everything and explains the results. You never see a command line unless
you want to.

**One-time setup (5 minutes):** install once with a single command and connect
your AI assistant (exact keystrokes in §4). Then say things like:

> *"Run a bid pack on my folder UNDP-2026-042."*

The assistant will:

1. **Read the ToR and screen it** — one page: title, deadline, effort, how
   they'll score you, red flags. **You decide: go or no-go.** No-go saves you
   a wasted week; nothing is written yet.
2. **Ask you every question in ONE message** — the consolidated
   questionnaire: your rate (or a one-word "yes" to your saved rates), your
   availability date, missing facts. This is the only "paperwork" you do.
3. **Draft all four documents** — and check each one mechanically: no
   superlatives in the letter, every CV line provable from your master CV,
   every scored criterion covered.
4. **Package and verify** — the final PDFs are read back by the tool and
   audited again (the check applies to what the client will read, not the
   draft). You get a folder with the finished documents, a submission
   checklist, and a calendar file for the deadline.

**The golden rule:** when you see `[FILL]` in anything, that is a question
addressed to YOU. Answer it with real facts, or leave it and fix before
submitting. Never let anyone "just make something up" for a `[FILL]`.

---

## 4. One-time installation

Ask a technical friend if unsure — it is two short steps. **Mac/Linux
Terminal** (Windows: PowerShell, after installing Node.js from nodejs.org).

**Step 1 — Install (one command):**

```bash
npx tor-to-proposal init
```

This installs the tool and asks you a few questions (name, credentials, your
rate numbers, where your master CV lives). Answers are saved on YOUR computer
only. Next time you prepare a bid, the assistant offers your saved numbers for
a one-word confirmation instead of asking again.

**Step 2 — Connect it to your AI assistant (pick yours):**

- **Claude Desktop** (the chat app): open Settings → Developer → Edit Config,
  and add to the JSON file:
  ```json
  {
    "mcpServers": {
      "tor-to-proposal": {
        "command": "npx",
        "args": ["-y", "tor-to-proposal", "mcp-server"]
      }
    }
  }
  ```
  (If you cloned the repo instead of using npx, point the config at
  `/FULL-PATH-TO/tor-to-proposal/mcp/server.mjs` — find the path by typing
  `pwd` in the tool's folder. Restart Claude Desktop.)

- **Claude Code / Codex CLI** (terminal AI): run
  ```bash
  claude mcp add tor-to-proposal -- npx -y tor-to-proposal mcp-server
  ```
  or for Codex, add the same server to `~/.codex/config.toml` (exact lines in
  the Prompt Guide).

- **ChatGPT** (web/app): if your plan shows local-connector support, point a
  connector at the same server. If it doesn't, skip this — use the
  **paste-the-text** prompts in the Prompt Guide instead; everything except
  reading PDFs directly works that way.

**Step 3 — Test it.** In your AI assistant, type:
> *"List the tor-to-proposal tools you have."*
If it lists twenty-ish tools with names like `bid_pack_start` and
`pricing_model`, you're connected.

---

## 5. Your first bid, step by step (what actually happens)

**Step 1 — The screen.** You say: *"Run a bid pack on this folder."* You get a
one-page summary: **title, reference number, deadline, how long the work is,
how they'll score you** (e.g. "70 points technical, 30 financial"), and red
flags. **You decide: go or no-go.**

**Step 2 — The one questionnaire.** The assistant puts all remaining questions
to you in a single numbered list. Typical questions: *"Your base day rate?"*
(or: *"Confirm your saved rate of $400 — yes/no"*), *"Can you start by 1
November?"*, *"The letter needs your exact availability."* You answer in one
reply. Pricing and the financial proposal are produced from YOUR answers,
every line showing its formula.

**Step 3 — Your tailored CV.** The tool re-orders your real CV so the
evidence the scorers want comes first, using the ToR's own words. It shows you
a green ✔ MATCH table and red **"GAP — do not claim"** lines. Those GAP lines
must not appear anywhere in your bid, no matter how tempting — the tool
enforces it.

**Step 4 — The drafts.** A one-page cover letter and a technical response with
**one section per scoring criterion**, quoting the ToR with page numbers.
Places it can't fill honestly appear as `[FILL]` — answer them and the drafts
are re-checked automatically.

**Step 5 — The self-score.** The tool scores your draft against their grid:
*"Criterion 3 (25 pts): 2 of 3 sub-elements covered; missing: sustainability
plan (p.7). 8.3 points at risk."* You fix, re-score, repeat until the at-risk
points are ~zero. **This is the step that wins points.**

**Step 6 — The pack.** The finished PDFs are read back and audited — the check
runs on the final documents, so a broken table or a leftover placeholder cannot
slip through. When it passes you get: the four documents, a submission
checklist, and `deadline.ics` for your calendar.

**Step 7 — Submit.** Through the channel and deadline **stated in the ToR**, in
their time zone. Your pricing worksheets are never included — they contain
your floor math.

**Step 8 — Save the outcome.** When the client announces results, tell your
assistant *"record this bid: won/lost"*. Over months this builds your private
database of what you quoted and what happened — the most valuable pricing data
you will ever own.

---

## 6. The honesty rules, in plain words

1. **Everything traceable.** Every fact in your documents points to a page in
   the ToR, something you supplied, or a public source with a link and date.
   Otherwise it's a yellow `[FILL]`.
2. **Nothing invented.** No fake rates, experience, dates or clients. The
   tailored CV is verified against your master CV line by line — including
   every number.
3. **Their template wins.** Your documents are restructured into the client's
   own forms — not the other way round.
4. **No gut-feel prices.** A price is either your own floor calculation or a
   cited market benchmark — and it's always YOUR number, confirmed.

---

## 7. If something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| "OCR required" | The PDF is a scanned photo, not text | Ask your assistant, or run it through a free OCR tool first, then retry |
| "missing dependency … run npm install" | Setup step 1 wasn't finished | Open Terminal in the tool's folder, type `npm install`, press Enter |
| "sign-off does not match CV name" | The letter's signature differs from your CV | Use the exact same name + credentials |
| "unanchored bullet" in the CV lint | The tailored CV has a line your master CV can't prove | Delete it, or give the true fact as an evidence answer and let it back in |
| "CHECK FAILED … [FILL] list" | A document still has empty required boxes | Give the tool the missing values, or fill those boxes by hand |
| "Pack NOT built" | The final check caught something | Read pack-report.md; fix each item; re-run. (Any old pack folder was removed so you can't submit a stale one.) |
| Exit code 2 / "do not submit" | A pre-flight check caught something | Read the list it gives you; fix each item; run again |
| Assistant invents a number | (Should not happen — but all AI can slip) | Reply: *"That number has no source. Mark it [FILL] and ask me."* |

---

## 8. Little dictionary

- **ToR** — Terms of Reference: the client's document describing the job.
- **Bid / proposal** — your offer: cover letter + CV + technical document + price.
- **Bid pack** — the finished folder: the four documents, the checklist, the
  calendar file, the zip.
- **Consolidated questionnaire** — every open question in one numbered list,
  asked once. The answer file is `answers.json`.
- **Compliance matrix** — a table of everything the ToR demands, with your
  answer and status.
- **Evaluation grid / criteria** — the official scoring table; the bid is won here.
- **Master CV** — your full, real CV. The tailored one is derived from it and
  verified against it.
- **`[FILL]`** — a yellow flag meaning "a real fact goes here — yours".
- **Floor rate** — the lowest daily rate that still pays your bills. Below it,
  you're paying the client.
- **MCP / skill / plugin** — three plumbing formats for connecting the tool to
  AI assistants. You only care that it's connected.
