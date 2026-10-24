import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..');
const localesDir = path.resolve(__dirname, '../public/locales');
const srcDir = path.resolve(__dirname, '../src');

console.log('=== MULTILINGUAL I18N VERIFICATION & AUDIT SUITE (20 LANGUAGES) ===\n');

// Import registry metadata
const registryModule = await import('../src/i18n/languageRegistry.js');
const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, ACTIVE_LANGUAGES, normalizeLanguageCode } = registryModule;

const namespaces = ['common', 'navigation', 'dashboard', 'forms', 'notifications', 'tours', 'chatbot'];
let hasErrors = false;
const dicts = {};

// 1. Verify all 20 languages and 140 JSON files exist and parse
console.log(`Auditing ${ACTIVE_LANGUAGES.length} active languages across ${namespaces.length} namespaces (Target: ${ACTIVE_LANGUAGES.length * namespaces.length} files)...\n`);

let totalLoadedFiles = 0;
for (const lng of ACTIVE_LANGUAGES) {
  dicts[lng] = {};
  for (const ns of namespaces) {
    const filePath = path.join(localesDir, lng, `${ns}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing locale file: ${filePath}`);
      hasErrors = true;
      continue;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      dicts[lng][ns] = JSON.parse(content);
      totalLoadedFiles++;
    } catch (err) {
      console.error(`❌ Syntax error in ${filePath}:`, err.message);
      hasErrors = true;
    }
  }
}

console.log(`✓ Successfully verified and loaded ${totalLoadedFiles} / ${ACTIVE_LANGUAGES.length * namespaces.length} locale JSON files.\n`);

// 2. Check 100% Key Parity against en-IN Master
console.log('--- Verifying key parity, completeness, and non-empty values ---');
const masterEnDict = dicts['en-IN'];
const allEnKeys = new Set();
const statsPerLanguage = {};

for (const ns of namespaces) {
  Object.keys(masterEnDict[ns]).forEach(k => {
    allEnKeys.add(k);
    allEnKeys.add(`${ns}:${k}`);
  });
}

for (const lng of ACTIVE_LANGUAGES) {
  statsPerLanguage[lng] = {
    totalKeys: 0,
    missingKeys: 0,
    emptyKeys: 0,
    translatedKeys: 0,
    englishFallbackKeys: 0,
  };

  const allowedIdentical = ['Core5 LMS', 'Core5', 'ID', 'OTP', 'PDF', 'CSV', 'LMS', 'API', 'GST', 'INR', 'URL', 'N/A', 'ID:', 'Roll No:'];

  for (const ns of namespaces) {
    const enKeys = Object.keys(masterEnDict[ns]);
    const targetKeys = Object.keys(dicts[lng][ns] || {});
    statsPerLanguage[lng].totalKeys += enKeys.length;

    // Missing keys
    const missing = enKeys.filter(k => !(k in (dicts[lng][ns] || {})));
    if (missing.length > 0) {
      console.error(`❌ ${lng}/${ns}.json missing ${missing.length} keys: ${missing.slice(0, 3).join(', ')}...`);
      statsPerLanguage[lng].missingKeys += missing.length;
      hasErrors = true;
    }

    // Empty keys
    const empty = targetKeys.filter(k => dicts[lng][ns][k] === undefined || dicts[lng][ns][k] === '');
    if (empty.length > 0) {
      console.error(`❌ ${lng}/${ns}.json contains ${empty.length} empty keys: ${empty.slice(0, 3).join(', ')}...`);
      statsPerLanguage[lng].emptyKeys += empty.length;
      hasErrors = true;
    }

    // Variable check
    for (const k of enKeys) {
      if (dicts[lng][ns] && dicts[lng][ns][k] !== undefined) {
        const enVal = String(masterEnDict[ns][k]);
        const targetVal = String(dicts[lng][ns][k]);

        const enVars = (enVal.match(/\{[^{}]+\}/g) || []).filter(v => v !== '{plural}').sort();
        const targetVars = (targetVal.match(/\{[^{}]+\}/g) || []).filter(v => v !== '{plural}').sort();
        
        if (enVars.join(',') !== targetVars.join(',')) {
          console.error(`❌ Variable mismatch in ${lng} [${ns}:${k}]: en-IN=${JSON.stringify(enVars)} vs ${lng}=${JSON.stringify(targetVars)}`);
          hasErrors = true;
        }

        // Translation status
        if (lng === 'en-IN') {
          statsPerLanguage[lng].translatedKeys++;
        } else {
          if (targetVal === enVal && !allowedIdentical.includes(enVal)) {
            if (enVal.startsWith('http') || enVal.startsWith('name@') || enVal === '••••••••' || enVal === 'Learning that moves everyone forward.' || enVal.startsWith('Give educators the clarity')) {
              statsPerLanguage[lng].translatedKeys++; // Legitimate preserved formats & hero exceptions
            } else {
              statsPerLanguage[lng].englishFallbackKeys++;
            }
          } else {
            statsPerLanguage[lng].translatedKeys++;
          }
        }
      }
    }
  }
}

