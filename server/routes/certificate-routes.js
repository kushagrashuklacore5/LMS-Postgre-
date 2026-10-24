const express = require('express');
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { certificateId: "certificate", courseId: "course" });
const {
  checkEligibility,
  generateCertificateController,
  downloadCertificate,
  getCertificates,
  viewCertificate
} = require('../controllers/certificate-controller');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// All certificate routes require authentication and student role
router.use(authMiddleware);
router.use(roleMiddleware(['student']));

// Check eligibility for certificate
router.get('/eligibility/:courseId', checkEligibility);

// Generate certificate if eligible
router.post('/generate/:courseId', generateCertificateController);

// View certificate
router.get('/view/:certificateId', viewCertificate);

// Download certificate
router.get('/download/:certificateId', downloadCertificate);

// Get student's certificates
router.get('/', getCertificates);

module.exports = router;
