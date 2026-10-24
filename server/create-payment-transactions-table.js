const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Creating payment_transactions table...');

// Create payment_transactions table
db.run(`CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)`, (err) => {
  if (err) {
    console.error('❌ Error creating payment_transactions table:', err);
    return;
  }

  console.log('✅ payment_transactions table created successfully');

  // Insert sample payment transaction for testing
  const sampleTransaction = {
    invoice_id: 13, // Use existing invoice ID
    user_id: 35,    // Use accountant user ID
    amount: 1107,
    payment_date: new Date().toISOString(),
    status: 'completed',
    razorpay_order_id: 'order_test123',
    razorpay_payment_id: 'pay_test123',
    razorpay_signature: 'sig_test123'
  };

  db.run(`INSERT INTO payment_transactions (invoice_id, user_id, amount, payment_date, status, 
           razorpay_order_id, razorpay_payment_id, razorpay_signature) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
    [
      sampleTransaction.invoice_id,
      sampleTransaction.user_id,
      sampleTransaction.amount,
      sampleTransaction.payment_date,
      sampleTransaction.status,
      sampleTransaction.razorpay_order_id,
      sampleTransaction.razorpay_payment_id,
      sampleTransaction.razorpay_signature
    ], 
    function(err) {
      if (err) {
        console.error('❌ Error inserting sample transaction:', err);
      } else {
        console.log('✅ Sample payment transaction inserted');
        console.log('📋 Transaction ID:', this.lastID);
      }

      // Verify the table was created
      db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='payment_transactions'", [], (err, tables) => {
        if (err) {
          console.error('❌ Error verifying table:', err);
        } else {
          console.log('✅ Table verification successful');
          
          // Show sample data
          db.all("SELECT * FROM payment_transactions LIMIT 3", [], (err, transactions) => {
            if (err) {
              console.error('❌ Error fetching sample data:', err);
            } else {
              console.log('\n📋 Sample Payment Transactions:');
              transactions.forEach((transaction, index) => {
                console.log(`${index + 1}. ID: ${transaction.id}, Invoice: ${transaction.invoice_id}, Amount: ₹${transaction.amount}, Status: ${transaction.status}`);
              });
            }
            
            db.close((err) => {
              if (err) {
                console.error('❌ Error closing database:', err);
              } else {
                console.log('\n✅ Database connection closed');
                console.log('🎯 Payment transactions table is ready for Razorpay integration!');
              }
            });
          });
        }
      });
    }
  );
});
