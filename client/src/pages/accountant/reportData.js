/**
 * Data loading and totals for the accountant Reports page.
 *
 * Only real API data is ever returned. An empty response is an empty list; a failed
 * response is an empty list plus an error message. Sample or fallback records are never
 * substituted, and an amount that is unknown stays null (shown as "—"), never 0 or a guess.
 */

function describeError(err, what) {
  const status = err?.response?.status;
  const message = err?.response?.data?.message;
  return `${what} could not be loaded${status ? ` (HTTP ${status})` : ''}${message ? `: ${message}` : '.'}`;
}

/** `get(url)` is an axios-style GET returning `{ data }`; it is injected so the loader can be tested. */
export async function loadReportData(get, api) {
  const result = {
    students: [],
    feeSummary: null,
    invoices: [],
    errors: { fees: null, invoices: null }
  };

  try {
    const res = await get(`${api}/classrooms/teacher/students-fees`);
    if (res?.data?.success && Array.isArray(res.data.students)) {
      result.students = res.data.students;
      result.feeSummary = res.data.summary || null;
    } else {
      result.errors.fees = res?.data?.message || 'Student fee records could not be loaded.';
    }
  } catch (err) {
    result.errors.fees = describeError(err, 'Student fee records');
  }

  try {
    const res = await get(`${api}/accountant/vendor-invoices`);
    if (res?.data?.success && Array.isArray(res.data.data)) {
      result.invoices = res.data.data;
    } else {
      result.errors.invoices = res?.data?.message || 'Vendor invoices could not be loaded.';
    }
  } catch (err) {
    result.errors.invoices = describeError(err, 'Vendor invoices');
  }

  return result;
}

const toAmount = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

/** A student's fee is only known when the server resolved a real fee structure for them. */
export const isFeeConfigured = (s) => s?.feeConfigured !== false && toAmount(s?.totalFee) !== null;
export const isPaidRecord = (s) => isFeeConfigured(s) && s.status === 'Paid';
export const hasDues = (s) => isFeeConfigured(s) && (s.status === 'Pending' || s.status === 'Partial');

export function summarizeFees(students = []) {
  const summary = { totalPaid: 0, totalPending: 0, paidCount: 0, pendingCount: 0, notConfiguredCount: 0 };
  for (const s of students) {
    const paid = toAmount(s.paidAmount);
    if (paid !== null) summary.totalPaid += paid;
    if (!isFeeConfigured(s)) {
      summary.notConfiguredCount += 1;
    } else if (isPaidRecord(s)) {
      summary.paidCount += 1;
    } else if (hasDues(s)) {
      summary.pendingCount += 1;
      summary.totalPending += toAmount(s.remainingBalance) || 0;
    }
  }
  return summary;
}

/** Real invoice rows use invoiceNumber/issueDate; missing values stay null instead of being invented. */
export function invoiceFields(invoice = {}) {
  return {
    number: invoice.invoiceNumber || invoice.invoiceNo || null,
    vendor: invoice.vendorName || invoice.vendor || null,
    category: invoice.category || null,
    amount: toAmount(invoice.amount),
    date: invoice.issueDate || invoice.date || null,
    status: invoice.status || null
  };
}

export function summarizeInvoices(invoices = []) {
  return invoices.reduce(
    (acc, invoice) => {
      const amount = invoiceFields(invoice).amount;
      return { total: acc.total + (amount || 0), count: acc.count + 1 };
    },
    { total: 0, count: 0 }
  );
}

/** "—" for an unknown amount; never renders a missing value as ₹0. */
export function formatInr(value) {
  const amount = toAmount(value);
  return amount === null ? '—' : `₹${amount.toLocaleString('en-IN')}`;
}
