/**
 * Email adapter for student onboarding (setup-password links), built on the LMS's
 * existing email infrastructure (services/emailService.js: its SMTP transporter and
 * EMAIL_FROM). Unlike the OTP path it:
 *   - never falls back to a mock or to Ethereal: without real SMTP credentials or an
 *     initialised transporter, sending FAILS (EMAIL_NOT_CONFIGURED / EMAIL_UNAVAILABLE),
 *     so the import reports email_failed instead of pretending the link was delivered;
 *   - never logs the recipient, the message, the link or any SMTP detail;
 *   - throws errors that carry a code only.
 */
const FALLBACK_PASS = "fallback-password";

function codeError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function createOnboardingEmailAdapter({ getEmailService = () => require("./emailService") } = {}) {
  return {
    name: "lms-smtp",
    async send({ to, subject, text, html }) {
      let service;
      try {
        service = getEmailService();
      } catch {
        throw codeError("EMAIL_UNAVAILABLE");
      }
      const config = (service && service.config) || {};
      if (!config.EMAIL_USER || !config.EMAIL_PASS || config.EMAIL_PASS === FALLBACK_PASS) {
        throw codeError("EMAIL_NOT_CONFIGURED");
      }
      if (!service.isInitialized || !service.transporter) {
        throw codeError("EMAIL_UNAVAILABLE");
      }
      try {
        await service.transporter.sendMail({ from: config.EMAIL_FROM, to, subject, text, html });
      } catch {
        throw codeError("EMAIL_SEND_FAILED");
      }
    },
  };
}

module.exports = { createOnboardingEmailAdapter };
