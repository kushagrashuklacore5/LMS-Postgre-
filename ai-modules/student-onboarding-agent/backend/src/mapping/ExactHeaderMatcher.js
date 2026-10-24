/**
 * Deterministic column recognition for PROPERLY FORMATTED spreadsheets (no LLM).
 *
 * A header is recognized when it equals, ignoring case, spaces and punctuation, either a canonical
 * field name ("fullName") or one of that field's schema mappingHints ("Full Name", "Email", "Class",
 * "Section", ...). A name that would fit more than one field is never used.
 *
 * exactHeaderProposal() returns a mapping-contract proposal ONLY when EVERY header is recognized
 * and no field is used twice; otherwise it returns null and the caller uses the existing flow
 * (LLM suggestion if configured, else manual mapping). The proposal still goes through
 * ColumnMappingGuard like any other proposal.
 */
const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function recognizedNames(schema) {
  const owners = new Map(); // normalized name -> Set(field)
  for (const f of schema.fields) {
    for (const name of [f.name, ...(Array.isArray(f.mappingHints) ? f.mappingHints : [])]) {
      const key = normalize(name);
      if (!key) continue;
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(f.name);
    }
  }
  const table = new Map();
  for (const [key, fields] of owners) if (fields.size === 1) table.set(key, [...fields][0]); // ambiguous names dropped
  return table;
}

function exactHeaderProposal(schema, headers) {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  const table = recognizedNames(schema);
  const used = new Set();
  const mappings = [];
  for (const header of headers) {
    const field = table.get(normalize(header));
    if (!field || used.has(field)) return null;
    used.add(field);
    mappings.push({ sourceColumn: header, status: 'mapped', targetField: field, confidence: 1, reason: 'Exact header match.' });
  }
  return { mappings };
}

module.exports = { exactHeaderProposal, recognizedNames, normalize };
