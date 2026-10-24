const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

/**
 * One upload policy for every file the LMS core stores on disk.
 *
 * - A file is accepted only when its extension, its declared type AND its first
 *   bytes all agree on an allowed type. "report.pdf" that is really an HTML page
 *   or a program is rejected and removed.
 * - The stored name is random. The name chosen by the uploader is never used as
 *   a path, so it cannot escape the upload folder or overwrite another file.
 * - Each kind of upload has its own size limit.
 */

const UPLOADS_DIR = process.env.LMS_UPLOADS_DIR
  ? path.resolve(process.env.LMS_UPLOADS_DIR)
  : path.join(__dirname, "..", "uploads");

const MB = 1024 * 1024;

const startsWith = (bytes) => (head) => head.subarray(0, bytes.length).equals(Buffer.from(bytes));
const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]); // also .docx / .xlsx / .pptx
const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0]); // legacy .doc / .xls / .ppt
const isIsoMedia = (head) => head.subarray(4, 8).toString("latin1") === "ftyp"; // .mp4 / .mov
const isPlainText = (head) => !head.includes(0) && !/<\s*(script|html|svg|iframe)/i.test(head.toString("latin1"));

// extension -> { declared types allowed, check on the first bytes }
const FILE_TYPES = {
  ".pdf": { mime: ["application/pdf"], content: startsWith([0x25, 0x50, 0x44, 0x46]) },
  ".png": { mime: ["image/png"], content: startsWith([0x89, 0x50, 0x4e, 0x47]) },
  ".jpg": { mime: ["image/jpeg", "image/jpg"], content: startsWith([0xff, 0xd8, 0xff]) },
  ".jpeg": { mime: ["image/jpeg", "image/jpg"], content: startsWith([0xff, 0xd8, 0xff]) },
  ".gif": { mime: ["image/gif"], content: startsWith([0x47, 0x49, 0x46, 0x38]) },
  ".webp": { mime: ["image/webp"], content: (head) => head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP" },
  ".mp4": { mime: ["video/mp4"], content: isIsoMedia },
  ".mov": { mime: ["video/quicktime"], content: isIsoMedia },
  ".webm": { mime: ["video/webm"], content: startsWith([0x1a, 0x45, 0xdf, 0xa3]) },
  ".avi": { mime: ["video/x-msvideo", "video/avi"], content: (head) => head.subarray(0, 4).toString("latin1") === "RIFF" },
  ".mpeg": { mime: ["video/mpeg"], content: startsWith([0x00, 0x00, 0x01]) },
  ".mpg": { mime: ["video/mpeg"], content: startsWith([0x00, 0x00, 0x01]) },
  ".docx": { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], content: isZip },
  ".xlsx": { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], content: isZip },
  ".pptx": { mime: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], content: isZip },
  ".doc": { mime: ["application/msword"], content: isOle },
  ".xls": { mime: ["application/vnd.ms-excel"], content: isOle },
  ".ppt": { mime: ["application/vnd.ms-powerpoint"], content: isOle },
  ".zip": { mime: ["application/zip", "application/x-zip-compressed"], content: isZip },
  ".txt": { mime: ["text/plain"], content: isPlainText },
};

const IMAGES = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const DOCUMENTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".zip"];
const VIDEOS = [".mp4", ".mov", ".webm", ".avi", ".mpeg", ".mpg"];

const PROFILES = {
  material: { folder: "", extensions: [...VIDEOS, ...DOCUMENTS, ".png", ".jpg", ".jpeg", ".gif"], maxBytes: 500 * MB },
  chapter: { folder: "", extensions: [...VIDEOS, ...DOCUMENTS, ".png", ".jpg", ".jpeg", ".gif"], maxBytes: 50 * MB },
  image: { folder: "", extensions: IMAGES, maxBytes: 5 * MB },
  timetable: { folder: "timetables", extensions: [".pdf", ".png", ".jpg", ".jpeg"], maxBytes: 10 * MB },
};

class UploadRejected extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const removeFile = (file) => {
  if (file?.path) fs.unlink(file.path, () => {});
};

