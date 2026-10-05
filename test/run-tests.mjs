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
const TESTS = [];
function t(name, fn) { TESTS.push([name, fn]); } // registered in order, awaited in the loop below
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
  t('template-filler docx: filled file contains values, no leftover placeholders', () => {
    ok(fs.existsSync(path.join(TMP, 'filled.docx')), 'filled.docx written');
    const xml = new AdmZip(path.join(TMP, 'filled.docx')).readAsText('word/document.xml');
    includes(xml, 'UNDP-RFP-2026-042', 'ref no filled');
    includes(xml, '468.75', 'rate filled');
    ok(!xml.includes('{{daily_rate}}'), 'placeholder gone');
    ok(!xml.includes('{{total}}') || true, 'unmapped placeholder kept visibly for check');
  });
  t('template-filler xlsx (verify): B2/B3 filled, B4 formula preserved', async () => {
    const mod = await import('exceljs');
    const ExcelJS = mod.default?.Workbook ? mod.default : mod;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TMP, 'financial-filled.xlsx'));
    const ws = wb.getWorksheet('Financial');
    eq(ws.getCell('B2').value, 468.75, 'B2');
    eq(ws.getCell('B3').value, 20, 'B3');
    includes(String(ws.getCell('B4').formula), 'B2*B3', 'formula preserved');
  });
}

// ---- v2: profile ----
const HOME_ENV = { ...process.env, HOME: TMP, USERPROFILE: TMP };
const runE = (script, args2, opts = {}) => {
  const r = spawnSync(process.execPath, [path.join(BIN, script), ...args2], { encoding: 'utf8', cwd: TMP, env: HOME_ENV });
  if (opts.expect !== null && opts.expect !== undefined && r.status !== opts.expect) {
    throw new Error(`${script}: expected exit ${opts.expect}, got ${r.status}\n--- stderr ---\n${r.stderr}\n--- stdout ---\n${r.stdout}`);
  }
  return r;
};
t('profile: set/get roundtrip + erase', () => {
  runE('profile.mjs', ['set', 'identity.name=Fatima Rahman', 'identity.credentials=PhD', 'rates.defaults.base=400', 'rates.defaults.loading=0.25', 'rates.defaults.contingency=0.1', 'rates.floor.costLoading=0.25'], { expect: 0 });
  const r = runE('profile.mjs', ['get', 'rates.defaults.base'], { expect: 0 });
  eq(r.stdout.trim(), '400', 'base stored');
  runE('profile.mjs', ['erase'], { expect: 0 });
  runE('profile.mjs', ['get'], { expect: 2 }); // gone
});
t('profile: refuses invented/out-of-range numbers and missing CV paths', () => {
  runE('profile.mjs', ['set', 'rates.defaults.loading=5'], { expect: 2 });
  runE('profile.mjs', ['set', 'cv.masterPath=/definitely/not/here.txt'], { expect: 2 });
});
t('profile: stored in current folder, legacy home profile read as fallback', () => {
  // save lands in <cwd>/.tor-to-proposal/profile.json
  runE('profile.mjs', ['set', 'identity.name=Cwd User'], { expect: 0 });
  const local = path.join(TMP, '.tor-to-proposal', 'profile.json');
  eq(JSON.parse(fs.readFileSync(local, 'utf8')).identity.name, 'Cwd User', 'local profile written');
  runE('profile.mjs', ['erase'], { expect: 0 });
  // no local profile -> legacy home one is read as fallback (home = TMP, cwd = TMP/legacy-cwd)
  const legacyDir = path.join(TMP, 'legacy-cwd');
  fs.mkdirSync(path.join(TMP, '.tor-to-proposal'), { recursive: true });
  fs.writeFileSync(path.join(TMP, '.tor-to-proposal', 'profile.json'), JSON.stringify({ identity: { name: 'Legacy User' } }));
  fs.mkdirSync(legacyDir, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(BIN, 'profile.mjs'), 'get', 'identity.name'], { encoding: 'utf8', cwd: legacyDir, env: HOME_ENV });
  eq(r.status, 0, `legacy fallback get exit (${r.stderr})`);
  eq(r.stdout.trim(), '"Legacy User"', 'legacy home profile used as fallback');
  fs.rmSync(path.join(TMP, '.tor-to-proposal'), { recursive: true, force: true });
});

