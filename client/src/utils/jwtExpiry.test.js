// Run with: node --test src/utils/   (from the client folder; Node 18+, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwtPayload, msUntilExpiry, isTokenExpired } from './jwtExpiry.js';

// Unsigned test tokens: only the payload segment matters to these helpers.
const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeToken = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

test('decodeJwtPayload reads base64url payloads', () => {
  assert.deepEqual(decodeJwtPayload(makeToken({ userId: 7, exp: 100 })), { userId: 7, exp: 100 });
});

test('decodeJwtPayload rejects malformed input', () => {
  assert.equal(decodeJwtPayload(null), null);
  assert.equal(decodeJwtPayload(''), null);
  assert.equal(decodeJwtPayload('a.b'), null);
  assert.equal(decodeJwtPayload('a.%%%.c'), null);
  assert.equal(decodeJwtPayload(`x.${Buffer.from('"str"').toString('base64')}.y`), null);
});

test('msUntilExpiry returns remaining ms, or null without exp', () => {
  assert.equal(msUntilExpiry(makeToken({ exp: NOW / 1000 + 60 }), NOW), 60000);
  assert.equal(msUntilExpiry(makeToken({ userId: 1 }), NOW), null);
  assert.equal(msUntilExpiry(makeToken({ exp: '9999999999' }), NOW), null);
});

test('isTokenExpired is true only for a past exp', () => {
  assert.equal(isTokenExpired(makeToken({ exp: NOW / 1000 - 1 }), NOW), true);
  assert.equal(isTokenExpired(makeToken({ exp: NOW / 1000 }), NOW), true);
  assert.equal(isTokenExpired(makeToken({ exp: NOW / 1000 + 1 }), NOW), false);
  // No exp claim / undecodable token: not treated as expired; the server stays the authority.
  assert.equal(isTokenExpired(makeToken({ userId: 1 }), NOW), false);
  assert.equal(isTokenExpired('garbage', NOW), false);
});
