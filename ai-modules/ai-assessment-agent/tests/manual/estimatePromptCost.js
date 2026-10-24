/**
 * OFFLINE, APPROXIMATE prompt-cost profile of the three AI flows (no network, no provider, no database).
 *   node tests/manual/estimatePromptCost.js      (npm run cost:estimate)
 * tokens ~= chars / 4 (+-20%). Real counts: only the provider's usage metadata from an approved manual call.
 */
const { representativePrompts } = require('../helpers/promptBudget');

console.log('flow                    system   data  schema  input (approx. tokens)');
for (const r of representativePrompts()) {
  console.log(`${r.flow.padEnd(22)} ${String(r.systemTokens).padStart(7)} ${String(r.promptTokens).padStart(6)} ${String(r.schemaTokens).padStart(7)} ${String(r.inputTokens).padStart(7)}`);
}
console.log('Output is capped by the provider (max_tokens 4096) and by the strict validators\' length/item limits.');
