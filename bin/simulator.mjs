#!/usr/bin/env node
// simulator: reverse-score a drafted technical response against the ToR's published
// evaluation grid. Coverage arithmetic only — at-risk points = weight × (missing
// sub-elements ÷ total). This is NOT a prediction of evaluator behavior (stated in report).
import fs from 'node:fs';
import { fail, parseArgs, readText, writeOut, helpText, mdTable } from './lib.mjs';

const HELP = helpText('simulator', [
  'Usage: node bin/simulator.mjs --extract out/tor-extract.json --response response.md',
  '            [--sub-elements sub-elements.json] [--out simulator-report.md]',
  '',
  '--sub-elements (optional): {"criterion label": ["sub-element 1", "..."], ...}',
  '  Agent-extracted from the ToR — verbatim wording, with the ToR page noted.',
  '',
  'Keyword-coverage check per sub-element; at-risk pts = weight × missing/total.',
]);

const STOP = new Set(['the', 'and', 'with', 'for', 'from', 'that', 'this', 'will', 'shall', 'including', 'based', 'using', 'which', 'their', 'other', 'others', 'must', 'have', 'been', 'into', 'such', 'than', 'then', 'when', 'where', 'while', 'about', 'under', 'over', 'within', 'should', 'would', 'could', 'these', 'those', 'applicant', 'bidder']);

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.extract || !args.response) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const extract = JSON.parse(readText(args.extract, '--extract'));
const response = readText(args.response, '--response');
const responseLc = response.toLowerCase();
const subMap = args['sub-elements'] ? JSON.parse(readText(args['sub-elements'], '--sub-elements')) : {};

const criteria = extract.evaluation?.criteria ?? [];
if (!criteria.length) fail('tor-extract.json has no evaluation criteria — re-run extract (or supply via --json per SKILL.md step 1)', 2);

function keywords(text) {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 8);
}
function coveredBy(el) {
  const kws = keywords(el);
  if (!kws.length) return { covered: true, hits: [], kws };
  const hits = kws.filter((k) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`, 'i').test(responseLc));
  return { covered: hits.length >= Math.max(1, Math.ceil(kws.length * 0.4)), hits, kws };
}

const rows = [];
let totalAtRisk = 0;
for (const c of criteria) {
  const subs = subMap[c.label] ?? [c.label]; // no sub-map -> the criterion itself is the unit
  const detail = subs.map((s) => ({ sub: s, ...coveredBy(s) }));
  const missing = detail.filter((d) => !d.covered);
  const atRisk = (c.weight * missing.length) / subs.length;
  totalAtRisk += atRisk;
  rows.push({
    label: c.label, weight: c.weight, page: c.page ?? null, subs, missing: missing.map((m) => m.sub),
    coveredN: subs.length - missing.length, atRisk: Math.round(atRisk * 100) / 100,
  });
}
rows.sort((a, b) => b.atRisk - a.atRisk);
const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

const table = mdTable(
  ['Criterion', 'Wt', 'Sub-elems covered', 'At-risk pts', 'Missing (add these)'],
  rows.map((r) => [`${r.label}${r.page ? ` (p.${r.page})` : ''}`, String(r.weight), `${r.coveredN}/${r.subs.length}`, r.atRisk ? `**${r.atRisk.toFixed(2)}**` : '0', r.missing.length ? r.missing.map((m) => `“${m}”`).join('; ') : '—'])
);
const priorities = rows.filter((r) => r.atRisk > 0).map((r, i) => `${i + 1}. ${r.label} — recover up to ${r.atRisk.toFixed(2)} pts: add ${r.missing.join('; ')}.`);

const report = `# Simulator report — coverage vs published grid\n\n**At-risk points: ${totalAtRisk.toFixed(2)} of ${totalWeight}** (sum of weights × missing share)\n\n${table}\n\n## Rewrite priorities (highest recoverable points first)\n${priorities.length ? priorities.join('\n') : 'None — every criterion covered at keyword level. Still get a human read.'}\n\n## Method (no false precision)\nPer sub-element, up to 8 distinctive keywords are extracted from the ToR wording and checked\nagainst your response; “covered” = ≥40% of keywords present. At-risk pts = weight × (missing ÷\ntotal sub-elements). This is coverage arithmetic on the published grid — NOT a prediction of\nhow evaluators will score you. Missing sub-element wording is verbatim ToR language: answer it\nin their words.\n`;
writeOut(args.out || 'simulator-report.md', report);
process.stderr.write(`simulator: at-risk ${totalAtRisk.toFixed(2)} / ${totalWeight} pts across ${criteria.length} criteria\n`);
