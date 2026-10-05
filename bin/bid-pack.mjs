#!/usr/bin/env node
// bid-pack: the one-shot orchestrator. "ToR + CV in -> every mechanical step
// runs; every human decision lands in ONE consolidated questionnaire; every
// document gets verified and packaged."
//
//   start  --tor <file> [--cv <file>] [--dir bid/]   extract + screen + cv-gap
//          + cv-tailor build + profile import -> questions.json/questions.md
//   ask    [--dir bid/]                              interactive wizard: answers
//          the open questions one at a time in the terminal, writes answers.json
//          and applies them (no editor or JSON knowledge needed)
//   apply  --answers answers.json [--dir bid/]       store answers, run pricing,
//          record evidence + fill answers, regenerate the open-question list
//   pack   [--dir bid/] [--fallback-pdf] [--no-zip]  verify + audit + zip (-> package.mjs)
//
// GATES PRESERVED: pricing never runs without user numbers; GAP terms never
// claimed; audit gates the final bytes. The orchestrator only automates plumbing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fail, parseArgs, readText, writeOut, helpText, mdTable } from './lib.mjs';
import { loadProfile, profilePath } from './profile.mjs';

const HELP = helpText('bid-pack', [
  'start  --tor <file.(pdf|docx|txt)> [--cv <file>] [--dir bid/] [--profile] [--no-cv-tailor]',
  'ask    [--dir bid/]',
  'apply  --answers answers.json [--dir bid/]',
  'pack   [--dir bid/] [--fallback-pdf] [--no-zip]',
  '',
  'start runs every mechanical step (pdf-extract -> extract -> cv-gap -> cv-tailor)',
  'and consolidates ALL open questions into out/questions.md. Answer them in one go,',
  'have your assistant write answers.json, then apply. Repeat apply until 0 open.',
  'ask is the human-friendly route: an interactive wizard that asks each open',
  'question in the terminal (Enter = suggested default, "back" to redo, "quit" to',
  'cancel), saves answers.json and applies it — no editor or JSON needed.',
  'pack verifies the final documents (re-extract + re-audit) and builds the zip.',
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (args.__help || !['start', 'ask', 'apply', 'pack'].includes(cmd)) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const dir = path.resolve(String(args.dir || 'bid'));
const outDir = path.join(dir, 'out');
fs.mkdirSync(outDir, { recursive: true });

function run(script, argv, { fatal = false, label } = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...argv], { encoding: 'utf8' });
  if (r.status !== 0) {
    const msg = `${label || script} failed (exit ${r.status}):\n${(r.stderr || r.stdout || '').trim().split('\n').slice(0, 6).join('\n')}`;
    if (fatal) fail(msg, r.status === 2 ? 2 : 1);
    process.stderr.write(`warning: ${msg}\n`);
    return null;
  }
  return r;
}
const inDir = (name) => [path.join(dir, name), path.join(outDir, name)].find((p) => fs.existsSync(p)) || null;

