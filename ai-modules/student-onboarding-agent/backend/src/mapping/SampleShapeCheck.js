/**
 * Deterministic cross-check of an AI suggestion against the masked samples the AI was shown
 * (SampleMasker output). It catches a confident but wrong mapping such as a phone column suggested
 * for "email", or a numbers-only column suggested for "fullName".
 *
 * It only ever makes a suggestion LESS trusted (the column then needs an admin's choice); it never
 * proposes or changes a target. No samples (blank column, credential-like header) = no verdict.
 */

const DATE_LIKE = /^(\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;
const NOT_A_NAME = new Set(['<EMAIL>', '<PHONE>', '<NUMBER>', '<DECIMAL>', '<CODE>']);

/** true = the samples contradict the target field; false = consistent or no evidence. */
function samplesContradict(field, samples) {
  if (!field || !Array.isArray(samples) || samples.length === 0) return false;
  if (field.format === 'email') return !samples.includes('<EMAIL>');
  if (field.format === 'phone') return !samples.some((s) => s === '<PHONE>' || /^\+?\d[\d\s-]{6,}$/.test(s));
  if (field.type === 'date') return !samples.some((s) => DATE_LIKE.test(s));
  if (field.type === 'number') return !samples.some((s) => s === '<NUMBER>' || s === '<DECIMAL>' || s === '<PHONE>' || /^[+-]?\d+(\.\d+)?$/.test(s));
  if (field.type === 'boolean') return !samples.some((s) => /^(true|false|yes|no|y|n|1|0)$/i.test(s));
  if (field.name === 'fullName') return samples.every((s) => NOT_A_NAME.has(s) || DATE_LIKE.test(s) || /^\d+$/.test(s));
  return false;
}

module.exports = { samplesContradict };