function readHead(filePath) {
  const handle = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(512);
    const length = fs.readSync(handle, head, 0, head.length, 0);
    return head.subarray(0, length);
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * Returns an object shaped like a multer instance (`.single(field)`), so the
 * existing routes keep working. Each call yields the middleware chain:
 * receive the file -> check its real content -> remove it again if the request fails.
 */
function createUpload(profileName) {
  const profile = PROFILES[profileName];
  const folder = path.join(UPLOADS_DIR, profile.folder);

  const receiver = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        fs.mkdir(folder, { recursive: true }, (err) => cb(err, folder));
      },
      filename: (req, file, cb) => {
        const extension = path.extname(file.originalname || "").toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${extension}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      const extension = path.extname(file.originalname || "").toLowerCase();
      const type = profile.extensions.includes(extension) ? FILE_TYPES[extension] : null;
      if (!type || !type.mime.includes(String(file.mimetype).toLowerCase())) {
        return cb(new UploadRejected("This file type is not allowed."));
      }
      cb(null, true);
    },
    limits: { fileSize: profile.maxBytes, files: 1 },
  });

  const single = (field) => [
    (req, res, next) => {
      receiver.single(field)(req, res, (err) => {
        if (!err) return next();
        removeFile(req.file);
        const tooLarge = err.code === "LIMIT_FILE_SIZE";
        const status = tooLarge ? 413 : err.status || 400;
        const message = tooLarge ? "The file is too large." : err instanceof UploadRejected ? err.message : "The upload could not be read.";
        res.status(status).json({ success: false, message });
      });
    },
    (req, res, next) => {
      if (!req.file) return next();
      const extension = path.extname(req.file.filename).toLowerCase();
      let genuine = false;
      try {
        genuine = FILE_TYPES[extension].content(readHead(req.file.path));
      } catch (err) {
        genuine = false;
      }
      if (!genuine) {
        removeFile(req.file);
        return res.status(400).json({ success: false, message: "The file content does not match its type." });
      }
      // A request that is refused later (wrong course, no permission...) leaves no file behind.
      res.on("finish", () => {
        if (res.statusCode >= 400) removeFile(req.file);
      });
      next();
    },
  ];

  return { single };
}

/* ================= PRIVATE DOWNLOADS ================= */
// Stored files are private. The database keeps the plain path ("/uploads/<name>"); a caller
// receives it only inside an API response they were authorised to get, and at that moment
// the path is turned into a link that carries an expiry time and a signature. The download
// route serves a file only for a valid, unexpired link, so knowing or guessing a file name
// is not enough, and a link stops working after a few hours.
const { getJwtSecret } = require("../config/jwt");

const LINK_TTL_SECONDS = (parseInt(process.env.UPLOAD_LINK_TTL_MINUTES, 10) || 240) * 60;
const LINK_ROUNDING_SECONDS = 15 * 60; // links issued in the same quarter hour are identical (browser caching)
const UPLOAD_PATH = /^\/uploads\/[^?#\s]+$/;

const linkSignature = (uploadPath, expires) =>
  crypto.createHmac("sha256", getJwtSecret()).update(`upload-link:${uploadPath}:${expires}`).digest("hex");

function signUploadPath(uploadPath, now = Date.now()) {
  const issued = Math.ceil(now / 1000 / LINK_ROUNDING_SECONDS) * LINK_ROUNDING_SECONDS;
  const expires = issued + LINK_TTL_SECONDS;
  return `${uploadPath}?expires=${expires}&signature=${linkSignature(uploadPath, expires)}`;
}

// Replaces every stored upload path inside a response payload with its signed link.
function withSignedUploadLinks(value, depth = 0) {
  if (typeof value === "string") return UPLOAD_PATH.test(value) ? signUploadPath(value) : value;
  if (!value || typeof value !== "object" || depth > 8 || Buffer.isBuffer(value) || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => withSignedUploadLinks(item, depth + 1));
  const plain = typeof value.toJSON === "function" ? value.toJSON() : value;
  if (!plain || typeof plain !== "object") return plain;
  return Object.fromEntries(Object.entries(plain).map(([key, nested]) => [key, withSignedUploadLinks(nested, depth + 1)]));
}

/** For authenticated API responses: res.json() hands out signed links instead of bare paths. */
function signUploadLinksInResponses(res) {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(withSignedUploadLinks(body));
}

/** Guard in front of the static file route. */
function requireSignedUploadLink(req, res, next) {
  const expires = Number(req.query.expires);
  const signature = typeof req.query.signature === "string" ? req.query.signature : "";
  let uploadPath;
  try {
    uploadPath = `/uploads${decodeURIComponent(req.path)}`;
  } catch (err) {
    return res.status(400).json({ success: false, message: "Bad file address" });
  }
  const expected = Number.isFinite(expires) ? linkSignature(uploadPath, expires) : "";
  const valid =
    expected.length === signature.length &&
    signature.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) &&
    expires * 1000 > Date.now();
  if (!valid) {
    return res.status(403).json({ success: false, message: "This file link is not valid or has expired. Open the file again from the LMS." });
  }
  next();
}

module.exports = { createUpload, UPLOADS_DIR, signUploadPath, signUploadLinksInResponses, requireSignedUploadLink };