// ---------------- question engine ----------------
function buildQuestions() {
  const extractPath = inDir('tor-extract.json');
  const extract = extractPath ? JSON.parse(fs.readFileSync(extractPath, 'utf8')) : null;
  const profile = loadProfile();
  const hasPricing = !!inDir('pricing.json');
  const items = [];
  const add = (o) => items.push({ answer: null, answerSource: null, ...o });

  if (!hasPricing && extract) {
    const d = profile?.rates?.defaults || {};
    if (d.base !== null && d.base !== undefined) {
      add({
        id: 'Q-PRICING-CONFIRM', area: 'pricing', type: 'confirm',
        question: `Confirm your saved pricing for this bid: base ${d.base}/${d.basis || 'day'} ${d.currency || 'USD'}, loading ${d.loading ?? 0}, contingency ${d.contingency ?? 0}. Answer yes, or give new numbers.`,
        why: 'Pricing runs only on numbers you confirm (HONESTY rule 4).',
      });
    } else {
      add({ id: 'Q-PRICING-BASE', area: 'pricing', type: 'number', question: 'Your base rate for this bid (per day)?', why: 'From your floor calculation only — the tool never suggests a rate.', unit: (profile?.rates?.defaults?.currency) || 'USD' });
      add({ id: 'Q-PRICING-LOADING', area: 'pricing', type: 'number', question: 'Cost loading (overheads on top of your net)?', why: 'e.g. 0.25 for 25%. From your own cost structure.', default: profile?.rates?.floor?.costLoading ?? 0 });
      add({ id: 'Q-PRICING-CONTINGENCY', area: 'pricing', type: 'number', question: 'Risk contingency?', why: 'e.g. 0.10 for 10%. 0 if you carry the risk yourself.', default: profile?.rates?.defaults?.contingency ?? 0 });
    }
    if (!extract.effortPersonDays) add({ id: 'Q-EFFORT-DAYS', area: 'pricing', type: 'number', question: 'Person-days you will quote?', why: 'The ToR states no effort estimate; the financial proposal needs a quantity.' });
  }
  if (extract) {
    const ctx = (() => { try { return JSON.parse(fs.readFileSync(path.join(outDir, 'bid-context.json'), 'utf8')); } catch { return {}; } })();
    if (!ctx.availabilityDate) {
      add({
        id: 'Q-AVAILABILITY', area: 'availability', type: 'date',
        question: `Your availability date?${extract.startDate ? ` (ToR expected start: ${extract.startDate.value}${extract.startDate.page ? `, p.${extract.startDate.page}` : ''})` : ''}`,
        why: 'Declared in the cover letter; must be honest against your calendar.',
      });
    }
    if (!extract.validity && !ctx.validity) add({ id: 'Q-VALIDITY', area: 'compliance', type: 'string', question: 'The ToR states no proposal validity period — what will you declare?', why: 'Cover letters must state validity; e.g. "90 days from submission".' });
    if (extract.evaluation?.weightsSumCheck && !String(extract.evaluation.weightsSumCheck).startsWith('ok') && extract.evaluation.weightsSumCheck !== 'not-stated') {
      add({ id: 'Q-CLAR-WEIGHTS', area: 'client-clarification', type: 'client', question: `Evaluation weights do not sum (${extract.evaluation.weightsSumCheck}). Send a clarification to the client quoting the grid (see assets/templates.md).`, why: 'A typo in the grid is their problem — but surface it before you price against it.' });
    }
    if (!extract.deadline) add({ id: 'Q-CLAR-DEADLINE', area: 'client-clarification', type: 'client', question: 'No submission deadline parsed from the ToR — confirm the deadline and channel manually.', why: 'Never bid without a verified deadline.' });
  }

  // [FILL] scan across drafts (stable ids: file + excerpt hash -> disappears when fixed)
  let fillN = 0;
  for (const f of ['cover-letter.md', 'cv-tailored.md', 'technical-proposal.md', 'financial-proposal.md']) {
    const p = inDir(f);
    if (!p) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const m of [...text.matchAll(/\[FILL([^\]]*)\]/g)]) {
      fillN++;
      const excerpt = (text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim());
      const detail = m[1].toLowerCase();
      // known generated slots get deterministic ids so apply can resolve them itself
      const known = f === 'financial-proposal.md' && /\bconsultant/.test(detail) ? 'CONSULTANT'
        : f === 'financial-proposal.md' && /reimbursab|itemize/.test(detail) ? 'REIMBURSABLES'
        : f === 'financial-proposal.md' && /tax/.test(detail) ? 'TAXES'
        : null;
      const id = known ? `Q-FILL-${known}` : 'Q-FILL-' + crypto.createHash('md5').update(f + '|' + excerpt).digest('hex').slice(0, 8);
      add({ id, area: 'draft-fill', type: 'string', question: `${f}: a placeholder needs a real fact — “…${excerpt}…”. What is the fact?`, why: 'No invented facts. If you cannot supply it, it stays [FILL] and the audit blocks submission.' });
    }
  }
  // cv-tailor unanchored bullets -> evidence questions
  const tailored = inDir('cv-tailored.md');
  if (tailored && inDir('cv-gap-report.md') || tailored && (args.cv || inDir('cv.txt'))) {
    const masterPath = typeof args.cv === 'string' && fs.existsSync(args.cv) ? args.cv : inDir('cv.txt');
    if (masterPath && fs.existsSync(masterPath) && /\.(txt|md)$/.test(masterPath)) {
      const r = run('cv-tailor.mjs', ['lint', '--cv', tailored, '--master', masterPath, '--gap', inDir('cv-gap-report.md') || '', '--evidence', inDir('cv-evidence.json') || '', '--report', path.join(outDir, 'cv-tailor-lint.md')], { label: 'cv-tailor lint' });
      if (r === null) {
        const lint = fs.existsSync(path.join(outDir, 'cv-tailor-lint.md')) ? fs.readFileSync(path.join(outDir, 'cv-tailor-lint.md'), 'utf8') : '';
        let evN = 0;
        for (const m of [...lint.matchAll(/- unanchored bullet[^\n]*?"([^"]{10,120})/g)]) {
          evN++;
          add({ id: `Q-CVE-${evN}`, area: 'cv-evidence', type: 'string', question: `Your tailored CV has a line the master CV does not support: "${m[1]}…". Give the exact, true wording (it will be stored as user-input evidence) — or say DELETE to remove the line.`, why: 'Every CV line must trace to your master CV or to a fact you state here.' });
        }
      }
    }
  }
  return { generatedAt: new Date().toISOString(), dir: dir, openCount: items.length, items };
}

