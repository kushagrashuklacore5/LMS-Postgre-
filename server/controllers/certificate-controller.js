const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { get, all, run } = require('../helpers/dbAsync');
const { UPLOADS_DIR } = require('../middleware/uploadPolicy');

// Certificates are stored with the other private uploads: reachable only through the
// routes below (owner only) or a signed link handed out by the API.
const CERTIFICATE_FOLDER = path.join(UPLOADS_DIR, 'certificates');

const fail = (res, action, error) => {
  console.error(`Error ${action} certificate:`, error.message);
  res.status(500).json({ message: 'Server error' });
};

/** A course is complete when every one of its chapters is marked completed by the student. */
async function chapterProgress(studentId, courseId) {
  const { total } = await get('SELECT COUNT(*) AS total FROM chapters WHERE courseId = ?', [courseId]);
  const { completed } = await get(
    `SELECT COUNT(DISTINCT p.contentId) AS completed
     FROM progress p JOIN chapters ch ON ch.id = p.contentId AND ch.courseId = ?
     WHERE p.studentId = ? AND p.contentType = 'chapter' AND p.completed = 1`,
    [courseId, studentId]
  );
  return { totalChapters: total, completedChapters: completed, eligible: total > 0 && completed >= total };
}

// The shape the student page reads: _id as text, courseId as { _id, title }
const forClient = (row) => ({
  _id: String(row.id),
  id: row.id,
  courseId: { _id: String(row.courseId), title: row.courseTitle },
  certificateUrl: row.certificateUrl,
  issuedAt: row.issuedAt,
});

const ownCertificate = (certificateId, studentId) =>
  get(
    `SELECT ce.*, c.title AS courseTitle FROM certificates ce LEFT JOIN courses c ON c.id = ce.courseId
     WHERE ce.id = ? AND ce.studentId = ?`,
    [certificateId, studentId]
  );

// The stored value is "/uploads/certificates/<name>"; only that folder is ever read.
const fileOf = (certificate) => path.join(CERTIFICATE_FOLDER, path.basename(String(certificate.certificateUrl || '')));

function writeCertificatePdf(filePath, { studentName, courseTitle, issuedOn }) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60 });
    const out = fs.createWriteStream(filePath);
    out.on('finish', resolve);
    out.on('error', reject);
    pdf.pipe(out);
    pdf.rect(30, 30, pdf.page.width - 60, pdf.page.height - 60).lineWidth(2).stroke('#b8860b');
    pdf.moveDown(2).fontSize(34).fillColor('#222').text('Certificate of Completion', { align: 'center' });
    pdf.moveDown(1.5).fontSize(16).fillColor('#444').text('This is to certify that', { align: 'center' });
    pdf.moveDown(0.6).fontSize(28).fillColor('#000').text(studentName, { align: 'center' });
    pdf.moveDown(0.6).fontSize(16).fillColor('#444').text('has successfully completed the course', { align: 'center' });
    pdf.moveDown(0.6).fontSize(24).fillColor('#000').text(courseTitle, { align: 'center' });
    pdf.moveDown(1.5).fontSize(14).fillColor('#444').text(`Issued on ${issuedOn}`, { align: 'center' });
    pdf.end();
  });
}

// Check if student is eligible for certificate for a course
const checkEligibility = async (req, res) => {
  try {
    const progress = await chapterProgress(req.user.userId, req.params.courseId);
    if (progress.totalChapters === 0) {
      return res.status(404).json({ message: 'No chapters found for this course' });
    }
    res.json(progress);
  } catch (error) {
    fail(res, 'checking eligibility for', error);
  }
};

// Generate certificate if eligible
const generateCertificateController = async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.userId;

    const progress = await chapterProgress(studentId, courseId);
    if (!progress.eligible) {
      return res.status(400).json({ message: 'Not eligible for certificate. Complete all chapters first.' });
    }

    const existing = await get('SELECT id, certificateUrl FROM certificates WHERE studentId = ? AND courseId = ?', [studentId, courseId]);
    if (existing && existing.certificateUrl && fs.existsSync(fileOf(existing))) {
      return res.status(400).json({ message: 'Certificate already exists', certificateUrl: existing.certificateUrl, certificateId: String(existing.id) });
    }

    const student = await get('SELECT name FROM users WHERE id = ?', [studentId]);
    const course = await get('SELECT title FROM courses WHERE id = ?', [courseId]);
    if (!student || !course) {
      return res.status(404).json({ message: 'Student or course not found' });
    }

    fs.mkdirSync(CERTIFICATE_FOLDER, { recursive: true });
    const fileName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.pdf`;
    await writeCertificatePdf(path.join(CERTIFICATE_FOLDER, fileName), {
      studentName: student.name,
      courseTitle: course.title,
      issuedOn: new Date().toLocaleDateString('en-GB'),
    });

    const certificateUrl = `/uploads/certificates/${fileName}`;
    // A record without a file (created when the last chapter was completed) gets its file now
    let certificateId;
    if (existing) {
      await run('UPDATE certificates SET certificateUrl = ? WHERE id = ?', [certificateUrl, existing.id]);
      certificateId = existing.id;
    } else {
      certificateId = (await run('INSERT INTO certificates (studentId, courseId, certificateUrl) VALUES (?, ?, ?)', [studentId, courseId, certificateUrl])).lastID;
    }

    res.json({ message: 'Certificate generated successfully', certificateUrl, certificateId: String(certificateId) });
  } catch (error) {
    fail(res, 'generating', error);
  }
};

async function sendOwnCertificate(req, res, { asDownload }) {
  const certificate = await ownCertificate(req.params.certificateId, req.user.userId);
  if (!certificate) {
    return res.status(404).json({ message: 'Certificate not found' });
  }
  const filePath = fileOf(certificate);
  if (!certificate.certificateUrl || !fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Certificate file not found' });
  }
  if (asDownload) return res.download(filePath, `certificate_${certificate.id}.pdf`);
  res.sendFile(filePath);
}

// Download certificate
const downloadCertificate = async (req, res) => {
  try {
    await sendOwnCertificate(req, res, { asDownload: true });
  } catch (error) {
    fail(res, 'downloading', error);
  }
};

// Get student's certificates
const getCertificates = async (req, res) => {
  try {
    const rows = await all(
      `SELECT ce.*, c.title AS courseTitle FROM certificates ce LEFT JOIN courses c ON c.id = ce.courseId
       WHERE ce.studentId = ? ORDER BY ce.issuedAt DESC, ce.id DESC`,
      [req.user.userId]
    );
    res.json(rows.map(forClient));
  } catch (error) {
    fail(res, 'fetching', error);
  }
};

const viewCertificate = async (req, res) => {
  try {
    await sendOwnCertificate(req, res, { asDownload: false });
  } catch (error) {
    fail(res, 'viewing', error);
  }
};

module.exports = {
  checkEligibility,
  generateCertificateController,
  downloadCertificate,
  getCertificates,
  viewCertificate
};
