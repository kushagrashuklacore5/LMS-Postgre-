/**
 * File uploads (audit finding SEC-014: unsafe upload validation and file handling).
 * Files are written to a temporary folder created by the test harness.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const HTML = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>');
const PROGRAM = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

describe('file uploads', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  const storedFiles = () => (fs.existsSync(ctx.uploadsDir) ? fs.readdirSync(ctx.uploadsDir).filter((name) => fs.statSync(path.join(ctx.uploadsDir, name)).isFile()) : []);

  const uploadMaterial = (account, { courseId = ids.courseA, name, type, content, materialType = 'pdf' }) => {
    const form = new FormData();
    form.append('courseId', String(courseId));
    form.append('title', 'Uploaded material');
    form.append('type', materialType);
    form.append('file', new Blob([content], { type }), name);
    return ctx.api('POST', '/api/materials/upload', { as: account, form });
  };

  it('a teacher uploads a real PDF to their own course; it is stored under a random name', async () => {
    const response = await uploadMaterial('mentorA', { name: 'Lesson Plan (final).pdf', type: 'application/pdf', content: PDF });
    assert.ok(response.status < 300, `upload -> ${response.status} ${response.text.slice(0, 160)}`);

    const files = storedFiles();
    assert.equal(files.length, 1);
    assert.match(files[0], /^\d+-[a-f0-9]{24}\.pdf$/);
    const saved = await ctx.db.get("SELECT fileUrl FROM course_materials WHERE title = 'Uploaded material'");
    assert.equal(saved.fileUrl, `/uploads/${files[0]}`);

  });

  describe('stored files are private: only a signed, unexpired link from the API opens them', () => {
    let storedPath;
    const linkFor = async (account) => {
      const response = await ctx.api('GET', `/api/materials/course/${ids.courseA}`, { as: account });
      assert.equal(response.status, 200);
      const match = response.text.match(/\/uploads\/[^"?]+\.pdf\?expires=\d+&signature=[a-f0-9]{64}/);
      assert.ok(match, 'the API response carries no signed file link');
      return match[0];
    };

    before(async () => {
      storedPath = (await ctx.db.get("SELECT fileUrl FROM course_materials WHERE title = 'Uploaded material'")).fileUrl;
    });

    it('the bare stored path is refused, with or without a login', async () => {
      assert.equal((await fetch(ctx.base + storedPath)).status, 403);
      const withToken = await fetch(ctx.base + storedPath, { headers: { Authorization: `Bearer ${ctx.tokenFor('studentB')}` } });
      assert.equal(withToken.status, 403);
    });

    it('a teacher and an enrolled student get a working link; the file is a plain download', async () => {
      for (const account of ['mentorA', 'studentA']) {
        const served = await fetch(ctx.base + (await linkFor(account)));
        assert.equal(served.status, 200, account);
        assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
        assert.match(served.headers.get('content-security-policy'), /sandbox/);
        assert.ok((await served.text()).startsWith('%PDF'));
      }
    });

    it('users who may not see the course never receive a link', async () => {
      for (const account of ['studentA2', 'mentorA2', 'adminB', 'studentB']) {
        const response = await ctx.api('GET', `/api/materials/course/${ids.courseA}`, { as: account });
        assert.equal(response.status, 404, account);
        assert.equal(response.text.includes('signature='), false);
      }
    });

    it('a changed, expired or re-targeted link is refused', async () => {
      const link = await linkFor('mentorA');
      const [, expires, signature] = link.match(/expires=(\d+)&signature=([a-f0-9]+)/);
      const flipped = signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');
      const attempts = [
        link.replace(signature, flipped),
        link.replace(`expires=${expires}`, `expires=${Number(expires) + 86400}`), // extend the lifetime
        `${storedPath}?expires=${expires}`,
        `${storedPath}?signature=${signature}`,
        `/uploads/another-file.pdf?expires=${expires}&signature=${signature}`, // reuse for another file
        `/uploads/..%2f.env?expires=${expires}&signature=${signature}`,
      ];
      for (const url of attempts) assert.equal((await fetch(ctx.base + url)).status, 403, url.slice(0, 70));

      // a correctly signed link whose time has passed
      const { signUploadPath } = require('../../middleware/uploadPolicy');
      const old = signUploadPath(storedPath, Date.now() - 24 * 3600 * 1000);
      assert.equal((await fetch(ctx.base + old)).status, 403);
    });

    it('the database keeps the plain path, never a signed link', () => {
      assert.match(storedPath, /^\/uploads\/\d+-[a-f0-9]{24}\.pdf$/);
    });
  });

  describe('files that are not what they claim to be are rejected and not kept', () => {
    const rejected = [
      ['an HTML page named .pdf', { name: 'notes.pdf', type: 'application/pdf', content: HTML }],
      ['a program named .pdf', { name: 'setup.pdf', type: 'application/pdf', content: PROGRAM }],
      ['a PDF declared as an image', { name: 'photo.png', type: 'image/png', content: PDF }],
      ['an HTML file', { name: 'page.html', type: 'text/html', content: HTML }],
      ['an HTML file declared as PDF', { name: 'page.html', type: 'application/pdf', content: PDF }],
      ['an SVG image', { name: 'logo.svg', type: 'image/svg+xml', content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') }],
      ['a script', { name: 'run.js', type: 'application/javascript', content: Buffer.from('alert(1)') }],
      ['a program', { name: 'tool.exe', type: 'application/octet-stream', content: PROGRAM }],
      ['a server script', { name: 'shell.php', type: 'application/x-php', content: Buffer.from('<?php system($_GET[0]); ?>') }],
      ['a double extension', { name: 'report.pdf.html', type: 'application/pdf', content: PDF }],
      ['a file without extension', { name: 'README', type: 'application/pdf', content: PDF }],
      ['a text file containing a script tag', { name: 'notes.txt', type: 'text/plain', content: HTML }],
      ['an empty file', { name: 'empty.pdf', type: 'application/pdf', content: Buffer.alloc(0) }],
    ];

    for (const [name, file] of rejected) {
      it(name, async () => {
        const before = storedFiles();
        const response = await uploadMaterial('mentorA', file);
        assert.equal(response.status, 400, response.text.slice(0, 120));
        assert.deepEqual(storedFiles(), before);
      });
    }
  });

  it('the file name sent by the browser can never choose where the file is stored', async () => {
    const before = storedFiles();
    for (const name of ['../../../evil.pdf', '..\\..\\evil.pdf', '/etc/cron.d/evil.pdf', 'C:\\Windows\\evil.pdf', 'nul.pdf', '%2e%2e%2fevil.pdf']) {
      const response = await uploadMaterial('mentorA', { name, type: 'application/pdf', content: PDF });
      assert.ok(response.status < 300, `${name} -> ${response.status}`);
    }
    const added = storedFiles().filter((file) => !before.includes(file));
    assert.equal(added.length, 6);
    for (const file of added) assert.match(file, /^\d+-[a-f0-9]{24}\.pdf$/);
    assert.equal(fs.existsSync(path.join(ctx.uploadsDir, '..', 'evil.pdf')), false);
  });

  it('uploading into another school\'s or another teacher\'s course is refused and leaves no file', async () => {
    const before = storedFiles();
    const attempts = [
      ['mentorA', ids.courseB],
      ['adminA', ids.courseB],
      ['adminB', ids.courseA],
      ['mentorA', ids.courseA2],
    ];
    for (const [account, courseId] of attempts) {
      const response = await uploadMaterial(account, { courseId, name: 'intruder.pdf', type: 'application/pdf', content: PDF });
      assert.equal(response.status, 404, `${account} -> course ${courseId}: ${response.status}`);
    }
    // removal of a refused upload happens right after the response is sent
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(storedFiles(), before);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_materials WHERE courseId IN (?, ?)', [ids.courseB, ids.courseA2])).n, 1);
  });

  it('students and non-teaching staff cannot upload course material', async () => {
    const before = storedFiles();
    for (const account of ['studentA', 'accountantA', 'storekeeperA']) {
      const response = await uploadMaterial(account, { name: 'x.pdf', type: 'application/pdf', content: PDF });
      assert.equal(response.status, 403, account);
    }
    assert.equal((await uploadMaterial(undefined, { name: 'x.pdf', type: 'application/pdf', content: PDF })).status, 401);
    assert.deepEqual(storedFiles(), before);
  });

  it('an image is accepted where images are allowed', async () => {
    const response = await uploadMaterial('adminA', { name: 'diagram.png', type: 'image/png', content: PNG, materialType: 'file' });
    assert.ok(response.status < 300, `upload -> ${response.status} ${response.text.slice(0, 160)}`);
  });

  it('the uploads folder cannot be listed or used to read files outside it', async () => {
    for (const url of ['/uploads/', '/uploads/..%2f..%2fserver.js', '/uploads/%2e%2e/package.json', '/uploads/.env', '/uploads/../.env']) {
      const response = await fetch(ctx.base + url);
      assert.ok([400, 403, 404].includes(response.status), `${url} -> ${response.status}`);
      const text = await response.text();
      assert.equal(/JWT_SECRET|"dependencies"|require\(/.test(text), false, url);
    }
  });
});
