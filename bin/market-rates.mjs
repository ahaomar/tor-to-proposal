#!/usr/bin/env node
// market-rates: benchmark RESEARCH scaffolder + rate position calculator.
// The scaffold never contains numbers — you research and cite every rate.
import { parseArgs, writeOut, helpText, num, fmt } from './lib.mjs';

const HELP = helpText('market-rates', [
  'Commands:',
  '  scaffold  [--title "..."] [--currency USD] [--out market-rates-research.md]',
  '  position  --your-rate N --benchmark-low N --benchmark-high N [--currency USD]',
  '',
  'position: BELOW/WITHIN/ABOVE the cited band + advisory. Rejects low > high (exit 2).',
  'Every band you use must be citable (source + date). No gut-feel numbers, ever.',
]);

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (args.__help || !cmd) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}

if (cmd === 'scaffold') {
  const title = args.title || '[FILL: assignment title + ref no.]';
  const cur = (args.currency || 'USD').toUpperCase();
  const md = `# Market rates research — ${title}\n\n> Fill every row from a real source. No number without a source + access date.\n> Drop this file's band into: market-rates.mjs position --benchmark-low X --benchmark-high Y\n\n## Benchmark sources\n\n| # | Source | Type | Rate/band (${cur}) | Unit | Date accessed | Link |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | UNDP/UNICEF/UNOPS consultant fee schedule or SSA guidance | fee grid | [FILL] | day | [FILL] | [FILL] |\n| 2 | UNGM contract award notices (search: client + sector + year) | awarded contract | [FILL] | day/lump | [FILL] | ungm.org\n| 3 | National procurement portal award notices | awarded contract | [FILL] | [FILL] | [FILL] | [FILL] |\n| 4 | Sector salary/rate survey (e.g. aid worker salary reports) | survey | [FILL] | month | [FILL] | [FILL] |\n| 5 | Live job postings with disclosed bands (client + sector) | posting | [FILL] | month | [FILL] | [FILL] |\n| 6 | 2–3 peer consultants (ask directly; record consent) | peer | [FILL] | day | [FILL] | n/a |\n\n## Context factors (write 1 line each — they move your band)\n- Cost-reimbursable vs lump-sum: lump-sum shifts risk to you -> floor up.\n- Payment delay reputation of this client (feeds from dossier.mjs): [FILL]\n- Currency + inflation of the contract currency: [FILL]\n- Your overhead (insurance, software, unpaid pipeline time): [FILL]%\n- Scope-creep exposure of the deliverables: [FILL]\n\n## Decision rule (printed, never skipped)\nfloor = (minimum acceptable net income for the period ÷ realistic billable days in it) + overhead.\nYour quote must trace to this floor or to a cited benchmark row above. If it traces to neither, it is a gut-feel number — not allowed.\n`;
  writeOut(args.out || 'market-rates-research.md', md);
  process.stderr.write('scaffold written. Research the rows, then run: position\n');
} else if (cmd === 'position') {
  const need = ['your-rate', 'benchmark-low', 'benchmark-high'];
  for (const k of need) if (args[k] === undefined || args[k] === true) {
    process.stderr.write(`ERROR: --${k} missing\n\n${HELP}`);
    process.exit(1);
  }
  const rate = num(args['your-rate'], '--your-rate', { min: 0 });
  const low = num(args['benchmark-low'], '--benchmark-low', { min: 0 });
  const high = num(args['benchmark-high'], '--benchmark-high', { min: 0 });
  if (low >= high) {
    process.stderr.write(`ERROR: --benchmark-low (${fmt(low)}) must be BELOW --benchmark-high (${fmt(high)}). Fix your research band.\n`);
    process.exit(2);
  }
  const cur = (args.currency || 'USD').toUpperCase();
  const posPct = ((rate - low) / (high - low)) * 100;
  const where = rate < low ? 'BELOW band' : rate > high ? 'ABOVE band' : 'WITHIN band';
  let advisory;
  if (rate < low) advisory = 'Below band: verify your floor (market-rates scaffold §Decision rule). Sustainable underpricing signals low quality to evaluators and burns the pipeline. If the floor genuinely fits, quote it with confidence.';
  else if (rate > high) advisory = 'Above band: you must justify the premium with cited evidence — scarce expertise, faster delivery, lower client risk. Otherwise reposition within the band.';
  else advisory = `Within band at ${posPct.toFixed(0)}% of the range. If >70%, prepare a one-line premium justification anyway.`;
  process.stdout.write(
    `Rate position (${cur})\n  Your rate:        ${fmt(rate)}\n  Cited band:       ${fmt(low)} – ${fmt(high)}\n  Position:         ${where} (${posPct.toFixed(0)}% of range)\n  Advisory:         ${advisory}\n  Source required:  benchmark-low/high must each trace to a row in market-rates-research.md (source + date). [FILL if not yet cited]\n`
  );
} else {
  process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`);
  process.exit(1);
}
