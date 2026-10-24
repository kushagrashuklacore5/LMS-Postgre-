// Client-side JWT expiry helpers. These only read the unverified `exp` claim to
// decide when the UI should stop treating a stored session as logged in; the
// server remains the authority on whether a token is valid.

export function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Milliseconds until expiry, or null when the token has no numeric `exp`. */
export function msUntilExpiry(token, nowMs = Date.now()) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000 - nowMs;
}

/** True only when the token carries an `exp` claim that is in the past. */
export function isTokenExpired(token, nowMs = Date.now()) {
  const ms = msUntilExpiry(token, nowMs);
  return ms !== null && ms <= 0;
}
