#!/usr/bin/env node
// cv-gap: CV <-> ToR gap analysis. Pattern scan only. GAPS are flagged as
// "do not claim" — the tool never rewrites facts, never invents experience.
import { fail, parseArgs, readText, writeOut, helpText, pageOf, extractWindow, mdTable } from './lib.mjs';

const HELP = helpText('cv-gap', [
  'Usage: node bin/cv-gap.mjs --tor tor.txt --cv cv.txt [--out cv-gap-report.md]',
  '',
  'Outputs a match table (requirement | p.X | in CV | action) + CV tailoring advice.',
  'MATCH = evidence pattern found in CV. GAP = not found -> never claim it.',
]);

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.tor || !args.cv) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const tor = readText(args.tor, '--tor');
const cv = readText(args.cv, '--cv').toLowerCase();
const cvPages = readText(args.cv, '--cv');

const DOMAINS = ['monitoring and evaluation', 'm&e', 'evaluation', 'gender', 'climate', 'climate change', 'public health', 'health', 'governance', 'public finance', 'finance', 'procurement', 'digital', 'digitalization', 'education', 'agriculture', 'livelihoods', 'wash', 'migration', 'statistics', 'data analysis', 'capacity development', 'human rights', 'project management'];
const CLIENTS = ['undp', 'unops', 'unicef', 'unhcr', 'iom', 'fao', 'wfp', 'who', 'unesco', 'un women', 'world bank', 'usaid', 'fcdo', 'giz', 'european union', 'ngo', 'ingo', 'government', 'ministry', 'united nations'];
const CERTS = ['pmp', 'prince2', 'cpa', 'acca', 'cima', 'cfa', 'phd'];
const SOFT = ['report writing', 'facilitation', 'training', 'stakeholder engagement', 'stakeholder', 'communication', 'workshop'];
const LANGS = ['english', 'french', 'spanish', 'arabic', 'russian', 'portuguese', 'chinese'];

function torHits(patternList, flags = 'i') {
  const hits = [];
  for (const p of patternList) {
    const re = new RegExp(`(^|[^a-z])${p.replace(/[&]/g, '\\&').replace(/ /g, '\\s+')}([^a-z]|$)`, flags);
    const m = tor.match(re);
    if (m) hits.push({ term: p, page: pageOf(tor, m.index) });
  }
  return hits;
}
function inCv(term) {
  const re = new RegExp(`(^|[^a-z])${term.replace(/[&]/g, '\\&').replace(/ /g, '\\s+')}([^a-z]|$)`, 'i');
  return re.test(cv);
}

const qualsWindow = extractWindow(tor, /qualification|requirements|expertise|competenc|profile/i, /\n\s*(?:submission|evaluation|annex\b|payment)/i, 6000) ?? tor;

const checks = [];
const push = (group, term, page) => checks.push({ group, term, page, found: inCv(term) });

// Education
const edu = qualsWindow.match(/(master|bachelor|phd|doctorate|mba|mda)[^.\n]{0,80}/i);
if (edu) {
  const level = edu[1].toLowerCase();
  checks.push({ group: 'Education', term: edu[0].trim().slice(0, 80), page: pageOf(tor, tor.indexOf(edu[0])), found: new RegExp(level === 'phd' || level === 'doctorate' ? 'phd|doctorate' : level, 'i').test(cv) });
}
// Years of experience
const years = qualsWindow.match(/(\d{1,2})\s*\+?\s*years?(?:\s+of)?(?:\s+\w+){0,4}\s+experience/i);
if (years) {
  const need = Number(years[1]);
  const cvYears = Math.max(0, ...[...cvPages.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0])));
  const from = Math.max(0, ...[...cvPages.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0])));
  const minFrom = Math.min(9999, ...[...cvPages.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0])));
  const span = cvPages.match(/(19|20)\d{2}/g) ? new Date().getFullYear() - minFrom : 0;
  checks.push({
    group: 'Experience',
    term: `${need}+ years of experience`,
    page: pageOf(tor, tor.indexOf(years[0])),
    found: span >= need,
    note: span >= need ? `CV spans ~${span} years (earliest year ${minFrom}) — verify the relevant subset` : `CV earliest year ${minFrom} (~${span} yrs) vs ${need} required — GAP unless earlier roles omitted`,
  });
}
for (const h of torHits(DOMAINS)) push('Domain', h.term, h.page);
for (const h of torHits(CLIENTS)) push('Client type', h.term, h.page);
for (const h of torHits(CERTS)) push('Certification', h.term.toUpperCase(), h.page);
const langWindow = extractWindow(tor, /language/i, /\n\s*\n/, 1200);
if (langWindow) for (const h of torHits(LANGS)) push('Language', h.term[0].toUpperCase() + h.term.slice(1), h.page);
for (const h of torHits(SOFT)) push('Soft skill', h.term, h.page);

const rows = checks.map((c) => [
  `${c.group}: ${c.term}`,
  c.page ? `p.${c.page}` : '[FILL: page]',
  c.found ? '✔ MATCH' : '✖ **GAP — do not claim**',
  c.found
    ? c.note || 'Reorder/quantify this bullet high in the CV using the ToR’s own wording'
    : 'Flag as risk in go/no-go, or reword around true adjacent experience — never invent',
]);

const nMatch = checks.filter((c) => c.found).length;
const report = `# CV gap report\n\n${checks.length} requirements detected; ${nMatch} matched, ${checks.length - nMatch} gaps.\n\n` +
  mdTable(['Requirement', 'p.X', 'In CV', 'Action'], rows) +
  `\n\n## CV tailoring rules (mechanical, honest)\n1. Re-order bullets so the top-weighted evaluation criteria (see tor-extract.json) see their evidence first, using the ToR's verbatim terminology.\n2. Quantify every retained bullet (years, budgets, team sizes, countries). No number available -> mark [FILL] and get the number.\n3. GAPS stay gaps. Reword around true adjacent experience only. Fabrication = disqualification + vendor blacklisting risk.\n4. Mirror the client's vocabulary (e.g. "results framework" not "logframe" if the ToR says results framework).\n`;
writeOut(args.out || 'cv-gap-report.md', report);
process.stderr.write(`cv-gap: ${nMatch}/${checks.length} matched\n`);
