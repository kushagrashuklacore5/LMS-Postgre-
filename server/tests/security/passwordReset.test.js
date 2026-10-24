/**
 * Password reset by emailed one-time code (audit finding SEC-008: account takeover).
 * Mail goes to the in-memory outbox of the mock transport; nothing is sent anywhere.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

describe('password reset', () => {
  let ctx;
  let outbox;
  let otpService;
  before(async () => {
    ctx = await startTestApp();
    outbox = require(path.resolve(__dirname, '../../services/emailService')).outbox;
    otpService = require(path.resolve(__dirname, '../../services/otpService'));
  });
  after(async () => { await ctx.stop(); });

  const send = (email) => ctx.api('POST', '/api/password-reset/send-otp', { body: { email } });
  const verify = (email, otp) => ctx.api('POST', '/api/password-reset/verify-otp', { body: { email, otp } });
  const reset = (email, newPassword) => ctx.api('POST', '/api/password-reset/reset-password', { body: { email, newPassword, confirmPassword: newPassword } });
  const login = (email, password) => ctx.api('POST', '/api/auth/login', { body: { email, password } });

  // The code exists only inside the email; read it from the mock outbox.
  const codeMailedTo = (email) => {
    const mail = [...outbox].reverse().find((message) => message.to === email);
    assert.ok(mail, `no email was sent to ${email}`);
    return mail.html.match(/>(\d{6})</)[1];
  };
  // Pretend time has passed, so the resend cooldown or the expiry applies.
  const age = (email, { createdMinutesAgo, expiresMinutesAgo }) => {
    const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    if (createdMinutesAgo !== undefined) return ctx.db.run('UPDATE otp_reset SET created_at = ? WHERE email = ?', [iso(createdMinutesAgo), email]);
    return ctx.db.run('UPDATE otp_reset SET expires_at = ? WHERE email = ?', [iso(expiresMinutesAgo), email]);
  };

  it('the code is sent by email only: not in the response, not readable in the database', async () => {
    const email = 'studenta@test.invalid';
    const response = await send(email);
    assert.equal(response.status, 200);
    const code = codeMailedTo(email);
    assert.equal(response.text.includes(code), false);
    assert.equal(Object.keys(response.body).some((key) => /otp/i.test(key)), false);
    const stored = await ctx.db.get('SELECT otp FROM otp_reset WHERE email = ?', [email]);
    assert.notEqual(stored.otp, code);
    assert.match(stored.otp, /^[a-f0-9]{64}$/);
  });

  it('answers the same for a registered and an unknown address, and mails only the registered one', async () => {
    const mailsBefore = outbox.length;
    const known = await send('mentora@test.invalid');
    const unknown = await send('nobody@test.invalid');
    assert.deepEqual(unknown.body, known.body);
    assert.equal(unknown.status, known.status);
    assert.equal(outbox.length, mailsBefore + 1);
    assert.equal(await ctx.db.get("SELECT id FROM otp_reset WHERE email = 'nobody@test.invalid'"), undefined);
  });

  it('full flow: correct code, new password works, old one does not, and the code cannot be used again', async () => {
    const email = 'accountanta@test.invalid';
    await send(email);
    const code = codeMailedTo(email);

    assert.equal((await reset(email, 'Not-Yet-Verified-1')).status, 400); // no skipping the code
    assert.equal((await verify(email, code)).status, 200);
    assert.equal((await reset(email, 'short')).status, 400);
    assert.equal((await reset(email, 'Brand-New-Passw0rd')).status, 200);

    assert.equal((await login(email, ctx.password)).status, 401);
    assert.equal((await login(email, 'Brand-New-Passw0rd')).status, 200);
    assert.match((await ctx.db.get('SELECT password FROM users WHERE email = ?', [email])).password, /^\$2[aby]\$/);

    // replay: the same code, and the "verified" state, are gone
    assert.equal((await verify(email, code)).status, 400);
    assert.equal((await reset(email, 'Replayed-Passw0rd')).status, 400);
    assert.equal((await login(email, 'Brand-New-Passw0rd')).status, 200);
  });

  it('wrong guesses are counted and the code dies after five (no brute force)', async () => {
    const email = 'storekeepera@test.invalid';
    await send(email);
    const code = codeMailedTo(email);
    const wrong = code === '000000' ? '111111' : '000000';

    // Guessing is tested on the service itself so the HTTP rate limit does not hide the counter
    const req = {};
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await otpService.verifyOTP(req, email, wrong);
      assert.equal(result.valid, false, `attempt ${attempt}`);
    }
    assert.equal((await ctx.db.get('SELECT attempts FROM otp_reset WHERE email = ?', [email])).attempts, 5);
    // Even the right code is refused now
    assert.deepEqual(await otpService.verifyOTP(req, email, code), { valid: false, reason: 'max_attempts' });
    assert.equal((await reset(email, 'Should-Not-Work-1')).status, 400);
    assert.equal((await login(email, ctx.password)).status, 200);
  });

  it('an expired code is refused', async () => {
    const email = 'mentora2@test.invalid';
    await send(email);
    const code = codeMailedTo(email);
    await age(email, { expiresMinutesAgo: 1 });
    assert.equal((await verify(email, code)).status, 400);
  });

  it('a verified code must be used within its window', async () => {
    const email = 'studenta2@test.invalid';
    await send(email);
    assert.equal((await verify(email, codeMailedTo(email))).status, 200);
    await age(email, { expiresMinutesAgo: 1 });
    assert.equal((await reset(email, 'Too-Late-Passw0rd')).status, 400);
    assert.equal((await login(email, ctx.password)).status, 200);
  });

  it('a code for one account cannot reset another account', async () => {
    const mine = 'admina@test.invalid';
    await send(mine);
    const code = codeMailedTo(mine);
    assert.equal((await verify('adminb@test.invalid', code)).status, 400);
    assert.equal((await verify(mine, code)).status, 200);
    assert.equal((await reset('adminb@test.invalid', 'Hijacked-Passw0rd')).status, 400);
    assert.equal((await login('adminb@test.invalid', ctx.password)).status, 200);
  });

  it('a new code replaces the previous one, and requests inside the cooldown send nothing', async () => {
    const email = 'studentb@test.invalid';
    await send(email);
    const first = codeMailedTo(email);
    const mails = outbox.length;
    await send(email); // inside the one-minute cooldown
    assert.equal(outbox.length, mails);

    await age(email, { createdMinutesAgo: 5 });
    await send(email);
    assert.equal(outbox.length, mails + 1);
    const second = codeMailedTo(email);
    if (second !== first) assert.equal((await verify(email, first)).status, 400);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM otp_reset WHERE email = ?', [email])).n, 1);
  });

  it('the reset endpoints are rate limited per address', async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      statuses.push((await verify('ratelimit@test.invalid', '123456')).status);
    }
    assert.equal(statuses[0], 400);
    assert.equal(statuses[11], 429);
  });

  it('malformed requests are rejected without a server error', async () => {
    for (const body of [{}, { email: '' }, { email: null }, { email: { $ne: null } }, { email: ['a@b.c'] }, 'not json']) {
      const response = await ctx.api('POST', '/api/password-reset/send-otp', { body });
      assert.ok(response.status >= 400 && response.status < 500, `${JSON.stringify(body)} -> ${response.status}`);
    }
    assert.equal((await verify('studenta@test.invalid', { $gt: '' })).status, 400);
  });
});
