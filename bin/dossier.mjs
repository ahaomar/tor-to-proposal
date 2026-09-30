#!/usr/bin/env node
// dossier: client-intelligence scaffolder. Generates the research structure;
// every fact you put in it must carry source + access date (citation rule).
import { parseArgs, writeOut, helpText } from './lib.mjs';

const HELP = helpText('dossier', [
  'Usage: node bin/dossier.mjs --client "UNOPS" [--sector "M&E"] [--out client-dossier.md]',
  '',
  'Scaffolds client-dossier.md: type presets, payment reputation, past awards,',
  'evaluation committee. Research outputs feed pricing contingency + tone.',
]);

const PRESETS = {
  un: 'UN system agency or fund. Tone: formal multilateral, results-framework vocabulary, SDG alignment where the ToR asks. Registration: UNGM (ungm.org) vendor account usually required before contract award; some agencies additionally use their own vendor portals (UNGM -> "United Nations Global Marketplace" -> register -> UNGM Vendor Number). Payment reputation: search "UNGM contract awards <agency> <sector>".',
  ingo: 'International NGO. Tone: mission- and beneficiary-first; donor visibility rules matter. Registration: usually vendor forms + due diligence pack (registration docs, bank letter, anti-terrorist financing screening). Payment: grant-conditioned; verify payment-terms reputation in the ToR + peer networks.',
  ministry: 'Government ministry or agency. Tone: national-plan/policy alignment; cite the relevant national strategy by name in your technical response. Registration: national procurement portal + tax clearance. Payment: verify budget-line availability; payment delays are common — feed contingency.',
  private: 'Private sector / foundation. Tone: ROI and deliverable-milestone language. Registration: vendor onboarding + compliance screening. Payment: usually faster; verify in ToR.',
};

const args = parseArgs(process.argv.slice(2));
if (args.__help || !args.client) {
  process.stdout.write(HELP);
  process.exit(args.__help ? 0 : 1);
}
const client = String(args.client).trim();
const sector = args.sector || '[FILL: sector]';
const c = client.toLowerCase();
const typeKey = /ministry|government|dept/.test(c) ? 'ministry' : /united nations|\bun\b|undp|unops|unicef|unhcr|iom|fao|wfp|who|unesco/.test(c) ? 'un' : /ngo|save the children|oxfam|care|nrcs|irc|nrc/.test(c) ? 'ingo' : 'private';

const md = `# Client dossier — ${client}\n\n> Every row below needs a source + access date. This file feeds pricing\n> contingency (payment risk) and proposal tone. No invented facts.\n\n## Type preset: ${typeKey.toUpperCase()}\n${PRESETS[typeKey]}\n\n## 1. Registration prerequisites\n- [ ] Portal(s) required: [FILL]\n- [ ] Documents required before award: [FILL]\n- [ ] Lead time to register: [FILL] (bid only if registration fits inside the deadline)\n\n## 2. Payment reputation (feeds pricing contingency)\n| Signal | Finding | Source + date |\n| --- | --- | --- |\n| Typical payment delay after invoice | [FILL] | [FILL] |\n| Public complaints / vendor disclosures | [FILL] | [FILL] |\n| Currency of payment + FX risk | [FILL] | [FILL] |\n\nRule: documented slow payer -> raise pricing contingency or negotiate advance payment; cite the reason in your own notes, not the proposal.\n\n## 3. Past awards for similar work (calibrates your rate band)\n| Award | Year | Winner (if disclosed) | Value | Source + date |\n| --- | --- | --- | --- | --- |\n| [FILL] | | | | |\n\nSearch: UNGM "Contract Award" notices for ${client}; national procurement portals; ${sector} keyword.\n\n## 4. Evaluation committee / process\n- Members or roles stated in ToR: [FILL]\n- Two-envelope (technical opened first) or single envelope: [FILL — check ToR p.X]\n- Clarification history of past solicitations: [FILL]\n\n## 5. What this means for THIS bid\n- Tone to adopt: [FILL from preset + ToR wording]\n- Rate band implication: [FILL from §2 + §3]\n- Risk to price in: [FILL]\n`;
writeOut(args.out || 'client-dossier.md', md);
process.stderr.write(`dossier scaffold written for ${client} (type: ${typeKey}).\n`);
