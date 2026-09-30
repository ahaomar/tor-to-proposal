#!/usr/bin/env node
// tor-to-proposal: command router. All tools are also directly runnable.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = {
  'pdf-extract': 'pdf-extract.mjs',
  extract: 'extract.mjs',
  'cv-gap': 'cv-gap.mjs',
  'cover-letter': 'cover-letter.mjs',
  'market-rates': 'market-rates.mjs',
  'pricing-model': 'pricing-model.mjs',
  dossier: 'dossier.mjs',
  simulator: 'simulator.mjs',
  'template-filler': 'template-filler.mjs',
  audit: 'audit.mjs',
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help') {
  process.stdout.write(`tor-to-proposal — the bid tool that refuses to lie.\n\nUsage: node bin/tor-to-proposal.mjs <command> [options]\n\nCommands:\n${Object.keys(TOOLS).map((k) => `  ${k.padEnd(17)} ${k === 'pdf-extract' ? 'PDF/docx/xlsx -> [[PAGE n]]-tagged text + signals' : k === 'extract' ? 'ToR -> tor-extract.json + bid screen + compliance matrix' : k === 'cv-gap' ? 'CV <-> ToR gap analysis (MATCH / GAP-do-not-claim)' : k === 'cover-letter' ? 'lint a drafted cover letter (agent drafts)' : k === 'market-rates' ? 'benchmark scaffold + rate position vs cited band' : k === 'pricing-model' ? 'multi-format rates, every line shows its formula' : k === 'dossier' ? 'client intelligence scaffold' : k === 'simulator' ? 'coverage vs evaluation grid -> at-risk points' : k === 'template-filler' ? "fill the client's own docx/xlsx forms" : 'pre-submission hard-fail gate'}`).join('\n')}\n\nPer-command help: node bin/tor-to-proposal.mjs <command> --help\nFull workflow: see SKILL.md\n`);
  process.exit(cmd ? 0 : 1);
}
if (!TOOLS[cmd]) {
  process.stderr.write(`unknown command: ${cmd}\n\nRun without arguments to list commands.\n`);
  process.exit(1);
}
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), TOOLS[cmd]);
const res = spawnSync(process.execPath, [script, ...rest], { stdio: 'inherit' });
process.exit(res.status ?? 1);
