/**
 * OPT-IN manual check of column mapping against the configured real LLM.
 * NOT part of `npm test`. Run with:  npm run mapping:manual
 *
 * Uses a small SYNTHETIC header set with made-up values (no real student
 * data). Needs SOA_LLM_PROVIDER, SOA_LLM_MODEL and the provider's key in
 * this module's .env; without them it prints why and exits without calling
 * anything. Prints the mapping decisions only, never rows or keys.
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const { loadLlmConfig, loadMappingConfig } = require('../src/config');
const { createLLMProvider } = require('../src/llm/createLLMProvider');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');

const SYNTHETIC = {
  headers: ['Student Full Name', 'Mail ID', 'Std', 'Div', 'Contact No', 'D.O.B', 'Blood Grp', 'Admission No', 'Remarks'],
  rows: [
    { rowNumber: 2, values: { 'Student Full Name': 'Test Student One', 'Mail ID': 'one@example.com', Std: 10, Div: 'A', 'Contact No': 5550100001,
      'D.O.B': '2010-01-01T00:00:00.000Z', 'Blood Grp': 'B+', 'Admission No': 'ADM0001', Remarks: 'sample' } },
    { rowNumber: 3, values: { 'Student Full Name': 'Test Student Two', 'Mail ID': 'two@example.com', Std: 9, Div: 'B', 'Contact No': 5550100002,
      'D.O.B': '2011-02-02T00:00:00.000Z', 'Blood Grp': 'O-', 'Admission No': 'ADM0002', Remarks: null } },
  ],
};

(async () => {
  const llmConfig = loadLlmConfig();
  const { provider, reason } = createLLMProvider(llmConfig);
  if (!provider) {
    console.log(`LLM provider not configured: ${reason} Nothing was called.`);
    return;
  }
  const service = new ColumnMappingService({
    schema: loadStudentSchema(),
    llmProvider: provider,
    samplesPerColumn: loadMappingConfig().samplesPerColumn,
    timeoutMs: llmConfig.timeoutMs,
  });
  const result = await service.mapImport(SYNTHETIC);
  console.log(`provider: ${result.provider}  status: ${result.status}${result.error ? `  error: ${result.error.code}` : ''}`);
  if (result.guard) {
    for (const c of result.guard.columns) {
      console.log(`  ${JSON.stringify(c.sourceColumn)} -> ${c.status}${c.targetField ? ` ${c.targetField}` : ''}` +
        `${c.confidence !== null ? ` (${c.confidence})` : ''}${c.errors.length ? `  [${c.errors.map((e) => e.code).join(', ')}]` : ''}`);
    }
    for (const w of result.warnings) console.log(`  warning: ${w.code} ${w.targetField || ''}`);
  }
})().catch((err) => {
  console.error(`Manual check failed: ${err.name}`);
  process.exitCode = 1;
});
