/**
 * Fee reminder email content (no mail transport here, so it can be tested in isolation).
 *
 * Every dynamic value is HTML-escaped. Values are expected to come from the server
 * (verified student record and installment summary); an unknown value is left out
 * rather than replaced with an invented default.
 */

const NOTE_MAX_LENGTH = 500;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates the optional plain-text note a staff member may add.
 * Returns { ok: true, note } with the trimmed note (or null), or { ok: false, message }.
 */
function normalizeReminderNote(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, note: null };
  if (typeof raw !== 'string') return { ok: false, message: 'The note must be plain text.' };
  // Drop control characters except line breaks and tabs
  const note = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (note.length > NOTE_MAX_LENGTH) return { ok: false, message: `The note must be at most ${NOTE_MAX_LENGTH} characters.` };
  return { ok: true, note: note || null };
}

function formatRupees(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function detailRow(label, valueHtml, valueStyle) {
  return `
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">${label}</td>
                  <td style="padding: 6px 0; ${valueStyle} text-align: right;">${valueHtml}</td>
                </tr>`;
}

/**
 * Builds the reminder email. `amount` (rupees) is required; studentName, classroomName,
 * dueDate and note are optional and omitted when absent.
 */
function buildFeeReminderEmail({ studentName, classroomName, amount, dueDate, note }) {
  const name = studentName ? escapeHtml(studentName) : null;
  const classes = classroomName ? escapeHtml(classroomName) : null;
  const due = dueDate ? escapeHtml(dueDate) : null;
  const noteHtml = note ? escapeHtml(note).replace(/\r?\n/g, '<br>') : null;

  const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fffdf4; border: 1px solid #ebdcaa; padding: 25px; border-radius: 12px;">
          <!-- Header -->
          <div style="background-color: #002366; padding: 20px; text-align: center; border-radius: 8px; border-bottom: 3px solid #B99652;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Core5 LMS — Academic Fee Reminder</h1>
            <p style="color: #ebdcaa; margin: 5px 0 0 0; font-size: 13px;">Official Academic Payment Notice</p>
          </div>

          <!-- Body Content -->
          <div style="padding: 25px 10px; color: #1e1b4b; line-height: 1.6;">
            <h2 style="color: #002366; margin-top: 0;">Dear ${name || 'Student'},</h2>
            <p style="font-size: 15px; color: #334155;">
              This is an official reminder regarding your outstanding academic fees${classes ? ` for <strong>${classes}</strong>` : ''}.
            </p>

            <!-- Details Card -->
            <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">${
                name ? detailRow('Student Name:', name, 'font-weight: 600; color: #0f172a;') : ''}${
                classes ? detailRow('Classroom / Course:', classes, 'font-weight: 600; color: #0f172a;') : ''}${
                detailRow('Outstanding Fee Amount:', escapeHtml(formatRupees(amount)), 'font-weight: 700; color: #dc2626; font-size: 16px;')}${
                due ? detailRow('Payment Due Date:', due, 'font-weight: 600; color: #b45309;') : ''}
              </table>
            </div>

            ${noteHtml ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; border-radius: 4px; margin-bottom: 20px; font-size: 13px; color: #78350f;">
                <strong>Note from Teacher/Institution:</strong> ${noteHtml}
              </div>
            ` : ''}

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5173/student/pay-fees"
                 style="background-color: #B99652; color: #0f172a; padding: 14px 30px; text-decoration: none; font-weight: bold; font-size: 15px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(185, 150, 82, 0.3);">
                💳 Pay Outstanding Fee Now
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 25px;">
              If you have already paid your fees offline, please contact your university accounts department to receive your tax receipt.
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #ebdcaa; font-size: 11px; color: #64748b;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Core5 Academy. All rights reserved.</p>
          </div>
        </div>
      `;

  return { subject: '⚠️ Reminder: Academic Fee Submission Due - Core5 LMS', html };
}

module.exports = { NOTE_MAX_LENGTH, escapeHtml, normalizeReminderNote, formatRupees, buildFeeReminderEmail };
