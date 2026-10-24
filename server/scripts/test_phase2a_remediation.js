/**
 * PHASE 2A REMEDIATION REGRESSION SUITE
 *
 * Runs against an ISOLATED copy of the project database (data/lms_phase2a_test.db);
 * the project database is only read (file copy). No gateway calls are made.
 * Usage: node scripts/test_phase2a_remediation.js
 * Exit code is non-zero if any test fails.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');
const express = require('express');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const TEST_SECRET = 'phase2a-remediation-test-secret';
process.env.JWT_SECRET = TEST_SECRET;
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

const { runInstallmentMigrations } = require('../config/migration-runner');
const svc = require('../services/installmentService');
const money = require('../services/money');

const srcDbPath = path.join(__dirname, '../data/lms_permanent.db');
const testDbPath = path.join(__dirname, '../data/lms_phase2a_test.db');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2a-'));

const say = console.log.bind(console);
// Route/service logging is noise here; test output goes through say()
console.log = () => {};
console.error = () => {};

const dbAll = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, r) => e ? reject(e) : resolve(r || [])));
const dbGet = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, r) => e ? reject(e) : resolve(r)));
const dbRun = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(e) { e ? reject(e) : resolve(this); }));

const PLANS = JSON.stringify([
  { id: 'p2', name: '2-Term Plan', isActive: true, installments: [{ number: 1, percentage: 50, dueDate: '2026-10-31' }, { number: 2, percentage: 50, dueDate: '2026-12-31' }] },
  { id: 'p3', name: '3-Term Equal Plan', isActive: true, installments: [{ number: 1 }, { number: 2 }, { number: 3 }] },
  { id: 'p6', name: '6-Month Plan', status: 'active', installments: [20, 20, 15, 15, 15, 15].map((percentage, i) => ({ number: i + 1, percentage })) },
  { id: 'pbad', name: 'Broken Plan', isActive: true, installments: [{ number: 1, percentage: 60 }, { number: 2, percentage: 60 }] },
  { id: 'poff', name: 'Inactive Plan', isActive: false, installments: [{ number: 1, percentage: 100 }] }
]);

let db, baseUrl, server, FS1, FS2, keySeq = 0;
const U = {}; // fixture user ids
const results = [];

const key = (label = 'k') => `T-${label}-${++keySeq}`;
const pay = (o) => Object.assign({ feeStructureId: FS1, planId: 'p2', installmentStage: 1, amount: 1000, paymentMethod: 'Cash', idempotencyKey: key() }, o);
const attempt = (payload) => svc.recordOfflineInstallmentPayment(db, payload, { universityId: 999 }) // fixture staff and students are all in university 999
  .then(r => ({ ok: true, dup: r.isDuplicate, id: r.payment.id, payment: r.payment, stage: r.stageUpdated }))
  .catch(e => ({ ok: false, status: e.statusCode, code: e.code, message: e.message }));

let workerSeq = 0;
const attemptInNewProcess = (payload) => new Promise(resolve => {
  const file = path.join(workDir, `payload-${++workerSeq}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  cp.execFile(process.execPath, [path.join(__dirname, 'phase2a_test_worker.js'), testDbPath, file], (err, stdout, stderr) => {
    try { resolve(JSON.parse(stdout)); } catch (e) { resolve({ ok: false, crashed: true, message: String(stderr || err).slice(0, 300) }); }
  });
});

const token = (claims, opts = { expiresIn: '1h' }, secret = TEST_SECRET) => jwt.sign(claims, secret, opts);
const tokenFor = (name) => token({ userId: U[name], role: name.replace(/\d+$/, '').replace(/^stu.*/, 'student'), email: `${name}@test.local` });
async function call(method, url, { auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(baseUrl + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON body */ }
  return { status: res.status, json };
}

async function test(name, fn) {
  const failures = [];
  const check = (label, cond, detail) => { if (!cond) failures.push(detail === undefined ? label : `${label} -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
  try {
    await fn(check);
  } catch (e) {
    failures.push(`threw: ${e.stack || e.message}`);
  }
  results.push({ name, failures });
  say(`${failures.length === 0 ? '✅ [PASS]' : '❌ [FAIL]'} ${name}`);
  failures.forEach(f => say(`      - ${f}`));
}

const newStudent = async (label) => (await dbRun(db, `INSERT INTO users (name, email, password, role, university_id) VALUES (?, ?, 'x', 'student', 999)`, [`Test ${label}`, `${label}-${Date.now()}-${Math.random()}@test.local`])).lastID;
const countRows = async (sql, params) => (await dbGet(db, `SELECT COUNT(*) n FROM ${sql}`, params)).n;
const stagePaise = async (studentId, stage) => (await dbGet(db, `SELECT COALESCE(SUM(amountPaise), 0) t, COUNT(*) n FROM payments WHERE studentId = ? AND installmentStage = ? AND status = 'success'`, [studentId, stage]));

async function setup() {
  db = new sqlite3.Database(testDbPath);

  for (const [name, role] of [['accountant', 'accountant'], ['admin', 'admin'], ['mentor', 'mentor'], ['stuA', 'student'], ['stuB', 'student']]) {
    U[name] = (await dbRun(db, `INSERT INTO users (name, email, password, role, university_id) VALUES (?, ?, 'x', ?, 999)`, [`Test ${name}`, `${name}-${Date.now()}@test.local`, role])).lastID;
  }
  FS1 = (await dbRun(db, `INSERT INTO feeStructures (university_id, category, grade, totalFee, dueDate, installmentOptions) VALUES (999, 'Primary', 'TEST', 8050, '2099-12-31', ?)`, [PLANS])).lastID;
  FS2 = (await dbRun(db, `INSERT INTO feeStructures (university_id, category, grade, totalFee, dueDate, installmentOptions) VALUES (999, 'Secondary', 'TEST', 12100, '2099-12-31', ?)`, [PLANS])).lastID;

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.tenant = { database: db }; next(); }); // routes read the test DB, never the project DB
  app.use('/api/accountant', require('../routes/accountantRoutes'));
  app.use('/api/transactions', require('../routes/transaction-routes'));
  app.use('/api/payments', require('../routes/payment-routes'));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  say('================================================================');
  say('🧪 PHASE 2A REMEDIATION REGRESSION SUITE');
  say('================================================================');

  // ---- Migration on the isolated copy (run before fixtures so "legacy" means the project's real rows)
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  fs.copyFileSync(srcDbPath, testDbPath);
  const pre = new sqlite3.Database(testDbPath);
  const legacyBefore = await dbAll(pre, `SELECT * FROM payments ORDER BY id`);
  const backupDir = path.join(workDir, 'backups');
  const firstRun = await runInstallmentMigrations(pre, { backupDir });
  const secondRun = await runInstallmentMigrations(pre, { backupDir });
  const legacyAfterMigration = await dbAll(pre, `SELECT * FROM payments ORDER BY id`);
  await new Promise(r => pre.close(r));

  await setup();
  say(`Isolated test database: ${testDbPath}`);
  say(`Legacy payment rows carried over from project DB: ${legacyBefore.length}\n`);

  const legacyColumns = legacyBefore.length ? Object.keys(legacyBefore[0]) : [];
  const projectOnly = (rows) => rows.map(r => Object.fromEntries(legacyColumns.map(c => [c, r[c]])));

  await test('0. Migration: backup first, additive only, idempotent, existing rows untouched', async (check) => {
    const pendingExpected = !legacyColumns.includes('amountPaise');
    if (pendingExpected) {
      check('backup file created before schema change', firstRun.backupPath && fs.existsSync(firstRun.backupPath), firstRun.backupPath);
    }
    check('second run applies nothing and takes no backup', secondRun.backupPath === null);
    check('existing payment rows byte-identical in their original columns', JSON.stringify(projectOnly(legacyAfterMigration)) === JSON.stringify(legacyBefore));
    const cols = (await dbAll(db, 'PRAGMA table_info(payments)')).map(c => c.name);
    for (const c of ['amountPaise', 'paymentMethod', 'referenceNo', 'receiptNo', 'recordedBy']) check(`payments.${c} exists`, cols.includes(c));
    const idx = (await dbAll(db, `SELECT name FROM sqlite_master WHERE type = 'index'`)).map(r => r.name);
    for (const i of ['idx_one_active_schedule_per_student', 'idx_payments_receipt_no', 'idx_payments_idempotency', 'idx_payments_razorpay_id']) check(`index ${i} exists`, idx.includes(i));
  });

  // ------------------------------------------------------------------
  const protectedCalls = () => [
    ['POST', '/api/accountant/collect-offline-fee', pay({ studentId: U.stuA })],
    ['GET', `/api/accountant/student-installment-status?studentId=${U.stuA}`],
    ['GET', `/api/accountant/student-payments-history?studentId=${U.stuA}`],
    ['GET', '/api/accountant/students'],
    ['GET', '/api/accountant/fees-stats'],
    ['GET', '/api/accountant/dashboard'],
    ['GET', '/api/transactions'],
    ['GET', '/api/transactions/stats'],
    ['GET', `/api/transactions/student/${U.stuA}`],
    ['POST', '/api/transactions', { studentId: U.stuA, amount: 500, status: 'success', type: 'full' }],
    ['POST', '/api/payments/create-order', { amount: 500 }],
    ['POST', '/api/payments/verify-payment', { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' }],
    ['GET', `/api/payments/transactions/${U.stuA}`],
    ['GET', '/api/payments/all-transactions']
  ];

  await test('1. Missing, invalid, expired and tampered authentication is rejected (401) on every payment route', async (check) => {
    const good = token({ userId: U.accountant, role: 'accountant' });
    const [h, p, s] = good.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ userId: U.accountant, role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const ghost = await newStudent('ghost');
    await dbRun(db, 'DELETE FROM users WHERE id = ?', [ghost]);
    const credentials = {
      'no token': undefined,
      'garbage token': 'not-a-jwt',
      'signed with wrong secret': token({ userId: U.accountant, role: 'accountant' }, { expiresIn: '1h' }, 'some-other-secret'),
      'signed with the code default secret': token({ userId: U.accountant, role: 'accountant' }, { expiresIn: '1h' }, 'default_jwt_secret_key'),
      'expired token': token({ userId: U.accountant, role: 'accountant' }, { expiresIn: -60 }),
      'tampered payload, original signature': `${h}.${forgedPayload}.${s}`,
      'alg=none token': `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`,
      'unsigned superadmin-<base64> token': 'superadmin-' + Buffer.from(JSON.stringify({ email: 'x@y.z', name: 'x' })).toString('base64'),
      'valid token for a deleted account': token({ userId: ghost, role: 'accountant' })
    };
    const before = await countRows('payments');
    for (const [label, auth] of Object.entries(credentials)) {
      for (const [method, url, body] of protectedCalls()) {
        const r = await call(method, url, { auth, body });
        check(`${label}: ${method} ${url.split('?')[0]} returns 401`, r.status === 401, `got ${r.status}`);
      }
    }
    check('no payment row was written by rejected requests', (await countRows('payments')) === before);
    check('no schedule was created by rejected requests', (await countRows('student_fee_schedules')) === 0);
  });

  await test('2. Student A cannot access Student B\'s schedule, history or payments', async (check) => {
    const a = tokenFor('stuA');
    for (const url of [`/api/accountant/student-installment-status?studentId=${U.stuB}`, `/api/accountant/student-payments-history?studentId=${U.stuB}`, `/api/transactions/student/${U.stuB}`, `/api/payments/transactions/${U.stuB}`, '/api/payments/transactions/demo']) {
      const r = await call('GET', url, { auth: a });
      check(`GET ${url} returns 403`, r.status === 403, `got ${r.status}`);
    }
    const claim = await call('POST', '/api/transactions', { auth: a, body: { studentId: U.stuB, amount: 100, type: 'full' } });
    check('POST /api/transactions for another student returns 403', claim.status === 403, `got ${claim.status}`);

    const own = await call('GET', '/api/accountant/student-installment-status', { auth: a });
    check('own status without studentId returns 200 for self', own.status === 200 && own.json.data.student.id === U.stuA, own);
    const ownHist = await call('GET', '/api/accountant/student-payments-history', { auth: a });
    check('own history returns 200', ownHist.status === 200 && Array.isArray(ownHist.json.payments), ownHist.status);
    for (const url of ['/api/accountant/students', '/api/accountant/fees-stats', '/api/accountant/dashboard', '/api/transactions', '/api/transactions/stats', '/api/payments/all-transactions']) {
      const r = await call('GET', url, { auth: a });
      check(`student GET ${url} returns 403`, r.status === 403, `got ${r.status}`);
    }
  });

  await test('3. Only accountant/admin can record an offline collection', async (check) => {
    const sid = await newStudent('t3');
    const before = await countRows('payments');
    for (const who of ['stuA', 'mentor']) {
      const r = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor(who), body: pay({ studentId: sid }) });
      check(`${who} returns 403`, r.status === 403, `got ${r.status}`);
    }
    // Token says "accountant" but the account's real role is student
    const lying = await call('POST', '/api/accountant/collect-offline-fee', { auth: token({ userId: U.stuA, role: 'accountant' }), body: pay({ studentId: sid }) });
    check('role claim not backed by the users table returns 403', lying.status === 403, `got ${lying.status}`);
    check('nothing recorded by forbidden callers', (await countRows('payments')) === before && (await countRows('student_fee_schedules WHERE studentId = ?', [sid])) === 0);

    const okAcc = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: pay({ studentId: sid, amount: 100 }) });
    check('accountant returns 201', okAcc.status === 201 && okAcc.json.payment.recordedBy === U.accountant, okAcc);
    const okAdmin = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('admin'), body: pay({ studentId: sid, amount: 100 }) });
    check('admin returns 201', okAdmin.status === 201, okAdmin.status);
    const viaBody = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: Object.assign(pay({ studentId: sid, amount: 100 }), { status: 'failed', allocationStatus: 'x', scheduleId: 999 }) });
    check('client cannot influence status/allocation fields', viaBody.status === 201 && viaBody.json.payment.status === 'success' && viaBody.json.payment.scheduleId !== 999, viaBody.json);
  });

  await test('4. Different students paying concurrently all succeed (shared app connection)', async (check) => {
    const students = [];
    for (let i = 0; i < 12; i++) students.push(await newStudent(`t4-${i}`));
    const out = await Promise.all(students.map(s => attempt(pay({ studentId: s, amount: 1000 }))));
    check('all 12 concurrent payments succeeded', out.every(r => r.ok), out.filter(r => !r.ok));
    for (const s of students) {
      const st = await stagePaise(s, 1);
      check(`student ${s} has exactly one ₹1000 payment`, st.n === 1 && st.t === 100000, st);
    }
    check('one schedule per student', (await countRows(`student_fee_schedules WHERE studentId IN (${students.join(',')})`)) === 12);

    // Payments racing ordinary app traffic on the shared connection (reads that hold a lock until
    // their callback runs, plus writes) must neither fail nor stall the event loop.
    const more = [];
    for (let i = 0; i < 20; i++) more.push(await newStudent(`t4-mixed-${i}`));
    const started = Date.now();
    let maxLag = 0, lastTick = Date.now();
    const lagTimer = setInterval(() => { maxLag = Math.max(maxLag, Date.now() - lastTick - 10); lastTick = Date.now(); }, 10);
    const traffic = [];
    for (const s of more) {
      for (let j = 0; j < 5; j++) traffic.push(dbGet(db, 'SELECT id, role FROM users WHERE id = ?', [s]).then(() => 'read'));
      traffic.push(attempt(pay({ studentId: s, amount: 250.25 })));
      traffic.push(dbRun(db, `INSERT INTO payments (studentId, amount, type, status) VALUES (?, 1, 'traffic', 'pending')`, [s]).then(() => 'write'));
    }
    const mixed = await Promise.all(traffic.map(p => p.catch(e => ({ ok: false, message: e.message }))));
    clearInterval(lagTimer);
    const payments = mixed.filter(r => r && typeof r === 'object');
    check('20 payments mixed with 100 reads + 20 writes on the shared connection all succeeded', payments.length === 20 && payments.every(r => r.ok) && mixed.filter(r => r === 'read').length === 100 && mixed.filter(r => r === 'write').length === 20, mixed.filter(r => r && r.ok === false));
    check('no multi-second stall (finished well inside the 5s lock timeout)', Date.now() - started < 4000, `${Date.now() - started}ms`);
    check('event loop was never blocked for long', maxLag < 1500, `${maxLag}ms`);
  });

  await test('5. Separate OS processes paying the same stage concurrently cannot over-collect', async (check) => {
    const sid = await newStudent('t5');
    const out = await Promise.all([1, 2, 3, 4, 5, 6].map(i => attemptInNewProcess(pay({ studentId: sid, amount: 1500, idempotencyKey: key('xp') }))));
    const ok = out.filter(r => r.ok);
    const st = await stagePaise(sid, 1);
    check('exactly 2 of 6 × ₹1500 accepted against a ₹4025 stage', ok.length === 2, out);
    check('stage total is ₹3000', st.t === 300000 && st.n === 2, st);
    check('every rejection is a clean OVERPAYMENT 400 (no raw DB error, no crash)', out.filter(r => !r.ok).every(r => r.status === 400 && r.code === 'OVERPAYMENT'), out.filter(r => !r.ok));
    check('exactly one schedule created across processes', (await countRows('student_fee_schedules WHERE studentId = ?', [sid])) === 1);
  });

  await test('6. A rolled-back payment cannot undo an unrelated request\'s successful write', async (check) => {
    const sid = await newStudent('t6');
    const bystander = await newStudent('t6-bystander');
    const pending = [];
    for (let i = 0; i < 15; i++) {
      pending.push(attempt(pay({ studentId: sid, amount: 999999 }))); // rejected -> ROLLBACK
      pending.push(dbRun(db, `INSERT INTO payments (studentId, amount, type, status, transactionId) VALUES (?, 1, 'bystander', 'pending', ?)`, [bystander, `BYSTANDER-${i}`]).then(() => 'written'));
    }
    const out = await Promise.all(pending);
    check('all 15 installment requests were rejected', out.filter(r => r && r.ok === false && r.code === 'OVERPAYMENT').length === 15, out.filter(r => r !== 'written'));
    check('all 15 unrelated writes reported success', out.filter(r => r === 'written').length === 15);
    check('all 15 unrelated rows are still in the database', (await countRows('payments WHERE studentId = ?', [bystander])) === 15);
    check('rejected requests left no schedule behind', (await countRows('student_fee_schedules WHERE studentId = ?', [sid])) === 0);
  });

  await test('7. At most one active schedule per student, including under concurrency', async (check) => {
    const sid = await newStudent('t7');
    const first = await attempt(pay({ studentId: sid, amount: 100 }));
    check('first payment creates the schedule', first.ok, first);
    const other = await attempt(pay({ studentId: sid, feeStructureId: FS2, amount: 100 }));
    check('second fee structure is rejected with 409', other.status === 409 && other.code === 'PLAN_LOCKED', other);
    check('still exactly one active schedule', (await countRows(`student_fee_schedules WHERE studentId = ? AND status = 'active'`, [sid])) === 1);
    const direct = await dbRun(db, `INSERT INTO student_fee_schedules (studentId, feeStructureId, planId, planName, totalFee, scheduleSnapshot, status) VALUES (?, ?, 'p3', 'x', 1, '[]', 'active')`, [sid, FS2]).then(() => 'inserted').catch(e => e.message);
    check('database itself refuses a second active schedule', /UNIQUE constraint failed/.test(direct), direct);

    const racer = await newStudent('t7-race');
    const race = await Promise.all(['p2', 'p3', 'p6', 'full'].map(planId => attempt(pay({ studentId: racer, planId, amount: 100 }))));
    check('in-process race: exactly one plan wins, the rest get 409 PLAN_LOCKED', race.filter(r => r.ok).length === 1 && race.filter(r => !r.ok).every(r => r.status === 409 && r.code === 'PLAN_LOCKED'), race);
    const racer2 = await newStudent('t7-race2');
    const race2 = await Promise.all(['p2', 'p3', 'p6', 'full'].map(planId => attemptInNewProcess(pay({ studentId: racer2, planId, amount: 100, idempotencyKey: key('xr') }))));
    check('cross-process race: exactly one plan wins, the rest get 409 PLAN_LOCKED', race2.filter(r => r.ok).length === 1 && race2.filter(r => !r.ok).every(r => r.status === 409 && r.code === 'PLAN_LOCKED'), race2);
    check('each racing student ended with one schedule', (await countRows('student_fee_schedules WHERE studentId IN (?, ?)', [racer, racer2])) === 2);
  });

  await test('8. Plan mismatch, invalid students and invalid plans/stages are rejected; viewing never creates a schedule', async (check) => {
    const sid = await newStudent('t8');
    const viewed = await call('GET', `/api/accountant/student-installment-status?studentId=${sid}`, { auth: tokenFor('accountant') });
    check('status view works with no schedule', viewed.status === 200 && viewed.json.data.activeSchedule === null && viewed.json.data.stages.length === 0, viewed.json);
    await call('GET', '/api/accountant/student-installment-status', { auth: tokenFor('stuA') });
    check('viewing the fee status created no schedule', (await countRows('student_fee_schedules WHERE studentId IN (?, ?)', [sid, U.stuA])) === 0);

    const expectFail = async (label, payload, status, code) => {
      const r = await attempt(payload);
      check(`${label} -> ${status} ${code}`, r.status === status && r.code === code, r);
    };
    await expectFail('unknown stage on first payment', pay({ studentId: sid, installmentStage: 9 }), 400, 'STAGE_NOT_FOUND');
    await expectFail('inactive plan', pay({ studentId: sid, planId: 'poff' }), 400, 'PLAN_NOT_AVAILABLE');
    await expectFail('unknown plan', pay({ studentId: sid, planId: 'nope' }), 400, 'PLAN_NOT_AVAILABLE');
    await expectFail('plan whose percentages total 120%', pay({ studentId: sid, planId: 'pbad' }), 409, 'PLAN_MISCONFIGURED');
    await expectFail('missing plan on first payment', pay({ studentId: sid, planId: undefined }), 400, 'INVALID_REQUEST');
    await expectFail('unknown fee structure', pay({ studentId: sid, feeStructureId: 99999999 }), 404, 'FEE_STRUCTURE_NOT_FOUND');
    check('failed attempts left no schedule behind', (await countRows('student_fee_schedules WHERE studentId = ?', [sid])) === 0);

    check('first valid payment locks plan p2', (await attempt(pay({ studentId: sid, amount: 100 }))).ok);
    await expectFail('different plan after lock', pay({ studentId: sid, planId: 'p3' }), 409, 'PLAN_LOCKED');
    await expectFail('"full" plan after lock', pay({ studentId: sid, planId: 'full' }), 409, 'PLAN_LOCKED');
    const viaHttp = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: pay({ studentId: sid, planId: 'p6' }) });
    check('plan mismatch is HTTP 409 at the endpoint', viaHttp.status === 409 && viaHttp.json.code === 'PLAN_LOCKED', viaHttp);

    await expectFail('nonexistent student', pay({ studentId: 99999999 }), 404, 'STUDENT_NOT_FOUND');
    await expectFail('admin user as student', pay({ studentId: U.admin }), 422, 'NOT_A_STUDENT');
    await expectFail('accountant user as student', pay({ studentId: U.accountant }), 422, 'NOT_A_STUDENT');
    for (const bad of [undefined, null, '', 'abc', '12abc', -5, 0, 1.5, '1 OR 1=1']) {
      await expectFail(`studentId ${JSON.stringify(bad)}`, pay({ studentId: bad }), 400, 'INVALID_REQUEST');
    }
    const status404 = await call('GET', '/api/accountant/student-installment-status?studentId=99999999', { auth: tokenFor('accountant') });
    check('status for nonexistent student is 404', status404.status === 404, status404.status);
    check('no payment or schedule exists for non-students', (await countRows('payments WHERE studentId IN (?, ?, 99999999)', [U.admin, U.accountant])) === 0 && (await countRows('student_fee_schedules WHERE studentId IN (?, ?, 99999999)', [U.admin, U.accountant])) === 0);
  });

  await test('9. Integer-paise precision: exact installment totals, decimals and boundary amounts', async (check) => {
    const sum = a => a.reduce((x, y) => x + y, 0);
    const three = money.splitTotalAcrossStages(805000, [undefined, undefined, undefined]);
    check('₹8,050 over 3 equal stages = 2683.33 + 2683.33 + 2683.34', JSON.stringify(three) === '[268333,268333,268334]' && sum(three) === 805000, three);
    const six = money.splitTotalAcrossStages(805000, [20, 20, 15, 15, 15, 15]);
    check('₹8,050 over 20/20/15/15/15/15 sums exactly', JSON.stringify(six) === '[161000,161000,120750,120750,120750,120750]' && sum(six) === 805000, six);
    const thirds = money.splitTotalAcrossStages(1210000, [33.33, 33.33, 33.34]);
    check('₹12,100 over 33.33/33.33/33.34 sums exactly', sum(thirds) === 1210000 && thirds.every(Number.isInteger), thirds);
    for (const total of [1, 99, 100, 101, 805001, 99999999]) {
      for (const n of [1, 2, 3, 6, 7]) {
        if (total < n) continue;
        const parts = money.splitTotalAcrossStages(total, new Array(n).fill(undefined));
        check(`split ${total}/${n} is exact`, sum(parts) === total && parts.every(v => Number.isInteger(v) && v > 0), parts);
      }
    }
    for (const [input, paise] of [['1500', 150000], ['1500.5', 150050], [1500.75, 150075], [0.1, 10], ['0.01', 1], [' 42 ', 4200], [2683.34, 268334]]) {
      check(`parse ${JSON.stringify(input)} = ${paise} paise`, money.parseRupeesToPaise(input) === paise, money.parseRupeesToPaise(input));
    }
    const sid = await newStudent('t9');
    const p3 = (o) => pay(Object.assign({ studentId: sid, planId: 'p3' }, o));
    for (const bad of [0, '0', '0.00', -5, '-5', '1e2', 0.001, '12abc', '', null, undefined, NaN, Infinity, '1,000', '₹100', 1e21, 0.1 + 0.2, [100], { a: 1 }, true]) {
      const r = await attempt(p3({ amount: bad }));
      check(`amount ${typeof bad === 'number' ? String(bad) : JSON.stringify(bad)} rejected with 400`, r.status === 400 && r.code === 'INVALID_REQUEST', r);
    }
    check('amount above the per-payment ceiling rejected', (await attempt(p3({ amount: 10000000.01 }))).status === 400);
    check('rejected amounts created nothing', (await countRows('payments WHERE studentId = ?', [sid])) === 0 && (await countRows('student_fee_schedules WHERE studentId = ?', [sid])) === 0);

    check('pay ₹0.10', (await attempt(p3({ amount: 0.1 }))).ok);
    check('pay ₹0.20', (await attempt(p3({ amount: '0.20' }))).ok);
    let s = await svc.calculateStudentInstallmentSummary(db, sid);
    check('0.10 + 0.20 = exactly 30 paise paid, 268303 remaining', s.stages[0].paidAmountPaise === 30 && s.stages[0].paidAmount === 0.3 && s.stages[0].remainingAmountPaise === 268303, s.stages[0]);
    check('schedule stages sum to total fee exactly', sum(s.stages.map(x => x.expectedAmountPaise)) === 805000 && s.activeSchedule.totalFeePaise === 805000, s.stages.map(x => x.expectedAmountPaise));
    const over = await attempt(p3({ amount: 2683.04 }));
    check('1 paisa over the remaining balance is rejected', over.status === 400 && over.code === 'OVERPAYMENT', over);
    check('exact remaining ₹2683.03 accepted', (await attempt(p3({ amount: 2683.03 }))).ok);
    const again = await attempt(p3({ amount: 0.01 }));
    check('fully paid stage rejects 1 more paisa with 409', again.status === 409 && again.code === 'STAGE_ALREADY_PAID', again);
    check('stage 2 full ₹2683.33', (await attempt(p3({ installmentStage: 2, amount: 2683.33 }))).ok);
    check('stage 3 rejects ₹2683.35', (await attempt(p3({ installmentStage: 3, amount: 2683.35 }))).code === 'OVERPAYMENT');
    check('stage 3 full ₹2683.34 (carries the remainder paisa)', (await attempt(p3({ installmentStage: 3, amount: 2683.34 }))).ok);
    s = await svc.calculateStudentInstallmentSummary(db, sid);
    check('all stages Paid and lifetime paid is exactly ₹8,050.00', s.stages.every(x => x.status === 'Paid' && x.remainingAmountPaise === 0) && s.lifetimePaidPaise === 805000 && s.lifetimePaid === 8050, { paid: s.lifetimePaidPaise });
    const stored = await dbGet(db, `SELECT SUM(amountPaise) p, COUNT(*) n, SUM(CASE WHEN typeof(amountPaise) = 'integer' THEN 1 ELSE 0 END) ints FROM payments WHERE studentId = ?`, [sid]);
    check('stored as integer paise summing to 805000', stored.p === 805000 && stored.n === stored.ints, stored);
  });

  await test('10. Identical idempotency retries return the original receipt (sequential, whitespace, concurrent, cross-process)', async (check) => {
    const sid = await newStudent('t10');
    const k = key('same');
    const first = await attempt(pay({ studentId: sid, idempotencyKey: k }));
    const retry = await attempt(pay({ studentId: sid, idempotencyKey: k }));
    check('retry returns the same payment as a duplicate', first.ok && retry.ok && retry.dup === true && retry.id === first.id, { first, retry });
    check('retry returns the same receipt number', retry.payment.receiptNo === first.payment.receiptNo && !!first.payment.receiptNo);
    for (const variant of [` ${k}`, `${k} `, `\t${k}\n`, `   ${k}   `]) {
      const r = await attempt(pay({ studentId: sid, idempotencyKey: variant }));
      check(`whitespace variant ${JSON.stringify(variant)} is the same key`, r.ok && r.dup === true && r.id === first.id, r);
    }
    const padded = await attempt(pay({ studentId: sid, idempotencyKey: '  T-padded-first  ', amount: 10 }));
    const stored = await dbGet(db, 'SELECT idempotencyKey k FROM payments WHERE id = ?', [padded.id]);
    check('key is stored trimmed', stored.k === 'T-padded-first', stored);
    const paddedRetry = await attempt(pay({ studentId: sid, idempotencyKey: 'T-padded-first', amount: 10 }));
    check('trimmed retry of a padded key is a duplicate', paddedRetry.dup === true && paddedRetry.id === padded.id, paddedRetry);

    const viaHttp1 = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: pay({ studentId: sid, idempotencyKey: k }) });
    check('HTTP retry returns 200 isDuplicate', viaHttp1.status === 200 && viaHttp1.json.isDuplicate === true && viaHttp1.json.payment.id === first.id, viaHttp1);

    const k2 = key('burst');
    const burst = await Promise.all([1, 2, 3, 4, 5, 6].map(() => attempt(pay({ studentId: sid, installmentStage: 2, amount: 700, idempotencyKey: k2 }))));
    check('6 concurrent identical requests: all succeed, one new + five duplicates, one id', burst.every(r => r.ok) && burst.filter(r => !r.dup).length === 1 && new Set(burst.map(r => r.id)).size === 1, burst);
    check('exactly one row for that key', (await countRows('payments WHERE idempotencyKey = ?', [k2])) === 1);

    const k3 = key('xproc');
    const xp = await Promise.all([1, 2, 3, 4].map(() => attemptInNewProcess(pay({ studentId: sid, installmentStage: 2, amount: 300, idempotencyKey: k3 }))));
    check('4 identical requests from separate processes: all succeed with one id, no raw DB error', xp.every(r => r.ok) && xp.filter(r => !r.dup).length === 1 && new Set(xp.map(r => r.id)).size === 1, xp);
    check('exactly one row for the cross-process key', (await countRows('payments WHERE idempotencyKey = ?', [k3])) === 1);
    const st = await stagePaise(sid, 1);
    check('stage 1 was charged once (₹1000 + ₹10)', st.t === 101000 && st.n === 2, st);
  });

  await test('11. Reusing an idempotency key with any different material field returns 409', async (check) => {
    const sid = await newStudent('t11');
    const other = await newStudent('t11-other');
    const k = key('conflict');
    const original = { studentId: sid, idempotencyKey: k };
    check('original recorded', (await attempt(pay(original))).ok);
    const variants = {
      'different student': { studentId: other },
      'different amount': { amount: 999 },
      'different amount by 1 paisa': { amount: 1000.01 },
      'different stage': { installmentStage: 2 },
      'different payment method': { paymentMethod: 'UPI' },
      'different fee structure': { feeStructureId: FS2 },
      'different plan': { planId: 'p3' }
    };
    for (const [label, change] of Object.entries(variants)) {
      const r = await attempt(pay(Object.assign({}, original, change)));
      check(`${label} -> 409 IDEMPOTENCY_KEY_CONFLICT`, r.status === 409 && r.code === 'IDEMPOTENCY_KEY_CONFLICT', r);
    }
    const http409 = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: pay(Object.assign({}, original, { paymentMethod: 'Cheque' })) });
    check('conflict is HTTP 409 at the endpoint', http409.status === 409 && http409.json.code === 'IDEMPOTENCY_KEY_CONFLICT', http409);
    check('conflicts recorded nothing', (await countRows('payments WHERE studentId IN (?, ?)', [sid, other])) === 1);
    for (const bad of [undefined, null, '', '   ', 'has space', 'x'.repeat(129), 12345, 'bad;key']) {
      const r = await attempt(pay({ studentId: sid, idempotencyKey: bad }));
      check(`key ${JSON.stringify(typeof bad === 'string' && bad.length > 20 ? bad.slice(0, 5) + '…(129)' : bad)} rejected with 400`, r.status === 400, r);
    }
    for (const bad of ['Card', 'cash', '', undefined, 'Offline (Cash)']) {
      const r = await attempt(pay({ studentId: sid, paymentMethod: bad }));
      check(`payment method ${JSON.stringify(bad)} rejected with 400`, r.status === 400, r);
    }
  });

  await test('12. Legacy payments: rows preserved, kept unallocated, and further collection blocked', async (check) => {
    const sid = await newStudent('t12');
    // A historical row exactly as the pre-installment code wrote it (allocationStatus falls to the column default)
    const legacyId = (await dbRun(db, `INSERT INTO payments (studentId, amount, type, status, transactionId, description) VALUES (?, 8050, 'full', 'success', 'pay_LEGACYFIXTURE', 'old online payment')`, [sid])).lastID;
    const legacyRowBefore = JSON.stringify(await dbGet(db, 'SELECT * FROM payments WHERE id = ?', [legacyId]));

    const blocked = await attempt(pay({ studentId: sid, planId: 'full', amount: 8050 }));
    check('collection for a student with an unallocated successful payment -> 409', blocked.status === 409 && blocked.code === 'LEGACY_RECONCILIATION_REQUIRED', blocked);
    const blockedHttp = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: pay({ studentId: sid, amount: 1 }) });
    check('blocked at the endpoint with HTTP 409', blockedHttp.status === 409 && blockedHttp.json.code === 'LEGACY_RECONCILIATION_REQUIRED', blockedHttp);
    check('no schedule and no new payment created for that student', (await countRows('student_fee_schedules WHERE studentId = ?', [sid])) === 0 && (await countRows('payments WHERE studentId = ?', [sid])) === 1);

    const s = await svc.calculateStudentInstallmentSummary(db, sid);
    check('summary reports it as unallocated, not as stage credit', s.unallocatedPayments.length === 1 && s.unallocatedPaidPaise === 805000 && s.stages.length === 0 && s.collectionBlocked === true && s.collectionBlockedReason === 'LEGACY_RECONCILIATION_REQUIRED', { u: s.unallocatedPayments.length, blocked: s.collectionBlocked });
    check('legacy row was not rewritten', JSON.stringify(await dbGet(db, 'SELECT * FROM payments WHERE id = ?', [legacyId])) === legacyRowBefore);

    // The project's real historical rows
    const legacyIds = legacyBefore.map(r => r.id);
    const owners = [...new Set(legacyBefore.filter(r => r.status === 'success' || r.status === 'paid').map(r => r.studentId))];
    for (const owner of owners) {
      const r = await attempt(pay({ studentId: owner, planId: 'full', amount: 1 }));
      // 403: the fixture staff (university 999) may not collect for a project student of another university
      check(`project legacy payer (studentId ${owner}) is blocked, invalid or out of tenant, never charged`, !r.ok && [409, 404, 422, 403].includes(r.status), r);
    }
    const nowRows = legacyIds.length ? await dbAll(db, `SELECT * FROM payments WHERE id IN (${legacyIds.join(',')}) ORDER BY id`) : [];
    check(`all ${legacyBefore.length} project payment rows still present and unchanged in their original columns after the whole suite`, JSON.stringify(projectOnly(nowRows)) === JSON.stringify(legacyBefore));
    check('no project legacy row was given a stage, schedule or paise value', nowRows.every(r => r.amountPaise === null && r.receiptNo === null && (legacyBefore.find(b => b.id === r.id).installmentStage ?? null) === r.installmentStage));

    // Client-reported payments can no longer count as paid
    const stu = tokenFor('stuA');
    const revenueBefore = (await dbGet(db, `SELECT COALESCE(SUM(amount), 0) t FROM payments WHERE status IN ('success', 'paid')`)).t;
    const claim = await call('POST', '/api/transactions', { auth: stu, body: { studentId: U.stuA, amount: 8050, status: 'success', type: 'full', transactionId: 'pay_CLIENTCLAIM', razorpay_payment_id: 'pay_CLIENTCLAIM', razorpay_signature: 'forged', allocationStatus: 'allocated', installmentStage: 1 } });
    const claimRow = await dbGet(db, 'SELECT * FROM payments WHERE id = ?', [claim.json?.transactionId]);
    check('client claim accepted only as pending', claim.status === 201 && claimRow && claimRow.status === 'pending', { status: claim.status, row: claimRow });
    check('claim is unallocated with no gateway id, stage or schedule', claimRow && claimRow.allocationStatus === 'unallocated' && claimRow.razorpay_payment_id === null && claimRow.razorpay_signature === null && claimRow.installmentStage === null && claimRow.scheduleId === null, claimRow);
    check('claim is attributed to the authenticated student', claimRow && claimRow.studentId === U.stuA && claimRow.recordedBy === U.stuA);
    check('successful revenue total unchanged by the claim', (await dbGet(db, `SELECT COALESCE(SUM(amount), 0) t FROM payments WHERE status IN ('success', 'paid')`)).t === revenueBefore);
    const sA = await svc.calculateStudentInstallmentSummary(db, U.stuA);
    check('pending claim does not count as paid and does not block collection', sA.lifetimePaidPaise === 0 && sA.collectionBlocked === false, { paid: sA.lifetimePaidPaise, blocked: sA.collectionBlocked });
    for (const bad of [0, -1, 'abc', '1e9', 0.001]) {
      const r = await call('POST', '/api/transactions', { auth: stu, body: { amount: bad, type: 'full' } });
      check(`claim with amount ${JSON.stringify(bad)} rejected with 400`, r.status === 400, r.status);
    }
    const gw = await call('POST', '/api/payments/create-order', { auth: stu, body: { amount: 100 } });
    check('create-order makes no gateway call without configured credentials (503)', gw.status === 503, gw.status);
    const vp = await call('POST', '/api/payments/verify-payment', { auth: stu, body: { razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' } });
    check('verify-payment refuses without configured credentials (503)', vp.status === 503, vp.status);
  });

  await test('13. Offline collection payload from the form is accepted; receipt numbers are unique and DB-enforced', async (check) => {
    const modal = fs.readFileSync(path.join(__dirname, '../../client/src/components/OfflineFeeModal.jsx'), 'utf8');
    const payloadBlock = (modal.match(/const payload = \{[\s\S]*?\};/) || [''])[0];
    for (const field of ['studentId', 'feeStructureId', 'planId', 'installmentStage', 'amount', 'paymentMethod', 'idempotencyKey']) {
      check(`[static] form payload includes ${field}`, new RegExp(`\\b${field}\\b`).test(payloadBlock));
    }
    const methods = [...modal.matchAll(/<option value="([^"]+)">/g)].map(m => m[1]);
    check('[static] every payment method offered by the form is accepted by the server', methods.length > 0 && methods.every(m => svc.PAYMENT_METHODS.includes(m)), methods);

    // Same shape and value types the form sends (string studentId, numeric amount, date-only paymentDate)
    const sid = await newStudent('t13');
    const formPayload = { studentId: String(sid), feeStructureId: FS1, planId: 'p6', installmentStage: 3, amount: 1207.5, paymentMethod: 'Demand Draft', referenceNo: 'OFFLINE-123456', remarks: 'Offline Fee Collection: 6-Month Plan - Stage 3 (15%, Due: N/A)', paymentDate: new Date().toISOString().split('T')[0], idempotencyKey: 'offline-3f2b0c9e-7a51-4c1e-9d55-0d6f0a2b7c11' };
    const res = await call('POST', '/api/accountant/collect-offline-fee', { auth: tokenFor('accountant'), body: formPayload });
    check('form-shaped payload returns 201', res.status === 201, res);
    const p = res.json?.payment || {};
    check('recorded on the selected plan, stage and fee structure', p.planId === 'p6' && p.installmentStage === 3 && p.feeStructureId === FS1 && p.amountPaise === 120750 && p.paymentMethod === 'Demand Draft' && p.type === 'Offline (Demand Draft)', p);
    check('receipt number issued and used as transactionId; accountant reference kept separately', /^RCPT-\d{8}$/.test(p.receiptNo || '') && p.transactionId === p.receiptNo && p.referenceNo === 'OFFLINE-123456', p);
    check('stage 3 of 15% of ₹8,050 is fully paid by ₹1,207.50', res.json?.stageUpdated?.remainingBalancePaise === 0, res.json?.stageUpdated);

    // Many receipts, all with the SAME accountant reference number, issued concurrently
    const students = [];
    for (let i = 0; i < 20; i++) students.push(await newStudent(`t13-${i}`));
    const burst = await Promise.all(students.flatMap(s => [1, 2].map(() => attempt(pay({ studentId: s, amount: 10, referenceNo: 'CHQ-000111' })))));
    check('40 concurrent collections succeeded', burst.every(r => r.ok), burst.filter(r => !r.ok));
    const receipts = (await dbAll(db, `SELECT receiptNo, transactionId, id FROM payments WHERE receiptNo IS NOT NULL`));
    check('every receipt number is unique and well-formed', new Set(receipts.map(r => r.receiptNo)).size === receipts.length && receipts.every(r => /^RCPT-\d{8}$/.test(r.receiptNo) && r.transactionId === r.receiptNo && r.receiptNo === `RCPT-${String(r.id).padStart(8, '0')}`), receipts.length);
    check('every allocated payment has a receipt number', (await countRows(`payments WHERE scheduleId IS NOT NULL AND receiptNo IS NULL`)) === 0);
    const dupe = await dbRun(db, `UPDATE payments SET receiptNo = ? WHERE id = ?`, [receipts[0].receiptNo, receipts[1].id]).then(() => 'updated').catch(e => e.message);
    check('database refuses a duplicate receipt number', /UNIQUE constraint failed/.test(dupe), dupe);
  });

  await test('14. Student history, accountant dashboard and existing report queries stay compatible', async (check) => {
    const sid = await newStudent('t14');
    const paid = await attempt(pay({ studentId: sid, amount: 1500.5, paymentMethod: 'UPI' }));
    const stuToken = token({ userId: sid, role: 'student' });
    await call('POST', '/api/transactions', { auth: stuToken, body: { amount: 200, type: 'full', transactionId: 'pay_PENDINGCLAIM' } });

    const hist = await call('GET', `/api/accountant/student-payments-history?studentId=${sid}`, { auth: stuToken });
    check('history returns both the original "data" list and the "payments" list the student page reads', hist.status === 200 && Array.isArray(hist.json.data) && Array.isArray(hist.json.payments), hist.json);
    const row = hist.json.payments?.[0] || {};
    check('student page fields present (transaction_id, amount, payment_date, payment_mode, term_type, status)', hist.json.payments.length === 1 && row.transaction_id === paid.payment.receiptNo && row.amount === 1500.5 && !!row.payment_date && row.payment_mode === 'Offline (UPI)' && row.term_type === 'Installment Stage 1' && row.status === 'success', row);
    check('"data" keeps its original shape and includes the pending claim', hist.json.data.length === 2 && ['id', 'studentId', 'amount', 'type', 'status', 'transactionId', 'description', 'paymentDate', 'paymentTime'].every(k => k in hist.json.data[0]), hist.json.data[0]);
    const staffHist = await call('GET', `/api/accountant/student-payments-history?studentId=${sid}`, { auth: tokenFor('accountant') });
    check('accountant can read the same history', staffHist.status === 200 && staffHist.json.payments.length === 1);
    const stuTx = await call('GET', `/api/transactions/student/${sid}`, { auth: stuToken });
    check('student transaction list still works for self', stuTx.status === 200 && stuTx.json.transactions.length === 2 && 'paymentDate' in stuTx.json.transactions[0], stuTx.status);

    const expectedRevenue = (await dbGet(db, `SELECT SUM(p.amount) t FROM payments p JOIN users u ON u.id = p.studentId WHERE p.status IN ('paid', 'success') AND u.university_id = 999`)).t;
    const expectedCount = (await dbGet(db, `SELECT COUNT(*) n FROM payments p JOIN users u ON u.id = p.studentId WHERE u.university_id = 999`)).n;
    const dash = await call('GET', '/api/accountant/dashboard', { auth: tokenFor('accountant') });
    check('dashboard returns 200', dash.status === 200 && dash.json.success === true, dash);
    check('dashboard revenue is the real total for the accountant\'s university (was always 0: payments has no university_id column)', expectedRevenue > 0 && dash.json.data?.totalRevenue === expectedRevenue, { got: dash.json.data?.totalRevenue, expectedRevenue });
    check('dashboard payment counts are populated', dash.json.data?.totalPayments === expectedCount && dash.json.data?.pendingPayments >= 1, dash.json.data);

    const ownSuccess = (await dbGet(db, `SELECT SUM(p.amount) t FROM payments p JOIN users u ON u.id = p.studentId WHERE p.status = 'success' AND u.university_id = 999`)).t;
    const allSuccess = (await dbGet(db, `SELECT SUM(amount) t FROM payments WHERE status = 'success'`)).t;
    const stats = await call('GET', '/api/accountant/fees-stats', { auth: tokenFor('accountant') });
    check('fees-stats total equals SUM(amount) of the accountant\'s own university\'s successful payments', stats.status === 200 && stats.json.data.totalFeesCollected === ownSuccess && stats.json.data.recentPayments.length > 0, { got: stats.json?.data?.totalFeesCollected, ownSuccess });
    check('fees-stats total excludes other universities\' payments carried over from the project DB', legacyBefore.length === 0 || ownSuccess < allSuccess, { ownSuccess, allSuccess });
    const list = await call('GET', '/api/transactions', { auth: tokenFor('accountant') });
    check('accountant transaction list returns every payment row', list.status === 200 && list.json.transactions.length === (await countRows('payments')), list.json?.transactions?.length);
    const txStats = await call('GET', '/api/transactions/stats', { auth: tokenFor('admin') });
    check('transaction stats revenue matches', txStats.status === 200 && txStats.json.stats.totalRevenue === allSuccess, txStats.json?.stats);
    const students = await call('GET', '/api/accountant/students', { auth: tokenFor('accountant') });
    check('accountant student list works', students.status === 200 && students.json.students.some(s => s.id === sid));
    const perStudent = await dbAll(db, `SELECT studentId, SUM(amount) as paidAmount FROM payments WHERE status = 'success' GROUP BY studentId`);
    check('per-student paid-amount report query (classroom fee report) still works on rupee amounts', perStudent.find(r => r.studentId === sid)?.paidAmount === 1500.5, perStudent.find(r => r.studentId === sid));
    check('rupee amount column always equals paise / 100 for new rows', (await countRows(`payments WHERE amountPaise IS NOT NULL AND ABS(amount * 100 - amountPaise) > 0.000001`)) === 0);
  });

  await test('15. Original Phase 2A behaviours still hold (partials, overpayment, cleared stage, summary)', async (check) => {
    const sid = await newStudent('t15');
    check('partial ₹1000', (await attempt(pay({ studentId: sid, amount: 1000 }))).ok);
    check('partial ₹1500', (await attempt(pay({ studentId: sid, amount: 1500, paymentMethod: 'UPI' }))).ok);
    let s = await svc.calculateStudentInstallmentSummary(db, sid);
    check('stage 1 partially paid: ₹2500 of ₹4025', s.stages[0].paidAmount === 2500 && s.stages[0].remainingAmount === 1525 && s.stages[0].status === 'Partially Paid', s.stages[0]);
    const over = await attempt(pay({ studentId: sid, amount: 2025 }));
    check('overpayment rejected with 400', over.status === 400 && over.code === 'OVERPAYMENT', over);
    check('clearing ₹1525', (await attempt(pay({ studentId: sid, amount: 1525, paymentMethod: 'Bank Transfer' }))).ok);
    const cleared = await attempt(pay({ studentId: sid, amount: 500 }));
    check('cleared stage rejected with 409', cleared.status === 409 && cleared.code === 'STAGE_ALREADY_PAID', cleared);
    for (const st of ['pending', 'failed', 'refunded']) await dbRun(db, `INSERT INTO payments (studentId, amount, amountPaise, type, status, scheduleId, installmentStage) VALUES (?, 500, 50000, 'x', ?, ?, 2)`, [sid, st, s.activeSchedule.id]);
    s = await svc.calculateStudentInstallmentSummary(db, sid);
    check('pending/failed/refunded rows do not count as paid', s.stages[1].paidAmountPaise === 0 && s.stages[0].status === 'Paid' && s.lifetimePaid === 4025, s.stages[1]);
  });

  // ------------------------------------------------------------------
  const failed = results.filter(r => r.failures.length > 0);
  say('\n================================================================');
  say(`📊 PHASE 2A REMEDIATION SUMMARY: ${results.length - failed.length} / ${results.length} TESTS PASSED`);
  say('================================================================');

  await new Promise(r => server.close(r));
  await new Promise(r => db.close(r));
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(err => {
  say('❌ Suite crashed:', err);
  process.exit(1);
});
