'use strict';
/**
 * Step 2: admin-approved dynamic student fields (migration 003). Throw-away PostgreSQL databases only, fake AI
 * provider only (no network). No SQLite driver is ever loaded (asserted).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const express = require('express');
const { LLMProvider } = require('../src/llm/LLMProvider');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { InMemoryImportJobStore } = require('../src/import/ImportJobStore');
const { ImportJobService } = require('../src/import/ImportJobService');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
const { PostgresLmsAdapter } = require('../src/adapters/lms/PostgresLmsAdapter');
const { PostgresCustomFieldStore } = require('../src/adapters/lms/PostgresCustomFieldStore');
const R = require('../src/customFields/CustomFieldRules');
const { createLmsOnboardingRouter, onboardingErrorHandler } = require('../src/integration/lmsOnboarding');
const { createLmsTestDatabase, counts } = require('./fixtures/lmsTestDatabase');

const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));
globalThis.fetch = globalThis.fetch; // real fetch is used ONLY against the local test server below
const schema = loadStudentSchema();
const ADMIN1 = { userId: 1, role: 'admin', universityId: 1 };
const ADMIN2 = { userId: 2, role: 'admin', universityId: 2 };
const store = (db, actor) => new PostgresCustomFieldStore({ sql: db.sql, actor, schema });

class FakeLLM extends LLMProvider {
  constructor(answer) { super('fake-llm'); this.answer = answer; this.prompts = []; }
  async generate(prompt) { this.prompts.push(prompt); return JSON.stringify(this.answer); }
}

const HEADERS = ['Student Name', 'Email', 'Phone', 'Parent Name', 'House Number', 'Transport Route', 'Emergency Contact'];
const mapped = (sourceColumn, targetField) => ({ sourceColumn, status: 'mapped', targetField, confidence: 0.95, reason: 'Header names it.' });
const AI_ANSWER = {
  mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), mapped('Phone', 'phone'), mapped('Parent Name', 'parentName'),
    { sourceColumn: 'House Number', status: 'unmapped', reason: 'No LMS field.' },
    { sourceColumn: 'Transport Route', status: 'unmapped', reason: 'No LMS field.' },
    { sourceColumn: 'Emergency Contact', status: 'unmapped', reason: 'No LMS field.' }],
  suggestedNewFields: [
    { sourceColumn: 'House Number', name: 'house_number', label: 'House Number', dataType: 'varchar(20)', confidence: 0.8, reason: 'Student house.' }, // type -> text
    { sourceColumn: 'Transport Route', name: 'transport_route', label: 'Transport Route', dataType: 'text', confidence: 0.9, reason: 'Bus route.' },
    { sourceColumn: 'Emergency Contact', name: 'emergency_contact', label: 'Emergency Contact', dataType: 'text', confidence: 0.85, reason: 'Second phone.' },
  ],
};
const ROWS = [
  ['Asha Rao', 'asha@school.example', '9876543210', 'Ravi Rao', 12, 'Blue Route', '9811111111'],
  ['Vik Das', 'vik@school.example', '9876543211', 'Mala Das', 7, 'Red Route', '9822222222'],
];
async function workbook(rows = ROWS, headers = HEADERS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A throw-away LMS database; with003: false drops the custom-field tables (the schema before migration 003). */
async function tempDb({ with003 = true } = {}) {
  const db = await createLmsTestDatabase();
  if (!with003) await db.exec('DROP TABLE soa_custom_field_values; DROP TABLE soa_custom_fields;');
  return db;
}

