const express = require('express');
const router = express.Router();

// Credentials and payment verification values are never part of an export, whoever asks.
const SECRET_COLUMNS = new Set(['password', 'password_hash', 'db_password', 'otp', 'razorpay_signature', 'token', 'token_hash']);
const isExportableColumn = (name) => !SECRET_COLUMNS.has(String(name).toLowerCase());
const withoutSecretColumns = (row) => Object.fromEntries(Object.entries(row).filter(([column]) => isExportableColumn(column)));
const path = require('path');
const fs = require('fs');
const translationService = require('../services/translationService');
const authMiddleware = require('../middleware/authMiddleware');
const { checkExportAccess } = require('../middleware/quotaMiddleware');
const { rateLimiters } = require('../middleware/rateLimiter');
const ExcelJS = require('exceljs');
const db = require('../config/database-switch');

// Database categories mapping for clean structured exports
const DB_CATEGORIES = {
  users: {
    id: 'users',
    name: 'Users & Accounts',
    description: 'Students, Mentors, Admins, Roles, Subscriptions',
    tables: [
      'users', 'students', 'superadmins', 'universities', 'subscriptions',
      'user_language_preferences', 'otp_reset', 'soa_student_setup_tokens',
      'soa_custom_field_values', 'soa_custom_fields'
    ]
  },
  academics: {
    id: 'academics',
    name: 'Academics & Classrooms',
    description: 'Classrooms, Courses, Modules, Attendance, Timetable, Progress',
    tables: [
      'classrooms', 'classroomAssignments', 'student_classroom_assignment',
      'courses', 'course_students', 'course_materials', 'weeks', 'chapters',
      'attendance', 'certificates', 'progress', 'results'
    ]
  },
  finance: {
    id: 'finance',
    name: 'Finance & Fees',
    description: 'Fee structures, Invoices, Payment history, Installments, Expenses',
    tables: [
      'payments', 'payment_orders', 'invoices', 'feeStructures',
      'student_fee_schedules', 'expenses', 'orders'
    ]
  },
  assessments: {
    id: 'assessments',
    name: 'AI Assessments & LMS Exams',
    description: 'AI assessment agent, Quizzes, Submissions, Question banks, Reports',
    tables: [
      'aia_assessments', 'aia_assignments', 'aia_assessment_recipients',
      'aia_assignment_questions', 'aia_assignment_submissions', 'aia_attempts',
      'aia_attempt_answers', 'aia_attempt_archive', 'aia_attempt_responses',
      'aia_options', 'aia_performance_reports', 'aia_questions',
      'assessments', 'assessment_questions', 'assessment_attempts'
    ]
  },
  operations: {
    id: 'operations',
    name: 'Campus & Operations',
    description: 'Announcements, Calendar, Live classes, Inventory, Vendors',
    tables: [
      'announcements', 'calendar_events', 'live_classes', 'live_class_attendees',
      'inventory', 'vendors', 'vendor_stock', 'requirements', 'requirement_items',
      'demo_requests', 'translations'
    ]
  }
};

// Hardcoded Arabic translations for common field names
const arabicTranslations = {
  'id': 'المعرّف',
  'name': 'الاسم',
  'email': 'البريد الإلكتروني',
  'password': 'كلمة السر',
  'role': 'الدور',
  'createdAt': 'تم الإنشاء في',
  'updatedAt': 'تم التحديث في',
  'isApproved': 'موافق عليه',
  'description': 'الوصف',
  'title': 'العنوان',
  'content': 'المحتوى',
  'status': 'الحالة',
  'userId': 'معرّف المستخدم',
  'user_id': 'معرّف المستخدم',
  'classroomId': 'معرّف الفصل',
  'classroom_id': 'معرّف الفصل',
  'courseId': 'معرّف الدورة',
  'course_id': 'معرّف الدورة',
  'students': 'الطلاب',
  'teachers': 'المعلمون',
  'mentors': 'المرشدون',
  'courses': 'الدورات',
  'classrooms': 'الفصول',
  'payments': 'المدفوعات',
  'amount': 'المبلغ',
  'date': 'التاريخ',
  'phone': 'الهاتف',
  'address': 'العنوان',
  'city': 'المدينة',
  'country': 'الدولة',
  'startDate': 'تاريخ البدء',
  'endDate': 'تاريخ الانتهاء',
  'grade': 'الدرجة',
  'remarks': 'الملاحظات',
  'comments': 'التعليقات'
};

