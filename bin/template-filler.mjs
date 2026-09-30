#!/usr/bin/env node
// template-filler: fills the CLIENT'S OWN forms. docx placeholders + xlsx labeled
// cells. Never alters template structure; never overwrites a formula; every write
// is traced in fill-report.md. CLIENT-TEMPLATE-WINS is enforced here, mechanically.
import fs from 'node:fs';
import path from 'node:path';
import { fail, parseArgs, readText, writeOut, helpText, loadDep } from './lib.mjs';

const HELP = helpText('template-filler', [
  'Commands (docx: {{placeholders}} in the client template; xlsx: row labels):',
  '  map   --template form.docx|form.xlsx --data data.json',
  '  fill  --template form.docx|form.xlsx --data data.json --out filled.docx|filled.xlsx',
  '  check --template form.docx|form.xlsx --data data.json        # exit 1 if any [FILL] left',
  '',
  'data.json: flat map, e.g. {"daily_rate": 468.75, "Daily Fee": 468.75}.',
  'docx values replace {{key}}; xlsx values fill the first empty cell right of a',
  'matching row label. Formulas are never touched. fill-report.md traces every write.',
]);

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (args.__help || !cmd || !args.template) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const template = args.template;
if (!fs.existsSync(template)) fail(`template not found: ${template}`, 2);
const ext = (template.split('.').pop() || '').toLowerCase();
const data = cmd === 'map' && !args.data ? {} : JSON.parse(readText(args.data, '--data (flat label->value map, e.g. from pricing.json rates)'));
const writes = [];
let unmapped = [];

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------- docx ----------------
async function docxEntries() {
  const AdmZip = await loadDep('adm-zip');
  const zip = new AdmZip(fs.readFileSync(template));
  return { zip, files: zip.getEntries().filter((e) => /word\/(document|header\d*|footer\d*)\.xml$/.test(e.entryName)) };
}

async function docxMap() {
  const { zip, files } = await docxEntries();
  const found = new Set();
  const split = [];
  for (const e of files) {
    const xml = zip.readAsText(e);
    for (const m of xml.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) found.add(m[1]);
    for (const m of xml.matchAll(/\{\{[^}]{0,80}?<[^>]+>[^}]{0,80}?\}\}/g)) split.push(`${e.entryName}: ${m[0].slice(0, 60)}…`);
  }
  return { placeholders: [...found], split, files };
}

async function docxFill(out) {
  const { zip, files } = await docxEntries();
  const remaining = new Set();
  for (const e of files) {
    let xml = zip.readAsText(e);
    xml = xml.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key) => {
      if (key in data) {
        writes.push({ file: out, place: `${e.entryName} {{${key}}}`, value: data[key], trace: `data.json["${key}"]` });
        return xmlEscape(data[key]);
      }
      remaining.add(key);
      return whole;
    });
    zip.updateFile(e.entryName, Buffer.from(xml, 'utf8'));
  }
  zip.writeZip(out);
  unmapped = [...remaining];
}

// ---------------- xlsx ----------------
async function loadWb() {
  const mod = await loadDep('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(template);
  return { ExcelJS, wb };
}
async function xlsxMap() {
  const { wb } = await loadWb();
  const labels = [];
  wb.eachSheet((ws) => {
    for (let r = 1; r <= Math.min(ws.rowCount || 0, 300); r++) {
      const labelCell = ws.getRow(r).getCell(1);
      const label = labelCell.value;
      if (typeof label !== 'string' || !label.trim()) continue;
      // candidate: label row with at least one empty non-label cell to the right
      for (let c = 2; c <= 12; c++) {
        const cell = ws.getRow(r).getCell(c);
        if (cell.value === null || cell.value === '' || cell.value === undefined) {
          labels.push({ sheet: ws.name, label: label.trim(), cell: cell.address });
          break;
        }
        if (cell.formula || typeof cell.value === 'object') break; // hit data/formula zone — not a fill row
      }
    }
  });
  return labels;
}
async function xlsxFill(out) {
  const { wb } = await loadWb();
  const labels = await xlsxMap();
  const left = new Set(labels.map((l) => l.label));
  for (const l of labels) {
    if (!(l.label in data)) continue;
    left.delete(l.label);
    const cell = wb.getWorksheet(l.sheet).getCell(l.cell);
    if (cell.formula) { fail(`refusing to overwrite formula at ${l.sheet}!${l.cell} (client's formula stays)`, 2); }
    const v = data[l.label];
    cell.value = typeof v === 'number' ? v : String(v);
    writes.push({ file: out, place: `${l.sheet}!${l.cell} (label "${l.label}")`, value: v, trace: `data.json["${l.label}"]` });
  }
  unmapped = [...left];
  await wb.xlsx.writeFile(out);
}

// ---------------- run ----------------
if (ext === 'docx') {
  if (cmd === 'map') {
    const { placeholders, split } = await docxMap();
    process.stdout.write(`Placeholders in ${template}:\n` + (placeholders.map((p) => `  {{${p}}}${p in data ? '' : '  -> needs data key'}`).join('\n') || '  (none)') + '\n' + (split.length ? `\nSPLIT placeholders (Word broke them across formatting runs — fix in Word by retyping them as plain text, then re-run):\n` + split.map((s) => '  ' + s).join('\n') + '\n' : ''));
  } else if (cmd === 'fill' || cmd === 'check') {
    const out = cmd === 'fill' ? args.out || 'filled.docx' : null;
    if (cmd === 'fill') {
      if (!out) fail('--out required for fill', 2);
      await docxFill(out);
    } else {
      const { placeholders } = await docxMap();
      unmapped = placeholders.filter((p) => !(p in data));
    }
  } else fail(`unknown command: ${cmd}`, 2);
} else if (ext === 'xlsx' || ext === 'xlsm') {
  if (cmd === 'map') {
    const labels = await xlsxMap();
    process.stdout.write(`Fillable labeled cells in ${template}:\n` + (labels.map((l) => `  "${l.label}" -> ${l.sheet}!${l.cell}${l.label in data ? '' : '  -> needs data key'}`).join('\n') || '  (none)') + '\n');
  } else if (cmd === 'fill') {
    if (!args.out) fail('--out required for fill', 2);
    await xlsxFill(args.out);
  } else if (cmd === 'check') {
    const labels = await xlsxMap();
    unmapped = labels.filter((l) => !(l.label in data)).map((l) => l.label);
  } else fail(`unknown command: ${cmd}`, 2);
} else {
  fail(`unsupported template type: .${ext} (docx/xlsx only — for PDF forms, request the editable original from the client)`, 2);
}

if (cmd !== 'map') {
  const report = `# Fill report — ${template}\n\n## Writes (${writes.length})\n` +
    (writes.length ? `| Where | Value | Trace |\n| --- | --- | --- |\n` + writes.map((w) => `| ${w.place} | ${w.value} | ${w.trace} |`).join('\n') : '(none)') +
    `\n\n## Unmapped ([FILL] required)\n` + (unmapped.length ? unmapped.map((u) => `- **${u}** — supply in data.json or fill by hand`).join('\n') : 'none — all mapped') +
    `\n\nClient template structure untouched; formulas never overwritten.\n`;
  writeOut(args.report || 'fill-report.md', report);
  process.stderr.write(`${cmd}: ${writes.length} writes, ${unmapped.length} unmapped\n`);
  if (cmd === 'check' && unmapped.length) {
    process.stderr.write(`CHECK FAILED: ${unmapped.length} field(s) still need values ([FILL] list above)\n`);
    process.exit(1);
  }
}