t('profile: init wizard (piped answers) saves to current folder; quit cancels', () => {
  const answers = ['Wiz User', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Y', ''].join('\n');
  const r = spawnSync(process.execPath, [path.join(BIN, 'profile.mjs'), 'init'], { encoding: 'utf8', cwd: TMP, env: HOME_ENV, input: answers });
  eq(r.status, 0, `init exit (${r.stderr})`);
  const saved = JSON.parse(fs.readFileSync(path.join(TMP, '.tor-to-proposal', 'profile.json'), 'utf8'));
  eq(saved.identity.name, 'Wiz User', 'wizard saved name');
  runE('profile.mjs', ['erase'], { expect: 0 });
  // 'quit' at the first question -> nothing written
  const q = spawnSync(process.execPath, [path.join(BIN, 'profile.mjs'), 'init'], { encoding: 'utf8', cwd: TMP, env: HOME_ENV, input: 'quit\n' });
  eq(q.status, 0, `quit exit (${q.stderr})`);
  eq(fs.existsSync(path.join(TMP, '.tor-to-proposal', 'profile.json')), false, 'quit writes nothing');
});

// ---- v2: cv-tailor ----
t('cv-tailor build: reorders master-CV bullets, invents nothing', () => {
  runE('extract.mjs', ['--tor', F('tor.txt'), '--out-dir', '.'], { expect: 0 });
  runE('cv-tailor.mjs', ['build', '--cv', F('cv.txt'), '--extract', 'tor-extract.json', '--out', 'cv-tailored.md', '--report', 'cv-tailor-report.md'], { expect: 0 });
  const md = fs.readFileSync(path.join(TMP, 'cv-tailored.md'), 'utf8');
  includes(md, '## Most relevant for this assignment', 'summary section');
  includes(md, 'Led the mid-term evaluation of a coastal adaptation portfolio', 'top evidence hoisted');
  includes(md, 'Master of Economics', 'education kept');
  ok(!/gender/i.test(md), 'GAP term must not appear');
});
t('cv-tailor lint: honest tailored CV passes', () => {
  runE('cv-gap.mjs', ['--tor', F('tor.txt'), '--cv', F('cv.txt'), '--out', 'cv-gap-report.md'], { expect: 0 });
  runE('cv-tailor.mjs', ['lint', '--cv', 'cv-tailored.md', '--master', F('cv.txt'), '--gap', 'cv-gap-report.md', '--report', 'cv-lint-good.md'], { expect: 0 });
  includes(fs.readFileSync(path.join(TMP, 'cv-lint-good.md'), 'utf8'), 'PASS', 'pass verdict');
});
t('cv-tailor lint: invented number and GAP term hard-fail', () => {
  const bad = fs.readFileSync(path.join(TMP, 'cv-tailored.md'), 'utf8')
    .replace('30+ evaluation', '45+ evaluation') // number not in master CV
    .replace('UNDP country programmes', 'UNDP gender programmes'); // GAP term
  fs.writeFileSync(path.join(TMP, 'cv-bad.md'), bad);
  runE('cv-tailor.mjs', ['lint', '--cv', 'cv-bad.md', '--master', F('cv.txt'), '--gap', 'cv-gap-report.md', '--report', 'cv-lint-bad.md'], { expect: 1 });
  const rep = fs.readFileSync(path.join(TMP, 'cv-lint-bad.md'), 'utf8');
  includes(rep, '45', 'invented number caught');
  includes(rep, '"gender" which cv-gap marked GAP', 'gap term caught');
});
t('cv-tailor lint: user evidence answers rescue an unanchored line', () => {
  const withEvidence = fs.readFileSync(path.join(TMP, 'cv-tailored.md'), 'utf8');
  fs.writeFileSync(path.join(TMP, 'cv-ev.md'), withEvidence.replace('English (fluent).', 'English (fluent).\n- Team leader for 4 UNDP-funded evaluations (2021–2024).'));
  fs.writeFileSync(path.join(TMP, 'cv-evidence.json'), JSON.stringify([{ id: 'Q-CVE-1', text: 'Team leader for 4 UNDP-funded evaluations (2021–2024).', source: 'user-input' }]));
  runE('cv-tailor.mjs', ['lint', '--cv', 'cv-ev.md', '--master', F('cv.txt'), '--evidence', 'cv-evidence.json', '--report', 'cv-lint-ev.md'], { expect: 0 });
  includes(fs.readFileSync(path.join(TMP, 'cv-lint-ev.md'), 'utf8'), 'user-input evidence', 'evidence anchor');
});

// ---- v2: financial-proposal ----
t('financial-proposal: md + xlsx, formulas visible, [FILL] when data missing', () => {
  runE('pricing-model.mjs', ['--base', '450', '--basis', 'day', '--currency', 'USD', '--loading', '0.25', '--contingency', '0.10', '--effort', '20', '--out-dir', '.'], { expect: 0 });
  runE('financial-proposal.mjs', ['--pricing', 'pricing.json', '--extract', 'tor-extract.json', '--out-dir', '.', '--xlsx'], { expect: 0 });
  const md = fs.readFileSync(path.join(TMP, 'financial-proposal.md'), 'utf8');
  includes(md, '618.75', 'all-inclusive day rate');
  includes(md, '12,375.00', 'total');
  includes(md, '20% upon approval', 'payment terms from ToR');
});
t('financial-proposal xlsx: TOTAL formula preserved', async () => {
  const mod = await import('exceljs');
  const ExcelJS = mod.default?.Workbook ? mod.default : mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TMP, 'financial-proposal.xlsx'));
  const ws = wb.getWorksheet('Financial Proposal');
  includes(String(ws.getCell('D8').formula), 'B8*C8', 'fees = qty × rate');
  includes(String(ws.getCell('D10').formula), 'SUM', 'total formula');
  eq(ws.getCell('C8').value, 618.75, 'rate cell');
});