// Per-question "how to answer" hint, shown in the wizard prompt and the
// questions table so users know the accepted format before replying.
function answerFormat(item) {
  switch (item.id) {
    case 'Q-PRICING-CONFIRM': return 'type yes to use the saved rates — or new numbers like: base 420 loading 0.25 contingency 0.1';
    case 'Q-PRICING-BASE': return 'a number, e.g. 400';
    case 'Q-PRICING-LOADING': return 'a decimal, e.g. 0.25 (= 25%)';
    case 'Q-PRICING-CONTINGENCY': return 'a decimal, e.g. 0.10 (= 10%)';
    case 'Q-PRICING-CURRENCY': return 'a currency code, e.g. USD';
    case 'Q-EFFORT-DAYS': return 'a number of person-days, e.g. 25';
    case 'Q-AVAILABILITY': return 'a date, e.g. 1 November 2026';
    case 'Q-VALIDITY': return 'a phrase, e.g. 90 days from submission';
    case 'Q-FILL-CONSULTANT': return 'the consultant name as it should appear in the document';
    case 'Q-FILL-REIMBURSABLES': return 'a sentence about which costs are reimbursable';
    case 'Q-FILL-TAXES': return 'a sentence about your tax status';
  }
  if (item.id.startsWith('Q-CVE-')) return 'the exact true wording that supports the line — or DELETE to remove the line';
  if (item.type === 'number') return `a number${item.unit ? ` in ${item.unit}` : ''}`;
  if (item.type === 'date') return 'a date, e.g. 1 November 2026';
  if (item.type === 'confirm') return 'yes or no';
  return 'a short sentence';
}

function writeQuestions(q) {
  fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(q, null, 2));
  const yours = q.items.filter((i) => i.type !== 'client');
  const clients = q.items.filter((i) => i.type === 'client');
  let n = 0;
  const intro = `Reply with the numbered answers; your assistant writes them to answers.json and runs:\n\n    tor-to-proposal bid-pack apply --answers answers.json --dir ${dir}\n`;
  const md =
    `# Bid questions — answer these in one go\n\n` +
    (yours.length ? intro + '\n' + mdTable(['#', 'Question', 'How to answer', 'Why it is asked'], yours.map((i) => [++n, `**${i.id}** — ${i.question}${i.default !== undefined && i.default !== null ? ` (default: ${i.default})` : ''}`, answerFormat(i), i.why || ''])) + '\n' : 'None — everything mechanical is resolved.\n') +
    (clients.length ? `\n## To send to the CLIENT (clarifications, before the cutoff)\n${clients.map((i) => `- ${i.question}`).join('\n')}\n` : '');
  writeOut(path.join(outDir, 'questions.md'), md);
}

