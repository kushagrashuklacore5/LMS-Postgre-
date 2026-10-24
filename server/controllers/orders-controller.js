// The handlers below use the shared LMS database connection.
const db = require('../config/database-switch');



/* ================= CREATE ORDER ================= */
const createOrder = async (req, res) => {
  try {
    const { requirementItemId, itemName, quantity, unitPrice, vendorId, deliveryDate } = req.body;
    const storekeeperId = req.user.userId;

    console.log("CREATE ORDER - Request:", { requirementItemId, itemName, quantity, unitPrice, vendorId, deliveryDate, storekeeperId });

    // Validate input
    if (!itemName || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Invalid order data' });
    }

    const totalAmount = quantity * (unitPrice || 0);

    db.run(`
      INSERT INTO orders (requirementItemId, storekeeperId, itemName, quantity, unitPrice, totalAmount, vendorId, deliveryDate, status, university_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [requirementItemId, storekeeperId, itemName, quantity, unitPrice, totalAmount, vendorId || null, deliveryDate || null, req.user.universityId], function(err) {
      if (err) {
        console.error("Error creating order:", err);
        return res.status(500).json({ message: 'Database error: ' + err.message });
      }

      const orderId = this.lastID;
      console.log("CREATE ORDER - Order created with ID:", orderId);

      // Update inventory quantity
      db.run(`
        UPDATE inventory 
        SET quantity = quantity + ?
        WHERE itemName = ? AND university_id = ?
      `, [quantity, itemName, req.user.universityId], function(err) {
        if (err) {
          console.error("Error updating inventory:", err);
          // Continue anyway, order is created
        } else {
          console.log("CREATE ORDER - Inventory updated for:", itemName);
        }

        // Create expense record
        createExpenseRecord(req.user.universityId, itemName, quantity, totalAmount, orderId, (expenseErr) => {
          if (expenseErr) {
            console.error("Error creating expense:", expenseErr);
          }

          // Emit socket.io event
          if (req.io) {
            req.io.emit('order:created', {
              orderId,
              itemName,
              quantity,
              totalAmount,
              status: 'pending',
              timestamp: new Date().toISOString()
            });
            console.log("CREATE ORDER - Socket event emitted");
          }

          res.json({
            message: 'Order created successfully',
            orderId,
            itemName,
            quantity,
            totalAmount,
            status: 'pending'
          });
        });
      });
    });
  } catch (error) {
    console.error("CREATE ORDER - Error:", error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/* ================= GET ALL ORDERS ================= */
const getAllOrders = async (req, res) => {
  try {
    console.log("GET ALL ORDERS - Request received");

    db.all(`
      SELECT 
        o.id,
        o.requirementItemId,
        o.storekeeperId,
        o.itemName,
        o.quantity,
        o.unitPrice,
        o.totalAmount,
        o.vendorId,
        o.orderDate,
        o.deliveryDate,
        o.status,
        o.createdAt,
        u.name as storekeepername,
        v.name as vendorName
      FROM orders o
      LEFT JOIN users u ON o.storekeeperId = u.id
      LEFT JOIN vendors v ON o.vendorId = v.id
      WHERE o.university_id = ?
      ORDER BY o.orderDate DESC
    `, [req.user.universityId], (err, rows) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      console.log("GET ALL ORDERS - Found orders:", rows?.length || 0);
      res.json(rows || []);
    });
  } catch (error) {
    console.error("GET ALL ORDERS - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET MY ORDERS (STOREKEEPER) ================= */
const getMyOrders = async (req, res) => {
  try {
    const storekeeperId = req.user.userId;
    console.log("GET MY ORDERS - Storekeeper ID:", storekeeperId);

    db.all(`
      SELECT 
        o.id,
        o.requirementItemId,
        o.storekeeperId,
        o.itemName,
        o.quantity,
        o.unitPrice,
        o.totalAmount,
        o.vendorId,
        o.orderDate,
        o.deliveryDate,
        o.status,
        o.createdAt,
        v.name as vendorName
      FROM orders o
      LEFT JOIN vendors v ON o.vendorId = v.id
      WHERE o.storekeeperId = ?
      ORDER BY o.orderDate DESC
    `, [storekeeperId], (err, rows) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      console.log("GET MY ORDERS - Found orders:", rows?.length || 0);
      res.json(rows || []);
    });
  } catch (error) {
    console.error("GET MY ORDERS - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= UPDATE ORDER STATUS ================= */
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { orderId } = req.params;

    console.log("UPDATE ORDER - Request:", { orderId, status });

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    db.run(`
      UPDATE orders 
      SET status = ?, updatedAt = utc_now_text()
      WHERE id = ? AND university_id = ?
    `, [status, orderId, req.user.universityId], function(err) {
      if (err) {
        console.error("Error updating order:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      console.log("UPDATE ORDER - Updated successfully");

      // Emit socket.io event
      if (req.io) {
        req.io.emit('order:updated', {
          orderId,
          status,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        message: 'Order updated successfully',
        orderId,
        status
      });
    });
  } catch (error) {
    console.error("UPDATE ORDER - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= CREATE EXPENSE RECORD ================= */
const createExpenseRecord = (universityId, itemName, quantity, totalAmount, orderId, callback) => {
  const description = `Order #${orderId}: Purchase of ${quantity}x ${itemName}`;
  const date = new Date().toISOString().split('T')[0];

  db.run(`
    INSERT INTO expenses (description, amount, category, date, status, university_id)
    VALUES (?, ?, 'Supplies', ?, 'pending', ?)
  `, [description, totalAmount, date, universityId], function(err) {
    if (err) {
      console.error("Error creating expense:", err);
      if (callback) callback(err);
      return;
    }

    console.log("EXPENSE RECORD - Created with ID:", this.lastID);
    if (callback) callback(null, this.lastID);
  });
};

module.exports = {
  createOrder,
  getAllOrders,
  getMyOrders,
  updateOrderStatus
};
