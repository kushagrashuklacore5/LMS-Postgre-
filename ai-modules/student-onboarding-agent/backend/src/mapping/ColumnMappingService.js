const { LLMProvider } = require('../llm/LLMProvider');
const { ColumnMappingGuard } = require('./ColumnMappingGuard');
const { buildMaskedSamples } = require('./SampleMasker');
const { buildMappingPrompt } = require('./MappingPrompt');
const { buildCanonicalRows } = require('./CanonicalRowBuilder');
const { exactHeaderProposal } = require('./ExactHeaderMatcher');

const EXACT_MATCH_PROVIDER = 'exact-header-match';

const MAX_RESPONSE_CHARS = 200000;

/**
 * Step 6B: LLM-assisted column mapping.
 *
 *   ExcelImportService result (headers + rows)
 *     -> masked samples (SampleMasker)      only headers + a few masked values leave the process
 *     -> prompt (MappingPrompt)             schema-derived contract
 *     -> llmProvider.generate()             any LLMProvider; JSON mode requested
 *     -> strict JSON.parse                  no repair, no fence stripping
 *     -> ColumnMappingGuard.validate()      authoritative; per-column acceptance
 *     -> buildCanonicalRows()               accepted columns only, rowNumber kept
 *
 * The LLM only proposes column meanings. It never sees whole rows, never
 * receives unmasked personal data by design, and has no way to create,
 * update or delete anything. Validation of the canonical rows is the next
 * step (StudentDataValidator), done by the caller.
 *
 * mapImport() never throws for provider, response or proposal problems; it
 * returns { status: 'failed', error: { code, message } }. Messages are fixed
 * texts: no API keys, raw responses or cell values.
 */
class ColumnMappingService {
  constructor({ schema, llmProvider = null, samplesPerColumn = 3, timeoutMs = 30000 } = {}) {
    if (!schema || !Array.isArray(schema.fields)) {
      throw new TypeError('ColumnMappingService requires a compiled schema (see loadStudentSchema()).');
    }
    if (llmProvider !== null) LLMProvider.assertValid(llmProvider);
    if (!Number.isInteger(samplesPerColumn) || samplesPerColumn < 1) {
      throw new TypeError('samplesPerColumn must be a positive integer.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be a positive integer.');
    this.schema = schema;
    this.llmProvider = llmProvider;
    this.samplesPerColumn = samplesPerColumn;
    this.timeoutMs = timeoutMs;
    this.guard = new ColumnMappingGuard(schema);
  }

  /** importResult: the object returned by ExcelImportService.parse(). */
  /**
   * importResult.customFields (optional): this school's ACTIVE custom fields [{ key, label, dataType }],
   * supplied by the server (never the client). They become valid targets "custom:<key>" for the guard and
   * are listed to the model as compact metadata only (no values, no usage, no other school's fields).
   */
  async mapImport(importResult) {
    const { headers, rows } = assertImportResult(importResult);
    const customFields = Array.isArray(importResult.customFields) ? importResult.customFields : [];
    const customTargets = customFields.map((f) => `custom:${f.key}`);
    const result = {
      status: 'failed',
      error: null,
      provider: this.llmProvider ? this.llmProvider.name : null,
      sentToLlm: null,
      proposal: null,
      guard: null,
      unresolvedColumns: [],
      canonicalRows: null,
      canonicalizationIssues: [],
      warnings: [],
    };
    const fail = (code, message) => {
      result.error = { code, message };
      return result;
    };

    // Properly formatted sheet: every header is a known column name -> deterministic mapping, no LLM call.
    const exact = exactHeaderProposal(this.schema, headers);
    if (exact) {
      result.provider = EXACT_MATCH_PROVIDER;
      result.proposal = exact;
      return this.applyProposal(result, exact, headers, rows, fail, customTargets);
    }

    if (!this.llmProvider) {
      return fail('LLM_PROVIDER_NOT_CONFIGURED', 'No LLM provider is configured, so columns cannot be mapped automatically.');
    }

    const columns = buildMaskedSamples(headers, rows, this.samplesPerColumn);
    result.sentToLlm = { columns }; // exactly what the model sees besides the fixed instructions
    const prompt = buildMappingPrompt(this.schema, columns, customFields);

    let text;
    try {
      text = await this.callWithTimeout(prompt);
    } catch (err) {
      if (err && err.code === 'LLM_TIMEOUT') return fail('LLM_TIMEOUT', `The LLM did not answer within ${this.timeoutMs} ms.`);
      return fail('LLM_PROVIDER_ERROR', 'The LLM provider request failed.');
    }

    if (typeof text !== 'string' || text.trim() === '') {
      return fail('LLM_MALFORMED_RESPONSE', 'The LLM returned an empty or non-text response.');
    }
    if (text.length > MAX_RESPONSE_CHARS) {
      return fail('LLM_MALFORMED_RESPONSE', 'The LLM response is too large to be a column mapping.');
    }

    let proposal;
    try {
      proposal = JSON.parse(text.trim());
    } catch {
      return fail('LLM_INVALID_JSON', 'The LLM response is not valid JSON.');
    }
    result.proposal = proposal;
    return this.applyProposal(result, proposal, headers, rows, fail, customTargets);
  }

  /** Guard (authoritative) + canonical rows, for an LLM or an exact-match proposal alike. */
  applyProposal(result, proposal, headers, rows, fail, customTargets = []) {
    const guard = this.guard.validate(proposal, { headers, customTargets });
    result.guard = guard;
    result.unresolvedColumns = guard.unresolvedColumns;
    result.warnings = guard.warnings;
    if (!guard.structurallyValid) {
      return fail('MAPPING_PROPOSAL_INVALID', 'The LLM proposal does not follow the mapping contract; see guard.errors.');
    }

    const built = buildCanonicalRows(rows, guard.mapping.filter((m) => !m.targetField.startsWith('custom:')), this.schema);
    result.canonicalRows = built.rows;
    result.canonicalizationIssues = built.issues;
    result.status = guard.reviewRequired || built.issues.length > 0 ? 'needs_review' : 'mapped';
    return result;
  }

  /** Calls the provider, aborting after timeoutMs even if the provider ignores the signal. */
  async callWithTimeout(prompt) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('timeout'), { code: 'LLM_TIMEOUT' }));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([
        this.llmProvider.generate(prompt, { responseFormat: 'json', temperature: 0, signal: controller.signal }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

function assertImportResult(importResult) {
  const headers = importResult && importResult.headers;
  const rows = importResult && importResult.rows;
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new TypeError('mapImport() expects the result of ExcelImportService.parse() ({ headers, rows }).');
  }
  for (const row of rows) {
    if (!row || !Number.isInteger(row.rowNumber) || !row.values || typeof row.values !== 'object') {
      throw new TypeError('Every row must be { rowNumber, values } as produced by ExcelImportService.');
    }
  }
  return { headers, rows };
}

module.exports = { ColumnMappingService, EXACT_MATCH_PROVIDER };
