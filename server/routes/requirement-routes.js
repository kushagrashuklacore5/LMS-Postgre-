const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  createRequirement,
  getAllRequirements,
  getMyRequirements,
  updateRequirementItemStatus
} = require("../controllers/requirement-controller");

/* ================= CREATE REQUIREMENT ================= */
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  createRequirement
);

/* ================= GET ALL REQUIREMENTS (STOREKEEPER & ACCOUNTANT) ================= */
router.get(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "storekeeper", "accountant"]),
  getAllRequirements
);

/* ================= GET MY REQUIREMENTS (TEACHER) ================= */
router.get(
  "/my-requests",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  getMyRequirements
);

/* ================= UPDATE REQUIREMENT ITEM STATUS (STOREKEEPER & ACCOUNTANT) ================= */
router.patch(
  "/:itemId/status",
  authMiddleware,
  roleMiddleware(["admin", "storekeeper", "accountant"]),
  updateRequirementItemStatus
);

module.exports = router;
