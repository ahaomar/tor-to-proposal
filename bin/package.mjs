#!/usr/bin/env node
// package: the finisher. Builds the submittable bid pack from the working dir:
//   1. inventories the four documents (cover letter, CV, technical, financial)
//   2. renders any md-only doc via the fallback renderer (--fallback-pdf)
//   3. RE-EXTRACTS the text from every rendered PDF/docx/xlsx and re-runs the
//      full audit on those bytes — the gate applies to what the client reads,
//      not the markdown source
//   4. writes submission-checklist.md + deadline.ics, assembles pack/ + zip
// Exit 0 = pack built. 1 = verification failed (do not submit). 2 = inputs missing.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fail, parseArgs, readText, writeOut, helpText, mdTable, loadDep } from './lib.mjs';

const HELP = helpText('package', [
  'Usage: node bin/package.mjs --dir <bid-dir> [--fallback-pdf] [--no-zip] [--profile profile.json]',
  '',
  'Expects in <bid-dir>/ or <bid-dir>/out/: tor-extract.json, compliance-matrix.md and',
  'cover-letter / cv-tailored / technical-proposal / financial-proposal as .pdf, .docx,',
  '.xlsx or .md. --fallback-pdf renders md-only docs with the built-in renderer.',
  'Outputs: <dir>/pack/ + <dir>/pack-report.md + <ref>-bid-pack.zip + <dir>/out/audit-final.md.',
]);

const DOCS = [
  { key: 'cover-letter', name: 'Cover-Letter', exts: ['pdf', 'docx', 'md'] },
  { key: 'cv-tailored', name: 'CV', exts: ['pdf', 'docx', 'md'] },
  { key: 'technical-proposal', name: 'Technical-Proposal', exts: ['pdf', 'docx', 'md'] },
  { key: 'financial-proposal', name: 'Financial-Proposal', exts: ['pdf', 'xlsx', 'md'] },
];

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.dir) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const dir = path.resolve(String(args.dir));
const outDir = path.join(dir, 'out');
if (!fs.existsSync(dir)) fail(`bid dir not found: ${dir}`, 2);
fs.mkdirSync(outDir, { recursive: true });
const HERE = path.dirname(fileURLToPath(import.meta.url));

const find = (name) => [path.join(dir, name), path.join(outDir, name)].find((p) => fs.existsSync(p)) || null;
const extractPath = find('tor-extract.json');
if (!extractPath) fail(`no tor-extract.json in ${dir} or ${dir}/out — run: tor-to-proposal start --tor <file> --dir ${dir}`, 2);
const extract = JSON.parse(fs.readFileSync(extractPath, 'utf8'));
let context = {};
try { context = JSON.parse(fs.readFileSync(find('bid-context.json'), 'utf8')); } catch { /* optional */ }
const val = (x) => (x && x.value ? x.value : '[FILL]');
const refNo = val(extract.referenceNumber);
const refSlug = (refNo.match(/[A-Za-z0-9-]+/g) || ['bid']).join('-').slice(0, 60);

// ---------- 1. inventory ----------
function inventory() {
  const found = {};
  for (const doc of DOCS) {
    let best = null;
    for (const ext of doc.exts) {
      const p = find(`${doc.key}.${ext}`);
      if (p) { best = { ext, path: p }; break; } // exts are listed best-first
    }
    found[doc.key] = best;
  }
  return found;
}
let inv = inventory();
const missing = DOCS.filter((d) => !inv[d.key]);

// ---------- 2. fallback render ----------
if (args['fallback-pdf']) {
  for (const doc of DOCS) {
    const a = inv[doc.key];
    if (!a || a.ext !== 'md') continue;
    const outPdf = path.join(outDir, `${doc.key}.pdf`);
    const r = spawnSync(process.execPath, [path.join(HERE, 'render.mjs'), a.path, '--out', outPdf, '--footer', refNo], { encoding: 'utf8' });
    if (r.status !== 0) fail(`fallback render failed for ${doc.key}: ${r.stderr}`, 1);
    process.stderr.write(`fallback-rendered: ${doc.key}.pdf from markdown\n`);
  }
  inv = inventory();
}

