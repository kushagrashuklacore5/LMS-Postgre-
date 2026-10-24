'use strict';
/**
 * Step 3: reuse of existing custom fields, field management, visibility/authorization. Throw-away
 * PostgreSQL databases, the real LMS router, a FAKE AI provider (no network). No SQLite driver is loaded.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const express = require('express');
const { LLMProvider } = require('../src/llm/LLMProvider');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { PostgresLmsAdapter } = require('../src/adapters/lms/PostgresLmsAdapter');
const { PostgresCustomFieldStore } = require('../src/adapters/lms/PostgresCustomFieldStore');
const { createLmsOnboardingRouter, onboardingErrorHandler } = require('../src/integration/lmsOnboarding');
const { createLmsTestDatabase, counts } = require('./fixtures/lmsTestDatabase');

const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));
const schema = loadStudentSchema();
const ADMIN1 = { userId: 1, role: 'admin', universityId: 1 };

/** Answers with whatever the test sets; records every prompt. */
class FakeLLM extends LLMProvider {
  constructor() { super('fake-llm'); this.prompts = []; this.answer = null; }
  async generate(prompt) { this.prompts.push(prompt); return JSON.stringify(this.answer); }
}
const mapped = (sourceColumn, targetField, confidence = 0.95) => ({ sourceColumn, status: 'mapped', targetField, confidence, reason: 'Header names it.' });
async function xlsx(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
describe('2-11. reuse, management and authorization through the real router', () => {
  let srv; let base; let t; let llm; const USERS = {};
  const ro = (sql, ...a) => t.all(sql, a);
  const call = async (user, method, url, json) => {
    const r = await fetch(`${base}${url}`, { method, headers: { 'x-test-user': user, ...(json !== undefined ? { 'content-type': 'application/json' } : {}) }, body: json !== undefined ? JSON.stringify(json) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const upload = async (user, headers, rows) => {
    const fd = new FormData();
    fd.append('file', new Blob([await xlsx(headers, rows)]), 's.xlsx');
    const r = await fetch(`${base}/imports`, { method: 'POST', headers: { 'x-test-user': user }, body: fd });
    return { status: r.status, body: await r.json() };
  };
  const approveAll = (review) => review.columns.filter((c) => c.status === 'suggested').map((c) => ({ sourceColumn: c.sourceColumn, action: 'map', targetField: c.candidateFields[0] }));
  const runImport = async (user, jobId, extra = []) => {
    const rv = (await call(user, 'GET', `/imports/${jobId}`)).body;
    const decisions = [...approveAll(rv), ...extra];
    const d = decisions.length ? await call(user, 'POST', `/imports/${jobId}/decisions`, { decisions }) : { body: rv };
    assert.equal(d.body.approvalReady, true, JSON.stringify(d.body.issues && d.body.issues.filter((i) => i.blocking)));
    assert.equal((await call(user, 'POST', `/imports/${jobId}/approve`, {})).status, 200);
    return (await call(user, 'POST', `/imports/${jobId}/execute`, {})).body;
  };
  let firstStudentRef;

  before(async () => {
    t = await createLmsTestDatabase();
    llm = new FakeLLM();
    Object.assign(USERS, { admin1: ADMIN1, admin2: { userId: 2, role: 'admin', universityId: 2 }, mentor1: { userId: 3, role: 'mentor', universityId: 1 } });
    const app = express();
    app.use((req, res, next) => { req.user = USERS[req.headers['x-test-user']]; next(); });
    app.use('/api/onboarding', createLmsOnboardingRouter({ express, sql: t.sql, llmProvider: llm, env: {}, skipSetupEmails: true }), onboardingErrorHandler);
    srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${srv.address().port}/api/onboarding`;
    // School 2 owns a field that school 1 must never see or use.
    await new PostgresCustomFieldStore({ sql: t.sql, actor: { userId: 2, role: 'admin', universityId: 2 }, schema }).ensureField({ key: 'bus_no', label: 'Bus Number', dataType: 'number' });
  });
  after(async () => { if (srv) srv.close(); if (t) await t.close(); });

  it('12. first import: a NEW custom field is approved and filled (Step 2 flow still works)', async () => {
    llm.answer = { mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), { sourceColumn: 'Transport Route', status: 'unmapped' }],
      suggestedNewFields: [{ sourceColumn: 'Transport Route', name: 'transport_route', label: 'Transport Route', dataType: 'text', confidence: 0.9 }] };
    const up = await upload('admin1', ['Student Name', 'Email', 'Transport Route'], [['Asha Rao', 'asha@s.example', 'Blue Route']]);
    assert.deepEqual(up.body.customFields, [], 'no school-1 field exists yet');
    const ap = await call('admin1', 'POST', `/imports/${up.body.jobId}/new-fields/approve`, { sourceColumn: 'Transport Route' });
    assert.deepEqual(ap.body.customFields, [{ key: 'transport_route', label: 'Transport Route', dataType: 'text', source: 'new' }]);
    const ex = await runImport('admin1', up.body.jobId);
    firstStudentRef = ex.rows[0].student.studentRef;
    assert.equal((await ro("SELECT COUNT(*) AS n FROM soa_custom_fields WHERE university_id = 1"))[0].n, 1);
  });

  it('2/3/4. the mapper gets this school\'s ACTIVE fields only (compact); "Bus Route" maps to the existing field; no duplicate is created', async () => {
    llm.answer = { mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), mapped('Bus Route', 'custom:transport_route', 0.9)] };
    const up = await upload('admin1', ['Student Name', 'Email', 'Bus Route'], [['Vik Das', 'vik@s.example', 'Red Route']]);
    const prompt = llm.prompts.at(-1);
    const list = JSON.parse(prompt.slice(prompt.indexOf('EXISTING CUSTOM FIELDS\n') + 23, prompt.indexOf('\n\nFORBIDDEN TARGETS')));
    assert.deepEqual(list, [{ field: 'custom:transport_route', label: 'Transport Route', type: 'text' }], 'key, label, type only');
    assert.ok(!prompt.includes('bus_no') && !prompt.includes('Bus Number'), 'never another school\'s field');
    assert.ok(!prompt.includes('Blue Route') && !prompt.includes('valueCount'), 'no values, no usage data');
    const col = up.body.columns.find((c) => c.sourceColumn === 'Bus Route');
    assert.deepEqual([col.status, col.targetField, col.decidedBy], ['mapped', 'custom:transport_route', 'llm'], 'AUTO MAPPED to the existing field (guard + confidence + samples)');
    assert.deepEqual(up.body.customFields, [{ key: 'transport_route', label: 'Transport Route', dataType: 'text', source: 'existing' }]);
    assert.deepEqual(up.body.newFields, [], 'nothing to create');
    const ex = await runImport('admin1', up.body.jobId);
    assert.equal(ex.rows[0].student.status, 'created');
    assert.equal((await ro("SELECT COUNT(*) AS n FROM soa_custom_fields WHERE university_id = 1"))[0].n, 1, 'no second field');
    assert.deepEqual((await ro("SELECT v.value FROM soa_custom_field_values v JOIN soa_custom_fields f ON f.id = v.field_id WHERE f.field_key = 'transport_route' ORDER BY v.id")).map((r) => r.value), ['Blue Route', 'Red Route']);
  });

  it('4. the AI cannot select another school\'s field, nor suggest a duplicate of an existing one', async () => {
    llm.answer = { mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), mapped('Bus', 'custom:bus_no'), { sourceColumn: 'Route', status: 'unmapped' }],
      suggestedNewFields: [{ sourceColumn: 'Route', name: 'transport_route', label: 'Route', dataType: 'text' }] };
    const up = await upload('admin1', ['Student Name', 'Email', 'Bus', 'Route'], [['Mia K', 'mia@s.example', '5', 'X']]);
    const bus = up.body.columns.find((c) => c.sourceColumn === 'Bus');
    assert.deepEqual([bus.status, bus.errors], ['rejected', ['UNKNOWN_TARGET_FIELD']]);
    assert.deepEqual(up.body.newFields, [], 'duplicate idea dropped');
    const r = await call('admin1', 'POST', `/imports/${up.body.jobId}/decisions`, { decisions: [{ sourceColumn: 'Bus', action: 'map', targetField: 'custom:bus_no' }] });
    assert.equal(r.body.error.code, 'MAPPING_DECISION_REJECTED', 'nor can the admin of school 1');
  });

  it('9/7. admin views own fields; rename keeps key and values; type change refused once values exist', async () => {
    const list = (await call('admin1', 'GET', '/custom-fields')).body;
    assert.equal(list.ready, true);
    assert.deepEqual(list.fields.map((f) => [f.key, f.dataType, f.retired, f.valueCount, f.hasValues, typeof f.createdAt]), [['transport_route', 'text', false, 2, true, 'string']]);
    const ren = await call('admin1', 'PATCH', '/custom-fields/transport_route', { label: 'School Bus Route' });
    assert.deepEqual([ren.status, ren.body.field.key, ren.body.field.label, ren.body.field.valueCount], [200, 'transport_route', 'School Bus Route', 2]);
    const ty = await call('admin1', 'PATCH', '/custom-fields/transport_route', { dataType: 'number' });
    assert.deepEqual([ty.status, ty.body.error.code], [409, 'TYPE_CHANGE_REFUSED']);
    for (const bad of [{ label: '<script>x</script>' }, { dataType: 'varchar' }, { key: 'new_key' }, {}]) {
      assert.equal((await call('admin1', 'PATCH', '/custom-fields/transport_route', bad)).status, 400, JSON.stringify(bad));
    }
    const vals = (await call('admin1', 'GET', `/students/${firstStudentRef}/custom-fields`)).body.customFields;
    assert.deepEqual(vals, [{ key: 'transport_route', label: 'School Bus Route', dataType: 'text', value: 'Blue Route', retired: false }]);
  });

  it('a type change is allowed while a field has no values', async () => {
    await new PostgresCustomFieldStore({ sql: t.sql, actor: ADMIN1, schema }).ensureField({ key: 'locker_no', label: 'Locker', dataType: 'text' });
    const r = await call('admin1', 'PATCH', '/custom-fields/locker_no', { dataType: 'number' });
    assert.deepEqual([r.status, r.body.field.dataType], [200, 'number']);
  });

  it('10/6. another school, a mentor or a student cannot see or change school-1 fields (404/403)', async () => {
    assert.deepEqual((await call('admin2', 'GET', '/custom-fields')).body.fields.map((f) => f.key), ['bus_no']);
    assert.equal((await call('admin2', 'PATCH', '/custom-fields/transport_route', { label: 'Mine' })).status, 404);
    assert.equal((await call('admin2', 'POST', '/custom-fields/transport_route/retire', {})).status, 404);
    assert.equal((await call('admin2', 'GET', `/students/${firstStudentRef}/custom-fields`)).status, 404);
    assert.equal((await call('mentor1', 'GET', '/custom-fields')).status, 403);
    assert.equal((await call('mentor1', 'POST', '/custom-fields/transport_route/retire', {})).status, 403);
  });

  it('student self view: own values only; teachers/admins cannot use the self route', async () => {
    const [asha] = await ro("SELECT id FROM users WHERE email = 'asha@s.example'");
    const [vik] = await ro("SELECT id FROM users WHERE email = 'vik@s.example'");
    USERS.asha = { userId: asha.id, role: 'student', universityId: 1 };
    USERS.ashaWrongSchool = { userId: asha.id, role: 'student', universityId: 2 };
    USERS.vik = { userId: vik.id, role: 'student', universityId: 1 };
    assert.deepEqual((await call('asha', 'GET', '/me/custom-fields')).body.customFields.map((f) => f.value), ['Blue Route']);
    assert.deepEqual((await call('vik', 'GET', '/me/custom-fields')).body.customFields.map((f) => f.value), ['Red Route']);
    assert.equal((await call('ashaWrongSchool', 'GET', '/me/custom-fields')).status, 403, 'token school must match the LMS');
    assert.equal((await call('admin1', 'GET', '/me/custom-fields')).status, 403);
    assert.equal((await call('mentor1', 'GET', '/me/custom-fields')).status, 403);
    assert.equal((await call('asha', 'GET', '/custom-fields')).status, 403, 'students cannot use admin routes');
  });

  it('5/6/11. retire: values kept and readable; not offered to new imports; an import mapped before retiring cannot be approved', async () => {
    llm.answer = { mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), mapped('Bus Route', 'custom:transport_route', 0.9)] };
    const pending = await upload('admin1', ['Student Name', 'Email', 'Bus Route'], [['Neha P', 'neha@s.example', 'Green']]);
    const rv = pending.body;
    assert.equal(rv.columns.find((c) => c.sourceColumn === 'Bus Route').status, 'mapped', 'auto-mapped before the field is retired');

    const ret = await call('admin1', 'POST', '/custom-fields/transport_route/retire', {});
    assert.deepEqual([ret.status, ret.body.field.retired, ret.body.field.valueCount], [200, true, 2]);
    assert.equal((await ro("SELECT COUNT(*) AS n FROM soa_custom_field_values"))[0].n, 2, 'no value deleted');
    assert.deepEqual((await call('asha', 'GET', '/me/custom-fields')).body.customFields, [{ key: 'transport_route', label: 'School Bus Route', dataType: 'text', value: 'Blue Route', retired: true }]);

    const ap = await call('admin1', 'POST', `/imports/${rv.jobId}/approve`, {});
    assert.deepEqual([ap.status, ap.body.error.code], [409, 'CUSTOM_FIELD_NOT_ACTIVE']);

    const up = await upload('admin1', ['Student Name', 'Email', 'Bus Route'], [['Om S', 'om@s.example', 'Blue']]);
    const prompt = llm.prompts.at(-1);
    assert.ok(!prompt.includes('transport_route'), 'a retired field is not offered');
    assert.equal(up.body.columns.find((c) => c.sourceColumn === 'Bus Route').status, 'rejected', 'and cannot be used');
    assert.equal((await call('admin1', 'PATCH', '/custom-fields/transport_route', { label: 'X' })).body.error.code, 'FIELD_RETIRED');
  });

  it('a retired key cannot be silently revived by a new-field approval', async () => {
    llm.answer = { mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), { sourceColumn: 'Route', status: 'unmapped' }],
      suggestedNewFields: [{ sourceColumn: 'Route', name: 'route_name', label: 'Route', dataType: 'text' }] };
    const up = await upload('admin1', ['Student Name', 'Email', 'Route'], [['Raj T', 'raj@s.example', 'Y']]);
    const r = await call('admin1', 'POST', `/imports/${up.body.jobId}/new-fields/approve`, { sourceColumn: 'Route', key: 'transport_route' });
    assert.deepEqual([r.status, r.body.error.code], [409, 'FIELD_RETIRED']);
  });

  it('11. an ordinary import without custom fields still works', async () => {
    llm.answer = { mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email'), { sourceColumn: 'Remarks', status: 'unmapped' }] };
    const up = await upload('admin1', ['Student Name', 'Email', 'Remarks'], [['Zoe A', 'zoe@s.example', 'x']]);
    const ex = await runImport('admin1', up.body.jobId, [{ sourceColumn: 'Remarks', action: 'unmap' }]);
    assert.equal(ex.rows[0].student.status, 'created');
  });
});

describe('15. student creation rolls back for a retired field', () => {
  it('no student, no value is written', async () => {
    const db = await createLmsTestDatabase();
    const store = new PostgresCustomFieldStore({ sql: db.sql, actor: ADMIN1, schema });
    await store.ensureField({ key: 'house_name', label: 'House', dataType: 'text' });
    await store.retireField('house_name');
    const before = await counts(db);
    const adapter = new PostgresLmsAdapter({ sql: db.sql, actor: ADMIN1, schema });
    await assert.rejects(adapter.createStudent({ idempotencyKey: 'r1', student: { fullName: 'A B', email: 'ab@x.test' }, customFields: { house_name: 'Red' } }), { code: 'CUSTOM_FIELD_NOT_FOUND' });
    assert.deepEqual(await counts(db), before);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM soa_custom_field_values')).n, 0);
  });

  it('never loaded a SQLite driver', () => {
    assert.equal(sqliteLoaded(), false);
  });
});
