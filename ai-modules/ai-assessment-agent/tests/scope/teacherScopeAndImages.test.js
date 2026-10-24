/**
 * Teacher classroom scope, classroom-required AI paths, academic level in the prompt,
 * and question pictures. No network and no AI call.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createLmsTestDb, IDS } = require('../helpers/lmsTestDb');
const { AssessmentService } = require('../../backend/src/core/AssessmentService');
const { AssignmentService } = require('../../backend/src/assignments/AssignmentService');
const { validateGenerationRequest } = require('../../backend/src/core/ai/generationRequest');
const { buildGenerationPrompt } = require('../../backend/src/core/ai/generationPrompt');
const { detectImageExtension, validateImageUpload, MAX_IMAGE_BYTES } = require('../../backend/src/core/questionImage');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const KEY = '0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718.png';
const mcq = (text, extra = {}) => ({ text, options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }, { text: 'C', isCorrect: false }, { text: 'D', isCorrect: false }], ...extra });
const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } return null; };
const detailsOf = async (fn) => { try { await fn(); } catch (err) { return (err.details || []).map((d) => `${d.field}:${d.code}`); } return []; };

describe('teacher classroom scope', () => {
  let db; let service; let assignments;
  const t1 = { userId: 1, universityId: 1, kind: 'teacher' };
  const outsider = { userId: 50, universityId: 1, kind: 'teacher' }; // same school, assigned to no class
  const student = { userId: 4, universityId: 1, kind: 'student' };   // member of class 10

  beforeEach(async () => {
    db = await createLmsTestDb();
    await db.run("INSERT INTO users (id, name, email, password, role, university_id) VALUES (50, 'Unassigned Teacher', 'u50@s1.test', 'x', 'mentor', 1)");
    const adapter = db.adapter();
    service = new AssessmentService({ adapter });
    assignments = new AssignmentService({ adapter });
  });

  it('a teacher lists only the classes they are assigned to', async () => {
    assert.deepEqual((await service.listClassrooms(t1)).map((c) => c.id), [IDS.class10, IDS.class11]);
    assert.deepEqual(await service.listClassrooms(outsider), []);
  });

  it('class teacher and course teacher relationships also give access', async () => {
    await db.run('UPDATE classrooms SET classTeacher = ? WHERE id = ?', ['50', IDS.class10]);
    assert.deepEqual((await service.listClassrooms(outsider)).map((c) => c.id), [IDS.class10]);
    await db.run('UPDATE classrooms SET classTeacher = NULL WHERE id = ?', [IDS.class10]);
    await db.run("INSERT INTO courses (title, mentorId, classroomId, university_id) VALUES ('Physics', 50, ?, 1)", [IDS.class11]);
    assert.deepEqual((await service.listClassrooms(outsider)).map((c) => c.id), [IDS.class11]);
  });

  it('an unassigned teacher cannot target a class of the same school by sending its id', async () => {
    assert.equal(await code(async () => await service.createAssessment(outsider, { title: 'T', subject: 'S', classroomId: IDS.class10 })), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await service.resolveGenerationTarget(outsider, IDS.class10)), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await service.listClassroomStudents(outsider, IDS.class10)), 'NOT_FOUND');
    assert.equal(await code(() => assignments.create(outsider, { title: 'A', classroomId: IDS.class10, maxMarks: 10 })), 'VALIDATION_FAILED');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assessments')).n, 0);
    // the assigned teacher is unaffected
    assert.equal((await service.createAssessment(t1, { title: 'T', subject: 'S', classroomId: IDS.class10 })).classroomId, IDS.class10);
  });

  it('AI generation and saving reviewed questions require a classroom; a manual draft does not', async () => {
    assert.deepEqual(await detailsOf(() => validateGenerationRequest({ topic: 'Motion', subject: 'Physics', count: 2, difficulty: 'easy' })), ['classroomId:REQUIRED']);
    assert.equal(validateGenerationRequest({ topic: 'Motion', subject: 'Physics', count: 2, difficulty: 'easy', classroomId: 10 }).classroomId, 10);
    assert.deepEqual(await detailsOf(async () => await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S' }, questions: [mcq('Q?')] })), ['assessment.classroomId:REQUIRED']);
    assert.equal((await service.createAssessment(t1, { title: 'Manual', subject: 'S' })).classroomId, null);
  });

  it('the prompt states the academic level as structured data: grade and section, not the class name', () => {
    const request = validateGenerationRequest({ topic: 'Motion', subject: 'Physics', count: 2, difficulty: 'easy', classroomId: 10 });
    const grade9 = buildGenerationPrompt(request, { id: 3, name: 'SECRET NAME', grade: '9', section: 'C' });
    const grade12 = buildGenerationPrompt(request, { id: 4, name: 'SECRET NAME', grade: '12', section: 'E' });
    const data = (p) => JSON.parse(p.prompt.slice(p.prompt.indexOf('{')));
    assert.deepEqual(data(grade9).audience, { grade: '9', section: 'C' });
    assert.deepEqual(data(grade12).audience, { grade: '12', section: 'E' });
    assert.notEqual(grade9.prompt, grade12.prompt); // a Grade 9 request is not the same as a Grade 12 one
    assert.match(grade9.systemInstruction, /academic level/);
    assert.equal(grade9.prompt.includes('SECRET NAME'), false);
    assert.deepEqual([data(grade9).subject, data(grade9).topic, data(grade9).difficulty], ['Physics', 'Motion', 'easy']);
  });

  it('question pictures: stored per question for every type, hidden from students as a key', async () => {
    const saved = await service.createAssessmentWithQuestions(t1, {
      assessment: { title: 'Pictures', subject: 'Science', classroomId: IDS.class10 },
      questions: [
        mcq('Single with picture?', { imageKey: KEY }),
        { type: 'multi_select', text: 'Multi with picture?', imageKey: KEY, options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }, { text: 'C', isCorrect: false }, { text: 'D', isCorrect: false }] },
        { type: 'numerical', text: 'Numerical with picture?', imageKey: KEY, numericAnswer: { format: 'integer', value: '4' } },
        mcq('Text only?'),
      ],
    });
    assert.deepEqual(saved.questions.map((q) => q.imageKey), [KEY, KEY, KEY, null]);

    const edited = await service.updateQuestion(t1, saved.id, saved.questions[0].id, mcq('Single with picture?'));
    assert.equal(edited.questions[0].imageKey, null); // removed on edit

    await service.updateQuestion(t1, saved.id, saved.questions[0].id, mcq('Single with picture?', { imageKey: KEY }));
    await service.publish(t1, saved.id);
    const view = await service.getAvailableForStudent(student, saved.id);
    assert.deepEqual(view.questions.map((q) => q.hasImage), [true, true, true, false]);
    assert.equal(JSON.stringify(view).includes(KEY), false);
    assert.equal(JSON.stringify(view).includes('imageKey'), false);

    assert.equal(await service.questionImageForStudent(student, saved.id, view.questions[0].id), KEY);
    assert.equal(await code(async () => await service.questionImageForStudent(student, saved.id, view.questions[3].id)), 'NOT_FOUND'); // text-only
    assert.equal(await code(async () => await service.questionImageForStudent({ userId: 5, universityId: 1, kind: 'student' }, saved.id, view.questions[0].id)), 'NOT_FOUND'); // another class
    assert.equal(await code(async () => await service.questionImageForStudent({ userId: 6, universityId: 2, kind: 'student' }, saved.id, view.questions[0].id)), 'NOT_FOUND'); // another school
  });

  it('a forged or malformed picture key is rejected', async () => {
    for (const bad of ['../../etc/passwd', 'abc.png', `${KEY}.exe`, KEY.replace('.png', '.svg'), 42, {}]) {
      assert.deepEqual(await detailsOf(async () => await service.createAssessmentWithQuestions(t1, {
        assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [mcq('Q?', { imageKey: bad })],
      })), ['questions[0].imageKey:INVALID_IMAGE'], String(bad));
    }
  });

  it('descriptive assignment questions keep their picture; students get hasImage only', async () => {
    const a = await assignments.create(t1, { title: 'Essay', classroomId: IDS.class10, maxMarks: 10 });
    const withQuestions = await assignments.replaceQuestions(t1, a.id, { questions: [{ text: 'Describe the figure.', maxMarks: 6, imageKey: KEY }, { text: 'Explain.', maxMarks: 4 }] });
    assert.deepEqual(withQuestions.questions.map((q) => q.imageKey), [KEY, null]);
    await assignments.publish(t1, a.id);
    const view = await assignments.getForStudent(student, a.id);
    assert.deepEqual(view.questions.map((q) => q.hasImage), [true, false]);
    assert.equal(JSON.stringify(view).includes(KEY), false);
    assert.equal(await assignments.questionImageForStudent(student, a.id, 1), KEY);
    assert.equal(await code(async () => await assignments.questionImageForStudent(student, a.id, 2)), 'NOT_FOUND');
    assert.equal(await code(async () => await assignments.questionImageForStudent({ userId: 5, universityId: 1, kind: 'student' }, a.id, 1)), 'NOT_FOUND');
  });
});

describe('picture upload validation (by content)', () => {
  it('accepts PNG, JPEG, GIF and WebP by their bytes', () => {
    assert.equal(detectImageExtension(PNG), 'png');
    assert.equal(detectImageExtension(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])), 'jpg');
    assert.equal(detectImageExtension(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)])), 'gif');
    assert.equal(detectImageExtension(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])), 'webp');
    assert.deepEqual(Object.keys(validateImageUpload({ buffer: PNG, contentType: 'image/png; charset=binary' })).sort(), ['buffer', 'contentType', 'extension']);
  });

  it('rejects other content, a wrong declared type, an empty file and an oversized file', async () => {
    assert.equal(detectImageExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectImageExtension(Buffer.from('%PDF-1.7 not an image at all')), null);
    assert.equal(await code(() => validateImageUpload({ buffer: Buffer.from('<script>alert(1)</script> padding'), contentType: 'image/png' })), 'IMAGE_TYPE_NOT_ALLOWED');
    assert.equal(await code(() => validateImageUpload({ buffer: PNG, contentType: 'image/jpeg' })), 'IMAGE_TYPE_MISMATCH');
    assert.equal(await code(() => validateImageUpload({ buffer: Buffer.alloc(0), contentType: 'image/png' })), 'IMAGE_REQUIRED');
    assert.equal(await code(() => validateImageUpload({ buffer: undefined, contentType: 'image/png' })), 'IMAGE_REQUIRED');
    assert.equal(await code(() => validateImageUpload({ buffer: Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]), contentType: 'image/png' })), 'IMAGE_TOO_LARGE');
  });
});
