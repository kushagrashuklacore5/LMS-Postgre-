/**
 * Integer-paise money helpers for the installment system.
 * All installment arithmetic is done on integer paise; rupee values are only
 * produced for display and for the legacy `payments.amount` column.
 */

// Hard ceiling for a single payment (₹1 crore), independent of stage balance.
const MAX_PAYMENT_PAISE = 1000000000;

/**
 * Strictly parses a rupee amount ("1500", "1500.5", 1500.75) into integer paise.
 * Returns null for anything that is not a plain decimal with at most 2 places
 * (exponents, signs, >2 decimals, NaN, empty) or that is zero.
 */
function parseRupeesToPaise(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    value = String(value);
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return paise > 0 ? paise : null;
}

// Converts a stored rupee REAL (fee totals, legacy payment amounts) to paise.
function storedRupeesToPaise(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function paiseToRupees(paise) {
  return paise / 100;
}

/**
 * Splits a total into stage amounts that sum to the total exactly.
 * Rule: every stage gets floor(total × percentage); the leftover paise are
 * added to the LAST stage. Stages without any percentage are split equally.
 * Throws if percentages are partially specified or do not add up to 100.
 */
function splitTotalAcrossStages(totalPaise, percentages) {
  const count = percentages.length;
  if (!Number.isInteger(totalPaise) || totalPaise <= 0 || count === 0) {
    throw new Error('Cannot split an empty or non-positive total.');
  }

  const given = percentages.filter(p => p !== undefined && p !== null && p !== '');
  let amounts;
  if (given.length === 0) {
    amounts = percentages.map(() => Math.floor(totalPaise / count));
  } else {
    if (given.length !== count) {
      throw new Error('Installment plan has percentages on only some stages.');
    }
    // Work in 1/10000ths of a percent so decimal percentages stay integral.
    const units = percentages.map(p => Math.round(Number(p) * 10000));
    if (units.some(u => !Number.isFinite(u) || u <= 0)) {
      throw new Error('Installment plan has an invalid stage percentage.');
    }
    const unitSum = units.reduce((a, b) => a + b, 0);
    if (Math.abs(unitSum - 1000000) > 100) {
      throw new Error(`Installment plan percentages add up to ${unitSum / 10000}%, not 100%.`);
    }
    amounts = units.map(u => Math.floor((totalPaise * u) / 1000000));
  }

  const remainder = totalPaise - amounts.reduce((a, b) => a + b, 0);
  amounts[count - 1] += remainder;
  if (amounts.some(a => a <= 0)) {
    throw new Error('Installment plan produces a non-positive stage amount.');
  }
  return amounts;
}

module.exports = {
  MAX_PAYMENT_PAISE,
  parseRupeesToPaise,
  storedRupeesToPaise,
  paiseToRupees,
  splitTotalAcrossStages
};