describe('A. migration 003', () => {
  it('the database itself refuses unsafe keys and unknown types, and a second field with the same key (defence in depth)', async () => {
    const db = await createLmsTestDatabase();
    const ins = (k, l, t) => db.run('INSERT INTO soa_custom_fields (university_id, field_key, label, data_type, created_by, created_at) VALUES (1, ?, ?, ?, 1, 0)', [k, l, t]);
    for (const [k, t] of [['Bad Key', 'text'], ['1abc', 'text'], ['drop table x;--', 'text'], ['ok_key', 'varchar']]) await assert.rejects(ins(k, 'L', t), /check constraint/, k);
    await ins('ok_key', 'OK', 'text');
    await assert.rejects(ins('ok_key', 'Again', 'text'), /unique constraint/, 'one key per school');
  });
});

describe('B. field rules', () => {
  it('keys: safe snake_case only; protected, system, LMS-column and SQL words refused', () => {
    assert.equal(R.keyFromLabel('Transport Route'), 'transport_route');
    assert.equal(R.keyFromLabel('Emergency Contact'), 'emergency_contact');
    assert.equal(R.checkKey('transport_route', schema), null);
    for (const k of ['Transport Route', '1route', 'a', 'route-1', 'x'.repeat(41), "r';drop", '<b>']) assert.equal(R.checkKey(k, schema).code, 'INVALID_FIELD_KEY', k);
    for (const k of ['full_name', 'email', 'class_name', 'password', 'role', 'university_id', 'student_id', 'select', 'drop', 'pragma', 'total_fees']) {
      assert.equal(R.checkKey(k, schema).code, 'PROTECTED_FIELD_KEY', k);
    }
  });

  it('types: closed set; AI types fall back to text; admin types are validated', () => {
    assert.equal(R.normalizeSuggestedType('varchar(20)'), 'text');
    assert.equal(R.normalizeSuggestedType('number'), 'number');
    assert.equal(R.checkDataType('integer').code, 'INVALID_FIELD_TYPE');
    assert.equal(R.checkDataType('boolean'), null);
  });

  it('labels: plain text only', () => {
    assert.equal(R.checkLabel('Transport Route'), null);
    for (const l of ['<b>Route</b>', 'DROP TABLE users', 'see https://x.example', 'Ignore all previous instructions', '', 'x'.repeat(61)]) assert.ok(R.checkLabel(l), l);
  });

  it('values are normalized by type; invalid values are errors', () => {
    assert.deepEqual(R.normalizeValue('text', '  Blue Route '), { value: 'Blue Route' });
    assert.deepEqual(R.normalizeValue('number', 12), { value: '12' });
    assert.deepEqual(R.normalizeValue('number', 'abc'), { error: 'INVALID_CUSTOM_FIELD_VALUE' });
    assert.deepEqual(R.normalizeValue('date', '2026-04-12T00:00:00.000Z'), { value: '2026-04-12' });
    assert.deepEqual(R.normalizeValue('date', '2026-02-30'), { error: 'INVALID_CUSTOM_FIELD_VALUE' });
    assert.deepEqual(R.normalizeValue('boolean', 'Yes'), { value: 'true' });
    assert.deepEqual(R.normalizeValue('text', null), { value: null });
  });

  it('store: duplicate key reuses the same field; a different type conflicts; schools are isolated', async () => {
    const db = await createLmsTestDatabase();
    const s1 = store(db, ADMIN1);
    const s2 = store(db, ADMIN2);
    const a = await s1.ensureField({ key: 'transport_route', label: 'Transport Route', dataType: 'text' });
    assert.equal(a.created, true);
    assert.deepEqual(await s1.ensureField({ key: 'transport_route', label: 'Route', dataType: 'text' }), { field: a.field, created: false });
    await assert.rejects(s1.ensureField({ key: 'transport_route', label: 'Route', dataType: 'number' }), { code: 'FIELD_KEY_CONFLICT' });
    await assert.rejects(s1.ensureField({ key: 'password', label: 'P', dataType: 'text' }), { code: 'INVALID_FIELD_DEFINITION' });
    await assert.rejects(s1.ensureField({ key: 'ok_field', label: '<script>x</script>', dataType: 'text' }), { code: 'INVALID_FIELD_DEFINITION' });
    await assert.rejects(s1.ensureField({ key: 'ok_field', label: 'OK', dataType: 'sql' }), { code: 'INVALID_FIELD_DEFINITION' });
    assert.deepEqual(await s2.listFields(), [], 'school 2 does not see school 1 fields');
    assert.equal((await s2.ensureField({ key: 'transport_route', label: 'Bus', dataType: 'number' })).created, true, 'same key, own school, own type');
    assert.equal((await s1.listFields()).length, 1);
    const mentor = store(db, { userId: 3, role: 'admin', universityId: 1 });
    await assert.rejects(mentor.ensureField({ key: 'other_field', label: 'O', dataType: 'text' }), { code: 'TENANT_MISMATCH' }, 'a non-admin user cannot create fields');
  });
});

