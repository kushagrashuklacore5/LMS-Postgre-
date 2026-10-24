const express = require('express');
const router = express.Router();
const { csvCell } = require('../helpers/csv');
const path = require('path');
const fs = require('fs');




// Credentials and payment verification values are never part of an export, whoever asks
// (the same rule as routes/databaseExportRoutes.js).
const SECRET_COLUMNS = new Set(['password', 'password_hash', 'db_password', 'otp', 'razorpay_signature', 'token', 'token_hash']);
const isExportableColumn = (name) => !SECRET_COLUMNS.has(String(name).toLowerCase());
const withoutSecretColumns = (row) => Object.fromEntries(Object.entries(row).filter(([column]) => isExportableColumn(column)));

// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}


// Define accountant-specific tables (finance-related only)
const ACCOUNTANT_TABLES = [
  'payments',
  'feeStructures',
  'students', // For fee information
  'expenses',
  'orders',
  'inventory',
  'vendors',
  'requirements', // For purchase requests
  'requirement_items',
  'users' // Limited info for role-based access
];

// Get accountant-specific tables
router.get('/tables', async (req, res) => {
  try {
    // Get all tables first
    getDatabaseFromRequest(req).tables((err, allTables) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching tables' });
      }
      
      // Filter only accountant-relevant tables
      const accountantTables = allTables
        .map(table => table.name)
        .filter(tableName => ACCOUNTANT_TABLES.includes(tableName));
      
      res.json({ 
        tables: accountantTables,
        description: 'Finance and inventory related tables'
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get table structure (accountant-safe)
router.get('/table/:tableName/structure', async (req, res) => {
  try {
    const { tableName } = req.params;
    
    // Validate table name and ensure it's accountant-accessible
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) || !ACCOUNTANT_TABLES.includes(tableName)) {
      return res.status(400).json({ error: 'Access denied: Table not available for accountant' });
    }
    
    getDatabaseFromRequest(req).tableInfo(tableName, (err, columns) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching table structure' });
      }
      
      // Filter sensitive columns for certain tables
      let filteredColumns = columns.filter(col => isExportableColumn(col.name));
      if (tableName === 'users') {
        // Remove sensitive columns from users table
        filteredColumns = filteredColumns.filter(col =>
          !['password', 'email'].includes(col.name)
        );
      }
      
      res.json({ columns: filteredColumns });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get table data (accountant-filtered)
router.get('/table/:tableName/data', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { limit = 10000, offset = 0 } = req.query;
    
    // Validate table name and ensure it's accountant-accessible
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) || !ACCOUNTANT_TABLES.includes(tableName)) {
      return res.status(400).json({ error: 'Access denied: Table not available for accountant' });
    }
    
    let query = `SELECT * FROM ${tableName}`;
    let params = [];
    
    // Filter sensitive data for users table
    if (tableName === 'users') {
      query = `SELECT id, name, role, isApproved, classroom_id, createdAt, updatedAt FROM ${tableName}`;
    }
    
    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    // Get total count
    let countQuery = tableName === 'users' 
      ? `SELECT COUNT(*) as total FROM ${tableName}`
      : `SELECT COUNT(*) as total FROM ${tableName}`;
    
    getDatabaseFromRequest(req).get(countQuery, (err, countResult) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching data count' });
      }
      
      // Get data
      getDatabaseFromRequest(req).all(query, params, (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Error fetching table data' });
        }
        
        res.json({
          data: rows.map(withoutSecretColumns),
          total: countResult.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Export accountant table as Excel
router.get('/table/:tableName/excel', async (req, res) => {
  try {
    const { tableName } = req.params;
    
    // Validate table name and ensure it's accountant-accessible
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName) || !ACCOUNTANT_TABLES.includes(tableName)) {
      return res.status(400).json({ error: 'Access denied: Table not available for accountant' });
    }
    
    // Get table structure first
    getDatabaseFromRequest(req).tableInfo(tableName, (err, columns) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching table structure' });
      }
      
      let columnNames = columns.map(col => col.name).filter(isExportableColumn);
      let query = `SELECT * FROM ${tableName}`;
      
      // Filter sensitive data for users table
      if (tableName === 'users') {
        columnNames = ['id', 'name', 'role', 'isApproved', 'classroom_id', 'createdAt', 'updatedAt'];
        query = `SELECT id, name, role, isApproved, classroom_id, createdAt, updatedAt FROM ${tableName}`;
      }
      
      // Get all data
      getDatabaseFromRequest(req).all(query, (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Error fetching table data' });
        }
        
        // Convert to CSV (Excel compatible format)
        let csv = '\uFEFF'; // UTF-8 BOM for Excel compatibility
        
        // Add headers
        csv += columnNames.join(',') + '\n';
        
        // Add data rows
        rows.forEach(row => {
          const values = columnNames.map(col => {
            return csvCell(row[col]);
          });
          csv += values.join(',') + '\n';
        });
        
        // Set headers for Excel download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="accountant_${tableName}_export_${new Date().toISOString().split('T')[0]}.csv"`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(csv);
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Export complete accountant database (all finance-related tables)
router.get('/database/excel', async (req, res) => {
  try {
    // Create a combined CSV with all accountant-relevant tables
    let combinedCsv = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    combinedCsv += 'ACCOUNTANT DATABASE EXPORT - LMS Finance System\n';
    combinedCsv += `Export Date: ${new Date().toLocaleString()}\n`;
    combinedCsv += `Total Finance Tables: ${ACCOUNTANT_TABLES.length}\n`;
    combinedCsv += 'Includes: Payments, Fees, Expenses, Inventory, Orders, Vendors\n\n';
    
    const database = getDatabaseFromRequest(req);
    const tableColumns = (tableName) =>
      new Promise((resolve) => database.tableInfo(tableName, (err, columns) => resolve(err ? [] : columns)));
    const tableRows = (query) =>
      new Promise((resolve) => database.all(query, (err, rows) => resolve(err ? [] : rows)));

    // Export each accountant table, one after another, then answer once
    for (const tableName of ACCOUNTANT_TABLES) {
      let columnNames = (await tableColumns(tableName)).map(col => col.name).filter(isExportableColumn);
      if (columnNames.length === 0) continue; // table not in this database
      let query = `SELECT * FROM ${tableName}`;

      // Filter sensitive data for users table
      if (tableName === 'users') {
        columnNames = ['id', 'name', 'role', 'isApproved', 'classroom_id', 'createdAt', 'updatedAt'];
        query = `SELECT id, name, role, isApproved, classroom_id, createdAt, updatedAt FROM ${tableName}`;
      }

      const rows = await tableRows(query);
      if (rows.length === 0) continue;

      // Add table header
      combinedCsv += `TABLE: ${tableName.toUpperCase()} (${rows.length} records)\n`;
      combinedCsv += columnNames.join(',') + '\n';

      // Add table data
      rows.forEach(row => {
        const values = columnNames.map(col => {
          return csvCell(row[col]);
        });
        combinedCsv += values.join(',') + '\n';
      });

      combinedCsv += '\n'; // Add separator between tables
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="accountant_finance_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(combinedCsv);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get accountant-specific statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      totalTables: ACCOUNTANT_TABLES.length,
      tables: {},
      financeSummary: {},
      exportDate: new Date().toISOString()
    };
    
    let completedTables = 0;
    
    // Get table counts
    ACCOUNTANT_TABLES.forEach(tableName => {
      getDatabaseFromRequest(req).get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, result) => {
        completedTables++;
        
        if (!err) {
          stats.tables[tableName] = result.count;
        }
        
        if (completedTables === ACCOUNTANT_TABLES.length) {
          // Calculate finance summary
          Promise.all([
            new Promise(resolve => {
              getDatabaseFromRequest(req).get("SELECT SUM(amount) as total FROM payments WHERE status = 'completed'", (err, result) => {
                resolve(result?.total || 0);
              });
            }),
            new Promise(resolve => {
              getDatabaseFromRequest(req).get('SELECT SUM(amount) as total FROM expenses', (err, result) => {
                resolve(result?.total || 0);
              });
            }),
            new Promise(resolve => {
              getDatabaseFromRequest(req).get('SELECT SUM(totalFee) as total FROM feeStructures', (err, result) => {
                resolve(result?.total || 0);
              });
            }),
            new Promise(resolve => {
              getDatabaseFromRequest(req).get('SELECT SUM(totalAmount) as total FROM orders', (err, result) => {
                resolve(result?.total || 0);
              });
            }),
            new Promise(resolve => {
              getDatabaseFromRequest(req).get('SELECT SUM(quantity * unitPrice) as total FROM inventory', (err, result) => {
                resolve(result?.total || 0);
              });
            })
          ]).then(([totalPayments, totalExpenses, totalFees, totalOrders, inventoryValue]) => {
            stats.financeSummary = {
              totalPayments: totalPayments || 0,
              totalExpenses: totalExpenses || 0,
              totalFees: totalFees || 0,
              totalOrders: totalOrders || 0,
              inventoryValue: inventoryValue || 0,
              netBalance: (totalPayments || 0) - (totalExpenses || 0)
            };
            
            res.json(stats);
          });
        }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
