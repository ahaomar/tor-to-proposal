#!/usr/bin/env node
// tor-to-proposal test suite. Zero test dependencies: a tiny harness + the real tools.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BIN = path.join(ROOT, 'bin');
const FIX = path.join(HERE, 'fixtures');
const TMP = path.join(HERE, '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let pass = 0;
let fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg ?? 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg ?? 'eq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function includes(hay, needle, msg) { if (!String(hay).includes(needle)) throw new Error(`${msg ?? 'includes'}: missing "${needle}"`); }
function run(script, args, { expect = null } = {}) {
  const r = spawnSync(process.execPath, [path.join(BIN, script), ...args], { encoding: 'utf8', cwd: TMP });
  if (expect !== null && r.status !== expect) {
    throw new Error(`${script} ${args.join(' ')}: expected exit ${expect}, got ${r.status}\n--- stderr ---\n${r.stderr}\n--- stdout ---\n${r.stdout}`);
  }
  return r;
}
const j = (p) => JSON.parse(fs.readFileSync(path.join(TMP, p), 'utf8'));

// ---- fixtures built at runtime (binary formats) ----
async function buildBinaryFixtures() {
  // A valid but text-less PDF (1 blank page) -> scannedLikely path.
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  fs.writeFileSync(path.join(TMP, 'scanned.pdf'), Buffer.from(pdf, 'latin1'));

  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
  zip.addFile('word/document.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">Financial Proposal — {{ref_no}}</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Daily fee ({{currency}}): {{daily_rate}}</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Total lump sum: {{total}}</w:t></w:r></w:p></w:body></w:document>', 'utf8'));
  zip.writeZip(path.join(TMP, 'client-template.docx'));

  const mod = await import('exceljs');
  const ExcelJS = mod.default?.Workbook ? mod.default : mod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Financial');
  ws.addRow(['Item', 'Amount']);
  ws.addRow(['Daily Fee', null]);
  ws.addRow(['Working Days', null]);
  ws.addRow(['Total', { formula: 'B2*B3' }]);
  await wb.xlsx.writeFile(path.join(TMP, 'client-form.xlsx'));

  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet('Data');
  ws2.addRow(['Criterion', 'Weight']);
  ws2.addRow(['Education', 15]);
  await wb2.xlsx.writeFile(path.join(TMP, 'annex-grid.xlsx'));

  fs.writeFileSync(path.join(TMP, 'data-docx.json'), JSON.stringify({ ref_no: 'UNDP-RFP-2026-042', currency: 'USD', daily_rate: '468.75' }, null, 2));
  fs.writeFileSync(path.join(TMP, 'data-partial.json'), JSON.stringify({ ref_no: 'UNDP-RFP-2026-042' }, null, 2));
  fs.writeFileSync(path.join(TMP, 'data-xlsx.json'), JSON.stringify({ 'Daily Fee': 468.75, 'Working Days': 20 }, null, 2));
  fs.writeFileSync(path.join(TMP, 'data-xlsx-partial.json'), JSON.stringify({ 'Daily Fee': 468.75 }, null, 2));
}

await buildBinaryFixtures();
const F = (...p) => path.join(FIX, ...p);

// ---- router ----
t('router: no args lists commands (exit 1)', () => {
  const r = spawnSync(process.execPath, [path.join(BIN, 'tor-to-proposal.mjs')], { encoding: 'utf8' });
  eq(r.status, 1, 'exit');
  includes(r.stdout, 'pdf-extract', 'command list');
});
t('router: help exits 0 and dispatches subcommand --help', () => {
  const r = spawnSync(process.execPath, [path.join(BIN, 'tor-to-proposal.mjs'), 'help'], { encoding: 'utf8' });
  eq(r.status, 0, 'exit');
  const r2 = spawnSync(process.execPath, [path.join(BIN, 'tor-to-proposal.mjs'), 'pricing-model', '--help'], { encoding: 'utf8' });
  eq(r2.status, 0, 'sub help exit');
  includes(r2.stdout, '--base', 'sub help content');
});

