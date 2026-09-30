#!/usr/bin/env node
// cover-letter: LINTER, not a generator. The agent drafts the letter (assets/templates.md);
// this tool enforces the honesty rules mechanically. Exit 1 = fix before use.
import { fail, parseArgs, readText, writeOut, helpText } from './lib.mjs';

const HELP = helpText('cover-letter (lint)', [
  'Usage: node bin/cover-letter.mjs lint --draft letter.md --cv cv.txt [--max-words 550]',
  '',
  'Checks: superlatives, page-tagged claims, [FILL] leftovers, sign-off/CV name match,',
  'unsupported-skill mentions, length. Output: lint report; exit 1 on any failure.',
]);

const SUPERLATIVES = ['leading', 'world-class', 'world leading', 'renowned', 'premier', 'cutting-edge', 'state-of-the-art', 'best-in-class', 'unparalleled', 'top-tier', 'preeminent', 'unrivaled', 'foremost', 'exceptional expertise', 'vast experience'];

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? 'lint';
if (args.__help || cmd !== 'lint' || !args.draft || !args.cv) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const draft = readText(args.draft, '--draft');
const cv = readText(args.cv, '--cv');
const lines = draft.split('\n');
const failures = [];
const warnings = [];

SUPERLATIVES.forEach((s) => {
  const re = new RegExp(`\\b${s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
  lines.forEach((l, i) => { if (re.test(l)) failures.push(`L${i + 1}: superlative "${s}" — cut it; show evidence instead (rule: no superlatives)`); });
});

const hasPageTags = /\[\[PAGE \d+\]\]|\bp\.\s?\d+\b/i.test(draft);
if (!hasPageTags) failures.push('no page-tagged references at all — every ToR claim in the letter needs (p.X)');

const fills = [...draft.matchAll(/\[FILL[^\]]*\]/g)];
if (fills.length) warnings.push(`${fills.length} [FILL] placeholder(s) remain — fill with real evidence before submission`);

const words = draft.trim().split(/\s+/).length;
const maxWords = Number(args['max-words'] || 550);
if (words > maxWords) failures.push(`${words} words > ${maxWords} (≈1 page) — trim`);

// Sign-off must match the CV's name (CVs conventionally open with the name).
const cvName = (cv.match(/^\s*(?:name\s*[:\-]\s*)?([A-Z][\w.'-]+(?:[ \t]+[A-Z][\w.'-]+){1,3})/) || [])[1];
if (cvName) {
  const tail = lines.slice(-6).join(' ');
  const allParts = cvName.split(/\s+/).every((p) => new RegExp(`\\b${p.replace(/[.\-]/g, '\\$&')}\\b`, 'i').test(tail));
  if (!allParts) failures.push(`sign-off does not match CV name "${cvName}" — exact name + credentials only (no-invention rule)`);
} else {
  warnings.push('could not detect a name in the CV header — verify the sign-off manually');
}

// Skills the ToR demands but the CV lacks must not appear in the letter.
// The cv-gap report feeds this: any "GAP — do not claim" term found in the draft is a failure.
if (args.gap && typeof args.gap === 'string') {
  const gap = readText(args.gap, '--gap');
  [...gap.matchAll(/\|\s*[^|]*?:\s*([^|]+?)\s*\|\s*p\.\d+\s*\|\s*✖/g)].forEach((m) => {
    const term = m[1].trim().toLowerCase();
    if (term.length > 3 && draft.toLowerCase().includes(term)) {
      failures.push(`letter mentions "${term}" which cv-gap marked GAP — remove it or fix the CV evidence first`);
    }
  });
}

const report = `# Cover letter lint\n\n${failures.length ? `## FAIL (${failures.length})\n` + failures.map((f) => '- ' + f).join('\n') : '## PASS — all checks ok'}\n${warnings.length ? `\n## Warnings\n` + warnings.map((w) => '- ' + w).join('\n') : ''}\n`;
writeOut(args.report || 'cover-letter-lint.md', report);
process.stdout.write(report);
if (failures.length) process.exit(1);
