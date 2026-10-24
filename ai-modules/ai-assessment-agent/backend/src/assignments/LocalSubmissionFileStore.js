const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Descriptive Assignments - SubmissionFileStore on the local disk.
 *
 * The ONLY code that touches submission files. Callers (service, and later the Prompt 2 AI
 * evaluator) work with opaque storage keys: `save(buffer)` returns { storageKey, sha256 } and
 * `read(key)` returns the bytes. Keys are generated here (random UUID + ".pdf") and validated on
 * every call, so no caller input can ever name a path (no traversal, no original filenames).
 *
 *   rootDir  absolute directory, created on first save (mode 0700; files 0600). Configure with
 *            AIA_SUBMISSIONS_DIR; default <module>/data/submissions (git-ignored).
 *
 * Writes are atomic (temp file + rename). Nothing is logged except keys, never contents.
 * Swap this class for a cloud store later by keeping the same four methods.
 */
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;
const keyPattern = (extensions) => new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(${extensions.join('|')})$`);

class LocalSubmissionFileStore {
  /**
   * `extensions`: the file kinds this store holds (default: PDF submissions). The same class,
   * with its own directory and `extensions: ['png', 'jpg', 'gif', 'webp']`, stores question images.
   */
  constructor({ rootDir, extensions = ['pdf'] }) {
    if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) throw new TypeError('LocalSubmissionFileStore requires an absolute rootDir.');
    this.rootDir = path.resolve(rootDir);
    this.extensions = extensions;
    this.key = keyPattern(extensions);
  }

  /** Resolves a key to its file, refusing anything that is not a key this store generated. */
  pathOf(storageKey) {
    if (typeof storageKey !== 'string' || !this.key.test(storageKey)) throw new Error('Invalid storage key.');
    const full = path.resolve(this.rootDir, storageKey);
    if (path.dirname(full) !== this.rootDir) throw new Error('Invalid storage key.');
    return full;
  }

  async save(buffer, extension = this.extensions[0]) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Nothing to save.');
    if (!this.extensions.includes(extension)) throw new Error('Unsupported file type.');
    await fs.promises.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const storageKey = `${crypto.randomUUID()}.${extension}`;
    const target = this.pathOf(storageKey);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, buffer, { mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temp, target);
    return { storageKey, sha256: (await crypto.createHash('sha256').update(buffer)).digest('hex') };
  }

  async read(storageKey) {
    return fs.promises.readFile(this.pathOf(storageKey));
  }

  async exists(storageKey) {
    try {
      await fs.promises.access(this.pathOf(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  /** Idempotent: deleting a missing file is not an error. */
  async delete(storageKey) {
    try {
      await fs.promises.unlink(this.pathOf(storageKey));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

const defaultSubmissionsDir = () => path.resolve(__dirname, '../../../data/submissions');
const defaultQuestionImagesDir = () => path.resolve(__dirname, '../../../data/question-images');

module.exports = { LocalSubmissionFileStore, defaultSubmissionsDir, defaultQuestionImagesDir, STORAGE_KEY: KEY };