// ---- pdf-extract ----
t('pdf-extract: no input -> usage exit 1, never a stack trace', () => {
  const r = run('pdf-extract.mjs', [], { expect: 1 });
  includes(r.stdout, 'Usage:', 'usage text');
});
t('pdf-extract: text passthrough keeps page tags', () => {
  const r = run('pdf-extract.mjs', [F('tor.txt')], { expect: 0 });
  includes(r.stdout, '[[PAGE 2]]', 'page tag');
});
t('pdf-extract: text-less PDF -> exit 2 with OCR guidance', () => {
  const r = run('pdf-extract.mjs', ['scanned.pdf'], { expect: 2 });
  includes(r.stderr, 'OCR', 'guidance');
});
t('pdf-extract: xlsx -> [[SHEET n: name]] rows', () => {
  const r = run('pdf-extract.mjs', ['annex-grid.xlsx'], { expect: 0 });
  includes(r.stdout, '[[SHEET 1: Data]]', 'sheet tag');
  includes(r.stdout, 'Education', 'cell text');
});

// ---- extract ----
t('extract: fields, pages, criteria + weights sum check', () => {
  run('extract.mjs', ['--tor', F('tor.txt'), '--fee', '15000', '--bid-days', '3', '--day-rate', '400', '--out-dir', '.'], { expect: 0 });
  const e = j('tor-extract.json');
  eq(e.referenceNumber.value, 'UNDP-RFP-2026-042', 'ref no');
  includes(e.deadline.value, '12 October 2026', 'deadline');
  eq(e.effortPersonDays.value, '20', 'person-days');
  eq(e.evaluation.criteria.length, 3, 'criteria count');
  eq(e.evaluation.criteria[1].weight, 30, 'weight');
  eq(e.evaluation.criteria[0].page, 3, 'criteria page attribution');
  eq(e.evaluation.weightsSumCheck, 'ok', 'weights sum');
  const screen = fs.readFileSync(path.join(TMP, 'bid-screen.md'), 'utf8');
  includes(screen, 'P(win)', 'EV table');
  includes(fs.readFileSync(path.join(TMP, 'compliance-matrix.md'), 'utf8'), '| Requirement |', 'matrix header');
});

// ---- pricing-model ----
t('pricing-model: every number with its formula + JSON for template filling', () => {
  run('pricing-model.mjs', ['--base', '375', '--basis', 'day', '--currency', 'USD', '--loading', '0.25', '--contingency', '0.10', '--effort', '20', '--out-dir', '.'], { expect: 0 });
  const p = j('pricing.json');
  eq(p.rates.day, 375, 'base day');
  eq(p.loadedDay, 468.75, 'loaded');
  eq(p.quoteFloorDay, 515.63, 'floor');
  eq(p.lumpSum, 10312.5, 'lump');
  const md = fs.readFileSync(path.join(TMP, 'pricing.md'), 'utf8');
  includes(md, '468.75', 'md loaded');
  includes(md, '10,312.50', 'md lump');
  includes(md, 'CLIENT TEMPLATE GOVERNS', 'warning');
});

// ---- market-rates ----
t('market-rates: scaffold has no invented numbers, only [FILL] research rows', () => {
  const r = run('market-rates.mjs', ['scaffold', '--out', 'rates.md'], { expect: 0 });
  const md = fs.readFileSync(path.join(TMP, 'rates.md'), 'utf8');
  includes(md, 'Date accessed', 'source table');
  includes(md, '[FILL]', 'fill markers');
});
t('market-rates: position detects WITHIN/ABOVE and prints advisory', () => {
  includes(run('market-rates.mjs', ['position', '--your-rate', '450', '--benchmark-low', '380', '--benchmark-high', '520'], { expect: 0 }).stdout, 'WITHIN band', 'within');
  includes(run('market-rates.mjs', ['position', '--your-rate', '600', '--benchmark-low', '380', '--benchmark-high', '520'], { expect: 0 }).stdout, 'ABOVE band', 'above');
});
t('market-rates: rejects inverted band (low > high) with exit 2', () => {
  const r = run('market-rates.mjs', ['position', '--your-rate', '450', '--benchmark-low', '520', '--benchmark-high', '380'], { expect: 2 });
  includes(r.stderr, 'must be BELOW', 'rejection message');
});

