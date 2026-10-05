#!/usr/bin/env node
// profile: the one-time consultant profile -> .tor-to-proposal/profile.json
// (in the CURRENT folder, so users can see and back it up like any project file;
//  the legacy ~/.tor-to-proposal/profile.json is still read as a fallback).
// Every value here is USER-SUPPLIED. The profile is the canonical "user input"
// trace source downstream tools cite; nothing in it is ever invented or defaulted
// silently. Plug-and-play: `npx tor-to-proposal init` runs the wizard once, and
// every future bid inherits these facts instead of re-asking for them.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { fail, parseArgs, helpText } from './lib.mjs';

const HELP = helpText('profile', [
  'One-time consultant profile, stored at .tor-to-proposal/profile.json in the CURRENT folder.',
  '',
  '  init                 interactive wizard (terminal prompts; blank = default/keep current)',
  '  set key=value ...    set fields (dotted keys). Values parse as JSON when valid:',
  '                         profile set identity.name="Ayesha Khan" rates.defaults.base=400 cv.masterPath=~/cv/master.md',
  '  get [key]            print the whole profile (or one dotted field) as JSON',
  '  path                 print the profile file path',
  '  erase                delete the profile',
  '',
  'Fields:',
  '  identity.{name, credentials, title, email, phone, location, nationality, languages[]}',
  '  rates.floor.{annualIncome, billableDays, costLoading}      # your floor-math inputs',
  '  rates.defaults.{base, basis, currency, loading, contingency} # re-confirmed per bid',
  '  cv.masterPath                                              # your master CV',
]);

// Profile lives in the current folder (cwd-first); the legacy home location is
// only read as a fallback so profiles created by older versions keep working.
export function profilePath() {
  return path.resolve('.tor-to-proposal', 'profile.json');
}
const LEGACY_FILE = path.join(os.homedir(), '.tor-to-proposal', 'profile.json');

const NUMERIC = {
  'rates.floor.annualIncome': { min: 0, max: 1e9, label: 'annual income need' },
  'rates.floor.billableDays': { min: 0, max: 365, label: 'billable days per year' },
  'rates.floor.costLoading': { min: 0, max: 2, label: 'cost loading (0–2, e.g. 0.25)' },
  'rates.defaults.base': { min: 0, max: 1e7, label: 'base rate' },
  'rates.defaults.loading': { min: 0, max: 2, label: 'loading (0–2)' },
  'rates.defaults.contingency': { min: 0, max: 1, label: 'contingency (0–1)' },
};
const BASIS = ['hour', 'day', 'week', 'month'];

