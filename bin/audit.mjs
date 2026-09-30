#!/usr/bin/env node
// audit: the pre-submission hard-fail gate. [FILL] leftovers, incomplete compliance
// matrix, claim-shaped sentences with no trace. Exit 1 = do not submit yet.
import { basename as path0 } from 'node:path';
import { parseArgs, readText, writeOut, helpText } from './lib.mjs';

const HELP = helpText('audit', [
  'Usage: node bin/audit.mjs --proposal final.md --matrix compliance-matrix.md',
  '            [--extras file.md ...] [--report audit-report.md]',
  '',
  'Hard fails: [FILL] remaining; matrix rows not Complete.',
  'Review list: claim-shaped sentences (achievement verb + number) without',
  '[[PAGE n]] / p.X / [FILL] / user-input / http trace.',
]);

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.proposal) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const files = [args.proposal, ...(args.extras ? [].concat(args.extras) : [])];
const hard = [];
const review = [];

for (const file of files) {
  const text = readText(file, 'proposal file');
  const fills = [...text.matchAll(/\[FILL[^\]]*\]/g)];
  if (fills.length) hard.push(`${path0(file)}: ${fills.length} [FILL] placeholder(s) remain — resolve every one before submission`);

  const sentences = text
    .split('\n')
    .filter((l) => !l.trim().startsWith('#') && !l.trim().startsWith('|'))
    .join(' ')
    .split(/(?<=[.!?])\s+/);
  sentences.forEach((s) => {
    const clean = s.replace(/\s+/g, ' ').trim();
    if (clean.length < 20 || clean.startsWith('|') || clean.startsWith('#')) return;
    const claimish = /\b(led|delivered|managed|implemented|achieved|reduced|increased|trained|designed|coordinated|produced|authored|advised)\b/i.test(clean) && /\d|%/.test(clean);
    if (!claimish) return;
    if (/\[\[PAGE \d+\]\]|\bp\.\s?\d+\b|https?:\/\/|\[FILL|user[- ]input|\(user/i.test(clean)) return;
    review.push(`${path0(file)}: “${clean.slice(0, 140)}${clean.length > 140 ? '…' : ''}” — claim-shaped, no trace (add [[PAGE n]], (p.X), source URL, or mark as user-input fact)`);
  });
}

if (args.matrix) {
  const matrix = readText(args.matrix, '--matrix');
  const rows = matrix.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|\s*[-:\s|]+\|/.test(l) && !/requirement/i.test(l.split('|')[1] ?? ''));
  let incomplete = 0;
  for (const r of rows) {
    const cells = r.split('|').map((c) => c.trim());
    const status = cells[cells.length - 2]; // last cell before trailing empty from split
    if (status && !/^complete$/i.test(status) && cells.length > 3) incomplete++;
  }
  if (incomplete) hard.push(`${path0(args.matrix)}: ${incomplete} row(s) not marked Complete`);
}

const report = `# Audit report\n\n${hard.length ? `## HARD FAILS — do not submit\n${hard.map((h) => '- ' + h).join('\n')}` : '## HARD FAILS — none'}\n\n## Review list (citation-rule lint, human judgement required)\n${review.length ? review.map((r) => '- ' + r).join('\n') : 'none — no untraceable claim-shaped sentences found'}\n\nGate: fix every hard fail. Work the review list: each flagged sentence needs a page tag, a source, or removal.\n`;
writeOut(args.report || 'audit-report.md', report);
process.stdout.write(report);
if (hard.length) process.exit(1);
