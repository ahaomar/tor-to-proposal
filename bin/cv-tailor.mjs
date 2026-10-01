#!/usr/bin/env node
// cv-tailor: produce (build) and verify (lint) a ToR-tailored CV.
//
// HONESTY CONTRACT — this is cv-gap's "do not claim" rule extended to generation:
//   * build reorders and selects master-CV material. It never writes a new fact.
//   * lint proves every bullet in the tailored CV is anchored in the master CV
//     (token containment + every number must come from the anchor) or in the
//     user's own cv-evidence.json answers. Unanchored = hard fail.
//   * GAP terms (cv-gap: "do not claim") may not appear anywhere in the output.
import fs from 'node:fs';
import path from 'node:path';
import { fail, parseArgs, readText, writeOut, helpText, mdTable } from './lib.mjs';

const HELP = helpText('cv-tailor', [
  'build  --cv master-cv.txt --extract out/tor-extract.json [--profile profile.json]',
  '           [--gap cv-gap-report.md] [--out out/cv-tailored.md] [--report out/cv-tailor-report.md]',
  'lint   --cv tailored.md --master master.txt [--gap gap.md] [--evidence cv-evidence.json]',
  '           [--report out/cv-tailor-lint.md]',
  '',
  'build: reorders/selects master-CV bullets against the ToR evaluation weights.',
  'lint:  every bullet must anchor to the master CV (>=60% token containment in one',
  '       master line, or >=75% across two lines) with all numbers preserved, or come',
  '       from cv-evidence.json (user-supplied answers). GAP terms hard-fail.',
]);

const STOP = new Set(('a,an,the,and,or,of,for,in,on,to,with,at,by,from,as,is,are,was,were,be,been,being,this,that,these,those,it,its,their,our,your,we,they,he,she,his,her,per,all,any,more,most,than,then,so,such,not,no,but,if,while,during,into,over,under,across,within,without,also,both,each,other,others,new,various,including,include,includes,using,use,used,based,well,has,have,had,do,does,did,will,would,can,could,should,may,might,must,against,about,after,before,between,through,up,down,out,off,own,same,too,very,just'.split(',')));

