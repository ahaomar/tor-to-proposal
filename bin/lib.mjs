// Shared helpers for tor-to-proposal CLI tools.
// Deterministic only: no network, no LLM, no guessing. Same input -> same output.
import fs from 'node:fs';
import path from 'node:path';

export function fail(msg, code = 1) {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(code);
}

export function readText(file, what = 'input file') {
  if (!file) fail(`${what} missing. Use --help for usage.`, 2);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    fail(`cannot read ${what}: ${file}`, 2);
  }
}

export function writeOut(file, content) {
  if (file) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, content);
    process.stderr.write(`written: ${file}\n`);
  } else {
    process.stdout.write(content);
  }
}

// Parse ["--key", "value", "--flag", "positional", "--n=3"] into
// { _: [positional], key: "value", flag: true, n: "3" } (values stay strings).
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.__help = true; return out; }
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let val = true;
      const eq = key.indexOf('=');
      if (eq !== -1) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { val = argv[++i]; }
      // repeated flags collect into arrays (e.g. audit --extras a --extras b)
      out[key] = out[key] === undefined ? val : [].concat(out[key], val);
    } else {
      out._.push(a);
    }
  }
  return out;
}

export function num(v, name, { min = -Infinity, max = Infinity } = {}) {
  const n = typeof v === 'string' ? Number(v.replace(/[, ]/g, '')) : Number(v);
  if (!Number.isFinite(n)) fail(`${name} must be a number (got: ${v})`, 2);
  if (n < min || n > max) fail(`${name} must be between ${min} and ${max} (got: ${n})`, 2);
  return n;
}

export function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Optional-dependency loader with an actionable message (skill users may not
// have run npm install yet).
export async function loadDep(spec) {
  try {
    const mod = await import(spec);
    // CJS-only packages (adm-zip, mammoth) arrive as { default: exports,
    // 'module.exports': exports } — unwrap so callers always get the module.
    const hasNamed = Object.keys(mod).some((k) => k !== 'default' && k !== 'module.exports');
    return !hasNamed && mod.default !== undefined ? mod.default : mod;
  } catch {
    fail(
      `missing dependency "${spec}". Run:  npm install  inside the tor-to-proposal skill directory (one-time, local only).`,
      3
    );
  }
}

// Page attribution: index of a match -> nearest preceding [[PAGE n]] tag.
export const PAGE_TAG = /\[\[PAGE (\d+)\]\]/g;

export function pageOf(text, index) {
  let page = null;
  PAGE_TAG.lastIndex = 0;
  let m;
  while ((m = PAGE_TAG.exec(text)) && m.index < index) page = Number(m[1]);
  return page;
}

export function helpText(name, lines) {
  return `tor-to-proposal :: ${name}\n\n${lines.join('\n')}\n`;
}

export function extractWindow(text, startRe, endRe, maxLen = 4000) {
  const sm = text.match(startRe);
  if (!sm) return null;
  const start = sm.index;
  const rest = text.slice(start + 1, start + maxLen);
  const em = rest.match(endRe);
  return text.slice(start, start + 1 + (em ? em.index + 1 : maxLen));
}

export function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}