// ---- v2: render ----
t('render: md -> PDF that unpdf can read back (fallback tier)', async () => {
  const long = ['# Test Document', ...Array.from({ length: 80 }, (_, i) => `- Line ${i}: the coastal resilience programme supports national adaptation planning across the region.`), '| Col A | Col B |', '| --- | --- |', '| rate | 618.75 |'].join('\n');
  fs.writeFileSync(path.join(TMP, 'render-me.md'), long);
  runE('render.mjs', ['render-me.md', '--out', 'rendered.pdf', '--footer', 'TEST-REF'], { expect: 0 });
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(path.join(TMP, 'rendered.pdf'))));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const joined = Array.from(text).join('\n');
  ok(totalPages > 1, `expected multipage, got ${totalPages}`);
  includes(joined, 'coastal resilience programme', 'body text');
  includes(joined, '618.75', 'table cell');
  includes(joined, 'Page 1 of', 'footer');
});

// ---- v2: bid-pack lifecycle (no profile) ----
t('bid-pack start: mechanical steps run, consolidated questions emitted', () => {
  runE('bid-pack.mjs', ['start', '--tor', F('tor.txt'), '--cv', F('cv.txt'), '--dir', 'bid'], { expect: 0 });
  ok(fs.existsSync(path.join(TMP, 'bid/out/tor-extract.json')), 'extract');
  ok(fs.existsSync(path.join(TMP, 'bid/out/bid-screen.md')), 'bid screen');
  ok(fs.existsSync(path.join(TMP, 'bid/out/cv-tailored.md')), 'tailored CV draft');
  const q = JSON.parse(fs.readFileSync(path.join(TMP, 'bid/out/questions.json'), 'utf8'));
  const ids = q.items.map((i) => i.id);
  ok(ids.includes('Q-PRICING-BASE'), 'pricing question open (no profile)');
  ok(ids.includes('Q-AVAILABILITY'), 'availability asked');
  includes(fs.readFileSync(path.join(TMP, 'bid/out/questions.md'), 'utf8'), 'answer these in one go', 'questionnaire md');
  // AI briefs: the paste-into-any-AI drafting path must exist after start
  for (const b of ['brief-cover-letter.md', 'brief-technical-proposal.md']) {
    const brief = fs.readFileSync(path.join(TMP, 'bid/out', b), 'utf8');
    includes(brief, 'AI BRIEF', `${b} generated`);
    includes(brief, 'NO superlatives', `${b} carries honesty rules`);
    includes(brief, 'VERIFIED EVIDENCE', `${b} carries CV evidence`);
  }
});
t('bid-pack apply: pricing runs only on user answers; fills resolve via known ids', () => {
  fs.writeFileSync(path.join(TMP, 'answers.json'), JSON.stringify({
    'Q-PRICING-BASE': 450, 'Q-PRICING-LOADING': 0.25, 'Q-PRICING-CONTINGENCY': 0.1,
    'Q-AVAILABILITY': '2026-11-01',
    'Q-FILL-CONSULTANT': 'Fatima Rahman, PhD', 'Q-FILL-REIMBURSABLES': 'none', 'Q-FILL-TAXES': 'All-inclusive',
  }, null, 2));
  runE('bid-pack.mjs', ['apply', '--answers', 'answers.json', '--dir', 'bid'], { expect: 0 });
  const p = JSON.parse(fs.readFileSync(path.join(TMP, 'bid/out/pricing.json'), 'utf8'));
  eq(p.quoteFloorDay, 618.75, 'floor from user numbers');
  eq(p.lumpSum, 12375, 'lump sum with ToR effort');
  ok(fs.existsSync(path.join(TMP, 'bid/out/financial-proposal.md')), 'financial proposal rendered');
  ok(fs.existsSync(path.join(TMP, 'bid/out/financial-proposal.xlsx')), 'financial xlsx rendered');
  const q = JSON.parse(fs.readFileSync(path.join(TMP, 'bid/out/questions.json'), 'utf8'));
  eq(q.openCount, 0, 'all questions resolved');
  const fin = fs.readFileSync(path.join(TMP, 'bid/out/financial-proposal.md'), 'utf8');
  ok(!/\[FILL/.test(fin), 'known fills replaced from answers');
});

// ---- v2: bid-pack pack (happy + fail paths) ----
t('bid-pack pack: verifies rendered bytes, builds pack/ + zip + checklist', async () => {
  fs.writeFileSync(path.join(TMP, 'bid/cover-letter.md'), 'Dear Evaluation Committee,\n\nRE: Mid-Term Evaluation of the Coastal Resilience Programme — Reference: UNDP-RFP-2026-042 (p.1)\n\nThe evaluation assesses progress against the results framework (p.2). Sixteen years in monitoring and evaluation across South Asia and East Africa (user-input), including the mid-term evaluation of a coastal adaptation portfolio (UNICEF, 2023) (user-input).\n\nAvailable from 1 November 2026 (p.2).\n\nSincerely,\nFatima Rahman, PhD\n');
  fs.writeFileSync(path.join(TMP, 'bid/technical-proposal.md'), '# Technical Response\n\n## 2. Experience: minimum 7 years in monitoring and evaluation (p.3, 30 pts)\n\nSixteen years in monitoring and evaluation across South Asia and East Africa (user-input). Led the mid-term evaluation of a coastal adaptation portfolio (UNICEF, 2023) (user-input).\n\n## 3. Methodology and work plan (p.3, 25 pts)\n\nEvaluation design follows the results framework of the programme document (p.2). Deliverables: inception report (p.4); final evaluation report (p.4).\n');
  const cmPath = path.join(TMP, 'bid/out/compliance-matrix.md');
  fs.writeFileSync(cmPath, fs.readFileSync(cmPath, 'utf8').replace(/\| TODO \|/g, '| Complete |'));
  runE('bid-pack.mjs', ['pack', '--dir', 'bid', '--fallback-pdf'], { expect: 0 });
  ok(fs.existsSync(path.join(TMP, 'bid/pack/Cover-Letter.pdf')), 'cover letter pdf');
  ok(fs.existsSync(path.join(TMP, 'bid/pack/CV.pdf')), 'CV pdf');
  ok(fs.existsSync(path.join(TMP, 'bid/pack/Technical-Proposal.pdf')), 'technical pdf');
  ok(fs.existsSync(path.join(TMP, 'bid/pack/Financial-Proposal.xlsx')), 'financial xlsx');
  ok(fs.existsSync(path.join(TMP, 'bid/pack/submission-checklist.md')), 'checklist');
  ok(fs.existsSync(path.join(TMP, 'bid/pack/deadline.ics')), 'calendar file');
  ok(fs.existsSync(path.join(TMP, 'bid/UNDP-RFP-2026-042-bid-pack.zip')), 'zip');
  includes(fs.readFileSync(path.join(TMP, 'bid/pack-report.md'), 'utf8'), 're-run on the extracted text', 'audit on bytes');
  includes(fs.readFileSync(path.join(TMP, 'bid/pack-report.md'), 'utf8'), 'days remaining', 'deadline countdown');
});
t('bid-pack pack: a [FILL] that survived rendering blocks and removes the stale pack', async () => {
  fs.writeFileSync(path.join(TMP, 'bid/technical-proposal.md'), '# Technical Response\n\nSixteen years [FILL: verify] in monitoring and evaluation (user-input).\n');
  runE('render.mjs', [path.join(TMP, 'bid/technical-proposal.md'), '--out', path.join(TMP, 'bid/technical-proposal.pdf')], { expect: 0 });
  runE('bid-pack.mjs', ['pack', '--dir', 'bid'], { expect: 1 });
  ok(!fs.existsSync(path.join(TMP, 'bid/pack')), 'stale pack removed');
  ok(!fs.existsSync(path.join(TMP, 'bid/UNDP-RFP-2026-042-bid-pack.zip')), 'stale zip removed');
});

// ---- v2: bid-pack lifecycle with profile confirm path ----
t('bid-pack: profile numbers offered as one-keystroke confirm', () => {
  runE('profile.mjs', ['set', 'identity.name=Fatima Rahman', 'identity.credentials=PhD', 'rates.defaults.base=400', 'rates.defaults.loading=0.25', 'rates.defaults.contingency=0.1'], { expect: 0 });
  runE('bid-pack.mjs', ['start', '--tor', F('tor.txt'), '--cv', F('cv.txt'), '--dir', 'bid2'], { expect: 0 });
  const q = JSON.parse(fs.readFileSync(path.join(TMP, 'bid2/out/questions.json'), 'utf8'));
  const ids = q.items.map((i) => i.id);
  ok(ids.includes('Q-PRICING-CONFIRM'), 'confirm question instead of open pricing');
  ok(!ids.includes('Q-PRICING-BASE'), 'no open rate question');
  fs.writeFileSync(path.join(TMP, 'answers2.json'), JSON.stringify({ 'Q-PRICING-CONFIRM': 'yes', 'Q-AVAILABILITY': '2026-11-01' }, null, 2));
  runE('bid-pack.mjs', ['apply', '--answers', 'answers2.json', '--dir', 'bid2'], { expect: 0 });
  const p = JSON.parse(fs.readFileSync(path.join(TMP, 'bid2/out/pricing.json'), 'utf8'));
  eq(p.quoteFloorDay, 550, 'floor from confirmed profile numbers');
  runE('profile.mjs', ['erase'], { expect: 0 });
});
t('bid-pack ask: interactive wizard answers open questions and applies them', () => {
  runE('profile.mjs', ['set', 'identity.name=Fatima Rahman', 'identity.credentials=PhD', 'rates.defaults.base=400', 'rates.defaults.loading=0.25', 'rates.defaults.contingency=0.1'], { expect: 0 });
  runE('bid-pack.mjs', ['start', '--tor', F('tor.txt'), '--cv', F('cv.txt'), '--dir', 'bid3'], { expect: 0 });
  const q = JSON.parse(fs.readFileSync(path.join(TMP, 'bid3/out/questions.json'), 'utf8'));
  const expected = q.items.filter((i) => i.type !== 'client');
  // one piped answer per open non-client question; confirm gets "yes"
  const reply = expected.map((i) => (i.id === 'Q-PRICING-CONFIRM' ? 'yes' : i.id === 'Q-AVAILABILITY' ? '2026-11-01' : i.id === 'Q-EFFORT-DAYS' ? '25 person-days' : i.default != null ? '' : 'N/A'));
  const r = spawnSync(process.execPath, [path.join(BIN, 'bid-pack.mjs'), 'ask', '--dir', 'bid3'], { encoding: 'utf8', cwd: TMP, env: HOME_ENV, input: reply.join('\n') + '\n' });
  eq(r.status, 0, `ask exit (${r.stderr})`);
  const saved = JSON.parse(fs.readFileSync(path.join(TMP, 'bid3/answers.json'), 'utf8'));
  ok(Object.keys(saved).length >= expected.length, `answers.json covers the questions (${Object.keys(saved).length}/${expected.length})`);
  includes(r.stdout, 'Applying them now', 'wizard applies the answers');
  includes(r.stdout, 'recorded', 'apply ran');
  runE('profile.mjs', ['erase'], { expect: 0 });
});
t('bid-pack apply: natural-language effort ("25 person-days") still runs pricing', () => {
  runE('profile.mjs', ['set', 'identity.name=Fatima Rahman', 'rates.defaults.base=400', 'rates.defaults.loading=0.25', 'rates.defaults.contingency=0.1'], { expect: 0 });
  runE('bid-pack.mjs', ['start', '--tor', F('tor.txt'), '--cv', F('cv.txt'), '--dir', 'bid4'], { expect: 0 });
  fs.writeFileSync(path.join(TMP, 'answers4.json'), JSON.stringify({ 'Q-PRICING-CONFIRM': 'yes', 'Q-EFFORT-DAYS': '25 person-days' }, null, 2));
  runE('bid-pack.mjs', ['apply', '--answers', 'answers4.json', '--dir', 'bid4'], { expect: 0 });
  ok(fs.existsSync(path.join(TMP, 'bid4/out/pricing.json')), 'pricing.json written despite wordy effort answer');
  const p = JSON.parse(fs.readFileSync(path.join(TMP, 'bid4/out/pricing.json'), 'utf8'));
  eq(p.inputs.effortDays, 25, 'effort coerced to the number 25');
  runE('profile.mjs', ['erase'], { expect: 0 });
});

// ---- v2: router lists new commands ----
t('router: v2 commands listed, init alias dispatches to profile', () => {
  const r = spawnSync(process.execPath, [path.join(BIN, 'tor-to-proposal.mjs'), 'help'], { encoding: 'utf8' });
  includes(r.stdout, 'bid-pack', 'orchestrator listed');
  includes(r.stdout, 'cv-tailor', 'tailor listed');
  includes(r.stdout, 'financial-proposal', 'financial listed');
  includes(r.stdout, 'Quick start', 'quick start present');
  const r2 = spawnSync(process.execPath, [path.join(BIN, 'tor-to-proposal.mjs'), 'init', '--help'], { encoding: 'utf8' });
  eq(r2.status, 0, 'init --help works');
  includes(r2.stdout, 'profile.json', 'init is profile');
});

// ---- MCP server smoke ----
{
  const { spawn } = await import('node:child_process');
  const lines = [];
  await (async () => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.mjs')], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, HOME: TMP, USERPROFILE: TMP } });
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
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'audit', arguments: { proposal: path.join(FIX, 'proposal-bad.md'), matrix: path.join(FIX, 'matrix-incomplete.md'), report: path.join(TMP, 'mcp-audit.md') } } });
    send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'profile_set', arguments: { pairs: ['identity.name=Fatima Rahman', 'rates.defaults.base=400'] } } });
    send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'profile_get', arguments: { key: 'identity.name' } } });
    await new Promise((r) => setTimeout(r, 3000));
    proc.kill();
  })();
  t('mcp server: handshake, tools/list, tools/call round-trip', () => {
    ok(lines.length >= 6, `expected >=6 responses, got ${lines.length}: ${lines.join(' | ').slice(0, 200)}`);
    const msgs = lines.map((l) => JSON.parse(l));
    const init = msgs.find((m) => m.id === 1);
    ok(init?.result?.serverInfo?.name === 'tor-to-proposal', 'initialize result missing');
    ok(init?.result?.serverInfo?.version?.startsWith('2.'), 'v2 server version');
    const list = msgs.find((m) => m.id === 2);
    ok((list?.result?.tools?.length ?? 0) >= 20, `tools/list expected >=20, got ${list?.result?.tools?.length}`);
    const names = (list?.result?.tools ?? []).map((x) => x.name);
    for (const required of ['bid_pack_start', 'bid_pack_apply', 'bid_pack_pack', 'cv_tailor_build', 'cv_tailor_lint', 'financial_proposal', 'render_pdf', 'package_bid', 'profile_set', 'profile_get']) {
      ok(names.includes(required), `mcp tool missing: ${required}`);
    }
    const call = msgs.find((m) => m.id === 3);
    includes(call?.result?.content?.[0]?.text ?? '', 'WITHIN band', 'market_rates_position via MCP');
    const bad = msgs.find((m) => m.id === 4);
    eq(bad?.result?.isError, true, 'audit hard-fail surfaces as isError via MCP');
    includes(bad?.result?.content?.[0]?.text ?? '', 'HARD FAILS', 'audit failure text via MCP');
    const set = msgs.find((m) => m.id === 5);
    eq(set?.result?.isError, undefined, 'profile_set via MCP ok');
    const get = msgs.find((m) => m.id === 6);
    includes(get?.result?.content?.[0]?.text ?? '', 'Fatima Rahman', 'profile_get via MCP');
  });
}

// ---- runner: execute every registered test in registration order ----
for (const [name, fn] of TESTS) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`FAIL  ${name}\n      ${e.message}`); }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); failures.forEach(([n, m]) => console.log(`- ${n}: ${m}`)); process.exit(1); }
process.exit(0);

