const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  createOrder,
  getAllOrders,
  getMyOrders,
  updateOrderStatus
} = require("../controllers/orders-controller");

/* ================= CREATE ORDER ================= */
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "storekeeper"]),
  createOrder
);

/* ================= GET ALL ORDERS (ADMIN & ACCOUNTANT) ================= */
router.get(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "accountant"]),
  getAllOrders
);

/* ================= GET MY ORDERS (STOREKEEPER) ================= */
router.get(
  "/my-orders",
  authMiddleware,
  roleMiddleware(["admin", "storekeeper"]),
  getMyOrders
);

/* ================= UPDATE ORDER STATUS ================= */
router.patch(
  "/:orderId/status",
  authMiddleware,
  roleMiddleware(["admin", "storekeeper"]),
  updateOrderStatus
);

module.exports = router;