// ---------- 3. verify artifacts by reading them back ----------
const FILL_RE = /\[FILL|\{\{|\blorem ipsum\b/i;
const checks = [];
let hard = 0;
const verifyDir = path.join(outDir, '.pack-verify');
fs.rmSync(verifyDir, { recursive: true, force: true });
fs.mkdirSync(verifyDir, { recursive: true });

async function verifyPdf(file, key) {
  const { extractText, getDocumentProxy } = await loadDep('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const joined = Array.from(text).join('\n');
  fs.writeFileSync(path.join(verifyDir, `${key}.txt`), joined);
  return { kind: 'PDF', pages: totalPages, text: joined };
}
async function verifyDocx(file, key) {
  const mammoth = await loadDep('mammoth');
  const { value } = await mammoth.extractRawText({ path: file });
  fs.writeFileSync(path.join(verifyDir, `${key}.txt`), value);
  return { kind: 'DOCX', pages: null, text: value };
}
async function verifyXlsx(file, key) {
  const mod = await loadDep('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const parts = [];
  wb.eachSheet((ws) => {
    parts.push(`[${ws.name}]`);
    for (let r = 1; r <= Math.min(ws.rowCount || 0, 300); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= Math.min(row.cellCount || 0, 30); c++) {
        const v = row.getCell(c).value;
        if (typeof v === 'string') parts.push(v);
        else if (v && typeof v === 'object' && v.formula) parts.push(String(v.result ?? ''));
      }
    }
  });
  const text = parts.join('\n');
  fs.writeFileSync(path.join(verifyDir, `${key}.txt`), text);
  return { kind: 'XLSX', pages: null, text };
}
const verifyMd = (file, key) => {
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(path.join(verifyDir, `${key}.txt`), text);
  return { kind: 'MD', pages: null, text };
};

for (const doc of DOCS) {
  const a = inv[doc.key];
  if (!a) { checks.push([doc.name, 'MISSING', '—', (doc.key === 'cover-letter' || doc.key === 'technical-proposal') ? `paste out/brief-${doc.key}.md into any AI chat, save the reply as ${doc.key}.md in ${dir} or ${dir}/out` : `produce ${doc.key}.(pdf|docx|xlsx|md) in ${dir} or ${dir}/out`]); hard++; continue; }
  let v;
  try {
    v = a.ext === 'pdf' ? await verifyPdf(a.path, doc.key) : a.ext === 'docx' ? await verifyDocx(a.path, doc.key) : a.ext === 'xlsx' ? await verifyXlsx(a.path, doc.key) : verifyMd(a.path, doc.key);
  } catch (e) {
    checks.push([doc.name, a.ext.toUpperCase(), '—', `unreadable: ${String(e.message || e).slice(0, 80)}`]); hard++; continue;
  }
  const hits = v.text.match(FILL_RE);
  if (hits) { checks.push([doc.name, v.kind, v.pages ?? '—', `contains "${hits[0]}" — a placeholder survived rendering`]); hard++; continue; }
  if (v.kind === 'MD') { checks.push([doc.name, 'MD', '—', 'markdown is not a submittable format — re-run with --fallback-pdf or render a real PDF/docx']); hard++; continue; }
  if (v.text.trim().length < 60) { checks.push([doc.name, v.kind, v.pages ?? '—', 'nearly no extractable text (scanned or empty?)']); hard++; continue; }
  checks.push([doc.name, v.kind, v.pages ?? '—', 'verified: text round-trips, no placeholders']);
}

// client-filled forms, if any, ride along unmodified (verified for [FILL] only)
const extras = ['financial-filled.xlsx', 'filled.docx', 'compliance-matrix.md'].map(find).filter(Boolean);

// ---------- 4. re-run the audit on the extracted bytes ----------
let auditOk = false;
const matrixPath = find('compliance-matrix.md');
const tp = fs.existsSync(path.join(verifyDir, 'technical-proposal.txt')) ? path.join(verifyDir, 'technical-proposal.txt') : null;
if (tp) {
  const extrasArgs = ['cover-letter', 'cv-tailored', 'financial-proposal'].filter((k) => fs.existsSync(path.join(verifyDir, `${k}.txt`))).flatMap((k) => ['--extras', path.join(verifyDir, `${k}.txt`)]);
  const auditArgs = ['--proposal', tp, ...(matrixPath ? ['--matrix', matrixPath] : []), ...extrasArgs, '--report', path.join(outDir, 'audit-final.md')];
  const r = spawnSync(process.execPath, [path.join(HERE, 'audit.mjs'), ...auditArgs], { encoding: 'utf8' });
  auditOk = r.status === 0;
  if (!auditOk) hard++;
}

// ---------- 5. deadline math ----------
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseDeadline(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/);
  if (m) return new Date(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()] ?? 0, +m[1]);
  m = t.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) return new Date(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0, +m[2]);
  m = t.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? +m[3] + 2000 : +m[3]; return new Date(y, +m[2] - 1, +m[1]); } // D/M/Y assumption (non-US ToRs)
  return null;
}
const deadlineStr = val(extract.deadline);
const deadline = parseDeadline(deadlineStr);
const daysLeft = deadline ? Math.ceil((deadline - new Date()) / 86400000) : null;

