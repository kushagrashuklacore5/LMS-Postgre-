import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..');
const srcDir = path.join(clientDir, 'src');
const localesDir = path.join(clientDir, 'public', 'locales');

console.log('=== SYSTEMATIC I18N AUDIT SCANNER ===\n');

// 1. Extract all routes from App.jsx
const appJsx = fs.readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
const routeRegex = /<Route\s+path=["']([^"']+)["']\s+element=\{([\s\S]*?)\}/g;
let match;
const routes = [];
while ((match = routeRegex.exec(appJsx)) !== null) {
  const routePath = match[1];
  const elementBody = match[2];
  // extract component name inside element
  const compMatch = elementBody.match(/<([A-Z][A-Za-z0-9_]+)/g);
  const components = compMatch ? compMatch.map(c => c.replace('<', '')).filter(c => !['ProtectedRoute', 'Navigate'].includes(c)) : [];
  routes.push({ path: routePath, components, raw: elementBody.trim().replace(/\s+/g, ' ') });
}

console.log(`Found ${routes.length} routed paths in App.jsx:`);
const portalRoutes = {
  public: [],
  student: [],
  mentor: [],
  teacher: [],
  admin: [],
  superadmin: [],
  accountant: [],
  storekeeper: [],
  vendor: [],
  other: []
};

for (const r of routes) {
  const p = r.path;
  if (p === '/' || p === '/login' || p === '/home' || p === '/register' || p.startsWith('/demo') || p.startsWith('/student-setup')) {
    portalRoutes.public.push(r);
  } else if (p.startsWith('/student')) {
    portalRoutes.student.push(r);
  } else if (p.startsWith('/mentor')) {
    portalRoutes.mentor.push(r);
  } else if (p.startsWith('/teacher')) {
    portalRoutes.teacher.push(r);
  } else if (p.startsWith('/admin')) {
    portalRoutes.admin.push(r);
  } else if (p.startsWith('/superadmin') || p.startsWith('/internal')) {
    portalRoutes.superadmin.push(r);
  } else if (p.startsWith('/accountant')) {
    portalRoutes.accountant.push(r);
  } else if (p.startsWith('/storekeeper')) {
    portalRoutes.storekeeper.push(r);
  } else if (p.startsWith('/vendor')) {
    portalRoutes.vendor.push(r);
  } else {
    portalRoutes.other.push(r);
  }
}

for (const [portal, rList] of Object.entries(portalRoutes)) {
  console.log(`- ${portal.toUpperCase()}: ${rList.length} routes`);
}

// 2. Load all current locale JSON files
const namespaces = ['common', 'navigation', 'dashboard', 'forms', 'notifications', 'tours', 'chatbot'];
const locales = { 'en-IN': {}, 'hi-IN': {} };
for (const lng of ['en-IN', 'hi-IN']) {
  for (const ns of namespaces) {
    const fPath = path.join(localesDir, lng, `${ns}.json`);
    if (fs.existsSync(fPath)) {
      locales[lng][ns] = JSON.parse(fs.readFileSync(fPath, 'utf8'));
    }
  }
}

const allEnKeys = new Set();
for (const ns of namespaces) {
  for (const k of Object.keys(locales['en-IN'][ns] || {})) {
    allEnKeys.add(k);
    allEnKeys.add(`${ns}:${k}`);
  }
}

// 3. Scan all src/ files for useTranslation, t() calls, and hardcoded JSX text
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
console.log(`\nAuditing ${allSrcFiles.length} source files in src/...`);

const auditData = [];
const missingKeysInCode = new Set();
let filesUsingTranslation = 0;
let filesWithoutTranslation = 0;

for (const file of allSrcFiles) {
  const relPath = path.relative(clientDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  
  const hasUseTranslation = /useTranslation\s*\(/.test(content);
  if (hasUseTranslation) filesUsingTranslation++;
  else filesWithoutTranslation++;

  // Find t('key') calls
  const tCalls = [];
  const tRegex = /\bt\(\s*['"`]([a-zA-Z0-9_.:-]+)['"`]/g;
  let tMatch;
  while ((tMatch = tRegex.exec(content)) !== null) {
    const key = tMatch[1];
    tCalls.push(key);
    // check if key exists in allEnKeys or if it has namespace prefix
    const keyClean = key.includes(':') ? key.split(':')[1] : key;
    if (!allEnKeys.has(key) && !allEnKeys.has(keyClean)) {
      missingKeysInCode.add({ file: relPath, key });
    }
  }

  // Count rough hardcoded strings in JSX (>Some Text<)
  const jsxTextMatches = content.match(/>\s*([A-Z][a-zA-Z0-9\s,.'!?-]{3,50})\s*</g) || [];
  
  auditData.push({
    file: relPath,
    hasUseTranslation,
    tCallsCount: tCalls.length,
    jsxTextCount: jsxTextMatches.length,
    sampleHardcoded: jsxTextMatches.slice(0, 3).map(s => s.replace(/[><]/g, '').trim())
  });
}

console.log(`\nAudit Summary:`);
console.log(`- Files using translation hook: ${filesUsingTranslation}`);
console.log(`- Files without translation hook: ${filesWithoutTranslation}`);
console.log(`- Keys referenced in code but missing from JSON dictionaries: ${missingKeysInCode.size}`);
if (missingKeysInCode.size > 0) {
  console.log('Sample missing keys:');
  Array.from(missingKeysInCode).slice(0, 10).forEach(m => console.log(`  ${m.file}: ${m.key}`));
}

// 4. Output detailed per-portal report
fs.writeFileSync(
  path.join(clientDir, 'scripts', 'audit_result.json'),
  JSON.stringify({ portalRoutes, missingKeys: Array.from(missingKeysInCode), auditData }, null, 2)
);
console.log(`\nDetailed audit results saved to scripts/audit_result.json`);
