#!/usr/bin/env node
// extract: page-tagged ToR text -> tor-extract.json + bid-screen.md + compliance-matrix.md
// Regex fast-path with [[PAGE n]] attribution on every field. The agent (SKILL.md
// step 1) may pass --json with additional fields; agent values are kept only when
// they carry their own page attribution, and every conflict is recorded, never hidden.
import fs from 'node:fs';
import path from 'node:path';
import { fail, parseArgs, readText, writeOut, helpText, num, pageOf, extractWindow, mdTable } from './lib.mjs';

const HELP = helpText('extract', [
  'Usage: node bin/extract.mjs --tor tor.txt [--json agent-fields.json]',
  '            [--fee 15000 --bid-days 3 --day-rate 400]   # optional EV inputs (user-supplied)',
  '            [--out-dir out]',
  '',
  'Outputs: <out-dir>/tor-extract.json, bid-screen.md, compliance-matrix.md',
  'Every extracted field records the [[PAGE n]] it came from, or null.',
]);

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.tor) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const tor = readText(args.tor, '--tor (page-tagged ToR text; run pdf-extract first)');
const outDir = args['out-dir'] || 'out';
fs.mkdirSync(path.resolve(outDir), { recursive: true });

function grab(re, group = 1) {
  const m = tor.match(re);
  return m ? { value: m[group].trim(), page: pageOf(tor, m.index) } : null;
}

const DATE_RE = '(\\d{1,2}[ \\-/]\\w{3,9}[ \\-/]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})';
const AGENCIES = 'united nations|undp|unops|unicef|unhcr|iom|fao|wfp|who|unesco|un women|world bank|ifc|adb|afdb|idb|ebrd|usaid|fcdo|giz|ec |european union|council of europe';

