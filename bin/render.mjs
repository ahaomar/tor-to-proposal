#!/usr/bin/env node
// render: minimal pure-JS markdown -> PDF emitter (the fallback tier).
// The agent's own document tooling produces the presentation PDFs; this exists so
// a bid pack can ALWAYS be completed and verified, even with no document skill
// present. Text layout only: headings, bullets, tables (Courier), wrapping,
// page numbers, WinAnsi text. Deterministic: same input -> same bytes.
import fs from 'node:fs';
import path from 'node:path';
import { fail, parseArgs, readText, writeOut, helpText } from './lib.mjs';

const HELP = helpText('render', [
  'Usage: node bin/render.mjs <input.md> --out output.pdf [--footer "text"]',
  '',
  'Fallback renderer: clean, plain, submittable. For a designed PDF, let your AI',
  'assistant render it with its document tooling instead — package.mjs verifies',
  'whichever PDF it finds, whichever tool produced it.',
]);

// ---------- cp1252 (WinAnsi) encoding ----------
const SPECIAL = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
function cp1252Buffer(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 0x100 && !(c >= 0x7f && c <= 0x9f)) out.push(c);
    else if (SPECIAL[c] !== undefined) out.push(SPECIAL[c]);
    else out.push(0x3f); // ?
  }
  return Buffer.from(out, 'latin1');
}

// ---------- markdown -> layout tokens ----------
const stripInline = (s) => String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();

function tokenize(md) {
  const lines = md.split('\n');
  const tokens = [];
  let table = null;
  const flushTable = () => { if (table && table.rows.length) tokens.push({ type: 'table', rows: table.rows }); table = null; };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*\|.*\|?\s*$/.test(line)) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue; // separator row
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => stripInline(c));
      table = table || { rows: [] };
      table.rows.push(cells);
      continue;
    }
    flushTable();
    if (!line.trim()) { tokens.push({ type: 'gap' }); continue; }
    let m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m) { tokens.push({ type: 'h' + m[1].length, text: stripInline(m[2]) }); continue; }
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) { tokens.push({ type: 'gap' }); continue; }
    m = line.match(/^(\s*)(?:[-*•·‣–]|\d{1,2}[.)])\s+(.*)$/);
    if (m) { tokens.push({ type: 'bullet', indent: m[1].length, text: stripInline(m[2]) }); continue; }
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) { tokens.push({ type: 'bold', text: stripInline(line) }); continue; }
    tokens.push({ type: 'text', text: stripInline(line) });
  }
  flushTable();
  return tokens;
}

// ---------- layout ----------
const PAGE_W = 595, PAGE_H = 842, MARGIN = 56, TOP = 778, BOTTOM = 56;
const FONTS = {
  F1: { base: 'Helvetica', factor: 0.5 },
  F2: { base: 'Helvetica-Bold', factor: 0.53 },
  F3: { base: 'Courier', factor: 0.6 },
};

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > maxChars) { // hard-break overlong tokens (URLs)
      const take = maxChars - (cur ? cur.length + 1 : 0);
      if (take <= 0) { break; }
      cur = cur ? cur + ' ' + w.slice(0, take) : w.slice(0, take);
      lines.push(cur); cur = ''; w = w.slice(take);
    }
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function layout(tokens) {
  const pages = [];
  let cur = [];
  let y = TOP;
  const newPage = () => { pages.push(cur); cur = []; y = TOP; };
  const put = (text, font, size, lead, x, wrapAt) => {
    for (const line of wrapText(text, wrapAt)) {
      if (y - lead < BOTTOM) newPage();
      cur.push({ x, y, font, size, text: line });
      y -= lead;
    }
  };
  for (const t of tokens) {
    if (t.type === 'gap') { y -= 6; continue; }
    if (t.type === 'h1') { y -= 8; put(t.text, 'F2', 14, 18, MARGIN, 64); y -= 2; continue; }
    if (t.type === 'h2') { y -= 6; put(t.text, 'F2', 12, 16, MARGIN, 74); continue; }
    if (t.type === 'h3') { y -= 4; put(t.text, 'F2', 10.5, 14, MARGIN, 85); continue; }
    if (t.type === 'bold') { put(t.text, 'F2', 10, 14, MARGIN, 88); continue; }
    if (t.type === 'bullet') {
      const first = '• ' + t.text;
      const lines = wrapText(first, 92);
      lines.forEach((line, i) => put(line, 'F1', 10, 14, i === 0 ? MARGIN + 2 : MARGIN + 14, 92));
      continue;
    }
    if (t.type === 'table') {
      const rows = t.rows;
      const nCol = Math.max(...rows.map((r) => r.length));
      const budget = 96;
      const widths = Array.from({ length: nCol }, (_, c) => Math.max(4, ...rows.map((r) => (r[c] || '').length)));
      let total = widths.reduce((a, b) => a + b, 0) + nCol * 3;
      if (total > budget) widths.forEach((_, i) => (widths[i] = Math.max(5, Math.floor((widths[i] / total) * budget))));
      total = widths.reduce((a, b) => a + b, 0) + nCol * 3;
      const renderRow = (r) => ' ' + Array.from({ length: nCol }, (_, c) => {
        const w = widths[c];
        const cell = (r[c] || '');
        return cell.length > w ? cell.slice(0, w - 1) + '…' : cell.padEnd(w);
      }).join(' | ');
      y -= 4;
      rows.forEach((r, i) => {
        put(renderRow(r), 'F3', 8, 10.5, MARGIN, 110);
        if (i === 0) put('-'.repeat(Math.min(total, 96)), 'F3', 8, 10.5, MARGIN, 110);
      });
      y -= 4;
      continue;
    }
    put(t.text, 'F1', 10, 14, MARGIN, 92);
  }
  pages.push(cur);
  return pages.filter((p, i) => p.length || i === 0);
}