// Human-readable PDF companions for the working files a non-technical user is
// most likely to be pointed at (regenerated after start/apply; the .md stays
// the source of truth — the PDFs are for reading, not editing).
function renderPreviews() {
  for (const [file, label] of [
    ['bid-screen.md', 'Bid-Screen'],
    ['questions.md', 'Questions'],
    ['cv-gap-report.md', 'CV-Gap-Report'],
    ['cv-tailor-report.md', 'CV-Tailor-Report'],
  ]) {
    if (!inDir(file)) continue;
    run('render.mjs', [path.join(outDir, file), '--out', path.join(outDir, 'preview', `${label}.pdf`), '--footer', `preview of out/${file} — the .md file is the source of truth`], { label: `render preview ${label}` });
  }
}

// ---------------- context ----------------
function writeContext() {
  const extractPath = inDir('tor-extract.json');
  const extract = extractPath ? JSON.parse(fs.readFileSync(extractPath, 'utf8')) : null;
  const profile = loadProfile();
  let context = {};
  try { context = JSON.parse(fs.readFileSync(path.join(outDir, 'bid-context.json'), 'utf8')); } catch { /* fresh */ }
  if (profile?.identity?.name) {
    context.identity = profile.identity;
    context.consultantLine = `${profile.identity.name}${profile.identity.credentials ? `, ${profile.identity.credentials}` : ''}`;
  }
  if (extract) {
    context.refNo = extract.referenceNumber?.value || context.refNo || null;
    context.title = extract.title?.value || context.title || null;
    context.deadline = extract.deadline?.value || context.deadline || null;
    context.currency = context.currency || profile?.rates?.defaults?.currency || 'USD';
  }
  context.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'bid-context.json'), JSON.stringify(context, null, 2));
  return context;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(path.join(outDir, 'bid-state.json'), 'utf8')); } catch { return { steps: {}, createdAt: new Date().toISOString() }; }
}
function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'bid-state.json'), JSON.stringify(state, null, 2));
}

