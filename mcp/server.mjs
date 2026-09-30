#!/usr/bin/env node
// MCP stdio server: exposes the tor-to-proposal CLI as MCP tools so Claude
// Desktop, Claude Code, Codex, ChatGPT (developer mode) and any MCP client can
// use them natively. Zero dependencies: JSON-RPC 2.0, newline-delimited messages.
//
// Convention for every tool: pass ABSOLUTE paths for files you read AND for
// outputs (the server's working directory belongs to the host app, not you).
// Exit codes: 0 ok | 1 validation/hard-fail | 2 cannot-process (e.g. OCR
// needed, inverted band) | 3 dependencies missing (run `npm install` in the
// tor-to-proposal repo).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin');

const P = (description) => ({ type: 'string', description });
const N = (description) => ({ type: 'number', description });
const S = (properties, required = []) => ({ type: 'object', properties, required });
const ABS_OUT = 'Absolute output path (the server cwd belongs to the host app — always pass absolute paths).';

const TOOLS = [
  {
    name: 'pdf_extract',
    description:
      'Step 0 — Extract page-tagged text from a ToR document (PDF, .docx, .xlsx, or already-extracted .txt). Inserts [[PAGE n]] / [[SHEET n]] markers that every later tool uses for citation. Exit 2 means the PDF is likely scanned: run OCR (tesseract) first, do not guess page numbers.',
    inputSchema: S({
      file: P('Absolute path to the ToR document'),
      out: P('Optional ' + ABS_OUT + ' Omit to receive the text in the response.'),
      signals: P('Optional ' + ABS_OUT + ' (extraction signals JSON: pages, scannedLikely, hasEvaluationTable…).'),
    }, ['file']),
    argv: (a) => [a.file, ...(a.out ? ['--out', a.out] : []), ...(a.signals ? ['--signals', a.signals] : [])],
    script: 'pdf-extract.mjs',
  },
  {
    name: 'extract_tor',
    description:
      'Step 1 — Structure a page-tagged ToR into tor-extract.json + bid-screen.md + compliance-matrix.md. Extracts reference number, deadline, evaluation criteria with weights (checks they sum to the stated total), deliverables, payment terms, submission channel. Optionally computes expected-value go/no-go if fee/bid_days/day_rate are supplied (user-confirmed numbers only).',
    inputSchema: S({
      tor: P('Absolute path to the page-tagged text (from pdf_extract)'),
      out_dir: P('Optional ' + ABS_OUT + ' (directory). Default: out/ under the server cwd.'),
      json: P('Optional absolute path to agent-extracted fields ({"deadline": {"value": "...", "page": 4}, ...}) — accepted only with page attribution'),
      fee: N('User-confirmed expected fee for EV analysis'),
      bid_days: N('User-confirmed bid preparation days for EV analysis'),
      day_rate: N('User-confirmed day rate for EV analysis'),
    }, ['tor']),
    argv: (a) => [
      '--tor', a.tor, '--out-dir', a.out_dir || 'out',
      ...(a.json ? ['--json', a.json] : []),
      ...(a.fee !== undefined ? ['--fee', a.fee, '--bid-days', a.bid_days, '--day-rate', a.day_rate] : []),
    ],
    script: 'extract.mjs',
  },
  {
    name: 'cv_gap',
    description:
      'Step 3 — Compare a CV against the ToR requirements. MATCH rows are evidence found in the CV; GAP rows must never be claimed anywhere in the proposal.',
    inputSchema: S({
      tor: P('Absolute path to the page-tagged ToR text'),
      cv: P('Absolute path to the CV text file'),
      out: P('Optional ' + ABS_OUT),
    }, ['tor', 'cv']),
    argv: (a) => ['--tor', a.tor, '--cv', a.cv, ...(a.out ? ['--out', a.out] : [])],
    script: 'cv-gap.mjs',
  },
  {
    name: 'cover_letter_lint',
    description:
      'Step 6 — Lint a drafted cover letter: bans superlatives, requires page-tagged claims, flags [FILL] leftovers, verifies the sign-off matches the CV name, checks length. Exit 1 = fix the draft and lint again.',
    inputSchema: S({
      draft: P('Absolute path to the drafted cover letter (markdown)'),
      cv: P('Absolute path to the CV text file'),
      gap: P('Optional absolute path to the cv-gap report — mentions of GAP skills then fail the lint'),
      max_words: N('Optional word limit (default 550 ≈ 1 page)'),
      report: P('Optional ' + ABS_OUT),
    }, ['draft', 'cv']),
    argv: (a) => ['lint', '--draft', a.draft, '--cv', a.cv,
      ...(a.gap ? ['--gap', a.gap] : []), ...(a.max_words ? ['--max-words', a.max_words] : []),
      ...(a.report ? ['--report', a.report] : [])],
    script: 'cover-letter.mjs',
  },
  {
    name: 'market_rates_scaffold',
    description:
      'Step 4a — Generate market-rates-research.md: a benchmark table (UNDP/UNICEF fee grids, UNGM award notices, surveys, postings) where EVERY rate must be researched and cited with source + date. Contains no numbers by design.',
    inputSchema: S({
      title: P('Assignment title + reference number'),
      currency: P('ISO currency code (default USD)'),
      out: P('Optional ' + ABS_OUT),
    }),
    argv: (a) => ['scaffold', ...(a.title ? ['--title', a.title] : []), ...(a.currency ? ['--currency', a.currency] : []), ...(a.out ? ['--out', a.out] : [])],
    script: 'market-rates.mjs',
  },
  {
    name: 'market_rates_position',
    description:
      'Step 4b — Position a rate against a cited benchmark band: BELOW/WITHIN/ABOVE + advisory. Refuses an inverted band (low >= high) with exit 2.',
    inputSchema: S({
      your_rate: N('The rate being evaluated'),
      benchmark_low: N('Low end of the cited band (from researched sources)'),
      benchmark_high: N('High end of the cited band'),
      currency: P('ISO currency code (default USD)'),
    }, ['your_rate', 'benchmark_low', 'benchmark_high']),
    argv: (a) => ['position', '--your-rate', a.your_rate, '--benchmark-low', a.benchmark_low, '--benchmark-high', a.benchmark_high, ...(a.currency ? ['--currency', a.currency] : [])],
    script: 'market-rates.mjs',
  },
  {
    name: 'pricing_model',
    description:
      'Step 5 — GATED: call only after the user confirmed base rate, loading and contingency as THEIR numbers. Computes every billing format with visible formulas, the loaded rate, quote floor, lump-sum and assignment total; writes pricing.json (input for template_filler).',
    inputSchema: S({
      base: N('Base rate in the chosen basis'),
      basis: { type: 'string', enum: ['hour', 'day', 'week', 'month'], description: 'Unit of the base rate' },
      currency: P('ISO currency code (default USD)'),
      loading: N('Overhead multiplier as decimal (e.g. 0.25 = 25%)'),
      contingency: N('Risk multiplier as decimal (e.g. 0.10 = 10%)'),
      effort: N('Estimated person-days (for lump-sum)'),
      weeks: N('Assignment weeks (for assignment total)'),
      out_dir: P('Optional ' + ABS_OUT + ' (directory). Default: out/ under the server cwd.'),
    }, ['base', 'basis']),
    argv: (a) => ['--base', a.base, '--basis', a.basis,
      ...(a.currency ? ['--currency', a.currency] : []), ...(a.loading !== undefined ? ['--loading', a.loading] : []),
      ...(a.contingency !== undefined ? ['--contingency', a.contingency] : []), ...(a.effort !== undefined ? ['--effort', a.effort] : []),
      ...(a.weeks !== undefined ? ['--weeks', a.weeks] : []), ...(a.out_dir ? ['--out-dir', a.out_dir] : [])],
    script: 'pricing-model.mjs',
  },
  {
    name: 'dossier',
    description:
      'Step 2 — Scaffold a client dossier (type preset, registration prerequisites, payment reputation, past awards). You fill it only from citable sources; [FILL] rows stay until researched.',
    inputSchema: S({
      client: P('Client name (e.g. "UNOPS", "Ministry of Finance")'),
      sector: P('Sector keyword (e.g. "M&E")'),
      out: P('Optional ' + ABS_OUT),
    }, ['client']),
    argv: (a) => ['--client', a.client, ...(a.sector ? ['--sector', a.sector] : []), ...(a.out ? ['--out', a.out] : [])],
    script: 'dossier.mjs',
  },
  {
    name: 'simulate',
    description:
      'Step 7 — Reverse-score a drafted technical response against the ToR evaluation grid. Output: at-risk points per criterion (= weight × missing share), missing sub-elements verbatim, rewrite priorities. Coverage arithmetic, NOT a predicted evaluator score.',
    inputSchema: S({
      extract: P('Absolute path to tor-extract.json'),
      response: P('Absolute path to the drafted technical response (markdown)'),
      sub_elements: P('Optional absolute path to sub-elements JSON ({"criterion label": ["sub-element 1", ...]} extracted verbatim from the ToR)'),
      out: P('Optional ' + ABS_OUT),
    }, ['extract', 'response']),
    argv: (a) => ['--extract', a.extract, '--response', a.response, ...(a.sub_elements ? ['--sub-elements', a.sub_elements] : []), ...(a.out ? ['--out', a.out] : [])],
    script: 'simulator.mjs',
  },
  {
    name: 'template_filler',
    description:
      "Step 8 — Fill the CLIENT'S OWN forms. map: list fillable placeholders/labeled cells; fill: write values into a copy of the template (never alters structure, never overwrites formulas); check: exit 1 while any required field has no value ([FILL] list). data is a flat label->value map (build it from pricing.json + tor-extract.json, labels exactly as `map` reports).",
    inputSchema: S({
      command: { type: 'string', enum: ['map', 'fill', 'check'], description: 'map = list fields; fill = write values; check = verify completeness' },
      template: P('Absolute path to the client .docx or .xlsx form'),
      data: P('Absolute path to the flat JSON data map'),
      out: P('For fill: ' + ABS_OUT),
      report: P('Optional ' + ABS_OUT + ' (fill-report.md tracing every write)'),
    }, ['command', 'template', 'data']),
    argv: (a) => [a.command, '--template', a.template, '--data', a.data, ...(a.out ? ['--out', a.out] : []), ...(a.report ? ['--report', a.report] : [])],
    script: 'template-filler.mjs',
  },
  {
    name: 'audit',
    description:
      'Step 9 — Pre-submission hard-fail gate: [FILL] leftovers, compliance-matrix rows not Complete, and claim-shaped sentences with no trace ([[PAGE n]] / p.X / URL / user-input). Exit 1 = do not submit yet.',
    inputSchema: S({
      proposal: P('Absolute path to the final proposal (markdown)'),
      matrix: P('Optional absolute path to compliance-matrix.md'),
      extras: { type: 'array', items: { type: 'string' }, description: 'Optional additional files to audit (cover letter, annexes) — absolute paths' },
      report: P('Optional ' + ABS_OUT),
    }, ['proposal']),
    argv: (a) => ['--proposal', a.proposal, ...(a.matrix ? ['--matrix', a.matrix] : []),
      ...(a.extras ? [].concat(a.extras).flatMap((e) => ['--extras', e]) : []), ...(a.report ? ['--report', a.report] : [])],
    script: 'audit.mjs',
  },
];

