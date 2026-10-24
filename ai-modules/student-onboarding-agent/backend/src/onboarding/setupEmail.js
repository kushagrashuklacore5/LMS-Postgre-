/**
 * The password-setup email. Plain text + simple HTML; every inserted value is escaped.
 * Contains the link (with the one-time token) and nothing secret besides it.
 */
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

function buildSetupEmail({ appName, studentName, schoolName, link, expiresAt }) {
  const app = oneLine(appName);
  const name = oneLine(studentName);
  const school = oneLine(schoolName);
  const expires = new Date(expiresAt).toUTCString();

  const subject = `Set up your ${app} account`;
  const text = [
    `Hello ${name},`,
    '',
    `${school} has created a ${app} student account for you.`,
    'Open this link to choose your password:',
    '',
    link,
    '',
    `The link can be used once and expires on ${expires}.`,
    'After setting your password, log in with this email address.',
    '',
    'If you were not expecting this email, you can ignore it.',
  ].join('\n');

  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="margin:0 0 16px">${escapeHtml(app)}</h2>
  <p>Hello ${escapeHtml(name)},</p>
  <p>${escapeHtml(school)} has created a ${escapeHtml(app)} student account for you. Choose your password to get started:</p>
  <p style="text-align:center;margin:28px 0"><a href="${escapeHtml(link)}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Set my password</a></p>
  <p style="font-size:13px;color:#666">Or copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="font-size:13px;color:#666">The link can be used once and expires on ${escapeHtml(expires)}. After setting your password, log in with this email address.</p>
  <p style="font-size:12px;color:#999">If you were not expecting this email, you can ignore it.</p>
</div>`;

  return { subject, text, html };
}

module.exports = { buildSetupEmail, escapeHtml };
