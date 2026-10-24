/**
 * Links typed by one user and opened by others (course material links, chapter videos,
 * live-class meeting links) must be ordinary web addresses. A "javascript:" or "data:"
 * link would run in the browser of every student who clicks it.
 */
function isWebUrl(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 2000) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (err) {
    return false;
  }
}

/** True when the value is empty (optional field) or a web address. */
const isEmptyOrWebUrl = (value) => value === undefined || value === null || value === '' || isWebUrl(value);

module.exports = { isWebUrl, isEmptyOrWebUrl };
