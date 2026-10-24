const fs = require('fs');

// Export a function that creates core tables on a given sqlite3 Database instance
module.exports.createTables = function(db) {
  if (!db) return;

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      isApproved BOOLEAN DEFAULT 0,
      classroom_id INTEGER,
      university_id INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('schema.createTables - users:', err.message);
  });

  // Universities table
  db.run(`
    CREATE TABLE IF NOT EXISTS universities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      adminId INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('schema.createTables - universities:', err.message);
  });

  // Payments table (complete with Razorpay fields)
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      amount REAL DEFAULT 0,
      type TEXT DEFAULT 'full',
      status TEXT DEFAULT 'success',
      transactionId TEXT UNIQUE,
      razorpay_payment_id TEXT UNIQUE,
      razorpay_order_id TEXT,
      razorpay_signature TEXT,
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      university_id INTEGER DEFAULT 1,
      FOREIGN KEY(studentId) REFERENCES users(id)
    )
  `, (err) => { if (err) console.error('schema.createTables - payments:', err.message); });

  // Expenses table (basic)
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT,
      amount REAL DEFAULT 0,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      category TEXT,
      university_id INTEGER DEFAULT 1
    )
  `, (err) => { if (err) console.error('schema.createTables - expenses:', err.message); });

  // Inventory table (basic)
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT,
      stock INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 0,
      unitPrice REAL DEFAULT 0,
      vendorName TEXT,
      description TEXT,
      purchaseDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      university_id INTEGER DEFAULT 1
    )
  `, (err) => { if (err) console.error('schema.createTables - inventory:', err.message); });

  // Orders table (basic)
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT,
      item TEXT,
      qty INTEGER DEFAULT 0,
      status TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      university_id INTEGER DEFAULT 1
    )
  `, (err) => { if (err) console.error('schema.createTables - orders:', err.message); });

  // Translations table (lightweight)
  db.run(`
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT NOT NULL,
      english_text TEXT,
      arabic_text TEXT,
      category TEXT,
      field_name TEXT,
      model_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => { if (err) console.error('schema.createTables - translations:', err.message); });

};