// ---------------- start ----------------
function start() {
  if (!args.tor) { process.stdout.write(HELP); process.exit(1); }
  const state = readState();
  state.steps = state.steps || {};
  const torAbs = path.resolve(String(args.tor));
  if (!fs.existsSync(torAbs)) fail(`--tor not found: ${torAbs}`, 2);

  // 0. ToR -> page-tagged text
  run('pdf-extract.mjs', [torAbs, '--out', path.join(outDir, 'tor.txt'), '--signals', path.join(outDir, 'tor-signals.json')], { fatal: true, label: 'pdf-extract (ToR)' });
  state.steps.torExtract = { status: 'done' };

  // 1. structure
  run('extract.mjs', ['--tor', path.join(outDir, 'tor.txt'), '--out-dir', outDir], { fatal: true, label: 'extract' });
  state.steps.structured = { status: 'done' };

  // 3. cv gap + tailor (non-fatal: bid can proceed without CV)
  if (args.cv) {
    const cvAbs = path.resolve(String(args.cv));
    if (!fs.existsSync(cvAbs)) fail(`--cv not found: ${cvAbs}`, 2);
    let cvTxt = cvAbs;
    if (!/\.(txt|md)$/.test(cvAbs)) {
      run('pdf-extract.mjs', [cvAbs, '--out', path.join(outDir, 'cv.txt')], { fatal: true, label: 'pdf-extract (CV)' });
      cvTxt = path.join(outDir, 'cv.txt');
    }
    run('cv-gap.mjs', ['--tor', path.join(outDir, 'tor.txt'), '--cv', cvTxt, '--out', path.join(outDir, 'cv-gap-report.md')], { label: 'cv-gap' });
    state.steps.cvGap = { status: 'done' };
    if (!inDir('cv-tailored.md') && !args['no-cv-tailor']) {
      const profFlag = (args.profile === undefined || args.profile === true) && loadProfile() ? ['--profile', profilePath()] : [];
      run('cv-tailor.mjs', ['build', '--cv', cvTxt, '--extract', path.join(outDir, 'tor-extract.json'), ...profFlag, '--gap', path.join(outDir, 'cv-gap-report.md'), '--out', path.join(outDir, 'cv-tailored.md'), '--report', path.join(outDir, 'cv-tailor-report.md')], { label: 'cv-tailor build' });
    }
    state.steps.cvTailored = { status: inDir('cv-tailored.md') ? 'done' : 'skipped' };
  }

  // 2. context + questions
  const context = writeContext();
  const q = buildQuestions();
  writeQuestions(q);
  state.steps.questions = { status: 'done', open: q.openCount };
  writeState(state);
  renderPreviews();

  // report
  const extract = JSON.parse(fs.readFileSync(path.join(outDir, 'tor-extract.json'), 'utf8'));
  const v = (x) => (x && x.value ? `${x.value}${x.page ? ` (p.${x.page})` : ''}` : '[FILL]');
  process.stdout.write(
    `# Bid pack started — ${v(extract.referenceNumber)}\n\n` +
      `Title: ${v(extract.title)}\nClient: ${v(extract.client)}\nDeadline: ${v(extract.deadline)}\nEffort: ${v(extract.effortPersonDays)} person-days\n` +
      `Evaluation: ${extract.evaluation.criteria.length} criteria, ${extract.evaluation.weightsSumCheck}\n\n` +
      `## Artifacts written to ${dir}/out/\n` +
      `- bid-screen.md — go/no-go decision (the USER decides; read it together)\n` +
      `- compliance-matrix.md, tor-extract.json\n` +
      (args.cv ? `- cv-gap-report.md, cv-tailored.md (+ report)\n` : '') +
      `- questions.json / questions.md — **${q.items.length} open question(s)**\n` +
      `- preview/ — readable PDFs of the bid screen + questionnaire (just double-click)\n\n` +
      `## Next\n1. Review bid-screen.md with the user. No-go -> stop here.\n` +
      `2. Put every open question to the user IN ONE MESSAGE (questions.md has them).\n` +
      `3. Write answers.json {"Q-...": value, ...} -> bid-pack apply --answers answers.json --dir ${dir}\n` +
      `4. Draft cover letter + technical response; lint/simulate until PASS (assets/templates.md).\n` +
      `5. financial-proposal.mjs renders once pricing.json exists.\n` +
      `6. bid-pack pack --dir ${dir} [--fallback-pdf] -> verified, zipped submission pack.\n`
  );
}

