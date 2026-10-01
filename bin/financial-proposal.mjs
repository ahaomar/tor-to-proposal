#!/usr/bin/env node
// financial-proposal: pricing.json + tor-extract.json -> the client-facing
// financial proposal (markdown + optional xlsx). Numbers come ONLY from
// pricing.json (user-confirmed inputs) or [FILL]; the internal floor math
// (base/loading/contingency) stays in pricing.md — the client sees the quote.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readText, writeOut, helpText, num, fmt, loadDep } from './lib.mjs';

const HELP = helpText('financial-proposal', [
  'Usage: node bin/financial-proposal.mjs --pricing out/pricing.json --extract out/tor-extract.json',
  '            [--context out/bid-context.json] [--out-dir out] [--xlsx]',
  '',
  'Outputs: <out-dir>/financial-proposal.md (+ financial-proposal.xlsx with --xlsx).',
  'Effort comes from pricing.json --effort, else the ToR extract, else [FILL].',
  'If the client supplied their own financial form, template-filler.mjs governs instead.',
]);

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.pricing || !args.extract) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const pricing = JSON.parse(readText(args.pricing, '--pricing (run pricing-model.mjs first)'));
const extract = JSON.parse(readText(args.extract, '--extract (run extract.mjs first)'));
let context = {};
try { context = JSON.parse(fs.readFileSync(args.context || path.join(args['out-dir'] || 'out', 'bid-context.json'), 'utf8')); } catch { /* optional */ }

const currency = pricing.inputs.currency || 'USD';
const rate = pricing.quoteFloorDay; // all-inclusive day rate (base + loading + contingency)
const p = (x) => (x && x.value ? x.value : null);
const pg = (x) => (x && x.page ? `(p.${x.page})` : '');
const refNo = p(extract.referenceNumber) || '[FILL: reference no.]';
const title = p(extract.title) || '[FILL: assignment title]';
const consultant = context.consultantLine || '[FILL: consultant name + credentials]';
const effort = pricing.inputs.effortDays ?? (extract.effortPersonDays ? Number(extract.effortPersonDays.value) : null);
const validity = context.validity || (extract.validity ? `${extract.validity.value} from the submission deadline ${pg(extract.validity)}` : '[FILL: validity period per ToR]');
// pick the first payment capture that carries actual terms, not just a "PAYMENT TERMS" heading
const paymentEntry = (extract.paymentTerms || []).find((t) => t.value.replace(/^\s*payment\s+terms?\s*[:\-]?\s*/i, '').replace(/[^a-z0-9]/gi, '').length >= 15) || null;
const payment = paymentEntry ? `${paymentEntry.value.replace(/^\s*payment\s+terms?\s*[:\-]?\s*/i, '')} ${pg(paymentEntry)}` : '[FILL: payment schedule per ToR]';
const fees = effort !== null ? rate * effort : null;
const reimbursables = context.reimbursables ?? null; // user-supplied; stays [FILL] otherwise
const reimbursablesNum = reimbursables !== null && Number.isFinite(Number(reimbursables)) ? Number(reimbursables) : 0; // text answers ("none") add zero
const total = fees !== null ? fees + reimbursablesNum : null;

const amount = (v) => (v === null || v === undefined ? '[FILL]' : Number.isFinite(Number(v)) ? fmt(Number(v)) : String(v));
const md = `# Financial Proposal

| | |
| --- | --- |
| Assignment | ${title} |
| Reference | ${refNo} ${extract.referenceNumber?.page ? `(p.${extract.referenceNumber.page})` : ''} |
| Submitted by | ${consultant} |
| Date | ${context.date || new Date().toISOString().slice(0, 10)} |
| Currency | ${currency} |
| Validity | ${validity} |

## Cost breakdown

| # | Item | Qty | Unit rate (${currency}) | Amount (${currency}) |
| --- | --- | --- | --- | --- |
| 1 | Professional fees — ${title}${effort !== null ? ` (${effort} person-days)` : ''} | ${effort ?? '[FILL: person-days]'} | ${fmt(rate)} | ${amount(fees)} |
| 2 | Reimbursable expenses (itemised attachment) | — | — | ${reimbursables !== null ? amount(reimbursables) : '[FILL: itemize, or state "none" and delete this row]'} |
| | **TOTAL (all-inclusive, ${currency})** | | | **${amount(total)}** |

## Payment schedule

${payment}

## Notes

1. The daily rate is **all-inclusive**: professional fees, overheads and insurance. No separate loading lines are claimable.
2. Taxes: ${context.taxes || '[FILL: tax treatment per the ToR / applicable law — declare whether amounts are tax-inclusive]'}.
3. This proposal remains valid for the validity period stated above. Per the ToR, no deviation from the General Conditions of Contract is accepted.
4. Deliverables priced above are those listed in the ToR${extract.deliverables.length ? ` (see ToR p.${extract.deliverables[0].page})` : ''}; the technical approach is detailed in the separate technical proposal.
`;

const outDir = args['out-dir'] || 'out';
fs.mkdirSync(path.resolve(outDir), { recursive: true });
writeOut(path.join(outDir, 'financial-proposal.md'), md);

if (args.xlsx) {
  const mod = await loadDep('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Financial Proposal');
  ws.getColumn(1).width = 46; ws.getColumn(2).width = 14; ws.getColumn(3).width = 16; ws.getColumn(4).width = 18;
  const rows = [
    ['Financial Proposal', null, null, null],
    [`Assignment: ${title}`, null, null, null],
    [`Reference: ${refNo}`, null, null, null],
    [`Submitted by: ${consultant}`, null, null, null],
    [`Date: ${context.date || new Date().toISOString().slice(0, 10)}    Currency: ${currency}    Validity: ${validity}`, null, null, null],
    [null, null, null, null],
    ['Item', 'Qty', `Unit rate (${currency})`, `Amount (${currency})`],
    ['Professional fees', effort ?? '[FILL: person-days]', rate, effort !== null ? { formula: 'B8*C8' } : '[FILL]'],
    ['Reimbursable expenses (itemised attachment)', null, null, reimbursables !== null ? (Number.isFinite(Number(reimbursables)) ? Number(reimbursables) : reimbursables) : '[FILL: itemize, or state none]'],
    ['TOTAL (all-inclusive)', null, null, { formula: 'SUM(D8:D9)' }],
    [null, null, null, null],
    [`Payment schedule: ${payment}`, null, null, null],
    ['The daily rate is all-inclusive: professional fees, overheads and insurance.', null, null, null],
    [`Taxes: ${context.taxes || '[FILL: tax treatment]'}`, null, null, null],
  ];
  rows.forEach((r) => ws.addRow(r));
  ws.getCell('A1').font = { bold: true, size: 13 };
  ['A7', 'B7', 'C7', 'D7'].forEach((a) => (ws.getCell(a).font = { bold: true }));
  ['A10', 'D10'].forEach((a) => (ws.getCell(a).font = { bold: true }));
  ['C8', 'D8', 'D9', 'D10'].forEach((a) => (ws.getCell(a).numFormat = '#,##0.00'));
  await wb.xlsx.writeFile(path.join(outDir, 'financial-proposal.xlsx'));
  process.stderr.write(`written: ${path.join(outDir, 'financial-proposal.xlsx')} (formulas visible: D8=B8*C8, D10=SUM)\n`);
}

const fills = [...md.matchAll(/\[FILL/g)].length;
process.stderr.write(`financial-proposal: ${outDir}/financial-proposal.md${args.xlsx ? ' + .xlsx' : ''}, ${fills} [FILL] slot(s) to resolve\n`);
