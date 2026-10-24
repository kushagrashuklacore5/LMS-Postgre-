#!/usr/bin/env node
/**
 * Validates the help knowledge base (docs/ai-knowledge-base) — no dependencies, read-only.
 *
 *   node docs/ai-knowledge-base-validation/validate-kb.js [kbDir] [--baseline oldKbDir]
 *
 * Checks
 *   1. Every document has front matter with the required fields; ids are unique and match the
 *      file name; `related` ids exist; `sources` files exist in the repository.
 *   2. User-facing text (the body, not the front matter) contains no backend detail
 *      (SQL, API paths, table/column names, code) — see FORBIDDEN.
 *   3. Every document except the index has a "Questions this answers" section.
 *   4. Evaluation dataset: for each question the expected document exists and contains every
 *      required phrase (document sufficiency).
 *   5. Retrieval proxy: a simple BM25 ranking over the documents must put the expected document
 *      in the top 3. This only approximates retrieval; it does NOT test the real chatbot.
 *   With --baseline, checks 4 and 5 also run against the old knowledge base for comparison.
 * Exit code 1 when a hard check (1–4) fails.
 */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const repoRoot = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const kbDir = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(repoRoot, 'docs', 'ai-knowledge-base'));
const baselineIdx = args.indexOf('--baseline');
const baselineDir = baselineIdx >= 0 ? path.resolve(args[baselineIdx + 1]) : null;
const dataset = JSON.parse(fs.readFileSync(path.join(here, 'evaluation-dataset.json'), 'utf8'));

const REQUIRED = ['id', 'title', 'intent', 'portal', 'roles', 'navigation', 'related', 'sources', 'verified', 'last_verified'];
const FORBIDDEN = [
  /\bSELECT\b[^\n]*\bFROM\b/, /\bINSERT\s+INTO\b/i, /\bUPDATE\s+\w+\s+SET\b/i, /\bDELETE\s+FROM\b/i, /\/api\//, /\bPRAGMA\b/,
  /\b(course_students|student_classroom_assignment|course_classrooms|university_id|live_classes|users\.\w+)\b/,
  /\breq\.(user|body|params)\b/, /\brouter\.(get|post|put|delete)\b/, /\bfetch\(/, /\bnpm\s+(run|install)\b/, /\bnode\s+server\.js\b/,
  /\.(js|jsx|tsx|sql)\b/,
];

function parseDoc(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { file, meta: null, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    else v = v.replace(/^"(.*)"$/, '$1');
    meta[kv[1]] = v;
  }
  return { file, meta, body: m[2] };
}

const loadDir = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => parseDoc(path.join(dir, f)));

/* ---------- BM25 retrieval proxy ---------- */
const STOP = new Set('a an the to of in on for and or is are do does i my me how what where why can when with this that it be by from at as you your we our'.split(' '));
const tokens = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
function makeIndex(docs) {
  const items = docs.map((d) => ({ id: d.meta?.id || path.basename(d.file, '.md'), tf: new Map(), len: 0, text: `${d.meta?.title || ''} ${d.body}` }));
  items.forEach((it) => { for (const t of tokens(it.text)) { it.tf.set(t, (it.tf.get(t) || 0) + 1); it.len += 1; } });
  const df = new Map();
  items.forEach((it) => it.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
  const avg = items.reduce((s, it) => s + it.len, 0) / items.length;
  return (query) => {
    const q = tokens(query);
    return items.map((it) => {
      let score = 0;
      for (const t of q) {
        const f = it.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (items.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
        score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * it.len / avg));
      }
      return { id: it.id, score, text: it.text };
    }).sort((a, b) => b.score - a.score);
  };
}

