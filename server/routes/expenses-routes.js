const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  getAllExpenses,
  createExpense,
  updateExpenseStatus,
  getExpenseSummary
} = require("../controllers/expenses-controller");

/* ================= GET ALL EXPENSES ================= */
router.get(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "accountant"]),
  getAllExpenses
);

/* ================= CREATE EXPENSE ================= */
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "storekeeper"]),
  createExpense
);

/* ================= GET EXPENSE SUMMARY ================= */
router.get(
  "/summary",
  authMiddleware,
  roleMiddleware(["admin", "accountant"]),
  getExpenseSummary
);

/* ================= UPDATE EXPENSE STATUS ================= */
router.patch(
  "/:expenseId/status",
  authMiddleware,
  roleMiddleware(["admin", "accountant"]),
  updateExpenseStatus
);

module.exports = router;
