#!/usr/bin/env node
// tor-to-proposal: command router. All tools are also directly runnable.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = {
  'pdf-extract': 'pdf-extract.mjs',
  extract: 'extract.mjs',
  'cv-gap': 'cv-gap.mjs',
  'cv-tailor': 'cv-tailor.mjs',
  'cover-letter': 'cover-letter.mjs',
  'market-rates': 'market-rates.mjs',
  'pricing-model': 'pricing-model.mjs',
  'financial-proposal': 'financial-proposal.mjs',
  dossier: 'dossier.mjs',
  simulator: 'simulator.mjs',
  'template-filler': 'template-filler.mjs',
  audit: 'audit.mjs',
  render: 'render.mjs',
  package: 'package.mjs',
  'bid-pack': 'bid-pack.mjs',
  profile: 'profile.mjs',
  init: 'profile.mjs', // plug-and-play alias: tor-to-proposal init
};

const DESCRIPTIONS = {
  'pdf-extract': 'PDF/docx/xlsx -> [[PAGE n]]-tagged text + signals',
  extract: 'ToR -> tor-extract.json + bid screen + compliance matrix',
  'cv-gap': 'CV <-> ToR gap analysis (MATCH / GAP-do-not-claim)',
  'cv-tailor': 'build + lint a ToR-tailored CV (every bullet anchored to the master CV)',
  'cover-letter': 'lint a drafted cover letter (agent drafts)',
  'market-rates': 'benchmark scaffold + rate position vs cited band',
  'pricing-model': 'multi-format rates, every line shows its formula',
  'financial-proposal': 'client-facing financial proposal from pricing.json (md + xlsx)',
  dossier: 'client intelligence scaffold',
  simulator: 'coverage vs evaluation grid -> at-risk points',
  'template-filler': "fill the client's own docx/xlsx forms",
  audit: 'pre-submission hard-fail gate',
  render: 'fallback markdown -> PDF emitter (no document tooling needed)',
  package: 'verify final docs (re-extract + re-audit) -> pack/ + checklist + zip',
  'bid-pack': 'one-shot orchestrator: start | apply | pack + the consolidated questionnaire',
  profile: 'consultant profile wizard (~/.tor-to-proposal/profile.json)',
  init: 'alias for profile — one-time setup wizard',
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help') {
  process.stdout.write(`tor-to-proposal — the bid tool that refuses to lie.\n\nUsage: tor-to-proposal <command> [options]\n\nQuick start (plug and play):\n  tor-to-proposal init                        one-time profile + setup wizard\n  tor-to-proposal bid-pack start --tor tor.pdf --cv cv.txt --dir mybid/\n  tor-to-proposal bid-pack apply --answers answers.json --dir mybid/\n  tor-to-proposal bid-pack pack --dir mybid/ --fallback-pdf\n\nCommands:\n${Object.keys(TOOLS).map((k) => `  ${k.padEnd(19)} ${DESCRIPTIONS[k]}`).join('\n')}\n\nPer-command help: tor-to-proposal <command> --help\nAgent workflow: see SKILL.md\n`);
  process.exit(cmd ? 0 : 1);
}
if (!TOOLS[cmd]) {
  if (cmd === 'mcp-server') {
    // npx launch path: "npx tor-to-proposal mcp-server" (stdio MCP)
    const res = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.mjs'), ...rest], { stdio: 'inherit' });
    process.exit(res.status ?? 1);
  }
  process.stderr.write(`unknown command: ${cmd}\n\nRun without arguments to list commands.\n`);
  process.exit(1);
}
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), TOOLS[cmd]);
const res = spawnSync(process.execPath, [script, ...rest], { stdio: 'inherit' });
process.exit(res.status ?? 1);