/* ---------- checks ---------- */
const problems = [];
const docs = loadDir(kbDir);
const ids = new Map();
for (const d of docs) {
  const name = path.basename(d.file);
  if (!d.meta) { problems.push(`${name}: no front matter`); continue; }
  for (const k of REQUIRED) if (d.meta[k] === undefined) problems.push(`${name}: missing ${k}`);
  if (ids.has(d.meta.id)) problems.push(`${name}: duplicate id ${d.meta.id}`);
  ids.set(d.meta.id, d);
  if (d.meta.id !== 'index' && name !== `${d.meta.id}.md`) problems.push(`${name}: file name does not match id ${d.meta.id}`);
  for (const s of [].concat(d.meta.sources || [])) if (!fs.existsSync(path.join(repoRoot, s))) problems.push(`${name}: source not found ${s}`);
  FORBIDDEN.forEach((re) => { const hit = d.body.match(re); if (hit) problems.push(`${name}: backend detail in user text: "${hit[0]}"`); });
  if (d.meta.id !== 'index' && !/^## Questions this answers/m.test(d.body)) problems.push(`${name}: no "Questions this answers" section`);
}
for (const d of docs) for (const r of [].concat(d.meta?.related || [])) if (!ids.has(r)) problems.push(`${path.basename(d.file)}: related id not found ${r}`);

function evaluate(docsToUse, label, byId) {
  const search = makeIndex(docsToUse);
  let sufficient = 0;
  let top1 = 0;
  let top3 = 0;
  let top3Facts = 0;
  const rows = [];
  for (const q of dataset.questions) {
    const lc = (s) => s.toLowerCase();
    const ranked = search(q.question);
    const ranks = ranked.slice(0, 3).map((r) => r.id);
    // sufficiency: the expected doc (or, for the baseline, any doc) holds every required phrase
    const target = byId ? byId.get(q.expected_doc) : null;
    const hasAll = (text) => q.must_include.every((p) => lc(text).includes(lc(p)));
    const ok = byId ? Boolean(target) && hasAll(`${target.meta.title} ${target.body}`) : docsToUse.some((d) => hasAll(d.body));
    const missing = byId && target ? q.must_include.filter((p) => !lc(`${target.meta.title} ${target.body}`).includes(lc(p))) : [];
    const retrievedFacts = ranked.slice(0, 3).some((r) => hasAll(r.text));
    if (ok) sufficient += 1;
    if (byId && ranks[0] === q.expected_doc) top1 += 1;
    if (byId && ranks.includes(q.expected_doc)) top3 += 1;
    if (retrievedFacts) top3Facts += 1;
    rows.push({ id: q.id, ok, missing, top3: ranks, hit3: byId ? ranks.includes(q.expected_doc) : null, retrievedFacts });
  }
  const n = dataset.questions.length;
  console.log(`\n[${label}] ${docsToUse.length} documents, ${n} questions`);
  console.log(`  document sufficiency (required facts present)     : ${sufficient}/${n}`);
  if (byId) console.log(`  retrieval proxy: expected doc ranked 1st / top 3    : ${top1}/${n} / ${top3}/${n}`);
  console.log(`  retrieval proxy: a top-3 doc holds all required facts: ${top3Facts}/${n}`);
  return rows;
}

console.log(`Knowledge base: ${kbDir}`);
const rows = evaluate(docs, 'new knowledge base', ids);
const failedSufficiency = rows.filter((r) => !r.ok);
failedSufficiency.forEach((r) => problems.push(`${r.id}: expected document lacks ${JSON.stringify(r.missing)}`));
const missedRetrieval = rows.filter((r) => !r.hit3);
if (missedRetrieval.length) {
  console.log('  retrieval proxy misses (expected doc not in top 3; informational):');
  missedRetrieval.forEach((r) => console.log(`    ${r.id}: top 3 = ${r.top3.join(', ')}`));
}
if (baselineDir) {
  const old = loadDir(baselineDir);
  evaluate(old, 'baseline (old knowledge base)', null);
  const oldForbidden = old.reduce((n, d) => n + FORBIDDEN.filter((re) => re.test(d.body)).length, 0);
  console.log(`  backend-detail patterns found in user text           : ${oldForbidden} (new: ${docs.reduce((n, d) => n + FORBIDDEN.filter((re) => re.test(d.body)).length, 0)})`);
}

console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n${problems.join('\n')}` : '\nAll hard checks passed.');
process.exit(problems.length ? 1 : 0);