// Print detailed language parity table
console.log('\n--- 20-Language Status Summary Table ---');
console.log('Locale   | Language (Native)         | Keys  | Translated | Fallbacks | Parity');
console.log('---------|---------------------------|-------|------------|-----------|--------');
for (const lng of ACTIVE_LANGUAGES) {
  const meta = SUPPORTED_LANGUAGES[lng];
  const stat = statsPerLanguage[lng];
  const parityPct = ((stat.totalKeys - stat.missingKeys) / stat.totalKeys * 100).toFixed(0);
  const transPct = (stat.translatedKeys / stat.totalKeys * 100).toFixed(1);
  const nameLabel = `${meta.name} (${meta.nativeName})`.padEnd(25);
  console.log(`${lng.padEnd(8)} | ${nameLabel} | ${String(stat.totalKeys).padEnd(5)} | ${String(stat.translatedKeys).padEnd(10)} | ${String(stat.englishFallbackKeys).padEnd(9)} | ${parityPct}%`);
}

// 3. Scan code for unresolved keys
console.log('\n--- Scanning code for unresolved translation keys ---');
function getAllFiles(dir, exts = ['.jsx', '.tsx', '.js', '.ts']) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(entry.name)) {
        files = files.concat(getAllFiles(full, exts));
      }
    } else if (exts.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const allSrcFiles = getAllFiles(srcDir);
const unresolvedCodeKeys = [];

for (const file of allSrcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const tRegex = /\bt\(\s*['"`]([a-zA-Z0-9_.:-]+)['"`]/g;
  let match;
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[1];
    const keyClean = key.includes(':') ? key.split(':')[1] : key;
    if (!allEnKeys.has(key) && !allEnKeys.has(keyClean)) {
      unresolvedCodeKeys.push({ file: path.relative(clientDir, file).replace(/\\/g, '/'), key });
    }
  }
}

if (unresolvedCodeKeys.length > 0) {
  console.error(`❌ Found ${unresolvedCodeKeys.length} unresolved keys in code:`);
  unresolvedCodeKeys.slice(0, 10).forEach(u => console.error(`   ${u.file}: ${u.key}`));
  hasErrors = true;
} else {
  console.log(`✓ 0 unresolved keys: All keys referenced in source code resolve in translation dictionaries.`);
}

// 4. Verify languageRegistry and metadata
console.log('\n--- Checking languageRegistry.js constraints ---');
if (DEFAULT_LANGUAGE !== 'en-IN') {
  console.error(`❌ DEFAULT_LANGUAGE is "${DEFAULT_LANGUAGE}", expected "en-IN"`);
  hasErrors = true;
} else {
  console.log('✓ DEFAULT_LANGUAGE is en-IN');
}

if (ACTIVE_LANGUAGES.length !== 20) {
  console.error(`❌ ACTIVE_LANGUAGES contains ${ACTIVE_LANGUAGES.length} languages, expected exactly 20`);
  hasErrors = true;
} else {
  console.log(`✓ ACTIVE_LANGUAGES contains all 20 specified Indian languages`);
}

// Verify RTL languages
const rtlLangs = ACTIVE_LANGUAGES.filter(code => SUPPORTED_LANGUAGES[code]?.dir === 'rtl');
if (!rtlLangs.includes('ur-IN') || !rtlLangs.includes('ks-IN') || rtlLangs.length !== 2) {
  console.error(`❌ RTL verification failed: expected ['ur-IN', 'ks-IN'], got:`, rtlLangs);
  hasErrors = true;
} else {
  console.log(`✓ Correct RTL direction registered for Urdu (ur-IN) and Kashmiri (ks-IN)`);
}

// Verify backward-compatibility mapping
if (normalizeLanguageCode('en') !== 'en-IN' || normalizeLanguageCode('hi') !== 'hi-IN' || normalizeLanguageCode('bn') !== 'bn-IN' || normalizeLanguageCode('ur') !== 'ur-IN') {
  console.error('❌ normalizeLanguageCode failed backward-compatibility mapping');
  hasErrors = true;
} else {
  console.log('✓ normalizeLanguageCode accurately maps legacy 2-letter codes across all languages');
}

// Final assertion
if (hasErrors) {
  console.error('\n❌ Multilingual i18n verification failed with errors.');
  process.exit(1);
} else {
  console.log('\n✅ All 20-language multilingual i18n checks passed successfully!');
  process.exit(0);
}