// ---------------- apply ----------------
function apply() {
  if (!args.answers) {
    process.stdout.write(HELP);
    process.stdout.write(`\nTip: run "bid-pack ask --dir ${dir}" to answer the open questions interactively in this terminal — no JSON file needed.\n`);
    process.exit(1);
  }
  const answersPath = path.resolve(String(args.answers));
  const answers = JSON.parse(readText(answersPath, '--answers'));
  const qPath = inDir('questions.json');
  if (!qPath) fail(`no questions.json in ${dir}/out — run: bid-pack start --tor <file> --dir ${dir}`, 2);
  const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const byId = new Map(q.items.map((i) => [i.id, i]));
  const profile = loadProfile();
  const context = writeContext();

  const pricing = { base: null, loading: null, contingency: null, currency: null, effort: null };
  const evidencePath = path.join(outDir, 'cv-evidence.json');
  const evidence = fs.existsSync(evidencePath) ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) : [];
  const fillPath = path.join(outDir, 'fill-answers.json');
  const fills = fs.existsSync(fillPath) ? JSON.parse(fs.readFileSync(fillPath, 'utf8')) : [];
  const clarifications = [];

  let applied = 0;
  for (const [id, rawValue] of Object.entries(answers)) {
    const item = byId.get(id);
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (item) { item.answer = value; item.answerSource = path.basename(answersPath); applied++; }
    if (id === 'Q-PRICING-CONFIRM') {
      if (String(value).toLowerCase() === 'yes' && profile?.rates?.defaults?.base != null) {
        const d = profile.rates.defaults;
        pricing.base = d.base; pricing.loading = d.loading ?? 0; pricing.contingency = d.contingency ?? 0; pricing.currency = d.currency || 'USD';
      } else if (String(value).toLowerCase() !== 'yes') {
        // new numbers given inline: "base 420 loading 0.25 contingency 0.1"
        for (const [k, v] of String(value).matchAll(/(base|loading|contingency|currency)\s+([\w.]+)/gi)) pricing[k] = v;
      }
    }
    if (id === 'Q-PRICING-BASE') pricing.base = value;
    if (id === 'Q-PRICING-LOADING') pricing.loading = value;
    if (id === 'Q-PRICING-CONTINGENCY') pricing.contingency = value;
    if (id === 'Q-PRICING-CURRENCY') pricing.currency = value;
    if (id === 'Q-EFFORT-DAYS') pricing.effort = value;
    if (id === 'Q-AVAILABILITY') context.availabilityDate = value;
    if (id === 'Q-VALIDITY') context.validity = value;
    if (id.startsWith('Q-CVE-')) {
      const text = String(value);
      if (/^delete$/i.test(text)) evidence.push({ id, text: null, deleted: true, source: 'user-input' });
      else evidence.push({ id, text, source: 'user-input' });
    }
    if (id === 'Q-FILL-CONSULTANT') context.consultantLine = String(value);
    if (id === 'Q-FILL-REIMBURSABLES') context.reimbursables = String(value);
    if (id === 'Q-FILL-TAXES') context.taxes = String(value);
    if (id.startsWith('Q-FILL-')) fills.push({ id, answer: value, source: 'user-input' });
    if (id.startsWith('Q-CLAR-')) clarifications.push({ id, question: item?.question || id, note: value });
  }
  // persist context BEFORE side effects: child tools read bid-context.json from disk
  fs.writeFileSync(path.join(outDir, 'bid-context.json'), JSON.stringify({ ...context, updatedAt: new Date().toISOString() }, null, 2));

  // side effect: pricing (only with user-supplied numbers)
  let pricingRan = false;
  if (pricing.base !== null && pricing.base !== undefined) {
    const profBasis = profile?.rates?.defaults?.basis || 'day';
    const argv = ['--base', String(pricing.base), '--basis', profBasis, '--currency', String(pricing.currency || 'USD'), '--out-dir', outDir];
    if (pricing.loading !== null && pricing.loading !== undefined) argv.push('--loading', String(pricing.loading));
    if (pricing.contingency !== null && pricing.contingency !== undefined) argv.push('--contingency', String(pricing.contingency));
    const extractPath = inDir('tor-extract.json');
    // users answer effort in natural language ("25", "25 person-days", "about 25 days") —
    // pricing-model needs a bare number, so coerce here instead of failing pricing
    const effortRaw = pricing.effort ?? (extractPath && JSON.parse(fs.readFileSync(extractPath, 'utf8')).effortPersonDays?.value);
    const effortMatch = effortRaw === null || effortRaw === undefined ? null : String(effortRaw).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    const effort = effortMatch ? Number(effortMatch[0]) : null;
    if (effort !== null && effort !== undefined) argv.push('--effort', String(effort));
    const r = run('pricing-model.mjs', argv, { label: 'pricing-model' });
    pricingRan = r !== null;
    process.stderr.write(r === null ? 'pricing NOT written — check the values; the pricing question stays open.\n' : `pricing written from user-confirmed numbers -> ${outDir}/pricing.json\n`);
  } else if (answers['Q-PRICING-CONFIRM'] !== undefined) {
    process.stderr.write('Q-PRICING-CONFIRM: no usable pricing in that answer — reply "yes" to use your saved rates, or new numbers like "base 420 loading 0.25". The pricing question stays open.\n');
  }

  // side effect: (re)render the financial proposal when its inputs are ready
  if (inDir('pricing.json') && inDir('tor-extract.json') && (pricingRan || context.reimbursables || context.taxes || context.consultantLine)) {
    const fin = run('financial-proposal.mjs', ['--pricing', path.join(outDir, 'pricing.json'), '--extract', path.join(outDir, 'tor-extract.json'), '--context', path.join(outDir, 'bid-context.json'), '--out-dir', outDir, '--xlsx'], { label: 'financial-proposal' });
    if (fin !== null) process.stderr.write('financial proposal rendered (md + xlsx)\n');
  }

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  fs.writeFileSync(fillPath, JSON.stringify(fills, null, 2));
  if (clarifications.length) {
    writeOut(path.join(outDir, 'clarifications.md'), `# Clarifications to send to the client\n\nSend BEFORE the clarification cutoff (bid-screen.md). Quote the ToR line each question refers to (assets/templates.md has the format).\n\n${clarifications.map((c, i) => `Q${i + 1}. ${c.question}${c.note ? `\nUser note: ${c.note}` : ''}`).join('\n\n')}\n`);
  }

  // regenerate questions
  const fresh = buildQuestions();
  fresh.items = fresh.items.filter((i) => i.answer === null);
  fresh.openCount = fresh.items.length;
  writeQuestions(fresh);
  const stillYours = fresh.items.filter((i) => i.type !== 'client');
  const stillClient = fresh.items.filter((i) => i.type === 'client');
  const state = readState();
  state.steps.questions = { status: 'done', open: fresh.openCount };
  state.steps.pricing = { status: inDir('pricing.json') ? 'done' : 'awaiting-user-numbers' };
  writeState(state);
  renderPreviews();

  process.stdout.write(
    `# Apply: ${applied} answer(s) recorded, ${fresh.openCount} still open\n\n` +
      (stillYours.length
        ? `## Still open — answer these (bid-pack ask)\n${mdTable(['#', 'Question'], stillYours.map((i, ix) => [ix + 1, `**${i.id}** — ${i.question}`]))}\n`
        : '') +
      (stillClient.length
        ? `## Reminders — ACTIONS for you, not answers\n(These describe things to DO outside the tool: contact the client, verify a fact. They never close by typing an answer here.)\n${mdTable(['#', 'Action'], stillClient.map((i, ix) => [ix + 1, `**${i.id}** — ${i.question}`]))}\n`
        : '') +
      (!fresh.openCount ? `All questions resolved. Draft/generate, then: bid-pack pack --dir ${dir}\n` : '') +
      (fills.length ? `\nFill answers recorded in out/fill-answers.json — apply them to the drafts, re-run the lints, and the questions disappear once the [FILL]s are gone.\n` : '') +
      (evidence.length ? `\nCV evidence entries: ${evidence.length} (out/cv-evidence.json) — cv-tailor lint accepts these as user-input anchors.\n` : '')
  );
}