// Helper function to translate field name to Arabic
function getArabicFieldName(fieldName) {
  // Check hardcoded translations first
  if (arabicTranslations[fieldName]) {
    return arabicTranslations[fieldName];
  }
  // For unknown fields, try to construct Arabic version
  // If it looks like camelCase or snake_case, return as is for translation service
  return fieldName;
}

// Get all tables in the database
router.get('/tables', rateLimiters.sensitive, authMiddleware, checkExportAccess, async (req, res) => {
  try {
    db.tables((err, tables) => {
      if (err) {
        console.error('Error fetching tables:', err);
        return res.status(500).json({ error: 'Error fetching tables' });
      }
      
      const tableNames = (tables || []).map(table => table.name);
      res.json({ tables: tableNames });
    });
  } catch (error) {
    console.error('Server error fetching tables:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get table structure
router.get('/table/:tableName/structure', rateLimiters.sensitive, authMiddleware, checkExportAccess, async (req, res) => {
  try {
    const { tableName } = req.params;
    
    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    db.tableInfo(tableName, (err, columns) => {
      if (err) {
        console.error('Error fetching table structure:', err);
        return res.status(500).json({ error: 'Error fetching table structure' });
      }
      
      const cols = (columns || []).filter(col => isExportableColumn(col.name)).map(col => ({
        name: col.name,
        column_name: col.name,
        data_type: col.type || 'TEXT',
        nullable: !col.notnull,
        is_primary: !!col.pk
      }));
      res.json({ columns: cols });
    });
  } catch (error) {
    console.error('Server error fetching table structure:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get table data
router.get('/table/:tableName/data', rateLimiters.sensitive, authMiddleware, checkExportAccess, async (req, res) => {
  try {
    const { tableName } = req.params;
    const { limit = 10000, offset = 0 } = req.query;
    
    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    // Get total count
    db.get(`SELECT COUNT(*) as total FROM ${tableName}`, (err, countResult) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching data count' });
      }
      
      // Get data
      db.all(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`, [parseInt(limit), parseInt(offset)], (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Error fetching table data' });
        }
        
        res.json({
          data: (rows || []).map(withoutSecretColumns),
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

// Get all categorized tables definition
router.get('/categories', rateLimiters.sensitive, authMiddleware, checkExportAccess, (req, res) => {
  res.json({ categories: DB_CATEGORIES });
});

// Helper: Style an Excel Worksheet with Core5 Navy & Gold branding
function styleTableWorksheet(ws, headers, rows, titleText) {
  // Title / Banner if provided
  if (titleText) {
    ws.addRow([titleText]);
    ws.mergeCells(1, 1, 1, Math.max(headers.length, 3));
    const titleCell = ws.getCell('A1');
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002366' } }; // Core5 Navy
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(1).height = 30;
    ws.addRow([]); // empty spacer row
  }

  // Header row
  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002366' } }; // Navy Blue
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF001740' } },
      bottom: { style: 'medium', color: { argb: 'FFB99652' } }, // Core5 Gold border accent
      left: { style: 'thin', color: { argb: 'FF002366' } },
      right: { style: 'thin', color: { argb: 'FF002366' } }
    };
  });

  // Data rows
  rows.forEach((rowObj, rIdx) => {
    const rowValues = headers.map(h => {
      const val = rowObj[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });
    const dRow = ws.addRow(rowValues);
    dRow.height = 20;

    // Subtle alternating row striping
    if (rIdx % 2 === 1) {
      dRow.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFD' } };
      });
    }

    dRow.eachCell((c) => {
      c.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6E8F1' } }
      };
    });
  });

  // Auto-fit column widths
  ws.columns.forEach((col, idx) => {
    const headerName = headers[idx] || '';
    let maxLen = headerName.length;
    // Check first 40 sample rows
    const sample = rows.slice(0, 40);
    sample.forEach(r => {
      const val = r[headerName];
      const strLen = val ? String(val).length : 0;
      if (strLen > maxLen) maxLen = strLen;
    });
    col.width = Math.min(46, Math.max(12, maxLen + 3));
  });

  // Freeze top pane and enable auto-filter
  const headerRowNum = titleText ? 3 : 1;
  ws.views = [{ state: 'frozen', ySplit: headerRowNum, showGridLines: true }];
  if (headers.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: headerRowNum, column: headers.length }
    };
  }
}

// Export single table as real Excel (.xlsx) workbook
router.get('/table/:tableName/excel', rateLimiters.sensitive, authMiddleware, checkExportAccess, async (req, res) => {
  try {
    const { tableName } = req.params;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${tableName}`, (err, data) => {
        if (err) return reject(err);
        resolve((data || []).map(withoutSecretColumns));
      });
    });

    let headers = [];
    if (rows.length > 0) {
      headers = Object.keys(rows[0]);
    } else {
      const cols = await new Promise((r) => {
        db.tableInfo(tableName, (err, c) => r((c || []).map(x => x.name)));
      });
      headers = cols.length > 0 ? cols : ['id'];
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Core5 Academy LMS';
    workbook.created = new Date();

    const safeSheetName = tableName.replace(/[\\/*?:\[\]]/g, '_').substring(0, 31);
    const ws = workbook.addWorksheet(safeSheetName);

    styleTableWorksheet(ws, headers, rows);

    const filename = `${tableName}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting single table:', error);
    res.status(500).json({ error: 'Server error exporting table' });
  }
});

// Export database as Multi-Sheet Excel (.xlsx) workbook with category filtering
router.get('/database/excel', rateLimiters.sensitive, authMiddleware, checkExportAccess, async (req, res) => {
  try {
    const lang = (req.query.lang || 'en').toLowerCase();
    const categoriesParam = req.query.categories;
    const requestedCategories = categoriesParam ? categoriesParam.split(',').map(c => c.trim()) : null;

    // Fetch all table names from database
    const allDbTables = await new Promise((resolve, reject) => {
      db.tables((err, tables) => {
        if (err) return reject(err);
        resolve((tables || []).map(t => t.name));
      });
    });

    // Filter tables based on requested categories
    let targetTables = allDbTables;
    let scopeLabel = 'Full_Database';

    if (requestedCategories && requestedCategories.length > 0 && !requestedCategories.includes('all')) {
      const allowedTables = new Set();
      requestedCategories.forEach(catId => {
        if (DB_CATEGORIES[catId]) {
          DB_CATEGORIES[catId].tables.forEach(t => allowedTables.add(t));
        }
      });
      targetTables = allDbTables.filter(t => allowedTables.has(t));
      scopeLabel = requestedCategories.join('_');
    }

    if (targetTables.length === 0) {
      targetTables = allDbTables;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Core5 Academy LMS';
    workbook.created = new Date();

    // 1. Overview / Table of Contents Worksheet
    const summarySheet = workbook.addWorksheet('Overview & Summary', {
      views: [{ showGridLines: true }]
    });

    // Title banner
    summarySheet.mergeCells('A1:E1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'Core5 Academy - LMS Database Export';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002366' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 36;

    // Metadata details
    summarySheet.addRow([]);
    summarySheet.addRow(['Export Date:', new Date().toLocaleString(), '', 'Language:', lang.toUpperCase()]);
    summarySheet.addRow(['Scope:', requestedCategories && !requestedCategories.includes('all') ? requestedCategories.join(', ') : 'All Categories (Full)', '', 'Tables Exported:', targetTables.length]);
    summarySheet.addRow([]);

    summarySheet.getRow(3).font = { bold: true };
    summarySheet.getRow(4).font = { bold: true };

    // Table of contents header
    const tocHeader = summarySheet.addRow(['#', 'Table / Sheet Name', 'Category', 'Records Count', 'Status']);
    tocHeader.height = 24;
    tocHeader.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002366' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    summarySheet.columns = [
      { width: 8 },
      { width: 34 },
      { width: 28 },
      { width: 16 },
      { width: 16 }
    ];

    let totalRecordsCount = 0;
    const tableCache = [];

    // Pre-fetch all tables data
    for (let i = 0; i < targetTables.length; i++) {
      const tableName = targetTables[i];
      const rows = await new Promise((resolve) => {
        db.all(`SELECT * FROM ${tableName}`, (err, data) => {
          if (err) return resolve([]);
          resolve((data || []).map(withoutSecretColumns));
        });
      });

      const catEntry = Object.values(DB_CATEGORIES).find(c => c.tables.includes(tableName));
      const categoryName = catEntry ? catEntry.name : 'System';

      tableCache.push({ tableName, rows, categoryName });
      totalRecordsCount += rows.length;

      const sRow = summarySheet.addRow([
        i + 1,
        tableName,
        categoryName,
        rows.length,
        rows.length > 0 ? 'Active' : 'Empty'
      ]);
      sRow.height = 20;
      sRow.getCell(1).alignment = { horizontal: 'center' };
      sRow.getCell(4).alignment = { horizontal: 'right' };
      sRow.getCell(5).alignment = { horizontal: 'center' };

      if (i % 2 === 1) {
        sRow.eachCell((c) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFC' } };
        });
      }
    }

    // Summary Total Row
    const sumRow = summarySheet.addRow(['', 'Total Across All Tables', '', totalRecordsCount, '']);
    sumRow.height = 24;
    sumRow.font = { bold: true };
    sumRow.getCell(4).alignment = { horizontal: 'right' };
    sumRow.eachCell((c) => {
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    });

    // 2. Add individual tab for each table
    for (const item of tableCache) {
      const { tableName, rows } = item;
      const safeSheetName = tableName.replace(/[\\/*?:\[\]]/g, '_').substring(0, 31);
      const ws = workbook.addWorksheet(safeSheetName);

      let headers = [];
      if (rows.length > 0) {
        headers = Object.keys(rows[0]);
      } else {
        const cols = await new Promise((r) => {
          db.tableInfo(tableName, (err, c) => r((c || []).map(x => x.name)));
        });
        headers = cols.length > 0 ? cols : ['id'];
      }

      styleTableWorksheet(ws, headers, rows);
    }

    const filename = `core5_${scopeLabel}_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Multi-Sheet Excel workbook:', error);
    res.status(500).json({ error: 'Server error generating Excel workbook' });
  }
});

// Get database statistics
router.get('/stats', rateLimiters.sensitive, authMiddleware, checkExportAccess, async (req, res) => {
  try {
    db.tables((err, tables) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching tables' });
      }
      
      const tableNames = (tables || []).map(table => table.name);
      const stats = {
        totalTables: tableNames.length,
        tables: {},
        exportDate: new Date().toISOString()
      };
      
      if (tableNames.length === 0) {
        return res.json(stats);
      }
      
      let completedTables = 0;
      
      tableNames.forEach(tableName => {
        db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, result) => {
          completedTables++;
          
          if (!err && result) {
            stats.tables[tableName] = result.count;
          }
          
          if (completedTables === tableNames.length) {
            res.json(stats);
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

