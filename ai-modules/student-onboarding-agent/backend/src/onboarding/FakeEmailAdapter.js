/**
 * In-memory email adapter for tests and standalone development. Sends nothing.
 * Records every message; can be told to fail for specific recipients or for the
 * next N sends, with a given error code.
 */
class FakeEmailAdapter {
  constructor() {
    this.name = 'fake-email';
    this.sent = [];
    this.failures = [];
    this.failFor = new Set();
    this.failNextCount = 0;
    this.failCode = 'EMAIL_SEND_FAILED';
  }

  failNext(count = 1, code = 'EMAIL_SEND_FAILED') {
    this.failNextCount = count;
    this.failCode = code;
    return this;
  }

  failRecipient(email, code = 'EMAIL_SEND_FAILED') {
    this.failFor.add(String(email).toLowerCase());
    this.failCode = code;
    return this;
  }

  reset() {
    this.sent = [];
    this.failures = [];
    this.failFor.clear();
    this.failNextCount = 0;
    return this;
  }

  async send({ to, subject, text, html }) {
    const recipient = String(to).toLowerCase();
    if (this.failNextCount > 0 || this.failFor.has(recipient)) {
      if (this.failNextCount > 0) this.failNextCount -= 1;
      this.failures.push({ to });
      const err = new Error('SMTP 550 mailbox unavailable at smtp.internal.example (user=secret-user)'); // deliberately leaky text
      err.code = this.failCode;
      throw err;
    }
    this.sent.push({ to, subject, text, html });
    return { accepted: [to] };
  }

  /** The one-time token in the most recent message to `to` (tests only). */
  lastTokenFor(to) {
    const msg = [...this.sent].reverse().find((m) => m.to.toLowerCase() === String(to).toLowerCase());
    const m = msg && /#token=([A-Za-z0-9_-]+)/.exec(msg.text);
    return m ? m[1] : null;
  }
}

module.exports = { FakeEmailAdapter };
