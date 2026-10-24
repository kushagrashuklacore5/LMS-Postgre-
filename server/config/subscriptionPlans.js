/**
 * Paid subscription plans: the one place the server learns what a plan costs.
 *
 * The browser only says WHICH plan it wants. The amount charged, the amount that must
 * have been paid, and the period bought all come from here, so a request can never
 * buy a plan for less than its price or for longer than its period.
 *
 * Prices are operator configuration (whole rupees per period):
 *   PLAN_PRICE_STANDARD_INR, PLAN_PRICE_PROFESSIONAL_INR, PLAN_PERIOD_DAYS (default 30)
 * A plan without a configured price cannot be bought.
 */
const PAID_PLANS = {
  standard: { name: 'Standard', priceVariable: 'PLAN_PRICE_STANDARD_INR' },
  professional: { name: 'Professional', priceVariable: 'PLAN_PRICE_PROFESSIONAL_INR' },
};

const periodDays = () => {
  const days = parseInt(process.env.PLAN_PERIOD_DAYS, 10);
  return Number.isInteger(days) && days > 0 && days <= 366 ? days : 30;
};

/**
 * @returns {{ id: string, name: string, amountPaise: number, periodDays: number } | null}
 *          null when the plan is unknown or has no valid configured price.
 */
function getPaidPlan(planId) {
  const key = typeof planId === 'string' ? planId.trim().toLowerCase() : '';
  const plan = Object.prototype.hasOwnProperty.call(PAID_PLANS, key) ? PAID_PLANS[key] : null;
  if (!plan) return null;
  const rupees = Number(process.env[plan.priceVariable]);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return { id: key, name: plan.name, amountPaise: Math.round(rupees * 100), periodDays: periodDays() };
}

const isKnownPaidPlan = (planId) =>
  typeof planId === 'string' && Object.prototype.hasOwnProperty.call(PAID_PLANS, planId.trim().toLowerCase());

module.exports = { getPaidPlan, isKnownPaidPlan };
