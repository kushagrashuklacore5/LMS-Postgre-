// Guards the token optimizations: representative prompts (built by the REAL builders) stay compact and within an
// APPROXIMATE input budget (chars/4, +-20%). A failure means a prompt grew - check it was intended before raising a ceiling.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { representativePrompts } = require('../helpers/promptBudget');

// Measured 2026-09-30 (~900 / ~3,270 / ~1,250 input tokens) plus ~15% headroom.
const CEILING = { 'question generation': 1050, 'performance report': 3750, 'assignment evaluation': 1450 };

describe('prompt token budget (approximate, no network)', () => {
  for (const r of representativePrompts()) {
    it(`${r.flow}: ~${r.inputTokens} input tokens <= ${CEILING[r.flow]}; data block is compact JSON`, () => {
      assert.ok(r.inputTokens <= CEILING[r.flow], `${r.flow}: ~${r.inputTokens} tokens`);
      assert.equal(r.prompt.split('\n').length, 2, 'header + one compact JSON line (no pretty-print whitespace)');
    });
  }
});
