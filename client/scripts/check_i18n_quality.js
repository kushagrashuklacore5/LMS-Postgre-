// Translation-quality gate, complementary to verify_i18n.js (which checks file
// presence, key parity and interpolation tokens). This script checks content:
//   1. every value in every locale uses only its own script (no stray
//      characters from another Indic/Arabic/Ol Chiki block);
//   2. for keys referenced from src/ (what users can actually see):
//      - the value is not left as the English source,
//      - the value contains the locale's native script,
//      - non-Hindi Devanagari locales are not long verbatim copies of Hindi.
// Keys that no source file references are reported (not failed) so remaining
// legacy English fallbacks stay visible instead of being hidden.
// Run with: node scripts/check_i18n_quality.js   (from the client folder)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(__dirname, '../public/locales');
const srcDir = path.resolve(__dirname, '../src');
const { ACTIVE_LANGUAGES } = await import('../src/i18n/languageRegistry.js');

const namespaces = ['common', 'navigation', 'dashboard', 'forms', 'notifications', 'tours', 'chatbot'];
const SCRIPTS = {
  Devanagari: /[ऀ-ॣ०-ॿ]/, // danda U+0964/0965 is shared by Indic scripts
  Bengali: /[ঀ-৿]/,
  Gurmukhi: /[਀-੿]/,
  Gujarati: /[઀-૿]/,
  Odia: /[଀-୿]/,
  Tamil: /[஀-௿]/,
  Telugu: /[ఀ-౿]/,
  Kannada: /[ಀ-೿]/,
  Malayalam: /[ഀ-ൿ]/,
  Arabic: /[؀-ۿ]/,
  OlChiki: /[᱐-᱿]/,
};
const EXPECTED_SCRIPT = {
  'hi-IN': 'Devanagari', 'mr-IN': 'Devanagari', 'sa-IN': 'Devanagari', 'ne-IN': 'Devanagari',
  'kok-IN': 'Devanagari', 'brx-IN': 'Devanagari', 'bn-IN': 'Bengali', 'as-IN': 'Bengali',
  'mni-IN': 'Bengali', 'te-IN': 'Telugu', 'ta-IN': 'Tamil', 'gu-IN': 'Gujarati', 'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam', 'pa-IN': 'Gurmukhi', 'or-IN': 'Odia', 'ur-IN': 'Arabic', 'ks-IN': 'Arabic',
  'sat-IN': 'OlChiki',
};
// Values made only of brand names, codes and placeholders may legitimately stay Latin.
const LATIN_ALLOWED = /\b(Core5|Academy|LMS|GuideBot|Google|Excel|CSV|PDF|SQLite|UPI|NEFT|QR|DD|ID|AI|IT|OTP|URL|Ctrl|Cmd|S\.No|N\/A|PM|AM|e\.g\.)\b/g;
const isOnlyAllowedLatin = (s) => !/[A-Za-z]{2,}/.test(s.replace(/\{\{?\w+\}?\}/g, '').replace(LATIN_ALLOWED, ''));
const HINDI_COPY_MIN_WORDS = 5;

const dicts = {};
for (const lng of ACTIVE_LANGUAGES) {
  dicts[lng] = {};
  for (const ns of namespaces) {
    dicts[lng][ns] = JSON.parse(fs.readFileSync(path.join(localesDir, lng, `${ns}.json`), 'utf8'));
  }
}

// Keys referenced from source, using the same t('...') pattern as verify_i18n.js.
// An un-prefixed key counts as referenced in every namespace that defines it.
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return ['node_modules', 'dist', '.git'].includes(e.name) ? [] : walk(full);
  return ['.jsx', '.tsx', '.js', '.ts'].includes(path.extname(e.name)) ? [full] : [];
});
const referenced = new Set();
for (const file of walk(srcDir)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const [, key] of content.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.:-]+)['"`]/g)) {
    if (key.includes(':')) {
      referenced.add(key);
    } else {
      for (const ns of namespaces) if (key in dicts['en-IN'][ns]) referenced.add(`${ns}:${key}`);
    }
  }
}

let failures = 0;
const fail = (lng, msg) => {
  failures++;
  if (failures <= 40) console.error(`  ❌ ${lng} ${msg}`);
};

console.log(`Checking ${ACTIVE_LANGUAGES.length} locales; ${referenced.size} keys referenced from src/.\n`);
console.log('Locale  | Foreign script | Ref. English | Ref. no native script | Ref. Hindi copy | Unreferenced English');
console.log('--------|----------------|--------------|-----------------------|-----------------|---------------------');

for (const lng of ACTIVE_LANGUAGES) {
  if (lng === 'en-IN') continue;
  const expected = EXPECTED_SCRIPT[lng];
  const c = { foreign: 0, english: 0, noNative: 0, hindiCopy: 0, unrefEnglish: 0 };
  for (const ns of namespaces) {
    for (const [key, raw] of Object.entries(dicts[lng][ns])) {
      if (typeof raw !== 'string') continue;
      const id = `${ns}:${key}`;
      const en = String(dicts['en-IN'][ns][key] ?? '');
      const foreign = Object.entries(SCRIPTS).find(([name, re]) => name !== expected && re.test(raw));
      if (foreign) { c.foreign++; fail(lng, `${id}: contains ${foreign[0]} characters`); }

      const untranslated = raw === en && !isOnlyAllowedLatin(en);
      if (!referenced.has(id)) {
        if (untranslated) c.unrefEnglish++;
        continue;
      }
      if (untranslated) { c.english++; fail(lng, `${id}: still English "${en.slice(0, 50)}"`); continue; }
      if (!isOnlyAllowedLatin(en) && !SCRIPTS[expected].test(raw)) {
        c.noNative++; fail(lng, `${id}: no ${expected} characters in "${raw.slice(0, 50)}"`);
      }
      if (expected === 'Devanagari' && lng !== 'hi-IN' && raw === dicts['hi-IN'][ns][key]
        && raw.trim().split(/\s+/).length >= HINDI_COPY_MIN_WORDS) {
        c.hindiCopy++; fail(lng, `${id}: verbatim Hindi copy "${raw.slice(0, 50)}"`);
      }
    }
  }
  console.log(`${lng.padEnd(7)} | ${String(c.foreign).padEnd(14)} | ${String(c.english).padEnd(12)} | ${String(c.noNative).padEnd(21)} | ${String(c.hindiCopy).padEnd(15)} | ${c.unrefEnglish}`);
}

if (failures > 40) console.error(`  ... and ${failures - 40} more`);
if (failures) {
  console.error(`\n❌ ${failures} translation-quality problems found.`);
  process.exit(1);
}
console.log('\n✅ No foreign-script values; every key referenced from src/ is translated into its native script.');
console.log('   "Unreferenced English" counts legacy keys no source file uses; they are not user-visible but are still untranslated.');
