// Database export: an admin exports only their own school's rows, never credentials, never internal tables;
// the platform owner exports whole tables; other roles cannot export at all. Downloads are real .xlsx files.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const ExcelJS = require(path.join(__dirname, '..', '..', 'node_modules', 'exceljs'));

async function download(ctx, url, as) {
  const response = await fetch(ctx.base + url, { headers: { Authorization: `Bearer ${ctx.tokenFor(as)}` } });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, type: response.headers.get('content-type'), disposition: response.headers.get('content-disposition'), buffer };
}

async function sheetValues(buffer, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  assert.ok(sheet, `sheet ${sheetName} missing; sheets: ${workbook.worksheets.map((w) => w.name).join(', ')}`);
  const rows = [];
  sheet.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v === null || v === undefined ? '' : String(v)))));
  return { workbook, rows };
}

describe('database export', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp();
    // a credential table row and a reset code that must never be offered
    await ctx.db.run("INSERT INTO otp_reset (email, otp, expires_at) VALUES ('admina@test.invalid', 'x', '2099-01-01')");
  });
  after(async () => { await ctx.stop(); });

  it('lists only tables an admin may export, without internal or credential tables', async () => {
    const response = await ctx.api('GET', '/api/database-export/tables', { as: 'adminA' });
    assert.equal(response.status, 200);
    const tables = response.body.tables;
    for (const t of ['users', 'classrooms', 'courses', 'payments', 'attendance', 'universities']) assert.ok(tables.includes(t), `${t} missing`);
    for (const t of ['schema_migrations', 'otp_reset', 'soa_student_setup_tokens', 'subscriptions', 'demo_requests']) assert.ok(!tables.includes(t), `${t} offered`);
  });

  it('table data is limited to the admin\'s school and carries no password column', async () => {
    for (const [table, expectedIds, otherSchoolIds] of [
      ['users', [10, 11, 13], [20, 21, 23, 1]],
      ['classrooms', [100, 101], [200]],
      ['payments', [1900], [2900]],
      ['attendance', [1700], [2700]],
      ['universities', [1], [2]],
    ]) {
      const response = await ctx.api('GET', `/api/database-export/table/${table}/data`, { as: 'adminA' });
      assert.equal(response.status, 200, table);
      const ids = response.body.data.map((r) => Number(r.id));
      for (const id of expectedIds) assert.ok(ids.includes(id), `${table} lacks ${id}`);
      for (const id of otherSchoolIds) assert.ok(!ids.includes(id), `${table} leaks ${id}`);
      assert.equal(response.body.total, response.body.data.length, `${table} count`);
      for (const row of response.body.data) assert.ok(!('password' in row) && !('razorpay_signature' in row), `${table} exports a secret column`);
    }
  });

  it('a table outside the admin\'s scope cannot be read or downloaded, whatever its spelling', async () => {
    for (const url of ['/api/database-export/table/otp_reset/data', '/api/database-export/table/schema_migrations/excel',
      '/api/database-export/table/subscriptions/structure', '/api/database-export/table/SCHEMA_MIGRATIONS/data', '/api/database-export/table/users;DROP/data']) {
      const response = await ctx.api('GET', url, { as: 'adminA' });
      assert.ok([400, 404].includes(response.status), `${url} -> ${response.status}`);
    }
  });

  it('downloads one table as a real Excel file with only the admin\'s school', async () => {
    const file = await download(ctx, '/api/database-export/table/users/excel', 'adminA');
    assert.equal(file.status, 200);
    assert.equal(file.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(file.disposition, /^attachment; filename="users_export_\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const { rows } = await sheetValues(file.buffer);
    const header = rows[0];
    assert.ok(header.includes('email') && !header.includes('password'));
    const emails = rows.slice(1).map((r) => r[header.indexOf('email')]);
    assert.ok(emails.includes('admina@test.invalid'));
    assert.ok(!emails.some((e) => e.endsWith('b@test.invalid') || e === 'superadmin@test.invalid'), emails.join(','));
  });

  it('downloads a category workbook (table names matched whatever their case) limited to the admin\'s school', async () => {
    const file = await download(ctx, '/api/database-export/database/excel?categories=academics,finance', 'adminA');
    assert.equal(file.status, 200);
    const { workbook } = await sheetValues(file.buffer, 'Overview & Summary');
    const names = workbook.worksheets.map((w) => w.name.toLowerCase());
    for (const t of ['classrooms', 'attendance', 'payments', 'feestructures', 'student_classroom_assignment']) assert.ok(names.includes(t), `${t} sheet missing: ${names}`);
    assert.ok(!names.includes('users'), 'a category not asked for was exported');
    const { rows } = await sheetValues(file.buffer, 'payments');
    const ids = rows.slice(1).map((r) => r[rows[0].indexOf('id')]);
    assert.deepEqual(ids, ['1900']);
    assert.ok(!rows[0].includes('razorpay_signature'));
  });

  it('statistics count only the admin\'s school', async () => {
    const response = await ctx.api('GET', '/api/database-export/stats', { as: 'adminA' });
    assert.equal(response.status, 200);
    assert.equal(Number(response.body.tables.classrooms), 2);
    assert.equal(Number(response.body.tables.users), 8);
  });

  it('the platform owner exports whole tables', async () => {
    const response = await ctx.api('GET', '/api/database-export/table/classrooms/data', { as: 'superadmin' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.map((r) => Number(r.id)).sort(), [100, 101, 200]);
  });

  it('other roles cannot export', async () => {
    for (const as of ['accountantA', 'mentorA', 'studentA', 'storekeeperA']) {
      const response = await ctx.api('GET', '/api/database-export/table/users/excel', { as });
      assert.equal(response.status, 403, as);
    }
  });
});
