/**
 * Jitsi as a Service (8x8 JaaS): the only file that knows about the meeting provider.
 * The rest of the LMS works with its own lecture ids (helpers/lectures.js) and calls:
 *
 *   isConfigured()                  are the credentials present?
 *   createRoom()                    a fresh, unguessable room name for one lecture
 *   joinDetails(room, user, opts)   what the browser needs to open the meeting: the app id, the
 *                                   room as "<appId>/<room>", and a short-lived JWT for that room
 *                                   only (moderator for the teacher, participant for students)
 *   verifyWebhook(raw, header)      is a webhook really from JaaS? (HMAC-SHA256, X-Jaas-Signature)
 *   parseWebhook(body)              the event as { key, kind, room, userId, at } or null
 *
 * Configuration (server/.env, see .env.example). The private key never leaves the server.
 *   JAAS_APP_ID            vpaas-magic-cookie-...
 *   JAAS_API_KEY_ID        the key id shown in the JaaS console ("<appId>/<id>" or just "<id>")
 *   JAAS_PRIVATE_KEY       the RSA private key (PEM; "\n" escapes allowed), or
 *   JAAS_PRIVATE_KEY_FILE  a path to the PEM file
 *   JAAS_WEBHOOK_SECRET    the webhook signing secret (webhooks are refused while it is empty)
 *   JAAS_TOKEN_TTL_MINUTES how long a join token is valid (default 10; checked when joining)
 *
 * References: https://developer.8x8.com/jaas/docs/api-keys-jwt
 *             https://developer.8x8.com/jaas/docs/webhooks-payload-validation
 *             https://developer.8x8.com/jaas/docs/iframe-api-integration/
 */
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const DOMAIN = '8x8.vc';
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function privateKey() {
  if (process.env.JAAS_PRIVATE_KEY) return process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n');
  if (process.env.JAAS_PRIVATE_KEY_FILE) {
    try {
      return fs.readFileSync(process.env.JAAS_PRIVATE_KEY_FILE, 'utf8');
    } catch {
      return null;
    }
  }
  return null;
}

const appId = () => (process.env.JAAS_APP_ID || '').trim();
const keyId = () => {
  const id = (process.env.JAAS_API_KEY_ID || '').trim();
  return id && !id.includes('/') ? `${appId()}/${id}` : id;
};

const isConfigured = () => Boolean(appId() && keyId() && privateKey());

/** A room name nobody can guess (the JWT is what lets a person in; the name is not a secret). */
const createRoom = () => `lms-${crypto.randomUUID()}`;

/**
 * The browser's join details for one room. `moderator` only for the lecture's teacher.
 * The token names this room only and expires after a few minutes.
 */
function joinDetails(room, user, { moderator }) {
  if (!isConfigured()) throw new Error('JaaS is not configured');
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(1, Math.min(60, Number(process.env.JAAS_TOKEN_TTL_MINUTES) || 10)) * 60;
  const token = jwt.sign(
    {
      aud: 'jitsi',
      iss: 'chat',
      sub: appId(),
      room,
      iat: now,
      nbf: now - 10,
      exp: now + ttl,
      context: {
        user: { id: String(user.id), name: user.name || 'Participant', email: user.email || '', moderator: Boolean(moderator) },
        features: { livestreaming: false, recording: false, transcription: false, 'outbound-call': false },
      },
    },
    privateKey(),
    { algorithm: 'RS256', header: { kid: keyId(), typ: 'JWT' } }
  );
  return { domain: DOMAIN, appId: appId(), roomName: `${appId()}/${room}`, jwt: token, expiresAt: new Date((now + ttl) * 1000).toISOString() };
}

/**
 * X-Jaas-Signature: "t=<unix seconds>,v1=<base64 HMAC-SHA256 of `${t}.${raw body}`>".
 * False when the secret is not set, the header is malformed, the time is outside the tolerance,
 * or no signature matches (compared in constant time).
 */
function verifyWebhook(rawBody, header, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = process.env.JAAS_WEBHOOK_SECRET;
  if (!secret || !rawBody || typeof header !== 'string') return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, ...v]) => v.join('='));
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(t)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('base64'));
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

const KINDS = { PARTICIPANT_JOINED: 'join', PARTICIPANT_LEFT: 'leave', ROOM_CREATED: 'started', ROOM_DESTROYED: 'ended' };

/**
 * A webhook body as one LMS event, or null for events the LMS does not use.
 *   key     the provider's idempotency key (a repeated delivery has the same one)
 *   kind    'join' | 'leave' | 'started' | 'ended'
 *   room    the room name without the app id
 *   userId  the LMS user id put in the JWT (participants only)
 *   at      ISO time of the event as the provider reports it
 */
function parseWebhook(body) {
  if (!body || typeof body !== 'object') return null;
  const kind = KINDS[body.eventType];
  if (!kind) return null;
  const fqn = String(body.fqn || '');
  const room = fqn.includes('/') ? fqn.slice(fqn.indexOf('/') + 1) : fqn;
  const when = Number(body.timestamp);
  if (!room || !Number.isFinite(when)) return null;
  const userId = body.data && body.data.id !== undefined && /^\d+$/.test(String(body.data.id)) ? Number(body.data.id) : null;
  const key = String(body.idempotencyKey || `${body.eventType}:${fqn}:${body.data?.participantId || userId}:${when}`);
  return { key, kind, room, userId, at: new Date(when).toISOString() };
}

module.exports = { DOMAIN, isConfigured, createRoom, joinDetails, verifyWebhook, parseWebhook };