// Reference numbers: keyword is case-insensitive but the CODE must be genuinely
// uppercase/digit (case-sensitive class), otherwise prose like the "TERMS OF
// REFERENCE" heading or "Individual Consultant" matches via the /i flag.
function grabRefNumber() {
  const kw = tor.match(/(?:reference|tender|solicitation|vacancy)[^.\n]{0,20}(?:no\.?|number|#|ref)?[:.\s]+/i);
  if (kw) {
    const after = tor.slice(kw.index + kw[0].length);
    const code = after.match(/\s*([A-Z0-9][A-Z0-9-]{4,})/); // case-sensitive: real ref codes are caps/digits
    if (code && code.index <= 4 && /\d/.test(code[1])) {
      return { value: code[1], page: pageOf(tor, kw.index + kw[0].length + code.index) };
    }
  }
  return grab(/\b([A-Z0-9]{2,6}[-/][A-Z0-9][A-Z0-9\/\-]{3,})\b/);
}

const extract = {
  source: path.basename(args.tor),
  title: grab(/^[ \t]*(?:terms of reference|tor|consultancy|individual consultant|request for proposal|rfp)[^\n]*\n+[ \t]*([^\n]{10,120})/im, 1)
    ?? grab(/^#{1,3}[ \t]*([^\n]{10,120})/m, 1)
    ?? grab(/(?:title|assignment)[\"”]*[:.]([^\n]{10,120})/i, 1),
  referenceNumber: grabRefNumber(),
  client: grab(new RegExp(`(${AGENCIES})`, 'i'), 1),
  contactEmail: grab(/([\w.+-]+@[\w-]+\.[\w.]{2,})/, 1),
  deadline: grab(new RegExp(`(?:deadline|closing date|last date|submission date)[^\\n]{0,60}?${DATE_RE}`, 'i'), 1),
  clarificationCutoff: grab(new RegExp(`clarification[^\\n]{0,80}?${DATE_RE}`, 'i'), 1),
  startDate: grab(new RegExp(`(?:expected |anticipated |proposed )?start(?:ing|t)?(?: date)?[^\\n]{0,40}?${DATE_RE}`, 'i'), 1),
  duration: grab(/(?:duration|period of performance|assignment length|timeframe)[^.\n]{0,50}?(\d+\s*(?:calendar |working |)?(?:day|week|month|year)s?)/i, 1),
  effortPersonDays: grab(/(\d{1,3})\s*(?:person[- ]days|working days|professional days|pd\b)/i, 1),
  validity: grab(/(?:validity|proposal (?:shall be )?valid)[^.\n]{0,50}?(\d+\s*(?:calendar )?(?:day|month)s?)/i, 1),
  paymentTerms: [...tor.matchAll(/payment[^\n]{5,140}/gi)].slice(0, 6).map((m) => ({ value: m[0].replace(/\s+/g, ' ').trim(), page: pageOf(tor, m.index) })),
  submissionChannel: grab(/(?:submi(?:t|ssion)s?)[^\n]{0,120}?(?:via|through|at|to|on)\s+([^\n]{3,90})/i, 1),
};

// Evaluation criteria table: window from the criteria heading to the next section.
const evalWindow = extractWindow(
  tor,
  /evaluation criteri|technical evaluation|award criteria|scoring (?:grid|methodology)/i,
  /\n\s*(?:financial (?:proposal|evaluation)|annex\b|other terms|submission of)/i
);
if (evalWindow) {
  const criteria = [];
  for (const line of evalWindow.split('\n')) {
    const m = line.match(/^\|?\s*\d{1,2}[.)]?\s*\|?\s*([^|]{4,90}?)\s*\|?\s*(\d{1,3})\s*(?:pts?|points?|%)?\s*\|?\s*$/);
    if (!m) continue;
    const weight = Number(m[2]);
    const label = m[1].replace(/\.{2,}/g, '').trim();
    if (label.length < 4 || weight > 100 || criteria.some((c) => c.label === label)) continue;
    criteria.push({ label, weight, page: pageOf(tor, tor.indexOf(line)) });
  }
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  const statedMatch = evalWindow.match(/(?:maximum|total|out of|of)\s*(?:of\s*)?(\d{1,3})\s*(?:points?|pts?|%|marks?)/i);
  const stated = statedMatch ? Number(statedMatch[1]) : null;
  extract.evaluation = {
    criteria,
    weightsSum: total,
    statedTotal: stated,
    weightsSumCheck: stated === null ? 'not-stated' : total === stated ? 'ok' : `MISMATCH (parsed ${total} vs stated ${stated}) — ToR may contain a typo; surface this in any clarification question`,
  };
}
if (!extract.evaluation) extract.evaluation = { criteria: [], weightsSum: 0, statedTotal: null, weightsSumCheck: 'criteria-table-not-found — use --json to supply agent-extracted criteria' };

// Deliverables: bulleted/numbered lines under a deliverables heading.
const delWindow = extractWindow(tor, /deliverables?|scope of work|tasks?(?: and deliverables)?/i, /\n\s*\n\s*\n|\n\s*(?:qualifications|requirements|annex\b)/i, 3000);
extract.deliverables = delWindow
  ? [...delWindow.matchAll(/^\s*(?:[-*•]|\d{1,2}[.)])\s+([^\n]{8,140})/gm)].slice(0, 15).map((m) => ({ value: m[1].trim(), page: pageOf(tor, m.index) }))
  : [];

// Agent-assisted merge: agent fields win only if they carry page attribution;
// conflicts are recorded, never silently discarded.
const conflicts = [];
if (args.json) {
  const agentJson = JSON.parse(readText(args.json, '--json'));
  for (const [k, v] of Object.entries(agentJson)) {
    if (v === null || v === undefined) continue;
    if (!(v instanceof Object) || v.page === null || v.page === undefined) continue; // unattributed -> reject
    if (Array.isArray(v)) {
      if (!v.every((x) => x && x.page != null)) continue;
    }
    const prev = extract[k];
    if (prev && JSON.stringify(prev) !== JSON.stringify(v)) conflicts.push({ field: k, regex: prev, agent: v });
    extract[k] = v;
  }
}
extract.conflicts = conflicts;
extract.generatedAt = new Date().toISOString();

fs.writeFileSync(path.join(outDir, 'tor-extract.json'), JSON.stringify(extract, null, 2));

// ---------- bid screen ----------
const f = (x) => (x && x.value ? x.value : '[FILL]') + (x && x.page ? ` (p.${x.page})` : '');
let ev = '';
if (args.fee !== undefined) {
  const fee = num(args.fee, '--fee', { min: 1 });
  const bidDays = num(args['bid-days'], '--bid-days', { min: 0 });
  const dayRate = num(args['day-rate'], '--day-rate', { min: 0 });
  ev = mdTable(['Scenario', 'P(win)', 'Expected value'], [0.25, 0.5, 0.75].map((p) => {
    const value = p * fee - bidDays * dayRate;
    return [`P(win)=${p}`, `${(p * 100).toFixed(0)}%`, `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('en-US')}`];
  })) + `\n\nEV = P(win) × fee − bid-days × your-day-rate = P × ${fee.toLocaleString('en-US')} − ${bidDays} × ${dayRate.toLocaleString('en-US')}.\nAll three inputs are your estimates (HONESTY RULE). EV > 0 at a realistic P(win) is necessary, not sufficient — go/no-go is your call.\n`;
}
const ungm = /ungm|un global marketplace/i.test(tor);
writeOut(path.join(outDir, 'bid-screen.md'), `# Bid screen\n\n## Assignment\n- Title: ${f(extract.title)}\n- Reference: ${f(extract.referenceNumber)}\n- Client: ${f(extract.client)}\n- Deadline: ${f(extract.deadline)}\n- Clarifications by: ${f(extract.clarificationCutoff)}\n- Duration / effort: ${f(extract.duration)} / ${f(extract.effortPersonDays)} person-days\n\n## Go / no-go checklist\n- [ ] UNGM/portal registration ${ungm ? '(ToR mentions UNGM — p.' + pageOf(tor, tor.search(/ungm/i)) + ')' : '(verify client registration prerequisites — see dossier)'}\n- [ ] CV matches must-have qualifications (run cv-gap)\n- [ ] Deadline achievable with your calendar\n- [ ] Eligibility (nationality/citizenship clauses if any)\n- [ ] EV positive at realistic P(win)\n\n${ev}## Red flags\n- ${extract.evaluation.weightsSumCheck !== 'ok' ? 'Weights check: ' + extract.evaluation.weightsSumCheck : 'Evaluation weights sum consistent'}\n- ${extract.conflicts.length} agent/regex conflict(s) recorded in tor-extract.json\n`);

// ---------- compliance matrix ----------
const rows = [];
if (extract.evaluation.criteria.length) rows.push(['**Evaluation criteria covered** (one section each in technical response)', extract.evaluation.criteria.map((c) => `p.${c.page ?? '?'}`).join(', '), 'See technical response', 'You', 'TODO']);
if (extract.deliverables.length) for (const d of extract.deliverables) rows.push([`Deliverable: ${d.value.slice(0, 60)}`, `p.${d.page}`, '[FILL: approach in 2–3 lines]', 'You', 'TODO']);
for (const p of extract.paymentTerms.slice(0, 4)) rows.push([`Payment term: ${p.value.slice(0, 60)}`, `p.${p.page}`, 'Accept / negotiate', 'You', 'TODO']);
rows.push(['Proposal validity per ToR', extract.validity?.page ? `p.${extract.validity.page}` : '[FILL]', 'Declare in cover letter', 'You', 'TODO']);
rows.push(['GCC / no-deviation acceptance', '[FILL: page]', 'Declare acceptance in cover letter', 'You', 'TODO']);
rows.push(['Submission channel + format', extract.submissionChannel?.page ? `p.${extract.submissionChannel.page}` : '[FILL]', 'Verify portal + file formats', 'You', 'TODO']);
writeOut(path.join(outDir, 'compliance-matrix.md'), `# Compliance matrix — ${f(extract.referenceNumber)}\n\nSource: ${extract.source}. Every requirement verbatim from the ToR with its page.\n\n` + mdTable(['Requirement', 'p.X', 'Our response', 'Owner', 'Status'], rows) + `\n\naudit.mjs will hard-fail while any Status is not Complete.\n`);
process.stderr.write(`extract: ${extract.evaluation.criteria.length} criteria, ${extract.deliverables.length} deliverables, ${conflicts.length} conflicts -> ${outDir}/\n`);
