#!/usr/bin/env node
// pricing-model: transparent multi-format rate calculator.
// Every number printed with its formula. Emits pricing.json (input to template-filler).
import fs from 'node:fs';
import path from 'node:path';
import { fail, parseArgs, writeOut, helpText, num, fmt } from './lib.mjs';

const HELP = helpText('pricing-model', [
  'Usage: node bin/pricing-model.mjs --base 400 --basis day --currency USD',
  '            [--loading 0.25] [--contingency 0.10] [--effort 20] [--weeks 6] [--out-dir out]',
  '',
  'Constants, always shown: 8h/day, 5d/week, 4.33 weeks/month.',
  'Outputs: <out-dir>/pricing.json + pricing.md (each line shows its formula).',
  'GATE: inputs are yours. This tool computes; it never suggests a base rate.',
]);

const args = parseArgs(process.argv.slice(2));
if (args.__help || args.base === undefined || !args.basis) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const basis = String(args.basis).toLowerCase();
if (!['hour', 'day', 'week', 'month'].includes(basis)) fail(`--basis must be hour|day|week|month (got ${basis})`, 2);
const base = num(args.base, '--base', { min: 0 });
const currency = (args.currency || 'USD').toUpperCase();
const loading = args.loading !== undefined ? num(args.loading, '--loading', { min: 0, max: 2 }) : 0;
const contingency = args.contingency !== undefined ? num(args.contingency, '--contingency', { min: 0, max: 1 }) : 0;
const effortDays = args.effort !== undefined ? num(args.effort, '--effort', { min: 0 }) : null;
const weeks = args.weeks !== undefined ? num(args.weeks, '--weeks', { min: 0 }) : null;

// Canonical: everything derives from the hourly rate.
const perHour = { hour: base, day: base / 8, week: base / (8 * 5), month: base / (8 * 5 * 4.33) }[basis];
const r = (x) => Math.round(x * 100) / 100;
const conv = [
  ['hour', perHour, `= ${fmt(base)} / ${basis === 'hour' ? '1' : { day: '8 (h/day)', week: '40 (8×5)', month: '173.3 (8×5×4.33)' }[basis]}`],
  ['day', perHour * 8, `= hourly ${fmt(r(perHour))} × 8`],
  ['week', perHour * 8 * 5, `= hourly ${fmt(r(perHour))} × 40`],
  ['month', perHour * 8 * 5 * 4.33, `= hourly ${fmt(r(perHour))} × 173.3`],
];
const baseDay = perHour * 8;
const loaded = baseDay * (1 + loading);
const floor = loaded * (1 + contingency);
const lumpSum = effortDays !== null ? floor * effortDays : null;
const total = weeks !== null ? floor * 5 * weeks : null;

const pricing = {
  inputs: { base, basis, currency, loading, contingency, effortDays, weeks, userSupplied: true },
  constants: { hoursPerDay: 8, daysPerWeek: 5, weeksPerMonth: 4.33 },
  rates: { hour: r(perHour), day: r(baseDay), week: r(perHour * 40), month: r(perHour * 173.3) },
  loadedDay: r(loaded),
  quoteFloorDay: r(floor),
  lumpSum: lumpSum !== null ? r(lumpSum) : null,
  assignmentTotal: total !== null ? r(total) : null,
};

const outDir = args['out-dir'] || 'out';
fs.mkdirSync(path.resolve(outDir), { recursive: true });
fs.writeFileSync(path.join(outDir, 'pricing.json'), JSON.stringify(pricing, null, 2));

let md = `# Pricing model (${currency})\n\nInputs (all user-supplied): base ${fmt(base)}/${basis}` +
  (loading ? `, loading ${(loading * 100).toFixed(0)}%` : '') +
  (contingency ? `, contingency ${(contingency * 100).toFixed(0)}%` : '') +
  (effortDays !== null ? `, effort ${effortDays} person-days` : '') +
  (weeks !== null ? `, ${weeks} weeks` : '') + `\n\nConstants (open): 8h/day, 5d/week, 4.33 weeks/month.\n\n## Billing formats\n\n| Basis | Rate (${currency}) | Formula |\n| --- | --- | --- |\n` +
  conv.map(([k, v, f]) => `| per ${k} | ${fmt(r(v))} | ${f} |`).join('\n') +
  `\n\n## Load & floor\n` +
  `- Loaded day rate: **${fmt(r(loaded))}** = base day ${fmt(r(baseDay))} × (1 + loading ${(loading * 100).toFixed(0)}%)\n` +
  (contingency ? `- Quote floor: **${fmt(r(floor))}** = loaded ${fmt(r(loaded))} × (1 + contingency ${(contingency * 100).toFixed(0)}%)\n` : `- Quote floor = loaded rate (no contingency set)\n`) +
  (lumpSum !== null ? `- Lump-sum for ${effortDays} days: **${fmt(r(lumpSum))}** = floor ${fmt(r(floor))} × ${effortDays}\n` : '') +
  (total !== null ? `- Assignment total (${weeks} weeks): **${fmt(r(total))}** = floor ${fmt(r(floor))} × 5 × ${weeks}\n` : '') +
  `\n> ⚠️ CLIENT TEMPLATE GOVERNS: many financial forms forbid loading/contingency lines or require\n> per-deliverable or per-team-member breakdown. Restructure INTO their template with\n> template-filler.mjs — never the other way around. If the template has no rows for loading,\n> present the loaded figure only.\n`;
writeOut(path.join(outDir, 'pricing.md'), md);
process.stdout.write(md);
