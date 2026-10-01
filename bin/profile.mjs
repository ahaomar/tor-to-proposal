#!/usr/bin/env node
// profile: the one-time consultant profile -> ~/.tor-to-proposal/profile.json
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
  'One-time consultant profile, stored at ~/.tor-to-proposal/profile.json.',
  '',
  '  init                 interactive wizard (terminal prompts; blank = keep current)',
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

const FILE = path.join(os.homedir(), '.tor-to-proposal', 'profile.json');

const NUMERIC = {
  'rates.floor.annualIncome': { min: 0, max: 1e9, label: 'annual income need' },
  'rates.floor.billableDays': { min: 0, max: 365, label: 'billable days per year' },
  'rates.floor.costLoading': { min: 0, max: 2, label: 'cost loading (0–2, e.g. 0.25)' },
  'rates.defaults.base': { min: 0, max: 1e7, label: 'base rate' },
  'rates.defaults.loading': { min: 0, max: 2, label: 'loading (0–2)' },
  'rates.defaults.contingency': { min: 0, max: 1, label: 'contingency (0–1)' },
};
const BASIS = ['hour', 'day', 'week', 'month'];

export function loadProfile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return null;
  }
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
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(profile, null, 2));
  process.stderr.write(`written: ${FILE}\n`);
}

// ---------- interactive wizard ----------
async function wizard() {
  const current = loadProfile() || emptyProfile();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (label, existing, hint = '') => {
    const tail = hint ? ` (${hint})` : '';
    const cur = existing === null || existing === undefined || (Array.isArray(existing) && !existing.length) ? '' : String(Array.isArray(existing) ? existing.join(', ') : existing);
    const a = (await rl.question(`${label}${tail} [${cur}]: `)).trim();
    return a === '' ? existing : a;
  };
  const id = current.identity;
  id.name = await ask('Full name (exactly as on your CV)', id.name);
  id.credentials = await ask('Credentials after your name (e.g. "PhD, PMP")', id.credentials);
  id.title = await ask('Professional title (e.g. "M&E Consultant")', id.title);
  id.email = await ask('Email', id.email);
  id.phone = await ask('Phone (international format)', id.phone);
  id.location = await ask('City, country', id.location);
  id.nationality = await ask('Nationality (some ToRs require it)', id.nationality);
  id.languages = await ask('Working languages (comma-separated)', id.languages);
  const cv = await ask('Path to your master CV file', current.cv.masterPath);
  if (cv !== current.cv.masterPath) {
    const p = String(cv).replace(/^~(?=\/|$)/, os.homedir());
    if (!fs.existsSync(p)) process.stderr.write(`  ! file not found (${p}) — stored anyway; fix with: profile set cv.masterPath=...\n`);
    current.cv.masterPath = p;
  }
  const fl = current.rates.floor;
  const asNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  let a = await ask('Minimum annual income you need (your floor math)', fl.annualIncome, 'e.g. 60000');
  fl.annualIncome = a === fl.annualIncome ? fl.annualIncome : asNum(a);
  a = await ask('Realistic billable days per year', fl.billableDays, 'e.g. 180');
  fl.billableDays = a === fl.billableDays ? fl.billableDays : asNum(a);
  a = await ask('Cost loading (overheads on top of your net)', fl.costLoading, 'e.g. 0.25');
  fl.costLoading = a === fl.costLoading ? fl.costLoading : asNum(a);
  const d = current.rates.defaults;
  a = await ask('Default currency', d.currency || 'USD');
  d.currency = String(a).toUpperCase();
  a = await ask('Typical base rate (optional — you confirm it per bid)', d.base, 'e.g. 400');
  d.base = a === d.base ? d.base : asNum(a);
  a = await ask('Typical loading', d.loading, 'e.g. 0.25');
  d.loading = a === d.loading ? d.loading : asNum(a);
  rl.close();
  save(current);
  process.stdout.write(
    `\nProfile saved: ${FILE}\n\nNext: drop a ToR + your CV into a folder and tell your AI assistant:\n  "Run a bid pack on <folder>"\n` +
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
  if (!profile) fail(`no profile at ${FILE} — run: tor-to-proposal init`, 2);
  if (args._[1]) {
    const v = getDeep(profile, args._[1]);
    if (v === undefined) fail(`unknown key: ${args._[1]}`, 2);
    process.stdout.write(JSON.stringify(v, null, 2) + '\n');
  } else process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
} else if (cmd === 'path') {
  process.stdout.write(FILE + '\n');
} else if (cmd === 'erase') {
  if (fs.existsSync(FILE)) { fs.rmSync(FILE); process.stderr.write(`erased: ${FILE}\n`); }
  else process.stderr.write('no profile to erase\n');
} else {
  fail(`unknown command: ${cmd} (init | set | get | path | erase)`, 2);
}
}

if (isMain) await main();
