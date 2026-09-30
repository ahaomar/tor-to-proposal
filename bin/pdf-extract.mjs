#!/usr/bin/env node
// pdf-extract: PDF/docx/xlsx -> page/sheet-tagged plain text + extraction signals.
// Deterministic. Never invents content; on failure it explains and exits non-zero.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fail, parseArgs, writeOut, helpText, loadDep } from './lib.mjs';

const HELP = helpText('pdf-extract', [
  'Usage: node bin/pdf-extract.mjs <input.(pdf|docx|xlsx|txt)> [--out text.txt] [--signals signals.json]',
  '',
  'Output: full text with [[PAGE n]] (PDF/docx) or [[SHEET n: Name]] (xlsx) tags.',
  'Signals: totalPages, charCount, charsPerPage, scannedLikely, hasEvaluationTable,',
  '         hasAnnexes, hasFinancialForm.',
  'Exit codes: 0 ok | 1 error | 2 cannot extract (scanned PDF / OCR needed / parse failed) | 3 deps missing',
]);

const args = parseArgs(process.argv.slice(2));
if (args.__help || args._.length === 0) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const file = args._[0];
if (!fs.existsSync(file)) fail(`file not found: ${file}`, 2);

const ext = (file.split('.').pop() || '').toLowerCase();

async function extractPdf() {
  const buf = fs.readFileSync(file);
  // Primary: unpdf (bundled pdf.js). Fallback: poppler pdftotext if installed.
  let pages = null;
  try {
    const { extractText, getDocumentProxy } = await loadDep('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    pages = Array.from(text);
    if (pages.length !== totalPages) pages.length = totalPages;
  } catch (e) {
    if (String(e?.message || e).startsWith('ERROR:')) throw e; // loadDep already handled
    try {
      const out = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      pages = out.split('\f');
    } catch {
      fail(
        `could not parse PDF "${file}". If it is a scanned document, run OCR first:\n` +
          '  tesseract input.pdf output_txt  (or: pdftotext input.pdf output.txt if poppler is installed)',
        2
      );
    }
  }
  return pages.map((t, i) => `[[PAGE ${i + 1}]]\n${(t || '').trim()}`).join('\n\n');
}

async function extractDocx() {
  try {
    const mammoth = await loadDep('mammoth'); // mammoth or its CJS default, both expose extractRawText
    const { value } = await mammoth.extractRawText({ path: file });
    // docx has no fixed pages; one tag block so downstream page attribution still works.
    return `[[PAGE 1]]\n${value.trim()}\n\n<!-- note: source is .docx; it has no fixed pagination -->`;
  } catch (e) {
    if (String(e?.message || e).startsWith('ERROR:')) throw e;
    try {
      const xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
      const text = xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      return `[[PAGE 1]]\n${text}\n\n<!-- note: docx extracted via unzip fallback -->`;
    } catch {
      fail(`could not extract docx "${file}" (mammoth and unzip fallback both failed)`, 2);
    }
  }
}

async function extractXlsx() {
  const mod = await loadDep('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const parts = [];
  let sheetIdx = 0; // eachSheet's 2nd arg is the sheet id, not the position — count manually
  wb.eachSheet((ws) => {
    sheetIdx += 1;
    parts.push(`[[SHEET ${sheetIdx}: ${ws.name}]]`);
    const maxRow = Math.min(ws.rowCount || 0, 500);
    for (let r = 1; r <= maxRow; r++) {
      const row = ws.getRow(r);
      const cells = [];
      const maxCol = Math.min(row.cellCount || 0, 40);
      for (let c = 1; c <= maxCol; c++) {
        const v = row.getCell(c).value;
        if (v !== null && v !== undefined && v !== '') cells.push(String(v));
      }
      if (cells.length) parts.push(`R${r}: ` + cells.join(' | '));
    }
  });
  return parts.join('\n');
}

let text;
if (ext === 'pdf') text = await extractPdf();
else if (ext === 'docx') text = await extractDocx();
else if (ext === 'xlsx' || ext === 'xlsm') text = await extractXlsx();
else text = fs.readFileSync(file, 'utf8'); // already-extracted or pasted text: pass through

const pageTags = [...text.matchAll(/\[\[PAGE (\d+)\]\]/g)].length;
const sheetTags = [...text.matchAll(/\[\[SHEET \d+/g)].length;
const totalPages = pageTags || sheetTags || 1;
const charCount = text.length;
const charsPerPage = totalPages ? charCount / totalPages : 0;

const signals = {
  file,
  kind: ext === 'pdf' || ext === 'docx' ? 'paged' : ext.startsWith('xls') ? 'sheeted' : 'text',
  totalPages,
  charCount,
  charsPerPage: Math.round(charsPerPage),
  scannedLikely: (ext === 'pdf' && charsPerPage < 200),
  hasEvaluationTable: /evaluation criteri|technical evaluation|scoring (?:grid|table)|award criteria/i.test(text),
  hasAnnexes: /\bannex\b/i.test(text),
  hasFinancialForm: /financial (?:proposal|offer|submission)|price schedule|breakdown of costs/i.test(text),
};

if (signals.scannedLikely) {
  process.stderr.write(
    `WARNING: thin text layer (${signals.charsPerPage} chars/page) -> likely scanned PDF.\n` +
      'OCR required before extraction:  tesseract input.pdf outbase txt\n'
  );
  if (args['allow-scanned'] !== true) {
    writeOut(args.signals, JSON.stringify(signals, null, 2));
    fail('refusing to extract a likely-scanned PDF without real text (use OCR first)', 2);
  }
}

writeOut(args.out, text);
writeOut(args.signals, JSON.stringify(signals, null, 2));