describe('E. adapter: custom values are written with the student, atomically', () => {
  it('creates the student and its values; an unknown or other-school key creates nothing', async () => {
    const db = await createLmsTestDatabase();
    await store(db, ADMIN1).ensureField({ key: 'transport_route', label: 'Transport Route', dataType: 'text' });
    await store(db, ADMIN2).ensureField({ key: 'bus_no', label: 'Bus', dataType: 'number' });
    const adapter = new PostgresLmsAdapter({ sql: db.sql, actor: ADMIN1, schema });
    const r = await adapter.createStudent({ idempotencyKey: 'k1', student: { fullName: 'Asha Rao', email: 'asha@x.test' }, customFields: { transport_route: ' Blue Route ' } });
    assert.equal(r.created, true);
    assert.deepEqual(await db.all('SELECT f.field_key, v.value, v.university_id FROM soa_custom_field_values v JOIN soa_custom_fields f ON f.id = v.field_id'),
      [{ field_key: 'transport_route', value: 'Blue Route', university_id: 1 }]);
    const before = await counts(db);
    for (const customFields of [{ not_approved: 'x' }, { bus_no: '5' }]) {
      await assert.rejects(adapter.createStudent({ idempotencyKey: `k-${Object.keys(customFields)[0]}`, student: { fullName: 'Vik Das', email: 'vik@x.test' }, customFields }), { code: 'CUSTOM_FIELD_NOT_FOUND' });
    }
    await assert.rejects(adapter.createStudent({ idempotencyKey: 'k3', student: { fullName: 'Vik Das', email: 'vik@x.test' }, customFields: { 'bad key': 'x' } }), { code: 'INVALID_REQUEST' });
    assert.deepEqual(await counts(db), before, 'no student, no value: the transaction rolled back');
  });
});