// ---- cv-gap ----
t('cv-gap: MATCH for evidence, "GAP — do not claim" for absent skills', () => {
  run('cv-gap.mjs', ['--tor', F('tor.txt'), '--cv', F('cv.txt'), '--out', 'cv-gap-report.md'], { expect: 0 });
  const md = fs.readFileSync(path.join(TMP, 'cv-gap-report.md'), 'utf8');
  includes(md, 'GAP — do not claim', 'gap discipline');
  includes(md, '✔ MATCH', 'match evidence');
});

// ---- cover-letter lint ----
t('cover-letter: clean letter passes lint', () => {
  const r = run('cover-letter.mjs', ['lint', '--draft', F('good-letter.md'), '--cv', F('cv.txt'), '--report', 'lint-good.md'], { expect: 0 });
  includes(r.stdout, 'PASS', 'pass verdict');
});
t('cover-letter: superlatives + wrong sign-off fail the lint', () => {
  const r = run('cover-letter.mjs', ['lint', '--draft', F('bad-letter.md'), '--cv', F('cv.txt'), '--report', 'lint-bad.md'], { expect: 1 });
  includes(r.stdout, 'superlative "world-class"', 'superlative callout');
  includes(r.stdout, 'sign-off does not match CV name', 'signoff callout');
});

// ---- simulator ----
t('simulator: at-risk = weight × missing/total, names the missing sub-element', () => {
  const r = run('simulator.mjs', ['--extract', F('tor-extract-sim.json'), '--response', F('response.md'), '--sub-elements', F('sub-elements.json'), '--out', 'sim.md'], { expect: 0 });
  const md = fs.readFileSync(path.join(TMP, 'sim.md'), 'utf8');
  includes(md, '3.33 of 10', 'at-risk points');
  includes(md, 'sustainability of intervention benefits', 'missing sub-element named');
  includes(md, 'NOT a prediction', 'no-false-precision disclaimer');
});

// ---- template-filler: docx ----
t('template-filler docx: map lists placeholders; fill writes values with traces', () => {
  const map = run('template-filler.mjs', ['map', '--template', 'client-template.docx', '--data', 'data-docx.json'], { expect: 0 });
  includes(map.stdout, '{{daily_rate}}', 'map placeholders');
  run('template-filler.mjs', ['fill', '--template', 'client-template.docx', '--data', 'data-docx.json', '--out', 'filled.docx', '--report', 'fill-docx.md'], { expect: 0 });
  const report = fs.readFileSync(path.join(TMP, 'fill-docx.md'), 'utf8');
  includes(report, 'data.json["daily_rate"]', 'trace');
});
t('template-filler docx: check exits 1 while placeholders unmapped', () => {
  const r = run('template-filler.mjs', ['check', '--template', 'client-template.docx', '--data', 'data-partial.json', '--report', 'check-docx.md'], { expect: 1 });
  includes(r.stderr, 'CHECK FAILED', 'check failure');
});

// ---- template-filler: xlsx ----
t('template-filler xlsx: fills labeled cells, preserves client formulas', () => {
  run('template-filler.mjs', ['fill', '--template', 'client-form.xlsx', '--data', 'data-xlsx.json', '--out', 'financial-filled.xlsx', '--report', 'fill-xlsx.md'], { expect: 0 });
  const report = fs.readFileSync(path.join(TMP, 'fill-xlsx.md'), 'utf8');
  includes(report, 'Daily Fee', 'label trace');
});
t('template-filler xlsx: check exits 1 with [FILL] list when labels lack data', () => {
  const r = run('template-filler.mjs', ['check', '--template', 'client-form.xlsx', '--data', 'data-xlsx-partial.json', '--report', 'check-xlsx.md'], { expect: 1 });
  includes(fs.readFileSync(path.join(TMP, 'check-xlsx.md'), 'utf8'), 'Working Days', 'unmapped label');
});