function callTool(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `unknown tool: ${name}`, isError: true };
  let argv;
  try { argv = tool.argv(args ?? {}); } catch (e) { return { text: `bad arguments: ${e.message}`, isError: true }; }
  const r = spawnSync(process.execPath, [path.join(BIN, tool.script), ...argv.map(String)], { encoding: 'utf8' });
  const parts = [];
  if (r.stdout?.trim()) parts.push(r.stdout.trim());
  if (r.stderr?.trim()) parts.push(`— stderr —\n${r.stderr.trim()}`);
  if (r.status !== 0) parts.push(`(exit code ${r.status})`);
  return { text: parts.join('\n') || '(no output)', isError: r.status !== 0 };
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return {
      protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'tor-to-proposal', version: '1.0.0' },
    };
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return undefined;
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
  if (method === 'tools/call') {
    const r = callTool(params?.name, params?.arguments);
    return { content: [{ type: 'text', text: r.text }], ...(r.isError ? { isError: true } : {}) };
  }
  if (id !== undefined) return { error: { code: -32601, message: `method not found: ${method}` } };
  return undefined;
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }
  try {
    const result = handle(msg);
    if (result === undefined) return;
    const response = { jsonrpc: '2.0', id: msg.id, ...(result.error ? { error: result.error } : { result }) };
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (e) {
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e?.message || e) } }) + '\n');
    }
  }
});