describe('C/D/E. approval + import through the real LMS router (temp DB, fake AI)', () => {
  let srv; let base; let db; let llm; let jobId;
  const call = async (user, method, url, json) => {
    const r = await fetch(`${base}${url}`, { method, headers: { 'x-test-user': user, ...(json !== undefined ? { 'content-type': 'application/json' } : {}) }, body: json !== undefined ? JSON.stringify(json) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const USERS = { admin1: { userId: 1, role: 'admin', universityId: 1 }, admin2: { userId: 2, role: 'admin', universityId: 2 }, mentor1: { userId: 3, role: 'mentor', universityId: 1 } };
  const upload = async () => {
    const fd = new FormData();
    fd.append('file', new Blob([await workbook()]), 'students.xlsx');
    const r = await fetch(`${base}/imports`, { method: 'POST', headers: { 'x-test-user': 'admin1' }, body: fd });
    return { status: r.status, body: await r.json() };
  };
  const fieldRows = () => db.all('SELECT field_key, data_type FROM soa_custom_fields ORDER BY id');
  const newField = (review, col) => review.newFields.find((f) => f.sourceColumn === col);

  before(async () => {
    db = await tempDb();
    llm = new FakeLLM(AI_ANSWER);
    const app = express();
    app.use((req, res, next) => { req.user = USERS[req.headers['x-test-user']]; next(); }); // stands in for the LMS auth
    app.use('/api/onboarding', createLmsOnboardingRouter({ express, sql: db.sql, llmProvider: llm, env: {}, skipSetupEmails: true }), onboardingErrorHandler);
    srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${srv.address().port}/api/onboarding`;
  });
  after(async () => { if (srv) srv.close(); if (db) await db.close(); });

  it('upload: new-field ideas stay "suggested"; nothing is created', async () => {
    const up = await upload();
    assert.equal(up.status, 201);
    jobId = up.body.jobId;
    assert.deepEqual(up.body.newFields.map((f) => [f.sourceColumn, f.key, f.dataType, f.status]), [
      ['House Number', 'house_number', 'text', 'suggested'], ['Transport Route', 'transport_route', 'text', 'suggested'], ['Emergency Contact', 'emergency_contact', 'text', 'suggested'],
    ]);
    assert.equal(newField(up.body, 'Transport Route').confidence, 0.9);
    assert.deepEqual(await fieldRows(), []);
    assert.deepEqual((await call('admin1', 'GET', '/custom-fields')).body, { ready: true, fields: [] });
  });

  it('a mentor cannot approve; another school cannot see or approve the job', async () => {
    assert.equal((await call('mentor1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route' })).status, 403);
    assert.equal((await call('admin2', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route' })).status, 404);
    assert.deepEqual(await fieldRows(), []);
  });

  it('invalid admin edits are refused and change nothing', async () => {
    for (const edit of [{ key: 'password' }, { key: 'Transport Route' }, { dataType: 'varchar' }, { label: '<img src=x>' }]) {
      const r = await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route', ...edit });
      assert.deepEqual([r.status, r.body.error.code], [400, 'INVALID_FIELD_DEFINITION'], JSON.stringify(edit));
    }
    assert.equal((await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route', sql: 'DROP TABLE users' })).status, 400);
    assert.equal((await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Student Name' })).body.error.code, 'NEW_FIELD_NOT_FOUND');
    assert.deepEqual(await fieldRows(), []);
    assert.equal(newField((await call('admin1', 'GET', `/imports/${jobId}`)).body, 'Transport Route').status, 'suggested');
  });

  it('D. atomicity: if the job cannot record the approval, the just-created field is removed', async () => {
    const r = await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route', expectedVersion: 1 }); // stale version
    assert.deepEqual([r.status, r.body.error.code], [409, 'JOB_CONFLICT']);
    assert.deepEqual(await fieldRows(), [], 'no orphan field');
    assert.equal(newField((await call('admin1', 'GET', `/imports/${jobId}`)).body, 'Transport Route').status, 'suggested', 'still suggested');
  });

  it('approve creates the field (once) and maps the column; the admin may edit key/type; reject creates nothing', async () => {
    let r = await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route' });
    assert.equal(r.status, 200);
    assert.equal(newField(r.body, 'Transport Route').status, 'approved');
    assert.deepEqual(r.body.columns.find((c) => c.sourceColumn === 'Transport Route').targetField, 'custom:transport_route');
    r = await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'House Number', key: 'house_no', label: 'House No.', dataType: 'number' });
    assert.deepEqual(newField(r.body, 'House Number'), { sourceColumn: 'House Number', key: 'house_no', label: 'House No.', dataType: 'number', confidence: 0.8, status: 'approved', reason: 'Student house.' });
    r = await call('admin1', 'POST', `/imports/${jobId}/new-fields/reject`, { sourceColumn: 'Emergency Contact' });
    assert.equal(newField(r.body, 'Emergency Contact').status, 'rejected');
    assert.deepEqual(r.body.columns.find((c) => c.sourceColumn === 'Emergency Contact').status, 'unmapped');
    assert.deepEqual(await fieldRows(), [{ field_key: 'transport_route', data_type: 'text' }, { field_key: 'house_no', data_type: 'number' }]);
    assert.deepEqual(r.body.customFields.map((f) => f.key), ['transport_route', 'house_no']);
    assert.equal((await call('admin1', 'POST', `/imports/${jobId}/new-fields/approve`, { sourceColumn: 'Transport Route' })).body.error.code, 'NEW_FIELD_ALREADY_APPROVED');
    assert.deepEqual((await call('admin2', 'GET', '/custom-fields')).body.fields, [], 'school 2 sees none of them');
  });

  it('E. import: approved custom fields receive their values; rejected/unapproved columns do not; normal fields still work', async () => {
    const review = (await call('admin1', 'GET', `/imports/${jobId}`)).body;
    const approvals = review.columns.filter((c) => c.status === 'suggested').map((c) => ({ sourceColumn: c.sourceColumn, action: 'map', targetField: c.candidateFields[0] }));
    const d = approvals.length ? await call('admin1', 'POST', `/imports/${jobId}/decisions`, { decisions: approvals }) : { body: review };
    assert.equal(d.body.approvalReady, true, JSON.stringify(d.body.issues.filter((i) => i.blocking)));
    assert.equal((await call('admin1', 'POST', `/imports/${jobId}/approve`, {})).status, 200);
    const ex = await call('admin1', 'POST', `/imports/${jobId}/execute`, {});
    assert.deepEqual(ex.body.rows.map((x) => x.student.status), ['created', 'created']);
    const ref = ex.body.rows[0].student.studentRef;
    const values = await call('admin1', 'GET', `/students/${ref}/custom-fields`);
    assert.deepEqual(values.body.customFields, [
      { key: 'transport_route', label: 'Transport Route', dataType: 'text', value: 'Blue Route', retired: false },
      { key: 'house_no', label: 'House No.', dataType: 'number', value: '12', retired: false },
    ]);
    assert.equal((await call('admin2', 'GET', `/students/${ref}/custom-fields`)).status, 404, 'another school cannot read them');
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM soa_custom_field_values WHERE value = '9811111111'")).n, 0, 'the rejected column was not imported');
    const u = await db.get("SELECT name, role, university_id FROM users WHERE email = 'asha@school.example'");
    assert.deepEqual({ ...u }, { name: 'Asha Rao', role: 'student', university_id: 1 });
    assert.equal(llm.prompts.length, 1, 'one AI call at upload; none for approving, importing or reading');
  });
});

describe('C/E. job service: approval required; invalid custom values block the import', () => {
  const svc = () => new ImportJobService({
    schema, store: new InMemoryImportJobStore(),
    importService: { parse: async () => ({ fileName: 's.xlsx', sheetName: 'S', sheetNames: ['S'], headerRowNumber: 1, headers: [...HEADERS], rowCount: 1, columnCount: 7, skippedBlankRows: 0, warnings: [],
      rows: [{ rowNumber: 2, values: Object.fromEntries(HEADERS.map((h, i) => [h, ['Asha Rao', 'asha@x.test', '9876543210', 'Ravi', 'twelve', 'Blue', '98'][i]])) }] }) },
    mappingService: new ColumnMappingService({ schema, llmProvider: new FakeLLM(AI_ANSWER) }),
  });

  it('a column cannot be mapped to a custom field nobody approved', async () => {
    const s = svc();
    const r = await s.startJob(Buffer.from('x'));
    await assert.rejects(s.applyMappingDecision(r.jobId, { decisions: [{ sourceColumn: 'Transport Route', action: 'map', targetField: 'custom:transport_route' }] }),
      (err) => err.code === 'MAPPING_DECISION_REJECTED' && err.details.some((x) => x.code === 'UNKNOWN_TARGET_FIELD'));
  });

  it('an invalid value for an approved number field is a blocking row error', async () => {
    const s = svc();
    const r = await s.startJob(Buffer.from('x'));
    const after = await s.approveNewField(r.jobId, { sourceColumn: 'House Number', field: { id: 7, key: 'house_no', label: 'House No.', dataType: 'number' } });
    const issue = after.issues.find((i) => i.code === 'INVALID_CUSTOM_FIELD_VALUE');
    assert.deepEqual([issue.blocking, issue.sourceColumn, issue.rowNumber], [true, 'House Number', 2]);
    assert.ok(!issue.message.includes('twelve'), 'no cell value in the message');
  });
});

describe('D. creation failure leaves no approval', () => {
  it('before migration 003 (no custom-field tables): approve answers 503 and the idea stays suggested', async () => {
    const db = await tempDb({ with003: false });
    const app = express();
    app.use((req, res, next) => { req.user = { userId: 1, role: 'admin', universityId: 1 }; next(); });
    app.use('/api/onboarding', createLmsOnboardingRouter({ express, sql: db.sql, llmProvider: new FakeLLM(AI_ANSWER), env: {}, skipSetupEmails: true }), onboardingErrorHandler);
    const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const b = `http://127.0.0.1:${srv.address().port}/api/onboarding`;
      const fd = new FormData();
      fd.append('file', new Blob([await workbook()]), 'students.xlsx');
      const up = await (await fetch(`${b}/imports`, { method: 'POST', body: fd })).json();
      const r = await fetch(`${b}/imports/${up.jobId}/new-fields/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceColumn: 'Transport Route' }) });
      assert.deepEqual([r.status, (await r.json()).error.code], [503, 'CUSTOM_FIELDS_NOT_READY']);
      const review = await (await fetch(`${b}/imports/${up.jobId}`)).json();
      assert.equal(review.newFields.find((f) => f.sourceColumn === 'Transport Route').status, 'suggested');
      assert.deepEqual(await (await fetch(`${b}/custom-fields`)).json(), { ready: false, fields: [] });
    } finally {
      srv.close();
      await db.close();
    }
  });

  it('never loaded a SQLite driver', () => {
    assert.equal(sqliteLoaded(), false);
  });
});

describe('E. tool boundary: only the approved row\'s custom values can be written', () => {
  const { createCreateStudentTool } = require('../src/tools/onboarding/createStudentTool');
  const tool = createCreateStudentTool(schema);
  const student = Object.fromEntries(schema.fields.filter((f) => !f.classroomAssignment).map((f) => [f.name, null]));
  Object.assign(student, { fullName: 'Asha Rao', email: 'asha@x.test' });
  const context = (approvedCustom) => {
    const calls = [];
    return { calls, ctx: { approvedRow: () => student, approvedCustom: () => approvedCustom, idempotencyKey: () => 'k', lms: { createStudent: async (r) => { calls.push(r); return { studentRef: 'lms-student:1', created: true }; } } } };
  };
  it('extra, changed or missing custom values are refused before the LMS is called', async () => {
    for (const [approved, given] of [[{}, { transport_route: 'Blue' }], [{ transport_route: 'Blue' }, { transport_route: 'Red' }], [{ transport_route: 'Blue' }, undefined]]) {
      const { calls, ctx } = context(approved);
      const args = tool.validateInput({ rowNumber: 2, student, ...(given ? { customFields: given } : {}) });
      await assert.rejects(tool.execute(ctx, args), { code: 'APPROVED_DATA_MISMATCH' });
      assert.equal(calls.length, 0);
    }
    assert.throws(() => tool.validateInput({ rowNumber: 2, student, customFields: { 'DROP TABLE': 'x' } }), (e) => e.details.some((d) => d.code === 'INVALID_CUSTOM_FIELDS'));
    const { calls, ctx } = context({ transport_route: 'Blue' });
    await tool.execute(ctx, tool.validateInput({ rowNumber: 2, student, customFields: { transport_route: 'Blue' } }));
    assert.deepEqual(calls[0].customFields, { transport_route: 'Blue' });
  });
});
