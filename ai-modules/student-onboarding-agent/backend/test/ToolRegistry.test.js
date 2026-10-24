const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ToolRegistry } = require('../src/tools/ToolRegistry');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { createOnboardingToolRegistry } = require('../src/tools/onboarding');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

const tool = (extra = {}) => ({
  description: 'Create a thing',
  access: 'create',
  inputContract: { value: 'string' },
  validateInput: (x) => x,
  execute: async () => 'ok',
  ...extra,
});

describe('ToolRegistry rules', () => {
  it('registers a create tool and lists it as plain data', () => {
    const r = new ToolRegistry({ allowedAccess: ['create'] }).register('createThing', tool());
    assert.deepEqual(r.list(), [{ name: 'createThing', description: 'Create a thing', access: 'create', input: { value: 'string' } }]);
    assert.doesNotThrow(() => JSON.stringify(r.list()));
  });

  it('rejects a duplicate name', () => {
    const r = new ToolRegistry().register('createThing', tool());
    assert.throws(() => r.register('createThing', tool()), /already registered/);
  });

  it('rejects update, delete and invalid access levels', () => {
    const r = new ToolRegistry();
    for (const access of ['update', 'delete', 'admin', 'write', undefined, 'CREATE']) {
      assert.throws(() => r.register('makeThing', tool({ access })), /not permitted|allowed/, String(access));
    }
  });

  it('a create-only registry rejects read tools, and cannot be configured with update/delete', () => {
    assert.throws(() => new ToolRegistry({ allowedAccess: ['create'] }).register('listThings', tool({ access: 'read' })), /only allows: create/);
    assert.throws(() => new ToolRegistry({ allowedAccess: ['create', 'delete'] }), /subset/);
    assert.throws(() => new ToolRegistry({ allowedAccess: [] }), /subset/);
  });

  it('rejects a tool without execute, validateInput, inputContract or description', () => {
    const r = new ToolRegistry();
    assert.throws(() => r.register('createA', tool({ execute: undefined })), /execute/);
    assert.throws(() => r.register('createA', tool({ validateInput: undefined })), /validateInput/);
    assert.throws(() => r.register('createA', tool({ inputContract: undefined })), /inputContract/);
    assert.throws(() => r.register('createA', tool({ inputContract: [] })), /inputContract/);
    assert.throws(() => r.register('createA', tool({ description: ' ' })), /description/);
  });

  it('refuses generic infrastructure and update/delete tool names', () => {
    const r = new ToolRegistry();
    for (const name of ['executeSQL', 'queryDatabase', 'runQuery', 'executeCommand', 'arbitraryHTTP', 'genericDatabaseAccess',
      'updateStudent', 'deleteStudent', 'removeStudent', 'dropTable', 'rawSql', 'shellCommand', 'httpRequest', 'fetchUrl', 'upsertStudent', 'patchStudent']) {
      assert.throws(() => r.register(name, tool()), /not permitted|camelCase/, name);
    }
    assert.throws(() => r.register('create student', tool()), /camelCase/);
  });

  it('freezes registered tools so execute cannot be swapped later', () => {
    const original = tool();
    const r = new ToolRegistry().register('createThing', original);
    original.execute = async () => 'hijacked';
    const stored = r.get('createThing');
    assert.ok(Object.isFrozen(stored) && Object.isFrozen(stored.inputContract));
    assert.equal(Reflect.set(stored, 'execute', async () => 'hijacked'), false);
    assert.notEqual(stored.execute, original.execute);
  });

  it('lock() prevents any further registration', () => {
    const r = new ToolRegistry().register('createThing', tool()).lock();
    assert.throws(() => r.register('createOther', tool()), /locked/);
  });
});

describe('onboarding registry', () => {
  const registry = createOnboardingToolRegistry(loadStudentSchema());

  it('contains exactly the two create-only tools, locked', () => {
    assert.deepEqual(registry.list().map((t) => [t.name, t.access]), [['createStudent', 'create'], ['assignStudentToClassroom', 'create']]);
    assert.equal(registry.locked, true);
    assert.deepEqual(registry.allowedAccess, ['create']);
    assert.throws(() => registry.register('createOnboardingToken', tool()), /locked/);
  });

  it('describes explicit inputs derived from the schema (no classroom fields in createStudent)', () => {
    const [createStudent, assign] = registry.list();
    assert.deepEqual(createStudent.input.student.fields.map((f) => f.name), ['fullName', 'email', 'parentName', 'phone', 'dob', 'admissionDate', 'bloodGroup', 'address']);
    assert.ok(/never IDs, passwords, roles/.test(createStudent.description));
    assert.deepEqual(Object.keys(assign.input), ['rowNumber', 'email', 'className', 'section', 'rejected']);
  });
});