function readProfileAt(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function loadProfile() {
  return readProfileAt(profilePath()) || readProfileAt(LEGACY_FILE);
}

function emptyProfile() {
  const now = new Date().toISOString();
  return {
    version: 1,
    identity: { name: null, credentials: null, title: null, email: null, phone: null, location: null, nationality: null, languages: [] },
    rates: { floor: { annualIncome: null, billableDays: null, costLoading: null }, defaults: { base: null, basis: 'day', currency: 'USD', loading: null, contingency: null } },
    cv: { masterPath: null },
    meta: { createdAt: now, updatedAt: now },
  };
}

function getDeep(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setDeep(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function coerceAndValidate(dotted, raw) {
  let v;
  try { v = JSON.parse(raw); } catch { v = raw; }
  if (v === '' || v === 'null' || v === null) v = null;
  if (NUMERIC[dotted]) {
    if (v === null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) fail(`${dotted} must be a number (got: ${JSON.stringify(raw)})`, 2);
    const { min, max, label } = NUMERIC[dotted];
    if (n < min || n > max) fail(`${dotted} (${label}) must be between ${min} and ${max}`, 2);
    return n;
  }
  if (dotted === 'rates.defaults.basis' && v !== null && !BASIS.includes(String(v).toLowerCase())) {
    fail(`rates.defaults.basis must be one of ${BASIS.join('|')}`, 2);
  }
  if (dotted === 'cv.masterPath' && v !== null) {
    const p = String(v).replace(/^~(?=\/|$)/, os.homedir());
    if (!fs.existsSync(p)) fail(`cv.masterPath does not exist: ${p} (set it to your master CV file)`, 2);
    return p;
  }
  if (dotted === 'identity.languages' && v !== null && !Array.isArray(v)) {
    v = String(v).split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return v;
}

function save(profile) {
  profile.meta = { ...(profile.meta || {}), updatedAt: new Date().toISOString() };
  const file = profilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(profile, null, 2));
  process.stderr.write(`written: ${file}\n`);
}

// ---------- interactive wizard ----------
async function wizard() {
  const current = loadProfile() || emptyProfile();

  // Answers come from a real terminal when interactive; when stdin is piped
  // (automation, tests), all lines are read up front and consumed in order.
  const piped = !process.stdin.isTTY;
  let pipedLines = [];
  if (piped) {
    try {
      pipedLines = fs.readFileSync(0, 'utf8').split('\n').map((l) => l.trim());
    } catch { /* empty stdin -> quit below */ }
  }
  let pipedPos = 0;
  const nextLine = async () => (piped ? (pipedPos < pipedLines.length ? pipedLines[pipedPos++] : 'EOF') : '');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Each question: [get set on the profile, label, hint, default, toValue]
  const id = current.identity;
  const fl = current.rates.floor;
  const d = current.rates.defaults;
  const expandTilde = (v) => String(v).replace(/^~(?=\/|$)/, os.homedir());
  const toNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const questions = [
    { label: 'Full name (exactly as on your CV)', get: () => id.name, set: (v) => { id.name = v; } },
    { label: 'Credentials after your name (e.g. "PhD, PMP")', get: () => id.credentials, set: (v) => { id.credentials = v; } },
    { label: 'Professional title (e.g. "M&E Consultant")', get: () => id.title, set: (v) => { id.title = v; } },
    { label: 'Email', get: () => id.email, set: (v) => { id.email = v; } },
    { label: 'Phone (international format)', get: () => id.phone, set: (v) => { id.phone = v; } },
    { label: 'City, country', get: () => id.location, set: (v) => { id.location = v; } },
    { label: 'Nationality (some ToRs require it)', get: () => id.nationality, set: (v) => { id.nationality = v; } },
    { label: 'Working languages (comma-separated)', get: () => id.languages, set: (v) => { id.languages = v; } },
    {
      label: 'Path to your master CV file', get: () => current.cv.masterPath,
      set: (v) => {
        if (v === null || v === undefined || v === '') { current.cv.masterPath = current.cv.masterPath ?? null; return; }
        const p = expandTilde(v);
        if (!fs.existsSync(p)) process.stderr.write(`  ! file not found (${p}) — stored anyway; fix with: profile set cv.masterPath=...\n`);
        current.cv.masterPath = p;
      },
    },
    { label: 'Minimum annual income you need (your floor math)', hint: 'e.g. 60000', get: () => fl.annualIncome, set: (v) => { fl.annualIncome = toNum(v); } },
    { label: 'Realistic billable days per year', hint: 'e.g. 180', get: () => fl.billableDays, set: (v) => { fl.billableDays = toNum(v); } },
    { label: 'Cost loading (overheads on top of your net)', hint: 'e.g. 0.25', get: () => fl.costLoading, set: (v) => { fl.costLoading = toNum(v); } },
    { label: 'Default currency', get: () => d.currency || 'USD', set: (v) => { d.currency = String(v).toUpperCase(); } },
    { label: 'Typical base rate (optional — you confirm it per bid)', hint: 'e.g. 400', get: () => d.base, set: (v) => { d.base = toNum(v); } },
    { label: 'Typical loading', hint: 'e.g. 0.25', get: () => d.loading, set: (v) => { d.loading = toNum(v); } },
  ];

  process.stdout.write(
    `Consultant profile wizard — ${questions.length} questions, one at a time.\n` +
    'Press Enter to accept the [suggested] value. Type "back" to redo the previous question, "quit" to cancel.\n\n'
  );

  const fmt = (v) => (v === null || v === undefined || (Array.isArray(v) && !v.length)) ? '' : String(Array.isArray(v) ? v.join(', ') : v);
  const askLine = async (prompt) => {
    if (piped) return nextLine();
    try {
      return (await rl.question(prompt)).trim();
    } catch (err) {
      if (err && (err.code === 'ABORT_ERR' || err.name === 'AbortError')) return 'EOF'; // Ctrl+D
      throw err;
    }
  };
  let i = 0;
  while (i < questions.length) {
    const q = questions[i];
    const cur = fmt(q.get());
    const tail = q.hint ? ` (${q.hint})` : '';
    const a = await askLine(`(${i + 1}/${questions.length}) ${q.label}${tail} [${cur}]: `);
    if (a === 'EOF' || a.toLowerCase() === 'quit') {
      rl.close();
      process.stdout.write('\nCancelled — nothing was saved.\n');
      return;
    }
    if (a.toLowerCase() === 'back') {
      if (i === 0) { process.stdout.write('  (already at the first question)\n'); continue; }
      i -= 1;
      continue;
    }
    // blank = keep the current/suggested value shown in brackets
    q.set(a === '' ? q.get() : a);
    i += 1;
  }

  // Summary + confirm before anything is written
  const fields = [
    ['name', id.name], ['credentials', id.credentials], ['title', id.title], ['email', id.email],
    ['phone', id.phone], ['location', id.location], ['nationality', id.nationality], ['languages', id.languages],
    ['master CV', current.cv.masterPath],
    ['min annual income', fl.annualIncome], ['billable days/year', fl.billableDays], ['cost loading', fl.costLoading],
    ['currency', d.currency], ['typical base rate', d.base], ['typical loading', d.loading],
  ];
  process.stdout.write('\n--- Your answers ---\n');
  for (const [k, v] of fields) process.stdout.write(`  ${k.padEnd(20)} ${fmt(v) || '(empty)'}\n`);
  const confirm = await askLine('\nSave this profile? (Y/n): ');
  rl.close();
  if (confirm === 'EOF' || confirm === 'n' || confirm === 'no') {
    process.stdout.write('Cancelled — nothing was saved.\n');
    return;
  }
  save(current);
  process.stdout.write(
    `\nProfile saved: ${profilePath()}\n(it lives in the CURRENT folder — open it with: open .tor-to-proposal)\n\n` +
    'Next: drop a ToR + your CV into a folder and tell your AI assistant:\n  "Run a bid pack on <folder>"\n' +
    'Your saved numbers will be offered for one-keystroke confirmation — never used without it.\n'
  );
}

// ---------- dispatch (guarded so other tools can import loadProfile) ----------
import { pathToFileURL } from 'node:url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

async function main() {
if (args.__help || !cmd) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}

if (cmd === 'init') {
  await wizard();
} else if (cmd === 'set') {
  if (!args._.slice(1).length) fail('nothing to set. Example: profile set identity.name="A. Khan" rates.defaults.base=400', 2);
  const profile = loadProfile() || emptyProfile();
  for (const kv of args._.slice(1)) {
    const eq = kv.indexOf('=');
    if (eq <= 0) fail(`expected key=value, got "${kv}"`, 2);
    const key = kv.slice(0, eq).trim();
    if (key === 'meta' || key.startsWith('meta.') || key === 'version') fail(`"${key}" is managed by the tool`, 2);
    setDeep(profile, key, coerceAndValidate(key, kv.slice(eq + 1)));
    process.stderr.write(`set ${key}\n`);
  }
  save(profile);
} else if (cmd === 'get') {
  const profile = loadProfile();
  if (!profile) fail(`no profile at ${profilePath()} — run: tor-to-proposal init`, 2);
  if (args._[1]) {
    const v = getDeep(profile, args._[1]);
    if (v === undefined) fail(`unknown key: ${args._[1]}`, 2);
    process.stdout.write(JSON.stringify(v, null, 2) + '\n');
  } else process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
} else if (cmd === 'path') {
  process.stdout.write(profilePath() + '\n');
} else if (cmd === 'erase') {
  let erased = false;
  for (const file of [profilePath(), LEGACY_FILE]) {
    if (fs.existsSync(file)) { fs.rmSync(file); process.stderr.write(`erased: ${file}\n`); erased = true; }
  }
  if (!erased) process.stderr.write('no profile to erase\n');
} else {
  fail(`unknown command: ${cmd} (init | set | get | path | erase)`, 2);
}
}

if (isMain) await main();
