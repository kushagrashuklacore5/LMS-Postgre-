// The handlers below use the shared LMS database connection.
const db = require('../config/database-switch');



/* ================= GET ALL EXPENSES ================= */
const getAllExpenses = async (req, res) => {
  try {
    console.log("GET ALL EXPENSES - Request received");

    db.all(`
      SELECT 
        id,
        description,
        amount,
        category,
        date,
        status,
        approvedBy,
        createdAt
      FROM expenses
      WHERE university_id = ?
      ORDER BY createdAt DESC
    `, [req.user.universityId], (err, rows) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      console.log("GET ALL EXPENSES - Found expenses:", rows?.length || 0);
      res.json(rows || []);
    });
  } catch (error) {
    console.error("GET ALL EXPENSES - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= CREATE EXPENSE ================= */
const createExpense = async (req, res) => {
  try {
    const { description, amount, category, date, status } = req.body;

    console.log("CREATE EXPENSE - Request:", { description, amount, category, date, status });

    // Validate input
    if (!description || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid expense data' });
    }

    db.run(`
      INSERT INTO expenses (description, amount, category, date, status, university_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [description, amount, category || 'Other', date || new Date().toISOString().split('T')[0], status || 'pending', req.user.universityId], function(err) {
      if (err) {
        console.error("Error creating expense:", err);
        return res.status(500).json({ message: 'Database error: ' + err.message });
      }

      const expenseId = this.lastID;
      console.log("CREATE EXPENSE - Expense created with ID:", expenseId);

      // Emit socket.io event
      if (req.io) {
        req.io.emit('expense:created', {
          expenseId,
          description,
          amount,
          category,
          status: status || 'pending',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        message: 'Expense created successfully',
        expenseId,
        description,
        amount,
        category,
        status: status || 'pending'
      });
    });
  } catch (error) {
    console.error("CREATE EXPENSE - Error:", error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/* ================= UPDATE EXPENSE STATUS ================= */
const updateExpenseStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { expenseId } = req.params;

    console.log("UPDATE EXPENSE - Request:", { expenseId, status });

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    db.run(`
      UPDATE expenses 
      SET status = ?, updatedAt = utc_now_text()
      WHERE id = ? AND university_id = ?
    `, [status, expenseId, req.user.universityId], function(err) {
      if (err) {
        console.error("Error updating expense:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      console.log("UPDATE EXPENSE - Updated successfully");

      // Emit socket.io event
      if (req.io) {
        req.io.emit('expense:updated', {
          expenseId,
          status,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        message: 'Expense updated successfully',
        expenseId,
        status
      });
    });
  } catch (error) {
    console.error("UPDATE EXPENSE - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET EXPENSE SUMMARY ================= */
const getExpenseSummary = async (req, res) => {
  try {
    console.log("GET EXPENSE SUMMARY - Request received");

    db.all(`
      SELECT 
        category,
        SUM(amount) as totalAmount,
        COUNT(*) as count,
        status
      FROM expenses
      WHERE university_id = ?
      GROUP BY category, status
      ORDER BY totalAmount DESC
    `, [req.user.universityId], (err, rows) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      // Calculate totals
      const totals = {
        total: 0,
        pending: 0,
        approved: 0,
        byCategory: {}
      };

      (rows || []).forEach(row => {
        totals.total += row.totalAmount;
        if (row.status === 'pending') totals.pending += row.totalAmount;
        if (row.status === 'approved') totals.approved += row.totalAmount;
        
        if (!totals.byCategory[row.category]) {
          totals.byCategory[row.category] = 0;
        }
        totals.byCategory[row.category] += row.totalAmount;
      });

      console.log("GET EXPENSE SUMMARY - Summary:", totals);
      res.json({
        summary: totals,
        details: rows
      });
    });
  } catch (error) {
    console.error("GET EXPENSE SUMMARY - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllExpenses,
  createExpense,
  updateExpenseStatus,
  getExpenseSummary
};