// ---------- PDF assembly ----------
function buildPdf(pages, title, footerText) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const obj = (body) => Buffer.concat([Buffer.from(body, 'latin1')]);
  const P = pages.length;
  const pageObjs = pages.map((_, i) => 6 + i);
  const contentObjs = pages.map((_, i) => 6 + P + i);
  const infoNum = 6 + 2 * P;

  const contents = pages.map((lines, i) => {
    const parts = lines.map((l) => `BT /${l.font} ${l.size} Tf 1 0 0 1 ${l.x.toFixed(1)} ${l.y.toFixed(1)} Tm (${esc(l.text)}) Tj ET`);
    const label = footerText ? `${footerText}  —  Page ${i + 1} of ${P}` : `Page ${i + 1} of ${P}`;
    parts.push(`BT /F1 8 Tf 1 0 0 1 ${(PAGE_W / 2 - label.length * 2).toFixed(1)} 36 Tm (${esc(label)}) Tj ET`);
    const stream = cp1252Buffer(parts.join('\n'));
    return Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1')]);
  });

  const bodies = [];
  bodies[1] = obj('<< /Type /Catalog /Pages 2 0 R >>');
  bodies[2] = obj(`<< /Type /Pages /Kids [${pageObjs.map((n) => `${n} 0 R`).join(' ')}] /Count ${P} >>`);
  bodies[3] = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  bodies[4] = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  bodies[5] = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  pages.forEach((_, i) => {
    bodies[pageObjs[i]] = obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjs[i]} 0 R >>`);
    bodies[contentObjs[i]] = contents[i];
  });
  bodies[infoNum] = obj(`<< /Title (${esc(title || 'Proposal')}) /Producer (tor-to-proposal render) >>`);

  const chunks = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = new Array(infoNum + 1).fill(0);
  for (let n = 1; n <= infoNum; n++) {
    if (!bodies[n]) continue;
    offsets[n] = Buffer.concat(chunks).length;
    chunks.push(Buffer.concat([Buffer.from(`${n} 0 obj\n`, 'latin1'), bodies[n], Buffer.from('\nendobj\n', 'latin1')]));
  }
  const xrefPos = Buffer.concat(chunks).length;
  let xref = `xref\n0 ${infoNum + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= infoNum; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  chunks.push(Buffer.from(xref + `trailer\n<< /Size ${infoNum + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

// ---------- CLI ----------
const args = parseArgs(process.argv.slice(2));
if (args.__help || !args._[0] || !args.out) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const md = readText(args._[0], 'markdown input');
const tokens = tokenize(md);
if (!tokens.length) fail('input is empty — nothing to render', 2);
const pages = layout(tokens);
const title = (tokens.find((t) => t.type === 'h1') || {}).text || path0(args._[0]);
function path0(p) { return String(p).split(/[\\/]/).pop(); }
const pdf = buildPdf(pages, title, args.footer ? String(args.footer) : null);
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(args.out, pdf);
process.stderr.write(`written: ${args.out} (${pages.length} page${pages.length > 1 ? 's' : ''}, ${pdf.length} bytes, fallback renderer)\n`);
