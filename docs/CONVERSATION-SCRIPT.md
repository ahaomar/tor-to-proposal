# The conversation script — what to say, step by step

For consultants using Door 1: you live in Claude, ChatGPT, or Gemini, and the
tool does the verification underneath. This page gives you the **exact
sentences to type** at every stage of a bid, what you should see back, and
what to do next. Replace anything in `⟨angle brackets⟩` with your own values.

If a step doesn't behave as described, jump to the [trouble table](#if-something-doesnt-work)
at the bottom.

---

## Step 0 — One-time setup (5 minutes, once ever)

**Claude Code** (terminal AI) — paste in Terminal:
```bash
npx skills add ahaomar/tor-to-proposal
```

**Claude Desktop / other MCP apps** — paste in Terminal:
```bash
claude mcp add tor-to-proposal -- npx -y tor-to-proposal mcp-server
```
(or add the JSON from the Prompt Guide to Claude Desktop's config file).

**Then, in your AI chat, say:**
> List the tor-to-proposal tools you have.

**You should see:** a list of around twenty tools with names like
`bid_pack_start`, `pricing_model`, `cv_tailor`.
**If not:** see [USER-GUIDE §7](USER-GUIDE.md) — or skip setup entirely and use
the zero-setup path in Step 5.

## Step 1 — Your consultant profile (once ever)

> Set up my consultant profile. My name is ⟨Ayesha Khan, PhD⟩, email
> ⟨ayesha@example.com⟩, my minimum acceptable income is ⟨60000⟩ per year
> across about ⟨180⟩ billable days, my typical base rate is ⟨400⟩ per day in
> ⟨USD⟩, and my master CV is at ⟨/Users/me/Documents/cv-master.pdf⟩.

**You should see:** the tool saving `profile.json` (in the current folder) and
a summary. Your AI will offer these numbers for one-word confirmation on every
future bid — they are never used without your "yes".

## Step 2 — Start a bid

Put the ToR (PDF or Word) and your master CV in one folder, then say:

> I want to bid on a new assignment. The ToR is ⟨tor.pdf⟩ and my CV is
> ⟨cv.pdf⟩, both in this folder. Run a bid pack.

**You should see:** a bid screen (title, client, deadline, duration, how you'll
be scored, red flags) and a set of open questions.

## Step 3 — Go / no-go (your decision, always)

> Show me the bid screen and explain it in plain words. What are the red
> flags, and is anything unusual?

**You decide:** continue or stop. Nothing is drafted until you say go.

## Step 4 — Answer the questions

> Ask me the open questions one at a time in plain language, then apply my
> answers. Never suggest a number — ask me for mine.

**You should see:** one question at a time, each with a "how to answer" hint.
Pricing runs only after you confirm numbers. Answering one round can reveal a
few more questions when a document is generated for the first time — that is
normal and converges.

*(Claude Code users can alternatively run `npx tor-to-proposal bid-pack ask --dir .`
in the Terminal — the wizard asks the same questions.)*

## Step 5 — The drafts (briefs: paste one into any AI)

The tool never writes about your career in your name. Instead it writes a
**brief** — a complete prompt containing the ToR facts, the requirements, and
your verified CV evidence.

**With Claude Code or an MCP file-writing assistant, say:**
> Read out/brief-cover-letter.md and draft my cover letter from it. Follow the
> brief's rules exactly, save the result as cover-letter.md in the bid folder,
> then run the cover-letter lint and fix everything you can fix yourself.

> Now do the same with out/brief-technical-proposal.md → technical-proposal.md.

**Zero-setup variant (any AI chat, nothing installed):** open
`out/brief-cover-letter.md` in any text editor, copy the whole file, paste it
into Claude/ChatGPT/Gemini, save the reply as `cover-letter.md` in the bid
folder. Same for the technical brief. The tool audits whatever you save.

## Step 6 — The verification loop

> Lint my cover letter and technical proposal. Fix every problem you can fix
> yourself, and list anything only I can supply (facts, decisions, missing
> ToR details) as plain questions.

**You should see:** PASS on both lints, or a short list of remaining items.
Repeat until the lists are empty. `[FILL]` markers mean "a real fact goes
here — yours"; the pack refuses to build while any remain.

## Step 7 — Build the submission pack

> Run the final pack. Tell me exactly where the PDFs and the zip are, and
> whether the audit passed.

**You should see:** `PACK READY`, the audit line **PASS**, and the locations:
`pack/` (four verified documents + submission checklist + calendar file) and
`⟨ref⟩-bid-pack.zip`.

## Step 8 — Pre-submit checklist (before you upload anything)

> What must I still confirm with the client before submitting? List anything
> not verified from the ToR: deadline, submission channel, clarifications, and
> any date conflicts (for example my availability vs their deliverable dates).

**You should see:** a short, honest list. Typical items: a deadline the ToR
text didn't state, the submission channel, and evaluation weights that don't
sum. Send these to the client BEFORE their clarification cutoff.

## Step 9 — Submit, then record the outcome

Submit the zip through the confirmed channel, in their time zone. When the
client announces the decision:

> The result came out: ⟨won / lost⟩ at ⟨the fee⟩. Save a one-paragraph outcome
> note (assignment, ref, fee, result, what I quoted) in the bid folder so I
> keep a record of my pricing history.

---

## If something doesn't work

| Symptom | First thing to say to your AI |
| --- | --- |
| Tool list is empty after setup | "Reconnect the tor-to-proposal MCP server and list your tools again." (Check the Prompt Guide's config for your app.) |
| "OCR required" / scanned PDF error | "The PDF seems scanned. Tell me how to OCR it, then retry." |
| A question you can't answer | "Mark it [FILL] and move on — I'll come back to it." |
| The pack says FAIL or MISSING | "Show me the pack report and explain each failed line in plain words, with the exact next action." |
| Your AI invents a number or fact | "That has no source. Mark it [FILL] and ask me instead." |

Everything in this script maps to the commands documented in the
[Technical Guide](TECHNICAL-GUIDE.md); the plain-language background is in the
[User Guide](USER-GUIDE.md).
