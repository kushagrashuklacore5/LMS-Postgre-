/**
 * Child process used by test_phase2a_remediation.js to exercise the installment
 * service from a SEPARATE OS process (own connection, no shared memory).
 * Usage: node phase2a_test_worker.js <dbPath> <payloadJsonFile>
 */
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { recordOfflineInstallmentPayment } = require('../services/installmentService');

const [dbPath, payloadFile] = process.argv.slice(2);
const db = new sqlite3.Database(dbPath);
const silence = console.error;
console.error = () => {};

// The parent suite's fixture staff and students are all in university 999
recordOfflineInstallmentPayment(db, JSON.parse(fs.readFileSync(payloadFile, 'utf8')), { universityId: 999 })
  .then(r => ({ ok: true, dup: r.isDuplicate, id: r.payment.id }))
  .catch(e => ({ ok: false, status: e.statusCode, code: e.code, message: e.message }))
  .then(result => {
    console.error = silence;
    process.stdout.write(JSON.stringify(result));
    db.close();
  });