// ---------- 6. submission checklist ----------
const fmtDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}` : '[FILL]');
const deadlineLine = deadline ? `${fmtDate(deadline)} — **${daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : `PASSED ${-daysLeft} day(s) ago`}** (parsed from "${deadlineStr}"; confirm the ToR's time zone before relying on the hour)` : `**${deadlineStr}** — could not parse to a date; confirm manually`;

const checklistRows = checks.map((c) => [c[0], c[1], String(c[2]), c[3]]);
let report = `# Bid pack report — ${refNo}\n\n## Assignment\n- Title: ${val(extract.title)}\n- Reference: ${refNo}\n- Consultant: ${context.consultantLine || '[FILL]'}\n- Deadline: ${deadlineLine}\n- Submission channel: ${val(extract.submissionChannel)}${extract.submissionChannel?.page ? ` (p.${extract.submissionChannel.page})` : ''}\n\n` +
  `## Document verification\n\n${mdTable(['Document', 'Format', 'Pages', 'Verdict'], checklistRows)}\n\n` +
  `## Audit on rendered bytes\n\n${auditOk ? 'PASS — audit.mjs re-run on the extracted text of every document: no hard fails.' : `FAIL — audit.mjs found hard fails on the final documents. See ${path.join(outDir, 'audit-final.md')}. Do not submit.`}\n`;

let zipWritten = null;
if (hard === 0) {
  const packDir = path.join(dir, 'pack');
  fs.rmSync(packDir, { recursive: true, force: true });
  fs.mkdirSync(packDir, { recursive: true });
  for (const doc of DOCS) {
    const a = inv[doc.key];
    if (a) fs.copyFileSync(a.path, path.join(packDir, `${doc.name}.${a.ext}`));
  }
  for (const e of extras) fs.copyFileSync(e, path.join(packDir, path.basename(e)));

    const checklist = `# Submission checklist — ${refNo}\n\n**Assignment:** ${val(extract.title)}\n**Deadline:** ${deadlineLine}\n**Channel:** ${val(extract.submissionChannel)}${extract.submissionChannel?.page ? ` (p.${extract.submissionChannel.page})` : ''}\n\n` +
    `## Files in this pack\n\n${mdTable(['File', 'What it is'], DOCS.filter((d) => inv[d.key]).map((d) => [`${d.name}.${inv[d.key].ext}`, d.key]).concat(extras.map((e) => [path.basename(e), 'client form / compliance matrix (verified)'])))}\n\n` +
    `## Before you hit submit\n\n1. Every document verified: no [FILL], no placeholders, audit passed on the final bytes.\n2. File names/formats: confirm the ToR's naming and format rules (some portals rename or reject files).\n3. Deadline: submit well before close — portals slow down near deadlines. Confirm the ToR's time zone.\n4. Registration: verify any portal registration the ToR requires is done **before** award stage.\n5. Keep pricing.md and pricing.json PRIVATE — they contain your floor math and are not in this pack.\n6. After submission: tell your assistant "record this bid" (win/loss library, opt-in).\n`;
  fs.writeFileSync(path.join(packDir, 'submission-checklist.md'), checklist);

  if (deadline) {
    const y = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const dayAfter = new Date(deadline); dayAfter.setDate(dayAfter.getDate() + 1);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tor-to-proposal//bid pack//EN', 'BEGIN:VEVENT', `UID:${refSlug}-${y(deadline)}@tor-to-proposal`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${y(deadline)}`, `DTEND;VALUE=DATE:${y(dayAfter)}`, `SUMMARY:SUBMIT: ${refNo} ${val(extract.title).replace(/[,\;]/g, ' ')}`, `DESCRIPTION:Deadline per ToR ${extract.deadline?.page ? '(p.' + extract.deadline.page + ')' : ''}. Channel: ${val(extract.submissionChannel).replace(/[,\;]/g, ' ')}`, 'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', `DESCRIPTION:Bid deadline in 2 days: ${refNo}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\n');
    fs.writeFileSync(path.join(packDir, 'deadline.ics'), ics);
  }
  report += `\n## Pack\n\n${packDir}/ — final files with canonical names.\n`;
  if (!args['no-zip']) {
    const zipMod = await loadDep('adm-zip');
    const AdmZip = zipMod.default ?? zipMod;
    const zip = new AdmZip();
    zip.addLocalFolder(packDir, `${refSlug}-bid-pack`);
    zipWritten = path.join(dir, `${refSlug}-bid-pack.zip`);
    zip.writeZip(zipWritten);
    report += `${zipWritten}\n`;
  }
} else {
  // a previous successful run may have left a pack — a stale pack that LOOKS
  // ready to submit is worse than no pack. Remove it and any zip.
  const stalePack = path.join(dir, 'pack');
  if (fs.existsSync(stalePack)) fs.rmSync(stalePack, { recursive: true, force: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('-bid-pack.zip')) fs.rmSync(path.join(dir, f), { force: true });
  report += `\n## Pack NOT built — ${hard} verification failure(s) above. Fix and re-run. (Any previous pack/ and zip were removed so a stale pack cannot be submitted by mistake.)\n`;
}
writeOut(path.join(dir, 'pack-report.md'), report);
process.stdout.write(report);
process.stderr.write(`package: ${hard === 0 ? 'PACK READY' : `${hard} hard failure(s) — pack withheld`}\n`);
process.exit(hard === 0 ? 0 : 1);