function tokenize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9&]+/g, ' ').split(' ').filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}
function numsOf(s) {
  return [...String(s).matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(/\.0+$/, ''));
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- master CV parsing ----------
function parseCv(text) {
  const lines = text.split('\n');
  const isHeader = (l) => {
    const t = l.trim();
    if (!t) return false;
    if (/^#{1,3}\s+\S/.test(t)) return true;
    if (/^\s*(?:[-*•·‣–]|\d{1,2}[.)])\s+/.test(t)) return false;
    return /^[A-Z][A-Z0-9 &/,'()+-]{2,70}:?$/.test(t) && /[A-Z]{3,}/.test(t);
  };
  const isBullet = (l) => /^\s*(?:[-*•·‣–]|\d{1,2}[.)])\s+/.test(l);
  const sections = [];
  let preamble = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isHeader(l)) {
      cur = { title: l.trim().replace(/^#+\s+/, '').replace(/:$/, ''), startLine: i + 1, body: [] };
      sections.push(cur);
    } else if (cur) cur.body.push({ line: i + 1, text: l, bullet: isBullet(l) });
    else preamble.push({ line: i + 1, text: l, bullet: isBullet(l) });
  }
  return { lines, preamble, sections };
}

// ---------- ToR term pool with weights ----------
function termPool(extract) {
  const pool = new Map();
  const add = (tokens, w) => {
    for (const t of tokens) pool.set(t, (pool.get(t) || 0) + w);
  };
  for (const d of extract.deliverables || []) add(tokenize(d.value), 0.5);
  add(tokenize(extract.title?.value || ''), 1);
  for (const c of extract.evaluation?.criteria || []) add(tokenize(c.label), c.weight / 15);
  if (!pool.size) fail('tor-extract.json has no title/criteria/deliverables to tailor against — run extract.mjs first', 2);
  return pool;
}
const scoreOf = (bulletTokens, pool) => bulletTokens.reduce((s, t) => s + (pool.get(t) || 0), 0);

// ---------- build ----------
function cmdBuild(args) {
  const master = readText(args.cv, '--cv (master CV text)');
  const extract = JSON.parse(readText(args.extract, '--extract (tor-extract.json from extract.mjs)'));
  const gap = args.gap ? readText(args.gap, '--gap') : null;
  const parsed = parseCv(master);
  const pool = termPool(extract);
  const SKIP_SUMMARY = /educat|language|reference|publication|referee/i;

  const scored = []; // { section, item, tokens, score }
  for (const sec of parsed.sections) {
    for (const item of sec.body) {
      if (!item.bullet) continue;
      const tokens = tokenize(item.text);
      scored.push({ sec, item, tokens, score: tokens.length ? scoreOf(tokens, pool) : 0 });
    }
  }

  // identity: profile if given, else the CV's own preamble lines (verbatim)
  let profile = null;
  if (args.profile) {
    profile = JSON.parse(readText(args.profile, '--profile'));
    if (!profile.identity?.name) fail('profile has no identity.name — run: tor-to-proposal init (or omit --profile)', 2);
  }
  const pre = parsed.preamble.filter((p) => p.text.trim());
  const out = [];
  if (profile) {
    const id = profile.identity;
    out.push(`# ${id.name}${id.credentials ? `, ${id.credentials}` : ''}`, '');
    const contact = [id.title, id.email, id.phone, id.location, id.nationality].filter(Boolean).join(' | ');
    if (contact) out.push(contact, '');
  } else {
    for (const p of pre) out.push(p.text.replace(/^#+\s*/, ''));
    out.push('');
    if (!pre.length) fail('master CV has no header lines and no --profile given — cannot build the identity block', 2);
  }

  // summary: top-scoring bullets, highest weight first, deduped
  const top = scored.filter((s) => s.score > 0 && !SKIP_SUMMARY.test(s.sec.title)).sort((a, b) => b.score - a.score || a.item.line - b.item.line).slice(0, 6);
  if (top.length) {
    out.push(`## Most relevant for this assignment`, '');
    for (const s of top) out.push(`- ${s.item.text.replace(/^\s*(?:[-*•·‣–]|\d{1,2}[.)])\s+/, '').trim()}`);
    out.push('');
  }

  // sections in original order; bullets reordered by relevance inside experience-like sections
  const orderInSection = new Map(); // section title -> ordered items
  for (const sec of parsed.sections) {
    const items = sec.body.filter((b) => b.bullet);
    const prose = sec.body.filter((b) => !b.bullet);
    if (SKIP_SUMMARY.test(sec.title) || !scored.some((s) => s.sec === sec && s.score > 0)) {
      orderInSection.set(sec, { prose, items }); // untouched
    } else {
      const keyed = new Map(items.map((it) => [it.line, scored.find((s) => s.item === it)]));
      const reordered = [...items].sort((a, b) => (keyed.get(b)?.score || 0) - (keyed.get(a)?.score || 0) || a.line - b.line);
      orderInSection.set(sec, { prose, items: reordered });
    }
  }
  for (const sec of parsed.sections) {
    out.push(`## ${sec.title}`, '');
    const { prose, items } = orderInSection.get(sec);
    for (const p of prose) out.push(p.text.trimEnd());
    if (prose.length && items.length) out.push('');
    for (const it of items) out.push(it.text.trimEnd());
    out.push('');
  }
  out.push('<!-- generated by tor-to-proposal cv-tailor: reordered/selected from the master CV only. Trace: cv-tailor-report.md -->');
  const md = out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeOut(args.out || path.join('out', 'cv-tailored.md'), md);

  // report
  const anchors = top.map((s) => [s.item.text.replace(/^\s*(?:[-*•·‣–]|\d{1,2}[.)])\s+/, '').slice(0, 70), s.sec.title, `line ${s.item.line}`, s.score.toFixed(1)]);
  const crit = extract.evaluation?.criteria || [];
  const cvAll = norm(master);
  const mirror = crit.map((c) => {
    const toks = [...new Set(tokenize(c.label))];
    const missing = toks.filter((t) => !cvAll.includes(t));
    return [`${c.label.slice(0, 50)} (${c.weight} pts)`, missing.length ? `not yet evidenced in CV: ${missing.join(', ')}` : 'all terms present in CV'];
  });
  const gapTerms = gap ? [...gap.matchAll(/\|\s*[^|]*?:\s*([^|]+?)\s*\|\s*p\.\d+\s*\|\s*✖/g)].map((m) => m[1].trim()) : [];
  const report = `# CV tailor report\n\nGenerated from master CV only (no new facts). Verify every line before use.\n\n` +
    `## Summary bullets, traceable to the master CV\n\n` +
    (anchors.length ? mdTable(['Tailored bullet', 'From section', 'Master line', 'Relevance score'], anchors) : 'no scored bullets — check tor-extract.json criteria') +
    `\n\n## Terminology mirror (advisory — edit wording, never add facts)\n\n` + mdTable(['Criterion', 'Mirror advice'], mirror) +
    (gapTerms.length ? `\n\n## GAP terms — must NOT appear in this CV\n` + gapTerms.map((g) => `- ${g}`).join('\n') + `\n` : '') +
    `\nNext: cv-tailor.mjs lint --cv <tailored> --master <master> [--gap gap.md]\n`;
  writeOut(args.report || path.join('out', 'cv-tailor-report.md'), report);
  process.stderr.write(`cv-tailor: ${top.length} summary bullets, ${parsed.sections.length} sections -> ${args.out || 'out/cv-tailored.md'}\n`);
}

// ---------- lint ----------
function cmdLint(args) {
  const tailored = readText(args.cv, '--cv (tailored CV)');
  const master = readText(args.master, '--master (the ORIGINAL master CV)');
  const gap = args.gap ? readText(args.gap, '--gap') : null;
  let evidence = [];
  if (args.evidence) {
    const ev = JSON.parse(readText(args.evidence, '--evidence'));
    evidence = (Array.isArray(ev) ? ev : ev.items || []).map((e) => (typeof e === 'string' ? { text: e } : e)).filter((e) => e.text);
  }
  const masterLines = master.split('\n');
  const masterTokens = masterLines.map((l) => ({ toks: new Set(tokenize(l)), text: l }));
  const evidenceNorm = evidence.map((e) => ({ norm: norm(e.text), id: e.id || 'evidence', raw: e.text }));
  const failures = [];
  const ok = [];
  const warnings = [];

  const bullets = tailored.split('\n').filter((l) => /^\s*(?:[-*•·‣–]|\d{1,2}[.)])\s+\S/.test(l));
  if (!bullets.length) failures.push('no bullets found in the tailored CV — is this the right file?');

  for (const b of bullets) {
    const text = b.replace(/^\s*(?:[-*•·‣–]|\d{1,2}[.)])\s+/, '').trim();
    const toks = tokenize(text);
    if (!toks.length) continue;
    // best single-line anchor, then best two-line union
    let best = { cov: 0, idx: [] };
    for (let i = 0; i < masterTokens.length; i++) {
      let hit = 0;
      for (const t of toks) if (masterTokens[i].toks.has(t)) hit++;
      const cov = hit / toks.length;
      if (cov > best.cov) best = { cov, idx: [i] };
    }
    if (best.cov < 0.6 && masterTokens.length > 1) {
      const first = best.idx[0] ?? 0;
      let pair = { cov: 0, idx: [first, first] };
      for (let i = 0; i < masterTokens.length; i++) {
        for (const j of [first, i]) {
          if (i === j) continue;
          const union = new Set([...masterTokens[i].toks, ...masterTokens[j].toks]);
          let hit = 0;
          for (const t of toks) if (union.has(t)) hit++;
          const cov = hit / toks.length;
          if (cov > pair.cov) pair = { cov, idx: [i, j].sort((a, b) => a - b) };
        }
      }
      if (pair.cov >= 0.75) best = pair;
    }
    const anchorText = best.idx.map((i) => masterLines[i]).join(' ');
    const ev = evidenceNorm.find((e) => e.norm === norm(text) || (norm(text).length && e.norm.includes(norm(text)) && norm(text).length / e.norm.length > 0.8));
    if (ev) {
      ok.push([text.slice(0, 60), `user-input evidence (${ev.id})`, '']);
      continue;
    }
    if (best.cov < 0.6) {
      failures.push(`unanchored bullet (no master-CV line covers ≥60% of it): "${text.slice(0, 90)}" — remove it, or answer its evidence question and put the text in cv-evidence.json`);
      continue;
    }
    const missingNums = numsOf(text).filter((n) => !numsOf(anchorText).includes(n));
    if (missingNums.length) {
      failures.push(`number(s) ${missingNums.join(', ')} not present in the anchor master line(s) (line${best.idx.length > 1 ? 's' : ''} ${best.idx.map((i) => i + 1).join(',')}): "${text.slice(0, 90)}" — numbers may not be invented or altered`);
      continue;
    }
    ok.push([text.slice(0, 60), `master line${best.idx.length > 1 ? 's' : ''} ${best.idx.map((i) => i + 1).join(',')}`, `${Math.round(best.cov * 100)}%`]);
  }

  if (gap) {
    [...gap.matchAll(/\|\s*[^|]*?:\s*([^|]+?)\s*\|\s*p\.\d+\s*\|\s*✖/g)].forEach((m) => {
      const term = m[1].trim().toLowerCase();
      if (term.length > 3 && norm(tailored).includes(term)) failures.push(`tailored CV mentions "${term}" which cv-gap marked GAP — remove it entirely`);
    });
  }
  const fills = [...tailored.matchAll(/\[FILL[^\]]*\]/g)].length;
  if (fills) warnings.push(`${fills} [FILL] placeholder(s) remain — resolve before submission (audit.mjs gates this too)`);

  const report = `# CV tailor lint — ${path.basename(String(args.cv))}\n\n` +
    `${failures.length ? `## FAIL (${failures.length})\n` + failures.map((f) => '- ' + f).join('\n') : '## PASS — every bullet traceable'}\n\n` +
    `## Anchor table (${ok.length} bullets)\n\n` + mdTable(['Bullet', 'Anchored to', 'Coverage'], ok) +
    (warnings.length ? `\n\n## Warnings\n` + warnings.map((w) => '- ' + w).join('\n') : '');
  writeOut(args.report || path.join('out', 'cv-tailor-lint.md'), report);
  process.stdout.write(report);
  if (failures.length) process.exit(1);
}

// ---------- dispatch ----------
const args = parseArgs(process.argv.slice(2));
const mode = args._[0] ?? 'build';
if (args.__help || !['build', 'lint'].includes(mode)) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
if (mode === 'build') {
  if (!args.cv || !args.extract) { process.stdout.write(HELP); process.exit(1); }
  cmdBuild(args);
} else {
  if (!args.cv || !args.master) { process.stdout.write(HELP); process.exit(1); }
  cmdLint(args);
}
