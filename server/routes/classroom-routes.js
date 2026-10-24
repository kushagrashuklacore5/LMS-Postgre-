const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  saveFeeStructure,
  getAllFeeStructures,
  updateFeeStructure,
  getClassroomFeeStructure
} = require('../controllers/classroomController');

/* ================= FEE STRUCTURES ROUTES ================= */

// Get all fee structures
router.get('/fee-structures', authMiddleware, getAllFeeStructures);

// Create fee structure
router.post('/fee-structures', authMiddleware, saveFeeStructure);

// Update fee structure
router.put('/fee-structures/:id', authMiddleware, updateFeeStructure);

// Get classroom fee structure
router.get('/:classroomId/fee-structure', authMiddleware, getClassroomFeeStructure);

module.exports = router;
