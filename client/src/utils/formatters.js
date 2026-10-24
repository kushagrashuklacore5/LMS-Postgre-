import { normalizeLanguageCode } from '../i18n/languageRegistry';

/**
 * Formatting utilities with locale awareness (supporting all 20 Indian languages)
 */

export const getLocaleCode = (language) => {
  if (!language) return 'en-IN';
  return normalizeLanguageCode(language);
};

/**
 * Formats an amount in Indian Rupees (INR)
 * @param {number|string} amount 
 * @param {string} [language='en-IN'] 
 * @returns {string} formatted currency string, e.g. ₹1,234.00
 */
export const formatCurrency = (amount, language = 'en-IN') => {
  const numeric = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numeric)) return '₹0.00';
  
  const locale = getLocaleCode(language);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `₹${numeric.toLocaleString('en-IN')}`;
  }
};

/**
 * Formats a localized number
 * @param {number|string} num 
 * @param {string} [language='en-IN'] 
 * @returns {string}
 */
export const formatNumber = (num, language = 'en-IN') => {
  const numeric = typeof num === 'number' ? num : parseFloat(num);
  if (isNaN(numeric)) return '0';
  
  const locale = getLocaleCode(language);
  try {
    return new Intl.NumberFormat(locale).format(numeric);
  } catch {
    return String(numeric);
  }
};

/**
 * Formats a localized date
 * @param {Date|string|number} date 
 * @param {string} [language='en-IN'] 
 * @param {Intl.DateTimeFormatOptions} [options] 
 * @returns {string}
 */
export const formatDate = (date, language = 'en-IN', options = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);

  const locale = getLocaleCode(language);
  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return d.toLocaleDateString('en-IN');
  }
};