// ---------------- ask (interactive question wizard) ----------------
async function askWizard() {
  const qPath = inDir('questions.json');
  if (!qPath) fail(`no questions.json in ${dir}/out — run: bid-pack start --tor <file> --dir ${dir}`, 2);
  const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const yours = q.items.filter((i) => i.type !== 'client');
  const clients = q.items.filter((i) => i.type === 'client');
  if (!yours.length) {
    process.stdout.write(
      (clients.length
        ? `Nothing for you to answer here — but send these to the CLIENT before the cutoff:\n${clients.map((c) => `- ${c.question}`).join('\n')}\n`
        : 'No open questions — everything is already resolved.\n') +
        (inDir('pricing.json') ? `\nNext: bid-pack pack --dir ${dir} [--fallback-pdf]\n` : '')
    );
    return;
  }

  // Same terminal behavior as the profile wizard: interactive when run by a
  // human; piped lines are consumed in order (automation/tests).
  const piped = !process.stdin.isTTY;
  let pipedLines = [];
  if (piped) {
    try {
      const raw = fs.readFileSync(0, 'utf8');
      pipedLines = raw.trim() ? raw.split('\n').map((l) => l.trim()) : [];
    } catch { /* empty stdin */ }
  }
  let pipedPos = 0;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const askLine = async (prompt) => {
    if (piped) return pipedPos < pipedLines.length ? pipedLines[pipedPos++] : 'EOF';
    try {
      return (await rl.question(prompt)).trim();
    } catch (err) {
      if (err && (err.code === 'ABORT_ERR' || err.name === 'AbortError')) return 'EOF';
      throw err;
    }
  };

  process.stdout.write(
    `Bid questions — ${yours.length} to answer, one at a time.\n` +
      'Press Enter to accept the [suggested] value when one is shown. Type "back" to redo the previous question, "quit" to cancel.\n\n'
  );

  const answers = {};
  // a pricing answer is only usable if it is "yes" or contains a base number —
  // anything else would silently skip pricing and re-open the question later,
  // so the wizard rejects it on the spot and re-asks
  const pricingAnswerUsable = (a) => /^yes$/i.test(a) || /\bbase\b\s*[\d]/i.test(a);
  let i = 0;
  while (i < yours.length) {
    const item = yours[i];
    const cur = item.default !== undefined && item.default !== null ? String(item.default) : '';
    const tail = item.unit ? ` (${item.unit})` : '';
    const a = await askLine(`(${i + 1}/${yours.length}) ${item.question}${tail}${cur ? ` [${cur}]` : ''}\n  How to answer: ${answerFormat(item)}\n> `);
    if (a === 'EOF' || a.toLowerCase() === 'quit') {
      rl.close();
      process.stdout.write('\nCancelled — nothing was saved. (Your documents are untouched; run bid-pack ask again anytime.)\n');
      return;
    }
    if (a.toLowerCase() === 'back') {
      if (i === 0) { process.stdout.write('  (already at the first question)\n'); continue; }
      const prev = yours[i - 1];
      delete answers[prev.id];
      i -= 1;
      continue;
    }
    if (a === '' && cur === '') {
      process.stdout.write('  This one needs an answer from you (no suggested default). Type it, or "quit" to stop.\n');
      continue;
    }
    if (item.id === 'Q-PRICING-CONFIRM' && a !== '' && !pricingAnswerUsable(a)) {
      process.stdout.write('  I can\'t price from that alone. Either type "yes" to use the saved rates shown above, or give new numbers like: base 420 loading 0.25 contingency 0.1\n');
      continue;
    }
    answers[item.id] = a === '' ? item.default : a;
    i += 1;
  }
  rl.close();

  const answersPath = path.join(dir, 'answers.json');
  fs.writeFileSync(answersPath, JSON.stringify(answers, null, 2));
  process.stdout.write(`\nSaved your ${Object.keys(answers).length} answer(s) to ${answersPath}\nApplying them now...\n\n`);
  args.answers = answersPath;
  apply();
}

// ---------------- pack ----------------
function pack() {
  const passThrough = ['--dir', dir, ...(args['fallback-pdf'] ? ['--fallback-pdf'] : []), ...(args['no-zip'] ? ['--no-zip'] : []), ...(args.profile ? ['--profile', String(args.profile)] : [])];
  const r = spawnSync(process.execPath, [path.join(HERE, 'package.mjs'), ...passThrough], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (cmd === 'start') start();
else if (cmd === 'ask') await askWizard();
else if (cmd === 'apply') apply();
else pack();