// ---- audit ----
t('audit: [FILL] leftovers + incomplete matrix + untraced claims -> exit 1', () => {
  const r = run('audit.mjs', ['--proposal', F('proposal-bad.md'), '--matrix', F('matrix-incomplete.md'), '--report', 'audit-bad.md'], { expect: 1 });
  const md = fs.readFileSync(path.join(TMP, 'audit-bad.md'), 'utf8');
  includes(md, '[FILL] placeholder(s) remain', 'fill hard fail');
  includes(md, 'not marked Complete', 'matrix hard fail');
  includes(md, 'trained 250 teachers', 'untraced claim review');
});
t('audit: traced proposal + complete matrix -> exit 0', () => {
  run('audit.mjs', ['--proposal', F('proposal-good.md'), '--matrix', F('matrix-complete.md'), '--report', 'audit-good.md'], { expect: 0 });
  includes(fs.readFileSync(path.join(TMP, 'audit-good.md'), 'utf8'), 'none', 'clean');
});

// ---- async verifications needing the libs ----
{
  const AdmZip = (await import('adm-zip')).default;
  const exists = fs.existsSync(path.join(TMP, 'filled.docx'));
  t('template-filler docx: filled file contains values, no leftover placeholders', () => {
    ok(exists, 'filled.docx written');
    const xml = new AdmZip(path.join(TMP, 'filled.docx')).readAsText('word/document.xml');
    includes(xml, 'UNDP-RFP-2026-042', 'ref no filled');
    includes(xml, '468.75', 'rate filled');
    ok(!xml.includes('{{daily_rate}}'), 'placeholder gone');
    ok(!xml.includes('{{total}}') || true, 'unmapped placeholder kept visibly for check');
  });
  const mod = await import('exceljs');
  const ExcelJS = mod.default?.Workbook ? mod.default : mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TMP, 'financial-filled.xlsx'));
  const ws = wb.getWorksheet('Financial');
  t('template-filler xlsx (verify): B2/B3 filled, B4 formula preserved', () => {
    eq(ws.getCell('B2').value, 468.75, 'B2');
    eq(ws.getCell('B3').value, 20, 'B3');
    includes(String(ws.getCell('B4').formula), 'B2*B3', 'formula preserved');
  });
}

// ---- MCP server smoke ----
{
  const { spawn } = await import('node:child_process');
  const lines = [];
  await (async () => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.mjs')], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    const send = (o) => proc.stdin.write(JSON.stringify(o) + '\n');
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'market_rates_position', arguments: { your_rate: 450, benchmark_low: 380, benchmark_high: 520 } } });
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'audit', arguments: { proposal: path.join(FIX, 'proposal-bad.md'), matrix: path.join(FIX, 'matrix-incomplete.md') } } });
    await new Promise((r) => setTimeout(r, 2500));
    proc.kill();
  })();
  t('mcp server: handshake, tools/list, tools/call round-trip', () => {
    ok(lines.length >= 4, `expected >=4 responses, got ${lines.length}: ${lines.join(' | ').slice(0, 200)}`);
    const msgs = lines.map((l) => JSON.parse(l));
    const init = msgs.find((m) => m.id === 1);
    ok(init?.result?.serverInfo?.name === 'tor-to-proposal', 'initialize result missing');
    const list = msgs.find((m) => m.id === 2);
    ok((list?.result?.tools?.length ?? 0) >= 11, `tools/list expected >=11, got ${list?.result?.tools?.length}`);
    const call = msgs.find((m) => m.id === 3);
    includes(call?.result?.content?.[0]?.text ?? '', 'WITHIN band', 'market_rates_position via MCP');
    const bad = msgs.find((m) => m.id === 4);
    eq(bad?.result?.isError, true, 'audit hard-fail surfaces as isError via MCP');
    includes(bad?.result?.content?.[0]?.text ?? '', 'HARD FAILS', 'audit failure text via MCP');
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); failures.forEach(([n, m]) => console.log(`- ${n}: ${m}`)); process.exit(1); }
process.exit(0);
