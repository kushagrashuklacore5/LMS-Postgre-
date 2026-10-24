// PDF upload validation + LocalSubmissionFileStore (temp directory only).
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validatePdfUpload, safeDisplayName, MAX_PDF_BYTES } = require('../../backend/src/assignments/pdfValidation');
const { LocalSubmissionFileStore, defaultSubmissionsDir } = require('../../backend/src/assignments/LocalSubmissionFileStore');
const { syntheticPdf } = require('../helpers/syntheticPdf');

const PDF = syntheticPdf();
const code = (fn) => { try { fn(); } catch (err) { return `${err.statusCode}:${err.code}`; } return 'ok'; };
const up = (over = {}) => validatePdfUpload({ buffer: PDF, contentType: 'application/pdf', filename: 'Essay.pdf', ...over });

describe('validatePdfUpload', () => {
  it('accepts a real PDF and returns safe metadata only', () => {
    const r = up();
    assert.deepEqual([r.originalFilename, r.size, r.contentType], ['Essay.pdf', PDF.length, 'application/pdf']);
  });

  it('rejects non-PDF MIME types even with PDF bytes (client MIME is checked, not trusted alone)', () => {
    for (const ct of ['text/html', 'application/octet-stream', 'application/x-pdf', 'image/png', '', undefined]) assert.equal(code(() => up({ contentType: ct })), '415:INVALID_FILE_TYPE', String(ct));
    assert.equal(code(() => up({ contentType: 'application/pdf; charset=binary' })), 'ok');
  });

  it('rejects wrong magic bytes even when MIME and extension say PDF', () => {
    for (const bytes of ['<html><script>alert(1)</script></html>', 'PK\u0003\u0004 zip', '\u0089PNG\r\n', 'Hello %PDF-1.4 later', '%PDF-9.9 fake']) {
      assert.equal(code(() => up({ buffer: Buffer.from(bytes.padEnd(200, ' ') + '%%EOF', 'latin1') })), '415:INVALID_FILE_TYPE', bytes.slice(0, 10));
    }
  });

  it('rejects empty, truncated/corrupt and oversized files', () => {
    assert.equal(code(() => up({ buffer: Buffer.alloc(0) })), '400:EMPTY_FILE');
    assert.equal(code(() => up({ buffer: undefined })), '400:EMPTY_FILE');
    assert.equal(code(() => up({ buffer: PDF.subarray(0, PDF.length - 40) })), '400:CORRUPT_FILE'); // no %%EOF trailer
    assert.equal(code(() => up({ buffer: Buffer.from('%PDF-1.4\n%%EOF') })), '400:CORRUPT_FILE'); // too small to be a PDF
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_PDF_BYTES)]);
    assert.equal(code(() => up({ buffer: big })), '413:FILE_TOO_LARGE');
  });

  it('rejects PDFs with active content (JavaScript, launch actions, embedded files)', () => {
    for (const name of ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile']) {
      const bad = Buffer.from(PDF.toString('latin1').replace('/Type /Catalog', `/Type /Catalog /OpenAction << /S ${name} >>`), 'latin1');
      assert.equal(code(() => up({ buffer: bad })), '400:ACTIVE_CONTENT', name);
    }
  });

  it('filenames: extension required; paths, traversal and control characters removed (display only)', () => {
    assert.equal(code(() => up({ filename: 'essay.docx' })), '400:INVALID_FILE_NAME');
    assert.equal(code(() => up({ filename: 'essay.pdf.exe' })), '400:INVALID_FILE_NAME');
    assert.equal(code(() => up({ filename: undefined })), '400:INVALID_FILE_NAME');
    assert.equal(code(() => up({ filename: '.pdf' })), '400:INVALID_FILE_NAME');
    assert.equal(safeDisplayName('../../etc/passwd.pdf'), 'passwd.pdf');
    assert.equal(safeDisplayName('C:\\Windows\\System32\\x.pdf'), 'x.pdf');
    assert.equal(safeDisplayName('..\\..\\..pdf'), null);
    assert.equal(safeDisplayName('my<script>"essay"\u0000.PDF'), 'myscriptessay.PDF');
    assert.equal(safeDisplayName(`${'a'.repeat(300)}.pdf`).length, 120);
  });
});

describe('LocalSubmissionFileStore', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aia-store-test-'));
  after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new LocalSubmissionFileStore({ rootDir: path.join(root, 'submissions') });

  it('save/read/exists/delete round trip with server-generated keys and a hash', async () => {
    const { storageKey, sha256 } = await store.save(PDF);
    assert.match(storageKey, /^[0-9a-f-]{36}\.pdf$/);
    assert.match(sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await store.read(storageKey), PDF);
    assert.equal(await store.exists(storageKey), true);
    assert.deepEqual(fs.readdirSync(path.join(root, 'submissions')), [storageKey]); // no temp files left
    await store.delete(storageKey);
    assert.equal(await store.exists(storageKey), false);
    await store.delete(storageKey); // idempotent
  });

  it('two saves never collide', async () => {
    const [a, b] = await Promise.all([store.save(PDF), store.save(PDF)]);
    assert.notEqual(a.storageKey, b.storageKey);
  });

  it('refuses any key it did not generate (path traversal, absolute paths, other names)', async () => {
    for (const key of ['../../etc/passwd', '..\\..\\x.pdf', '/etc/passwd', 'C:\\x.pdf', 'essay.pdf', '', null, '12345678-1234-4234-8234-123456789012.pdf/../x', `${'../'.repeat(3)}12345678-1234-4234-8234-123456789012.pdf`]) {
      await assert.rejects(() => store.read(key), /Invalid storage key/, String(key));
      await assert.rejects(() => store.delete(key), /Invalid storage key/, String(key));
      assert.equal(await store.exists(key), false);
    }
  });

  it('requires an absolute root; the default lives inside the module and is git-ignored', () => {
    assert.throws(() => new LocalSubmissionFileStore({ rootDir: 'relative/dir' }), /absolute/);
    const moduleRoot = path.resolve(__dirname, '../..');
    assert.equal(defaultSubmissionsDir(), path.join(moduleRoot, 'data', 'submissions'));
    assert.match(fs.readFileSync(path.join(moduleRoot, '.gitignore'), 'utf8'), /^data\/$/m);
  });
});
