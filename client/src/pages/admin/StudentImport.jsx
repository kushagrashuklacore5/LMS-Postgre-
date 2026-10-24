import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
  AlertTriangle,
  CheckCircle,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  PlusCircle,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";

/*
 * Bulk student import (Student Onboarding Agent, /api/onboarding).
 * All parsing, mapping checks, validation, approval and creation happen on the
 * server; this page only shows the server's review and sends admin decisions.
 * The server returns codes, row numbers and column names only (never cell
 * values, passwords, SQL or stack traces), and the page shows nothing else.
 */

/* ================= LABELS (presentation only) ================= */
const FIELD_LABELS = {
  fullName: "Full name",
  email: "Email",
  className: "Class",
  section: "Section",
  parentName: "Parent name",
  phone: "Phone",
  dob: "Date of birth",
  admissionDate: "Admission date",
  bloodGroup: "Blood group",
  address: "Address",
};
let customLabels = {}; // "custom:<key>" -> label, from the current review (approved custom fields)
const fieldLabel = (name) => FIELD_LABELS[name] || customLabels[name] || (typeof name === "string" && name.startsWith("custom:") ? name.slice(7) : name);

const CODE_TEXT = {
  AUTOMATIC_MAPPING_UNAVAILABLE: "Automatic column mapping is not available. Map the columns below.",
  LLM_PROVIDER_NOT_CONFIGURED: "Automatic column mapping is not configured.",
  LLM_TIMEOUT: "Automatic column mapping timed out. Map the columns below.",
  LLM_PROVIDER_ERROR: "Automatic column mapping failed. Map the columns below.",
  COLUMN_NOT_MAPPED: "Column has not been decided yet",
  COLUMN_NOT_ADDRESSED: "Column has not been decided yet",
  UNRESOLVED_COLUMNS: "Some columns still need a decision",
  AMBIGUOUS_COLUMN: "Column could be more than one field; choose one",
  LOW_CONFIDENCE_MAPPING: "The AI was not sure about this column; confirm or change it",
  AI_SUGGESTION_NOT_APPROVED: "AI suggestion not approved yet",
  CUSTOM_FIELDS_NOT_READY: "New student fields cannot be created yet: a database update is pending. Reject the idea or leave the column out for now.",
  INVALID_FIELD_DEFINITION: "The field name, key or type is not valid.",
  INVALID_FIELD_KEY: "Key: use 2-40 lower-case letters, digits or _ (starting with a letter)",
  PROTECTED_FIELD_KEY: "Key: this is a built-in or reserved name",
  INVALID_FIELD_LABEL: "Name: 1-60 characters",
  UNSAFE_FIELD_LABEL: "Name: plain text only",
  INVALID_FIELD_TYPE: "Type: choose text, number, date or yes/no",
  FIELD_KEY_CONFLICT: "This school already has a field with this key but a different type.",
  NEW_FIELD_ALREADY_APPROVED: "This new field has already been approved.",
  FIELD_RETIRED: "This custom field is retired and cannot be used or edited.",
  TYPE_CHANGE_REFUSED: "The type cannot change: this field already holds values. Create a new field instead.",
  CUSTOM_FIELD_NOT_ACTIVE: "A custom field used by this import was retired or changed. Map those columns again.",
  FIELD_NOT_FOUND: "Custom field not found.",
  INVALID_CUSTOM_FIELD_VALUE: "Value does not match the custom field's type",
  CUSTOM_FIELD_VALUE_TOO_LONG: "Value is too long for the custom field",
  SAMPLE_MISMATCH: "The sample values do not look like the suggested field; choose the field yourself",
  MAPPING_PROPOSAL_INVALID: "The AI answer did not pass the safety checks, so it was not used. Map the columns below.",
  LLM_INVALID_JSON: "The AI answer was not valid, so it was not used. Map the columns below.",
  LLM_MALFORMED_RESPONSE: "The AI answer was not valid, so it was not used. Map the columns below.",
  REJECTED_MAPPING: "The suggested mapping was rejected; choose a field",
  UNMAPPED_COLUMN: "Column will not be imported",
  UNCONFIRMED_UNMAPPED_COLUMN: "Confirm that this column should not be imported",
  REQUIRED_FIELD_UNMAPPED: "A required field has no column",
  REQUIRED_FIELD_MISSING: "Required value is empty",
  DUPLICATE_TARGET_FIELD: "Two columns are mapped to the same field",
  DUPLICATE_EMAIL: "Email appears more than once in the file",
  DUPLICATE_HEADER: "Two columns have the same header",
  EMPTY_HEADER: "A column has no header",
  INVALID_EMAIL: "Email address is not valid",
  INVALID_PHONE: "Phone number is not valid",
  INVALID_DATE: "Date is not valid",
  AMBIGUOUS_DATE: "Date could be read more than one way (use YYYY-MM-DD or DD-MM-YYYY)",
  NOT_A_DATE_VALUE: "Value is not a date",
  UNSUPPORTED_VALUE: "Value is not one of the allowed values",
  DECIMAL_NOT_TEXT: "A number was found where text was expected",
  BOOLEAN_NOT_TEXT: "TRUE/FALSE was found where text was expected",
  UNSAFE_INTEGER: "Number is too large to store exactly",
  FORMULA_CELLS: "Formula cells were read as their stored value",
  MERGED_CELLS: "The sheet has merged cells",
  ERROR_CELLS: "Some cells contain spreadsheet errors",
  VALUES_OUTSIDE_HEADER: "Some values are outside the header columns",
  OTHER_WORKSHEETS_IGNORED: "Only the first usable worksheet is imported",
  SKIPPED_WORKSHEETS: "Some worksheets were skipped",
  FORBIDDEN_SYSTEM_FIELD: "This column is system-controlled and cannot be imported",
  FORBIDDEN_TARGET_FIELD: "This field cannot be imported",
  EMPTY_FILE: "The file is empty",
  NO_DATA_ROWS: "The file has a header but no student rows",
  NO_ROWS: "There are no student rows to import. Fill the Students sheet starting on row 2",
  INVALID_ROWS: "Some rows have errors; fix them in the file and upload it again",
  INVALID_BLOOD_GROUP: "Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+, O-",
  NO_USABLE_WORKSHEET: "No usable worksheet was found",
  INVALID_WORKBOOK: "The file is not a readable .xlsx workbook",
  WORKBOOK_TOO_LARGE: "The workbook is too large",
  TOO_MANY_ROWS: "The file has too many rows",
  FILE_TOO_LARGE: "The file is too large",
  UNSUPPORTED_FILE_TYPE: "Only .xlsx files are supported",
  PARSE_FAILED: "The file could not be read",
  JOB_NOT_FOUND: "This import no longer exists (the server may have restarted). Upload the file again.",
  JOB_CONFLICT: "The import changed in the meantime; the latest version has been loaded.",
  EXECUTION_IN_PROGRESS: "This import is already running.",
  EXECUTION_INTERRUPTED: "The import was interrupted. Run it again; completed rows will not be duplicated.",
  IMPORT_NOT_APPROVED: "Only an approved import can be run.",
  STUDENT_NOT_FOUND: "No student created by this import was found for that row.",
  STUDENT_ALREADY_SET_UP: "This student already set their own password.",
  PASSWORD_TOO_SHORT: "The password must be at least 8 characters long.",
  PASSWORD_TOO_LONG: "The password is too long (at most 72 bytes).",
  IMPORT_NOT_EXECUTED: "Run the import before marking its student setup as verified.",
  TENANT_MISMATCH: "Your account does not match this school.",
  FORBIDDEN: "Admin access only.",
  LMS_NOT_READY: "Student import is not available right now.",
  QUOTA_EXCEEDED: "Your plan's student limit has been reached",
  STUDENT_ALREADY_EXISTS: "An account with this email already exists and was not created by this import",
  LMS_BUSY: "The system is busy. Run the import again; completed rows will not be duplicated.",
  LMS_UNAVAILABLE: "The system could not complete this row. Run the import again later.",
  APPROVAL_BLOCKED: "The import still has blocking issues.",
  JOB_APPROVED_IMMUTABLE: "The import is approved and can no longer be changed.",
  MAPPING_DECISION_REJECTED: "That mapping is not allowed.",
  INVALID_MAPPING_DECISION: "That mapping is not allowed.",
  TOOL_EXECUTION_FAILED: "The row could not be imported",
  INVALID_TOOL_ARGUMENTS: "The row data was rejected",
  EMAIL_SEND_FAILED: "The email could not be sent",
  EMAIL_NOT_CONFIGURED: "Email sending is not configured on the server",
  EMAIL_UNAVAILABLE: "The email service is not available right now",
  SETUP_URL_NOT_CONFIGURED: "The password-setup link address is not configured on the server",
  SETUP_NOT_READY: "Password setup is not enabled on the server yet",
  SETUP_FAILED: "The setup email could not be prepared",
  SETUP_STATUS_NOT_RECORDED: "The email status could not be recorded",
};
const codeText = (code) => CODE_TEXT[code] || code;

const STUDENT_STATUS = {
  created: { label: "Created", tone: "green" },
  already_created: { label: "Already existed (not duplicated)", tone: "blue" },
  failed: { label: "Failed", tone: "red" },
};
const CLASSROOM_STATUS = {
  assigned: { label: "Classroom assigned", tone: "green" },
  classroom_not_found: { label: "Classroom not found", tone: "amber" },
  classroom_ambiguous: { label: "Classroom ambiguous", tone: "amber" },
  not_requested: { label: "No classroom given", tone: "gray" },
  skipped_incomplete_classroom: { label: "Class or section missing", tone: "amber" },
  skipped_student_not_created: { label: "Skipped (student not created)", tone: "gray" },
  failed: { label: "Failed", tone: "red" },
};
const EMAIL_STATUS = {
  sent: { label: "Setup email sent", tone: "green" },
  already_sent: { label: "Email already sent", tone: "blue" },
  in_progress: { label: "Sending…", tone: "blue" },
  account_already_set_up: { label: "Password already set", tone: "blue" },
  rate_limited: { label: "Too many emails today", tone: "amber" },
  email_failed: { label: "Email failed", tone: "red" },
  skipped: { label: "Skipped — email not configured", tone: "gray" },
  not_applicable: { label: "—", tone: "gray" },
};
/**
 * The one label an admin needs per column:
 *   Auto-mapped   a safe AI mapping the server applied (guard + confidence + sample checks passed)
 *   Header match  matched by the deterministic header rule (no AI)
 *   Manual        set by an admin
 *   Needs action  ambiguous / rejected / uncertain / AI-unmapped / not mapped yet: blocks the import
 *   Not imported  an admin confirmed the column is left out
 */
function mappingState(col) {
  if (col.status === "mapped") {
    if (col.decidedBy === "llm") return { label: "Auto-mapped", tone: "green" };
    if (col.decidedBy === "rule") return { label: "Header match", tone: "green" };
    return { label: "Manual", tone: "blue" };
  }
  if (col.status === "unmapped" && col.decidedBy === "human") return { label: "Not imported", tone: "gray" };
  return { label: "Needs action", tone: col.status === "rejected" ? "red" : "amber" };
}

const COLUMN_STATUS = {
  mapped: { label: "Mapped", tone: "green" },
  suggested: { label: "AI suggestion", tone: "blue" }, // not used until an admin approves it
  unmapped: { label: "Not imported", tone: "gray" },
  pending: { label: "Needs decision", tone: "amber" },
  ambiguous: { label: "Ambiguous", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
};
const STATE_TEXT = {
  needs_review: { label: "Needs review", tone: "amber" },
  validated: { label: "Ready to approve", tone: "green" },
  approved: { label: "Approved", tone: "blue" },
  failed: { label: "Failed", tone: "red" },
};
const TONES = {
  green: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  blue: "bg-[#002366]/10 text-[#002366] border border-[#002366]/20",
  amber: "bg-amber-50 text-amber-800 border border-amber-200",
  red: "bg-rose-50 text-rose-800 border border-rose-200",
  gold: "bg-[#B99652]/15 text-[#8c6b2d] border border-[#ebdcaa]",
  gray: "bg-slate-100 text-slate-700 border border-slate-200",
};

/* ================= PAGE ================= */
const StudentImport = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const base = `${API}/onboarding`;
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [fields, setFields] = useState([]);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [uploadPct, setUploadPct] = useState(null); // null | 0-100
  const [busy, setBusy] = useState(""); // "", "upload", "decisions", "validate", "approve", "execute"
  const [review, setReview] = useState(null);
  const [choices, setChoices] = useState({}); // sourceColumn -> "map:<field>" | "unmap" | "unresolve"
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { code, message }
  const [creatingCol, setCreatingCol] = useState(null);
  const [creatingAll, setCreatingAll] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    axios
      .get(`${base}/fields`, { headers: auth })
      .then((res) => setFields(res.data.fields || []))
      .catch((err) => setError(safeError(err)));
  }, [base, auth]);

  /* ---------- helpers ---------- */
  function safeError(err) {
    const status = err?.response?.status;
    const e = err?.response?.data?.error;
    if (status === 401) return { code: "SESSION_EXPIRED", message: "Your session has expired. Please log in again." };
    if (e && typeof e.code === "string") {
      return { code: e.code, message: CODE_TEXT[e.code] || (typeof e.message === "string" ? e.message : e.code), details: Array.isArray(e.details) ? e.details : [] };
    }
    if (status === 403) return { code: "FORBIDDEN", message: "You do not have access to student import." };
    if (!err?.response) return { code: "NETWORK_ERROR", message: "Could not reach the server." };
    return { code: "ERROR", message: "Something went wrong. Please try again." };
  }

  function currentChoice(col) {
    if (col.status === "mapped") return `map:${col.targetField}`;
    if (col.status === "unmapped" && col.decidedBy === "human") return "unmap";
    return "unresolve";
  }

  async function reload(jobId = review?.jobId) {
    const res = await axios.get(`${base}/imports/${jobId}`, { headers: auth });
    setReview(res.data);
    setChoices({});
    return res.data;
  }

  async function run(kind, fn) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const e = safeError(err);
      setError(e);
      toast.error(e.message || "Operation could not be completed.");
      if (e.code === "JOB_CONFLICT" && review?.jobId) {
        try { await reload(); } catch { /* keep the error shown */ }
      }
    } finally {
      setBusy("");
      setUploadPct(null);
    }
  }

  /* ---------- actions ---------- */
  function onPickFile(e) {
    const f = e.target.files?.[0] || null;
    setFileError("");
    setFile(null);
    if (!f) return;
    if (/\.xls$/i.test(f.name)) {
      setFileError("Old .xls files cannot be read. Open the file in Excel and use Save As → Excel Workbook (.xlsx).");
      return;
    }
    if (!/\.xlsx$/i.test(f.name)) {
      setFileError("Choose an Excel .xlsx file.");
      return;
    }
    setFile(f);
  }

  const upload = () =>
    run("upload", async () => {
      const form = new FormData();
      form.append("file", file);
      setUploadPct(0);
      try {
        const res = await axios.post(`${base}/imports`, form, {
          headers: auth,
          onUploadProgress: (p) => p.total && setUploadPct(Math.round((p.loaded / p.total) * 100)),
        });
        setReview(res.data);
      } catch (err) {
        // A file that could not be parsed still returns a review (422) with its error code.
        if (err?.response?.status === 422 && err.response.data?.jobId) {
          setReview(err.response.data);
          return;
        }
        throw err;
      }
      setChoices({});
      setResult(null);
    });

  // Template generated by the server from the student schema; its headers are recognized automatically.
  const downloadTemplate = () =>
    run("template", async () => {
      const res = await axios.get(`${base}/template`, { headers: auth, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

  const changedDecisions = useMemo(() => {
    if (!review) return [];
    return review.columns
      .filter((c) => choices[c.sourceColumn] !== undefined && choices[c.sourceColumn] !== currentChoice(c))
      .map((c) => {
        const v = choices[c.sourceColumn];
        if (v.startsWith("map:")) return { sourceColumn: c.sourceColumn, action: "map", targetField: v.slice(4) };
        return { sourceColumn: c.sourceColumn, action: v };
      });
  }, [review, choices]);

  const submitDecisions = () =>
    run("decisions", async () => {
      const res = await axios.post(
        `${base}/imports/${review.jobId}/decisions`,
        { decisions: changedDecisions, expectedVersion: review.version },
        { headers: auth }
      );
      setReview(res.data);
      setChoices({});
    });

  const restoreColumn = (sourceColumn, expectedVersion) => {
    if (!review) return;
    run("decisions", async () => {
      const res = await axios.post(
        `${base}/imports/${review.jobId}/decisions`,
        {
          decisions: [{ sourceColumn, action: "unresolve" }],
          expectedVersion: expectedVersion || review.version,
        },
        { headers: auth }
      );
      setReview(res.data);
      setChoices({});
      toast.info(`"${sourceColumn}" restored.`);
    });
  };

  /** 1-Click quick ignore for all unmapped/unresolved columns with Undo toast */
  const ignoreAllUnmapped = () => {
    if (!review) return;
    const colsToUnmap = (review.columns || []).filter(
      (c) => c.status !== "mapped" && !(c.status === "unmapped" && c.decidedBy === "human")
    );
    if (colsToUnmap.length === 0) return;
    run("decisions", async () => {
      const res = await axios.post(
        `${base}/imports/${review.jobId}/decisions`,
        {
          decisions: colsToUnmap.map((c) => ({ sourceColumn: c.sourceColumn, action: "unmap" })),
          expectedVersion: review.version,
        },
        { headers: auth }
      );
      setReview(res.data);
      setChoices({});
      toast(
        ({ closeToast }) => (
          <div className="flex items-center justify-between gap-4 text-sm font-medium">
            <span>{colsToUnmap.length} column(s) ignored</span>
            <button
              onClick={() => {
                closeToast();
                run("decisions", async () => {
                  const r = await axios.post(
                    `${base}/imports/${review.jobId}/decisions`,
                    {
                      decisions: colsToUnmap.map((c) => ({ sourceColumn: c.sourceColumn, action: "unresolve" })),
                      expectedVersion: res.data.version,
                    },
                    { headers: auth }
                  );
                  setReview(r.data);
                  setChoices({});
                  toast.info("Columns restored.");
                });
              }}
              className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded text-xs border border-gray-300 shadow-sm transition-colors"
            >
              Undo
            </button>
          </div>
        ),
        { autoClose: 3500 }
      );
    });
  };

  /** 1-Click ignore for a single column with 3.5s Undo toast */
  const quickUnmap = (sourceColumn) => {
    if (!review) return;
    run("decisions", async () => {
      const res = await axios.post(
        `${base}/imports/${review.jobId}/decisions`,
        {
          decisions: [{ sourceColumn, action: "unmap" }],
          expectedVersion: review.version,
        },
        { headers: auth }
      );
      setReview(res.data);
      setChoices({});
      toast(
        ({ closeToast }) => (
          <div className="flex items-center justify-between gap-4 text-sm font-medium">
            <span>&ldquo;{sourceColumn}&rdquo; ignored</span>
            <button
              onClick={() => {
                closeToast();
                restoreColumn(sourceColumn, res.data.version);
              }}
              className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded text-xs border border-gray-300 shadow-sm transition-colors"
            >
              Undo
            </button>
          </div>
        ),
        { autoClose: 3500 }
      );
    });
  };

  /** Explicit admin approval of AI suggestions (one decision per column; the server re-checks every one). */
  const approveSuggestions = (cols) =>
    run("decisions", async () => {
      const res = await axios.post(
        `${base}/imports/${review.jobId}/decisions`,
        { decisions: cols.map((c) => ({ sourceColumn: c.sourceColumn, action: "map", targetField: c.candidateFields[0] })), expectedVersion: review.version },
        { headers: auth }
      );
      setReview(res.data);
      setChoices({});
      toast.success(`${cols.length} AI suggestion${cols.length > 1 ? "s" : ""} approved.`);
    });

  /** Admin approves an AI new-field idea: the server validates it, creates the field, then maps the column. */
  const approveNewField = (sourceColumn, edits) =>
    run("decisions", async () => {
      const rawKey = (edits?.key || edits?.name || sourceColumn).toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
      let safeKey = /^[a-z]/.test(rawKey) ? rawKey : `f_${rawKey}`;
      const reserved = ["roll_number", "rollnumber", "id", "name", "email", "password", "role", "grade", "class", "section", "studentid", "student_id", "status"];
      if (reserved.includes(safeKey) || reserved.includes(safeKey.replace(/_/g, ""))) {
        safeKey = `cf_${safeKey}`;
      }
      const safeLabel = (edits?.label || sourceColumn).trim().slice(0, 60);
      const safeType = ["text", "number", "date", "boolean"].includes(edits?.dataType) ? edits.dataType : "text";

      const res = await axios.post(
        `${base}/imports/${review.jobId}/new-fields/approve`,
        {
          sourceColumn,
          key: safeKey,
          label: safeLabel,
          dataType: safeType,
          expectedVersion: review.version,
        },
        { headers: auth }
      );
      setReview(res.data);
      setChoices({});
      toast.success(`Custom field "${safeLabel}" created & column mapped!`);
    });
  const rejectNewField = (sourceColumn) =>
    run("decisions", async () => {
      const res = await axios.post(`${base}/imports/${review.jobId}/new-fields/reject`, { sourceColumn, expectedVersion: review.version }, { headers: auth });
      setReview(res.data);
      setChoices({});
      toast.info(`"${sourceColumn}" column set to not imported.`);
    });

  const handleCreateCustomField = async (sourceColumn) => {
    setCreatingCol(sourceColumn);
    try {
      await approveNewField(sourceColumn, {
        label: sourceColumn,
        dataType: "text",
      });
    } finally {
      setCreatingCol(null);
    }
  };

  const handleCreateAllCustomFields = async (colsToCreate) => {
    if (!colsToCreate || colsToCreate.length === 0) return;
    setCreatingAll(true);
    try {
      for (const col of colsToCreate) {
        setCreatingCol(col.sourceColumn);
        await approveNewField(col.sourceColumn, {
          label: col.sourceColumn,
          dataType: "text",
        });
      }
    } finally {
      setCreatingCol(null);
      setCreatingAll(false);
    }
  };

  const validate = () =>
    run("validate", async () => {
      const res = await axios.post(`${base}/imports/${review.jobId}/validate`, { expectedVersion: review.version }, { headers: auth });
      setReview(res.data);
      setChoices({});
    });

  const approve = () =>
    run("approve", async () => {
      await axios.post(`${base}/imports/${review.jobId}/approve`, { expectedVersion: review.version }, { headers: auth });
      await reload();
      toast.success("Import approved. It can no longer be changed.");
    });

  const execute = () => {
    const rows = review?.approval?.rowCount ?? review?.file?.rowCount ?? 0;
    if (!window.confirm(`Create ${rows} student account(s) in your school now? Rows that were already created will not be duplicated.`)) return;
    run("execute", async () => {
      const res = await axios.post(`${base}/imports/${review.jobId}/execute`, {}, { headers: auth });
      setResult(res.data);
      if (res.data.repeated) toast.info("This import had already run. Showing its results; nothing was created again.");
      else toast.success("Import finished.");
    });
  };

  const setVerification = (verified) =>
    run("verify", async () => {
      const res = await axios.post(`${base}/imports/${review.jobId}/setup-verification`, { verified }, { headers: auth });
      setResult((r) => (r ? { ...r, setupVerification: res.data.setupVerification } : r));
      toast.success(verified ? "Student setup marked as verified." : "Student setup marked as not verified.");
    });

  // TEMPORARY testing/admin setup (email disabled): set a created student's first password.
  const setStudentPassword = async (rowNumber, password) => {
    try {
      await axios.post(`${base}/imports/${review.jobId}/rows/${rowNumber}/password`, { password }, { headers: auth });
      return null;
    } catch (err) {
      return safeError(err).message;
    }
  };

  const startOver = () => {
    setReview(null);
    setResult(null);
    setChoices({});
    setFile(null);
    setFileError("");
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  /* ---------- derived ---------- */
  customLabels = Object.fromEntries((review?.customFields || []).map((f) => [`custom:${f.key}`, `${f.label} (custom)`]));
  const approved = review?.state === "approved";
  const failedJob = review?.state === "failed";
  const canApprove = !!review && review.approvalReady === true && !approved && changedDecisions.length === 0;
  const blocking = (review?.issues || []).filter((i) => i.blocking);
  const warnings = (review?.issues || []).filter((i) => !i.blocking);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* ===== PAGE TITLE ===== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                  {t('import_students_title')}
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-none bg-[#B99652]/15 text-[#8c6b2d] border border-[#ebdcaa] inline-flex items-center gap-1.5 shadow-2xs">
                  <Sparkles size={13} className="text-[#B99652]" /> {t('ai_suggested_mapping')}
                </span>
              </div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">
                {t('import_students_desc')}
              </p>
            </div>
            {review && (
              <button
                onClick={startOver}
                disabled={!!busy}
                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] hover:border-[#B99652] rounded-none uppercase tracking-wider text-xs font-semibold transition-colors self-start sm:self-auto shadow-xs disabled:opacity-50"
              >
                <RotateCcw size={14} className="text-[#B99652]" /> {t('start_new_import')}
              </button>
            )}
          </div>

          {/* ===== STEPPER PROGRESS BAR ===== */}
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] px-6 py-4 shadow-xs">
            <div className="flex items-center justify-between max-w-2xl mx-auto">
              {/* Step 1: Upload */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-none border flex items-center justify-center text-xs font-bold transition-all ${
                    review
                      ? "bg-[#1e1b4b] text-[#ebdcaa] border-[#1e1b4b] shadow-xs"
                      : "bg-[#B99652] text-white border-[#B99652] shadow-xs"
                  }`}
                >
                  {review ? <CheckCircle size={15} /> : "1"}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{t('upload_file_step')}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{review ? t('completed') : "Choose .xlsx"}</p>
                </div>
              </div>

              {/* Divider */}
              <div className={`flex-1 h-0.5 mx-4 transition-colors ${review ? "bg-[#1e1b4b]" : "bg-[#ebdcaa]"}`} />

              {/* Step 2: Map Columns */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-none border flex items-center justify-center text-xs font-bold transition-all ${
                    approved
                      ? "bg-[#1e1b4b] text-[#ebdcaa] border-[#1e1b4b] shadow-xs"
                      : review
                      ? "bg-[#B99652] text-white border-[#B99652] shadow-xs"
                      : "bg-white text-slate-400 border-[#ebdcaa]"
                  }`}
                >
                  {approved ? <CheckCircle size={15} /> : "2"}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{t('column_mapping_step')}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{approved ? t('done') : review ? "Review & Match" : t('pending')}</p>
                </div>
              </div>

              {/* Divider */}
              <div className={`flex-1 h-0.5 mx-4 transition-colors ${approved ? "bg-[#1e1b4b]" : "bg-[#ebdcaa]"}`} />

              {/* Step 3: Approve & Import */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-none border flex items-center justify-center text-xs font-bold transition-all ${
                    approved
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-slate-400 border-[#ebdcaa]"
                  }`}
                >
                  {approved ? <CheckCircle size={15} /> : "3"}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{t('approve_import_step')}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{approved ? t('done') : canApprove ? "Ready" : "Final Step"}</p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-3 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 text-rose-800 rounded-none p-4 shadow-xs">
              <CircleAlert size={20} className="shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-semibold text-sm">{error.message}</p>
                {error.details?.length > 0 && (
                  <p className="text-xs mt-1 text-rose-700 font-medium">{error.details.map((d) => codeText(typeof d === "string" ? d : d.code)).join(" · ")}</p>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 1: UPLOAD ================= */}
          {!review && (
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-6 shadow-xs space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap pb-3 border-b border-[#ebdcaa]">
                <div>
                  <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] mb-1">{t('upload_student_file')}</h3>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Start from the template: fill the "Students" sheet and keep its headers unchanged, so every column is recognized automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  disabled={!!busy}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] hover:border-[#B99652] rounded-none uppercase tracking-wider text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                >
                  <Download size={14} className="text-[#B99652]" /> {busy === "template" ? t('loading') : t('download_template')}
                </button>
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#ebdcaa] bg-white hover:bg-[#fffdf4] rounded-none p-8 cursor-pointer transition-colors text-center group">
                <FileSpreadsheet size={38} className="text-[#B99652] group-hover:scale-105 transition-transform" />
                <span className="mt-3 font-semibold text-sm text-[#1e1b4b]">{file ? file.name : "Choose an Excel file"}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-medium mt-1">.xlsx, first row = column headers, one student per row</span>
                <input ref={fileInput} type="file" accept=".xlsx,.xls" hidden onChange={onPickFile} disabled={!!busy} />
              </label>
              {fileError && <p className="text-xs text-rose-700 font-semibold">{fileError}</p>}

              {busy === "upload" && (
                <div className="space-y-2" aria-live="polite">
                  <div className="h-2 bg-[#ebdcaa]/40 rounded-none overflow-hidden">
                    <div className="h-full bg-[#B99652] transition-all" style={{ width: `${uploadPct ?? 100}%` }} />
                  </div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-slate-600 flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-[#B99652]" />
                    {uploadPct !== null && uploadPct < 100 ? `Uploading… ${uploadPct}%` : "Reading and checking the file…"}
                  </p>
                </div>
              )}

              <button
                onClick={upload}
                disabled={!file || !!busy}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
              >
                <Upload size={14} /> {busy === "upload" ? "Uploading…" : "Upload and check"}
              </button>
            </div>
          )}

          {review && (
            <div className="space-y-6">
              {/* ================= SUMMARY ================= */}
              <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-6 shadow-xs">
                <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[#ebdcaa]">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#B99652]/10 text-[#B99652] border border-[#ebdcaa] rounded-none">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div>
                      <p className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">{review.file?.name || "Uploaded file"}</p>
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-0.5">
                        {review.file?.sheetName ? `Sheet “${review.file.sheetName}” · ` : ""}
                        {review.file?.rowCount ?? 0} student row(s) · {review.file?.columnCount ?? review.columns.length} column(s)
                      </p>
                    </div>
                  </div>
                  <Badge {...(STATE_TEXT[review.state] || { label: review.state, tone: "gray" })} />
                </div>

                {failedJob && (
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-rose-700">
                    {codeText(review.error?.code)}. Fix the file and upload it again.
                  </p>
                )}

                {review.summary && !failedJob && (
                  <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Columns mapped" value={`${review.summary.columns.mapped} / ${review.summary.columns.total}`} />
                    <Stat label="Valid rows" value={`${review.summary.rows.valid} / ${review.summary.rows.total}`} />
                    <Stat label="Blocking issues" value={review.summary.blockingIssues} tone={review.summary.blockingIssues ? "red" : "green"} />
                    <Stat label="Warnings" value={review.summary.nonBlockingIssues} tone={review.summary.nonBlockingIssues ? "amber" : "gray"} />
                  </div>
                )}

                {review.automaticMapping?.status === "unavailable" && !approved && !failedJob && (
                  <p className="mt-4 text-xs uppercase tracking-wider text-slate-600 font-semibold">
                    {codeText(review.automaticMapping.error?.code || "AUTOMATIC_MAPPING_UNAVAILABLE")}
                  </p>
                )}
              </div>

              {/* ================= STEP 2: COLUMNS ================= */}
              {!failedJob && (() => {
                const allCols = review?.columns || [];
                const mappedCols = allCols.filter((c) => c.status === "mapped");
                const activeUnmappedCols = allCols.filter(
                  (c) => c.status !== "mapped" && !(c.status === "unmapped" && c.decidedBy === "human")
                );
                const ignoredCols = allCols.filter(
                  (c) => c.status === "unmapped" && c.decidedBy === "human"
                );
                const missing = review?.missingRequiredFields || [];
                const aiReasons = review?.aiReview?.reasons || {};

                return (
                  <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-xs space-y-6">
                    <div className="pb-3 border-b border-[#ebdcaa]">
                      <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] mb-1">Column Mapping</h3>
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                        Check your auto-mapped columns, and decide how to handle new or extra columns from your Excel file.
                        {approved && " The import is approved, so the mapping is locked."}
                      </p>
                    </div>

                    {missing.length > 0 && (
                      <div className="p-4 rounded-none bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 text-rose-800 text-xs flex items-start gap-2.5">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                        <span>No column provides the required field{missing.length > 1 ? "s" : ""} <b>{missing.map(fieldLabel).join(", ")}</b>. Every row would fail. Map a column below or fix the file.</span>
                      </div>
                    )}

                    {/* 1. AUTO-MAPPED COLUMNS TABLE */}
                    <div className="border border-[#ebdcaa] rounded-none p-5 bg-white shadow-2xs">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pb-3 border-b border-[#ebdcaa]">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold font-['DM_Serif_Display',serif] text-lg text-[#1e1b4b]">Auto-mapped Columns</span>
                          <span className="px-2.5 py-0.5 rounded-none text-[11px] font-semibold bg-[#B99652]/10 text-[#8c6b2d] border border-[#ebdcaa] uppercase tracking-wider">
                            {mappedCols.length} mapped
                          </span>
                        </div>
                        <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">These columns match standard student fields or existing custom fields</span>
                      </div>

                      {mappedCols.length === 0 ? (
                        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold py-3 italic">No columns auto-mapped yet. Review columns in the new/unmapped section below.</p>
                      ) : (
                        <div className="overflow-x-auto bg-white rounded-none border border-[#ebdcaa]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left bg-[#fffdf4] border-b border-[#ebdcaa] text-[#1e1b4b] uppercase tracking-wider font-semibold">
                                <th className="py-3 px-4">Excel column</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4">Student field</th>
                                <th className="py-3 px-4">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mappedCols.map((col) => {
                                const value = choices[col.sourceColumn] ?? currentChoice(col);
                                const changed = value !== currentChoice(col);
                                const candidates = col.candidateFields || [];
                                const aiReason = aiReasons[col.sourceColumn];
                                return (
                                  <tr key={col.sourceColumn} className={`border-b border-[#ebdcaa]/50 last:border-0 hover:bg-[#fffdf4]/40 transition-colors ${changed ? "bg-[#B99652]/10" : ""}`}>
                                    <td className="py-3 px-4 font-semibold text-[#1e1b4b]">{col.sourceColumn}</td>
                                    <td className="py-3 px-4">
                                      <Badge {...mappingState(col)} />
                                      {col.decidedBy === "llm" && typeof col.confidence === "number" && (
                                        <span className="ml-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{Math.round(col.confidence * 100)}% sure</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">
                                      <select
                                        aria-label={`Field for column ${col.sourceColumn}`}
                                        value={value}
                                        disabled={approved || !!busy}
                                        onChange={(e) => setChoices((c) => ({ ...c, [col.sourceColumn]: e.target.value }))}
                                        className="w-full min-w-[12rem] bg-white border border-[#ebdcaa] rounded-none px-3 py-1.5 focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-xs font-medium text-[#1e1b4b] disabled:bg-slate-50"
                                      >
                                        <option value="unresolve">— Decide later —</option>
                                        <option value="unmap">Don’t import this column</option>
                                        {candidates.length > 0 && (
                                          <optgroup label="Suggested">
                                            {candidates.map((f) => (
                                              <option key={`s-${f}`} value={`map:${f}`}>{fieldLabel(f)}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {(review.customFields || []).length > 0 && (
                                          <optgroup label="Custom fields (approved)">
                                            {review.customFields.map((f) => (
                                              <option key={`c-${f.key}`} value={`map:custom:${f.key}`}>{f.label} (custom)</option>
                                            ))}
                                          </optgroup>
                                        )}
                                        <optgroup label="Student fields">
                                          {fields.filter((f) => !candidates.includes(f.name)).map((f) => (
                                            <option key={f.name} value={`map:${f.name}`}>
                                              {fieldLabel(f.name)}{f.required ? " (required)" : ""}
                                            </option>
                                          ))}
                                        </optgroup>
                                      </select>
                                    </td>
                                    <td className="py-3 px-4 text-slate-600">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs space-y-0.5">
                                          {aiReason && (
                                            <span className="text-slate-500 italic block">{aiReason}</span>
                                          )}
                                          {col.errors?.length > 0 && (
                                            <span className="text-rose-600 font-semibold block">{col.errors.map(codeText).join(" · ")}</span>
                                          )}
                                        </div>
                                        {!approved && (
                                          <button
                                            type="button"
                                            onClick={() => quickUnmap(col.sourceColumn)}
                                            disabled={!!busy}
                                            className="px-2.5 py-1 text-xs bg-white hover:bg-[#fffdf4] text-slate-600 hover:text-slate-900 rounded-none border border-[#ebdcaa] hover:border-[#B99652] font-semibold uppercase tracking-wider shrink-0 transition-colors disabled:opacity-50"
                                            title="Skip / Do not import this column"
                                          >
                                            Ignore
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 2. NEW & UNMAPPED FIELDS TABLE */}
                    <div className="border border-[#ebdcaa] rounded-none p-5 bg-white shadow-2xs">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pb-3 border-b border-[#ebdcaa]">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold font-['DM_Serif_Display',serif] text-lg text-[#1e1b4b]">New & Unmapped Columns</span>
                            <span className={`px-2.5 py-0.5 rounded-none text-[11px] font-semibold border uppercase tracking-wider ${
                              activeUnmappedCols.length > 0 ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            }`}>
                              {activeUnmappedCols.length > 0 ? `${activeUnmappedCols.length} need action` : "All resolved"}
                            </span>
                          </div>
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">
                            These columns do not exist in the database or were not auto-mapped. You can create them as custom fields, map them to an existing field, or ignore them.
                          </p>
                        </div>

                        {activeUnmappedCols.length > 0 && !approved && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleCreateAllCustomFields(activeUnmappedCols)}
                              disabled={!!busy || creatingAll}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#002366] hover:bg-[#001b4e] text-white rounded-none text-xs uppercase tracking-wider font-semibold shadow-xs transition-colors disabled:opacity-50"
                              title="Create custom fields for all unmapped columns in one click"
                            >
                              {creatingAll ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
                              + Add All as Fields ({activeUnmappedCols.length})
                            </button>
                            <button
                              type="button"
                              onClick={ignoreAllUnmapped}
                              disabled={!!busy}
                              className="px-3.5 py-2 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] hover:border-[#B99652] rounded-none text-xs uppercase tracking-wider font-semibold shadow-xs transition-colors disabled:opacity-50"
                            >
                              Ignore All ({activeUnmappedCols.length})
                            </button>
                          </div>
                        )}
                      </div>

                      {activeUnmappedCols.length === 0 ? (
                        <div className="p-4 bg-emerald-50 rounded-none border border-emerald-200 text-xs font-semibold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                          <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                          {ignoredCols.length > 0
                            ? `All columns are mapped or resolved! (${ignoredCols.length} column${ignoredCols.length > 1 ? "s" : ""} ignored)`
                            : "All columns are mapped! No unmapped or extra fields require action."}
                        </div>
                      ) : (
                        <div className="overflow-x-auto bg-white rounded-none border border-[#ebdcaa]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left bg-[#fffdf4] border-b border-[#ebdcaa] text-[#1e1b4b] uppercase tracking-wider font-semibold">
                                <th className="py-3 px-4">Excel column</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4">Map to field</th>
                                <th className="py-3 px-4">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeUnmappedCols.map((col) => {
                                const value = choices[col.sourceColumn] ?? currentChoice(col);
                                const changed = value !== currentChoice(col);
                                const candidates = col.candidateFields || [];
                                return (
                                  <tr key={col.sourceColumn} className={`border-b border-[#ebdcaa]/50 last:border-0 hover:bg-[#fffdf4]/40 transition-colors ${changed ? "bg-[#B99652]/10" : ""}`}>
                                    <td className="py-3 px-4 font-semibold text-[#1e1b4b]">
                                      {col.sourceColumn}
                                      {candidates.length > 0 && (
                                        <div className="text-[11px] text-slate-500 font-normal mt-0.5">Could be: {candidates.map(fieldLabel).join(" or ")}</div>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">
                                      <Badge {...mappingState(col)} />
                                      {col.errors?.length > 0 && (
                                        <div className="text-xs text-rose-600 font-semibold mt-1">{col.errors.map(codeText).join(" · ")}</div>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">
                                      <select
                                        aria-label={`Field for column ${col.sourceColumn}`}
                                        value={value}
                                        disabled={approved || !!busy}
                                        onChange={(e) => {
                                          if (e.target.value === "create_custom") {
                                            handleCreateCustomField(col.sourceColumn);
                                          } else {
                                            setChoices((c) => ({ ...c, [col.sourceColumn]: e.target.value }));
                                          }
                                        }}
                                        className="w-full min-w-[12rem] bg-white border border-[#ebdcaa] rounded-none px-3 py-1.5 focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-xs font-medium text-[#1e1b4b] disabled:bg-slate-50"
                                      >
                                        <option value="unresolve">— Decide later —</option>
                                        <option value="create_custom" className="font-semibold text-[#8c6b2d] bg-[#B99652]/15">✨ + Add as new custom field</option>
                                        <option value="unmap">Don’t import this column</option>
                                        {candidates.length > 0 && (
                                          <optgroup label="Suggested">
                                            {candidates.map((f) => (
                                              <option key={`s-${f}`} value={`map:${f}`}>{fieldLabel(f)}</option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {(review.customFields || []).length > 0 && (
                                          <optgroup label="Custom fields (approved)">
                                            {review.customFields.map((f) => (
                                              <option key={`c-${f.key}`} value={`map:custom:${f.key}`}>{f.label} (custom)</option>
                                            ))}
                                          </optgroup>
                                        )}
                                        <optgroup label="Student fields">
                                          {fields.filter((f) => !candidates.includes(f.name)).map((f) => (
                                            <option key={f.name} value={`map:${f.name}`}>
                                              {fieldLabel(f.name)}{f.required ? " (required)" : ""}
                                            </option>
                                          ))}
                                        </optgroup>
                                      </select>
                                    </td>
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {!approved && (
                                          <button
                                            type="button"
                                            onClick={() => handleCreateCustomField(col.sourceColumn)}
                                            disabled={!!busy || creatingCol === col.sourceColumn}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs font-semibold uppercase tracking-wider shadow-2xs transition-colors disabled:opacity-50"
                                            title={`Add "${col.sourceColumn}" as a custom field and map to it`}
                                          >
                                            {creatingCol === col.sourceColumn ? <Loader2 size={12} className="animate-spin" /> : <PlusCircle size={12} />}
                                            + Add field
                                          </button>
                                        )}
                                        {!approved && (
                                          <button
                                            type="button"
                                            onClick={() => quickUnmap(col.sourceColumn)}
                                            disabled={!!busy}
                                            className="px-2.5 py-1 text-xs bg-white hover:bg-[#fffdf4] text-slate-600 hover:text-slate-900 rounded-none border border-[#ebdcaa] hover:border-[#B99652] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
                                            title="Skip / Do not import this column"
                                          >
                                            Ignore
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Collapsible section for ignored columns so user can view/restore anytime */}
                      {ignoredCols.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-dashed border-[#ebdcaa]">
                          <button
                            type="button"
                            onClick={() => setShowIgnored((prev) => !prev)}
                            className="text-xs text-slate-600 hover:text-[#1e1b4b] uppercase tracking-wider font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <span>{ignoredCols.length} column{ignoredCols.length > 1 ? "s" : ""} ignored (will not be imported)</span>
                            <span className="text-[#B99652] hover:underline font-bold">
                              {showIgnored ? "· Hide" : "· View & restore"}
                            </span>
                          </button>

                          {showIgnored && (
                            <div className="mt-3 bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-3 space-y-2">
                              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">You can restore any ignored column back to the table before approving:</p>
                              <div className="divide-y divide-[#ebdcaa]/60">
                                {ignoredCols.map((col) => (
                                  <div key={col.sourceColumn} className="flex items-center justify-between py-2 text-xs">
                                    <span className="font-semibold text-[#1e1b4b]">{col.sourceColumn}</span>
                                    <button
                                      type="button"
                                      onClick={() => restoreColumn(col.sourceColumn)}
                                      disabled={!!busy || approved}
                                      className="px-3 py-1 text-xs bg-white hover:bg-[#fffdf4] text-[#B99652] border border-[#ebdcaa] rounded-none uppercase tracking-wider font-semibold transition-colors disabled:opacity-50"
                                    >
                                      Restore
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!approved && (
                      <div className="pt-2 flex items-center gap-3 flex-wrap">
                        <button
                          onClick={submitDecisions}
                          disabled={changedDecisions.length === 0 || !!busy}
                          className="px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {busy === "decisions" ? "Saving…" : `Save mapping${changedDecisions.length ? ` (${changedDecisions.length} change${changedDecisions.length > 1 ? "s" : ""})` : ""}`}
                        </button>
                        {changedDecisions.length > 0 && (
                          <button
                            onClick={() => setChoices({})}
                            disabled={!!busy}
                            className="px-4 py-2.5 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs transition-colors"
                          >
                            Discard changes
                          </button>
                        )}
                        <button
                          onClick={validate}
                          disabled={changedDecisions.length > 0 || !!busy}
                          className="px-4 py-2.5 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] hover:border-[#B99652] rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {busy === "validate" ? "Checking…" : "Check again"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ================= ISSUES ================= */}
              {!failedJob && (blocking.length > 0 || warnings.length > 0) && (
                <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-rose-500 p-6 shadow-xs">
                  <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] mb-3 pb-2 border-b border-[#ebdcaa]">Validation Issues</h3>
                  {blocking.length > 0 && (
                    <IssueGroup title="Must be fixed before approval" icon={<CircleAlert size={18} className="text-rose-600" />} issues={blocking} tone="red" />
                  )}
                  {warnings.length > 0 && (
                    <IssueGroup title="Warnings (do not block approval)" icon={<AlertTriangle size={18} className="text-amber-600" />} issues={warnings} tone="amber" />
                  )}
                  {blocking.some((i) => i.rowNumber !== null) && (
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-2">Row numbers are the rows in your Excel file. Fix those cells and upload the file again.</p>
                  )}
                </div>
              )}

              {/* ================= APPROVE / EXECUTE ================= */}
              {!failedJob && (
                <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-6 shadow-xs space-y-4">
                  <div className="pb-3 border-b border-[#ebdcaa]">
                    <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] mb-1">Approve & Import</h3>
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      {!approved
                        ? canApprove
                          ? "Everything checks out. Approving locks this import so it cannot be changed."
                          : changedDecisions.length > 0
                            ? "Save your mapping changes first."
                            : "Approval is available once there are no blocking issues."
                        : `Approved${review.approval?.approvedAt ? ` on ${new Date(review.approval.approvedAt).toLocaleString()}` : ""} · ${review.approval?.rowCount ?? review.file?.rowCount} row(s). Running creates student accounts without duplicating.`}
                    </p>
                  </div>

                  {!approved ? (
                    <button
                      onClick={approve}
                      disabled={!canApprove || !!busy}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={15} /> {busy === "approve" ? "Approving…" : "Approve import"}
                    </button>
                  ) : (
                    <button
                      onClick={execute}
                      disabled={!!busy}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#002366] hover:bg-[#001b4e] text-white rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                    >
                      {busy === "execute" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                      {busy === "execute" ? "Importing…" : result ? "Run again" : "Execute import"}
                    </button>
                  )}
                </div>
              )}

              {/* ================= RESULTS ================= */}
              {result && <Results result={result} onVerify={setVerification} onSetPassword={setStudentPassword} busy={!!busy} />}
            </div>
          )}

          {/* Custom student fields of this school (migration 003): view, rename, retire. Never deleted. */}
          <CustomFieldManager base={base} auth={auth} refreshKey={(review?.customFields || []).map((f) => f.key).join(",")} />
        </div>
      </div>
    </AdminLayout>
  );
};

export default StudentImport;

/* ================= PIECES ================= */
/**
 * "AI Suggested Mapping": what the AI proposed, with its confidence, the MASKED samples it was shown and its
 * short reason. A suggestion is not a mapping: it is used only after the admin approves it here (or picks a
 * field in the table below). Low-confidence or sample-mismatch columns cannot be bulk-approved.
 */
const AiSuggestedMapping = ({ review, busy, hasUnsavedChanges, onApprove, onApproveField, onRejectField }) => {
  const { samples = {}, reasons = {} } = review.aiReview || {};
  const rows = review.columns.filter((c) => c.decidedBy === "llm"
    && (c.status === "mapped" || c.status === "suggested" || ((c.candidateFields || []).length > 0 && c.status === "ambiguous")));
  const approvable = rows.filter((c) => c.status === "suggested");
  const missing = review.missingRequiredFields || [];
  const blockedReason = hasUnsavedChanges ? "Save or discard your changes in the table first." : "";
  if (rows.length === 0 && missing.length === 0) return null;
  return (
    <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-6 shadow-xs" data-testid="soa-ai-suggestions">
      <div className="flex items-start justify-between gap-3 flex-wrap pb-3 mb-4 border-b border-[#ebdcaa]">
        <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] flex items-center gap-2">
          <Sparkles size={18} className="text-[#B99652]" /> AI Suggested Mapping
        </h3>
        <Badge label="Safe mappings applied automatically" tone="green" />
      </div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">
        Safe AI mappings (checked against the mapping rules, confidence of at least 70% and the sample values) are applied automatically; you can still change any column in the table below. Columns marked "Needs action" are not used until you decide. New fields are never created without your approval. Samples are shown masked, exactly as the AI saw them.
      </p>
      {missing.length > 0 && (
        <div className="mb-4 p-3.5 rounded-none bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 text-rose-800 text-xs font-semibold flex items-start gap-2" data-testid="soa-missing-required">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
          <span>No column provides the required field{missing.length > 1 ? "s" : ""} <b>{missing.map(fieldLabel).join(", ")}</b>. Every row would fail. Map a column below or fix the file.</span>
        </div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-none border border-[#ebdcaa]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left bg-[#fffdf4] border-b border-[#ebdcaa] text-[#1e1b4b] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Excel column</th>
                <th className="py-3 px-4">Suggested LMS field</th>
                <th className="py-3 px-4">Kind</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">Sample values (masked)</th>
                <th className="py-3 px-4">AI reason</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const auto = c.status === "mapped";
                const flagged = !auto && c.status !== "suggested";
                const target = auto ? c.targetField : (c.candidateFields || [])[0];
                return (
                  <tr key={c.sourceColumn} className="border-b border-[#ebdcaa]/50 last:border-0 align-top hover:bg-[#fffdf4]/40 transition-colors" data-testid="soa-ai-suggestion" data-status={c.status}>
                    <td className="py-3 px-4 font-semibold text-[#1e1b4b]">{c.sourceColumn}</td>
                    <td className="py-3 px-4">
                      {auto ? fieldLabel(c.targetField) : (c.candidateFields || []).map(fieldLabel).join(" or ")}
                      {auto
                        ? <div className="mt-1"><Badge label="Auto-mapped" tone="green" /></div>
                        : flagged && <div className="text-xs text-amber-700 font-semibold mt-1">Needs action: {(c.errors || []).map(codeText).join(" · ") || "choose the field"}</div>}
                    </td>
                    <td className="py-3 px-4"><TargetKind target={target} customFields={review.customFields || []} /></td>
                    <td className="py-3 px-4 font-semibold">{typeof c.confidence === "number" ? `${Math.round(c.confidence * 100)}%` : "—"}</td>
                    <td className="py-3 px-4 text-slate-600">{(samples[c.sourceColumn] || []).join(", ") || "—"}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs">{reasons[c.sourceColumn] || "—"}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {!flagged && !auto && (
                        <button
                          onClick={() => onApprove([c])}
                          disabled={busy || hasUnsavedChanges}
                          title={blockedReason}
                          className="px-3 py-1 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors disabled:opacity-50"
                          data-testid="soa-ai-approve-one"
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {approvable.length > 0 && (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onApprove(approvable)}
            disabled={busy || hasUnsavedChanges}
            title={blockedReason}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            data-testid="soa-ai-approve-all"
          >
            <CheckCircle size={15} /> Approve {approvable.length} AI suggestion{approvable.length > 1 ? "s" : ""}
          </button>
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">You can still change any column in the table below. Flagged columns need your own choice.</span>
        </div>
      )}
    </div>
  );
};

const FIELD_TYPES = [["text", "Text"], ["number", "Number"], ["date", "Date"], ["boolean", "Yes / No"]];
const typeLabel = (t) => (FIELD_TYPES.find(([k]) => k === t) || [null, t])[1];

/** What a mapping target is: a built-in field, an EXISTING custom field, or a custom field approved in this import. */
const TargetKind = ({ target, customFields }) => {
  if (typeof target !== "string" || !target.startsWith("custom:")) return <Badge label="Built-in field" tone="gray" />;
  const f = customFields.find((x) => `custom:${x.key}` === target);
  if (!f) return <Badge label="Custom field" tone="gray" />;
  return (
    <span className="whitespace-nowrap">
      <Badge label={f.source === "existing" ? "Existing custom field" : "New custom field (approved)"} tone={f.source === "existing" ? "green" : "blue"} />
      <span className="ml-1 text-[11px] font-semibold text-slate-500">{typeLabel(f.dataType)}</span>
    </span>
  );
};

/**
 * The school's custom student fields: name, key, type, created, values, status. Rename keeps the key and
 * every value; retire keeps all values (still readable) but stops offering the field to new imports.
 * The server enforces school scoping and refuses type changes once values exist.
 */
const CustomFieldManager = ({ base, auth, refreshKey }) => {
  const [data, setData] = useState(null); // { ready, fields }
  const [editing, setEditing] = useState(null); // key being renamed
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => axios.get(`${base}/custom-fields`, { headers: auth }).then((r) => setData(r.data)).catch(() => setData({ ready: false, fields: [] }));
  useEffect(() => { load(); }, [base, auth, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, ok) => {
    if (saving) return;
    setSaving(true);
    try { await fn(); toast.success(ok); setEditing(null); await load(); }
    catch (err) { const c = err?.response?.data?.error?.code; toast.error(CODE_TEXT[c] || err?.response?.data?.error?.message || "The change could not be saved."); }
    finally { setSaving(false); }
  };
  const rename = (key) => act(() => axios.patch(`${base}/custom-fields/${encodeURIComponent(key)}`, { label }, { headers: auth }), "Field renamed.");
  const retire = (f) => {
    if (!window.confirm(`Retire "${f.label}"? Its ${f.valueCount} saved value(s) are kept and stay visible, but new imports can no longer use this field.`)) return;
    act(() => axios.post(`${base}/custom-fields/${encodeURIComponent(f.key)}/retire`, {}, { headers: auth }), "Field retired.");
  };
  const unretire = (f) => {
    act(() => axios.post(`${base}/custom-fields/${encodeURIComponent(f.key)}/unretire`, {}, { headers: auth }), `Field "${f.label}" reactivated.`);
  };
  if (!data || (!data.ready && data.fields.length === 0)) return null;
  return (
    <div className="mt-6 bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-xs" data-testid="soa-custom-field-manager">
      <div className="pb-3 mb-4 border-b border-[#ebdcaa]">
        <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] mb-1">Custom Student Fields</h3>
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          Fields your school added through imports. Renaming keeps the key and all values. Retiring stops new imports from using the field, but you can reactivate it at any time.
        </p>
      </div>
      {data.fields.length === 0 ? (
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold py-2">No custom fields yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-none border border-[#ebdcaa]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left bg-[#fffdf4] border-b border-[#ebdcaa] text-[#1e1b4b] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Key</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4">Values</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {data.fields.map((f) => (
                <tr key={f.key} className="border-b border-[#ebdcaa]/50 last:border-0 hover:bg-[#fffdf4]/40 transition-colors" data-testid="soa-custom-field" data-key={f.key}>
                  <td className="py-3 px-4 font-semibold text-[#1e1b4b]">
                    {editing === f.key
                      ? <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} aria-label={`New name for ${f.key}`} className="bg-white border border-[#ebdcaa] rounded-none px-2.5 py-1 w-48 text-xs text-[#1e1b4b] focus:outline-none focus:border-[#B99652]" />
                      : f.label}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{f.key}</td>
                  <td className="py-3 px-4 font-medium">{typeLabel(f.dataType)}</td>
                  <td className="py-3 px-4 text-slate-600">{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "—"}</td>
                  <td className="py-3 px-4 font-semibold text-[#1e1b4b]">{f.valueCount}</td>
                  <td className="py-3 px-4"><Badge label={f.retired ? "Retired" : "Active"} tone={f.retired ? "gray" : "green"} /></td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {editing === f.key ? (
                      <span className="inline-flex gap-2">
                        <button onClick={() => rename(f.key)} disabled={saving || !label.trim()} className="px-3 py-1 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold disabled:opacity-50">Save</button>
                        <button onClick={() => setEditing(null)} disabled={saving} className="px-3 py-1 bg-white hover:bg-[#fffdf4] text-slate-700 border border-[#ebdcaa] rounded-none uppercase tracking-wider text-xs font-semibold">Cancel</button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <button onClick={() => { setEditing(f.key); setLabel(f.label); }} disabled={saving} className="px-3 py-1 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] hover:border-[#B99652] rounded-none uppercase tracking-wider text-xs font-semibold shadow-2xs">Rename</button>
                        {f.retired ? (
                          <button onClick={() => unretire(f)} disabled={saving} className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-none uppercase tracking-wider text-xs font-semibold" data-testid="soa-custom-field-unretire">Reactivate</button>
                        ) : (
                          <button onClick={() => retire(f)} disabled={saving} className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-none uppercase tracking-wider text-xs font-semibold" data-testid="soa-custom-field-retire">Retire</button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
const IDEA_STATUS = {
  suggested: { label: "Suggested — not created", tone: "blue" },
  approved: { label: "Approved — field created", tone: "green" },
  rejected: { label: "Rejected — column not imported", tone: "gray" },
};

/**
 * AI ideas for NEW student fields. Nothing exists until the admin clicks Approve: the server then validates
 * the name/key/type, creates the field for this school and maps the column to it. Reject creates nothing.
 * The status shown is the server's, never assumed.
 */
const NewFieldIdeas = ({ ideas, samples, busy, onApprove, onReject }) => {
  const [edits, setEdits] = useState({}); // sourceColumn -> { label, key, dataType }
  const [actionCol, setActionCol] = useState(null);

  const valueOf = (f) => {
    const rawKey = edits[f.sourceColumn]?.key ?? f.key ?? f.name ?? (f.sourceColumn || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    const validKey = /^[a-z]/.test(rawKey) ? rawKey : `f_${rawKey}`;
    return {
      label: edits[f.sourceColumn]?.label ?? f.label ?? f.sourceColumn,
      key: validKey,
      dataType: edits[f.sourceColumn]?.dataType ?? f.dataType ?? "text",
    };
  };

  const set = (col, k, v) => setEdits((e) => ({ ...e, [col]: { ...(e[col] || {}), [k]: v } }));

  const handleApprove = async (col, v) => {
    setActionCol(col);
    try {
      await onApprove(col, v);
    } finally {
      setActionCol(null);
    }
  };

  const handleReject = async (col) => {
    setActionCol(col);
    try {
      await onReject(col);
    } finally {
      setActionCol(null);
    }
  };

  const openIdeas = ideas.filter((f) => f.status === "suggested");

  const handleApproveAll = async () => {
    for (const f of openIdeas) {
      setActionCol(f.sourceColumn);
      try {
        await onApprove(f.sourceColumn, valueOf(f));
      } catch {
        break; // stop sequence if one fails
      } finally {
        setActionCol(null);
      }
    }
  };

  return (
    <div className="mt-6 border border-[#ebdcaa] bg-white rounded-none p-5 shadow-2xs" data-testid="soa-new-field-ideas">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2 pb-3 border-b border-[#ebdcaa]">
        <div className="font-bold font-['DM_Serif_Display',serif] text-base text-[#1e1b4b]">New Custom Field Suggestions — Require Approval</div>
        {openIdeas.length > 1 && (
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={busy || !!actionCol}
            className="px-3.5 py-1.5 bg-[#002366] hover:bg-[#001b4e] text-white rounded-none text-xs uppercase tracking-wider font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <CheckCircle size={14} /> Approve All ({openIdeas.length}) Suggestions
          </button>
        )}
      </div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">These columns have no matching LMS field. Approve to create the field for your school and import the column into it, or reject to leave the column out.</p>
      <div className="overflow-x-auto bg-white rounded-none border border-[#ebdcaa]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left bg-[#fffdf4] border-b border-[#ebdcaa] text-[#1e1b4b] uppercase tracking-wider font-semibold">
              <th className="py-3 px-4">Excel column</th>
              <th className="py-3 px-4">Field name</th>
              <th className="py-3 px-4">Key</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Confidence</th>
              <th className="py-3 px-4">Samples (masked)</th>
              <th className="py-3 px-4">AI reason</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((f) => {
              const v = valueOf(f);
              const open = f.status === "suggested";
              const isWorking = actionCol === f.sourceColumn;
              return (
                <tr key={f.sourceColumn} className="border-b border-[#ebdcaa]/50 last:border-0 align-top hover:bg-[#fffdf4]/40" data-testid="soa-new-field" data-status={f.status}>
                  <td className="py-3 px-4 font-semibold text-[#1e1b4b]">{f.sourceColumn}</td>
                  <td className="py-3 px-4">
                    {open ? <input value={v.label} maxLength={60} onChange={(e) => set(f.sourceColumn, "label", e.target.value)} aria-label={`Field name for ${f.sourceColumn}`} className="bg-white border border-[#ebdcaa] rounded-none px-2 py-1 w-40 text-xs text-[#1e1b4b] focus:border-[#B99652]" /> : f.label}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">
                    {open ? <input value={v.key} maxLength={40} onChange={(e) => set(f.sourceColumn, "key", e.target.value)} aria-label={`Field key for ${f.sourceColumn}`} className="bg-white border border-[#ebdcaa] rounded-none px-2 py-1 w-40 font-mono text-xs text-[#1e1b4b] focus:border-[#B99652]" /> : f.key}
                  </td>
                  <td className="py-3 px-4">
                    {open ? (
                      <select value={v.dataType} onChange={(e) => set(f.sourceColumn, "dataType", e.target.value)} aria-label={`Field type for ${f.sourceColumn}`} className="bg-white border border-[#ebdcaa] rounded-none px-2 py-1 text-xs text-[#1e1b4b] focus:border-[#B99652]">
                        {FIELD_TYPES.map(([t, label]) => <option key={t} value={t}>{label}</option>)}
                      </select>
                    ) : (FIELD_TYPES.find(([t]) => t === f.dataType) || [null, f.dataType])[1]}
                  </td>
                  <td className="py-3 px-4 font-semibold">{typeof f.confidence === "number" ? `${Math.round(f.confidence * 100)}%` : "—"}</td>
                  <td className="py-3 px-4 text-slate-600">{(samples[f.sourceColumn] || []).join(", ") || "—"}</td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs">{f.reason || "—"}</td>
                  <td className="py-3 px-4 whitespace-nowrap"><Badge {...(IDEA_STATUS[f.status] || { label: f.status, tone: "gray" })} /></td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {open && (
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(f.sourceColumn, v)}
                          disabled={busy || isWorking}
                          className="px-3 py-1.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs uppercase tracking-wider font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-2xs"
                          data-testid="soa-new-field-approve"
                        >
                          {isWorking ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Approving...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle size={13} />
                              <span>Approve</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(f.sourceColumn)}
                          disabled={busy || isWorking}
                          className="px-3 py-1.5 bg-white hover:bg-[#fffdf4] text-slate-700 border border-[#ebdcaa] rounded-none text-xs uppercase tracking-wider font-semibold disabled:opacity-50 transition-colors"
                          data-testid="soa-new-field-reject"
                        >
                          Reject
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Badge = ({ label, tone }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-none text-[11px] font-semibold uppercase tracking-wider ${TONES[tone] || TONES.gray}`}>
    {label}
  </span>
);

const Stat = ({ label, value, tone = "gray" }) => {
  const toneBorder = {
    red: "border-l-rose-500",
    green: "border-l-emerald-600",
    amber: "border-l-amber-500",
    blue: "border-l-[#002366]",
    gray: "border-l-[#B99652]",
  }[tone] || "border-l-[#B99652]";

  return (
    <div className={`bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 ${toneBorder} p-3.5 shadow-xs`}>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 truncate">{label}</p>
      <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-0.5">{value}</p>
    </div>
  );
};

/** Issues grouped by code, with where they occur (row numbers / columns / fields). No cell values. */
const IssueGroup = ({ title, icon, issues, tone }) => {
  const groups = [];
  const byCode = new Map();
  for (const i of issues) {
    if (!byCode.has(i.code)) {
      const g = { code: i.code, rows: [], places: new Set(), count: 0 };
      byCode.set(i.code, g);
      groups.push(g);
    }
    const g = byCode.get(i.code);
    g.count++;
    if (i.rowNumber !== null && i.rowNumber !== undefined) g.rows.push(i.rowNumber);
    if (i.sourceColumn) g.places.add(`column “${i.sourceColumn}”`);
    else if (i.targetField) g.places.add(fieldLabel(i.targetField));
  }
  return (
    <div className="mb-4">
      <p className="font-semibold text-xs uppercase tracking-wider text-[#1e1b4b] flex items-center gap-2 mb-2">{icon}{title}</p>
      <ul className="space-y-2">
        {groups.map((g) => {
          const rows = [...new Set(g.rows)].sort((a, b) => a - b);
          return (
            <li key={g.code} className={`rounded-none px-4 py-2 text-xs font-medium uppercase tracking-wider ${TONES[tone]}`}>
              <span className="font-semibold">{codeText(g.code)}</span>
              {g.places.size > 0 && <span> · {[...g.places].join(", ")}</span>}
              {rows.length > 0 && (
                <span>
                  {" "}· row{rows.length > 1 ? "s" : ""} {rows.slice(0, 25).join(", ")}
                  {rows.length > 25 ? ` and ${rows.length - 25} more` : ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const Results = ({ result, onVerify, onSetPassword, busy }) => {
  const t = result.totals || {};
  const [pwRow, setPwRow] = useState(null); // row number with the open password form
  const [pwDone, setPwDone] = useState(() => new Set());
  return (
    <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-6 shadow-xs">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4 pb-3 border-b border-[#ebdcaa]">
        <h3 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">Import Results</h3>
        <Badge
          label={result.status === "completed" ? "Completed" : "Completed with issues"}
          tone={result.status === "completed" ? "green" : "amber"}
        />
      </div>
      {result.repeated && (
        <p className="text-xs uppercase tracking-wider font-semibold text-[#002366] bg-[#002366]/10 border border-[#002366]/20 rounded-none px-4 py-2.5 mb-4">
          This import had already run. These are its results; nothing was created again.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm mb-6">
        <Stat label="Created" value={t.created ?? 0} tone="green" />
        <Stat label="Already existed" value={t.alreadyCreated ?? 0} tone="blue" />
        <Stat label="Failed" value={t.failed ?? 0} tone={t.failed ? "red" : "gray"} />
        <Stat label="Classroom assigned" value={t.assigned ?? 0} tone="green" />
        <Stat label="Classroom not found" value={t.classroomNotFound ?? 0} tone={t.classroomNotFound ? "amber" : "gray"} />
        <Stat label="Classroom ambiguous" value={t.classroomAmbiguous ?? 0} tone={t.classroomAmbiguous ? "amber" : "gray"} />
        <Stat label="Needs attention" value={t.needsAttention ?? 0} tone={t.needsAttention ? "amber" : "gray"} />
      </div>
      {result.emailTotals?.skipped > 0 && (
        <p className="text-xs uppercase tracking-wider font-medium text-slate-700 bg-white border border-[#ebdcaa] rounded-none px-4 py-2.5 mb-4">
          Setup emails are paused (email is not configured on the server), so none were sent. The students and classroom
          assignments were still created.
        </p>
      )}
      {result.emailTotals && !(result.emailTotals.skipped > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-6">
          <Stat label="Setup emails sent" value={result.emailTotals.sent} tone="green" />
          <Stat label="Already sent" value={result.emailTotals.alreadySent + result.emailTotals.inProgress} tone="blue" />
          <Stat label="Password already set" value={result.emailTotals.alreadySetUp} tone="blue" />
          <Stat label="Email failed / limited" value={result.emailTotals.failed + result.emailTotals.rateLimited} tone={result.emailTotals.failed + result.emailTotals.rateLimited ? "red" : "gray"} />
        </div>
      )}
      {result.emailTotals && result.emailTotals.failed > 0 && (
        <p className="text-xs uppercase tracking-wider font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-none px-4 py-2.5 mb-4">
          Some setup emails could not be sent. The students were still created. Use “Run again” later to retry only the failed emails.
        </p>
      )}
      <SetupVerification value={result.setupVerification} onVerify={onVerify} busy={busy} />
      <div className="overflow-x-auto bg-white rounded-none border border-[#ebdcaa]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left bg-[#fffdf4] border-b border-[#ebdcaa] text-[#1e1b4b] uppercase tracking-wider font-semibold">
              <th className="py-3 px-4">Excel row</th>
              <th className="py-3 px-4">Student</th>
              <th className="py-3 px-4">Student ID</th>
              <th className="py-3 px-4">Classroom</th>
              {result.emailTotals && <th className="py-3 px-4">Setup email</th>}
              {result.tempPasswordSetup && <th className="py-3 px-4">Password (temporary)</th>}
              <th className="py-3 px-4">Reason</th>
            </tr>
          </thead>
          <tbody>
            {(result.rows || []).map((r) => {
              const s = STUDENT_STATUS[r.student?.status] || { label: r.student?.status, tone: "gray" };
              const c = CLASSROOM_STATUS[r.classroom?.status] || { label: r.classroom?.status, tone: "gray" };
              const err = r.student?.error || r.classroom?.error;
              const studentId = typeof r.student?.studentRef === "string" ? r.student.studentRef.replace(/^lms-student:/, "") : "";
              return (
                <tr key={r.rowNumber} className={`border-b border-[#ebdcaa]/50 last:border-0 hover:bg-[#fffdf4]/40 transition-colors ${r.needsAttention ? "bg-amber-50/50" : ""}`}>
                  <td className="py-3 px-4 font-semibold text-[#1e1b4b]">{r.rowNumber}</td>
                  <td className="py-3 px-4"><Badge {...s} /></td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{studentId}</td>
                  <td className="py-3 px-4"><Badge {...c} /></td>
                  {result.emailTotals && (
                    <td className="py-3 px-4"><Badge {...(EMAIL_STATUS[r.email?.status] || { label: r.email?.status || "—", tone: "gray" })} /></td>
                  )}
                  {result.tempPasswordSetup && (
                    <td className="py-3 px-4">
                      {["created", "already_created"].includes(r.student?.status) ? (
                        pwDone.has(r.rowNumber) ? (
                          <Badge label="Password set" tone="green" />
                        ) : (
                          <button type="button" onClick={() => setPwRow(r.rowNumber)} className="text-[#B99652] hover:text-[#a38241] text-xs font-semibold uppercase tracking-wider hover:underline">
                            Set password
                          </button>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="py-3 px-4 text-slate-600">
                    {[...(err ? [err.code, ...(err.reasons || [])] : []), ...(r.email?.code && r.email.status !== "skipped" ? [r.email.code] : [])].map(codeText).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pwRow !== null && (
        <TempPasswordForm
          key={pwRow}
          rowNumber={pwRow}
          onCancel={() => setPwRow(null)}
          onSubmit={async (password) => {
            const error = await onSetPassword(pwRow, password);
            if (!error) {
              setPwDone((d) => new Set(d).add(pwRow));
              setPwRow(null);
              toast.success(`Password set for the student in Excel row ${pwRow}.`);
            }
            return error;
          }}
        />
      )}
    </div>
  );
};

/**
 * TEMPORARY testing/admin setup (email disabled): set a created student's first password.
 * The password is sent once to the server and never shown again or stored in the page.
 */
const TempPasswordForm = ({ rowNumber, onCancel, onSubmit }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (new TextEncoder().encode(password).length > 72) return setError("That password is too long (at most 72 bytes).");
    if (password !== confirm) return setError("The two passwords do not match.");
    setSaving(true);
    const err = await onSubmit(password);
    setSaving(false);
    if (err) setError(err);
  };
  return (
    <form onSubmit={submit} className="mt-4 border border-[#ebdcaa] rounded-none p-5 bg-[#fffdf4] shadow-xs" noValidate>
      <p className="font-bold font-['DM_Serif_Display',serif] text-base text-[#1e1b4b]">Set password for the student in Excel row {rowNumber}</p>
      <p className="text-xs uppercase tracking-wider text-amber-800 font-medium mb-3 mt-0.5">
        Temporary admin setup while email is disabled. Share the password with the student securely; this will be replaced by the email invite flow.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" aria-label="New password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]" />
        <input type="password" autoComplete="new-password" placeholder="Confirm password" aria-label="Confirm password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm text-[#1e1b4b] focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]" />
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-rose-700 mt-2">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold shadow-xs disabled:opacity-50">{saving ? "Saving…" : "Set password"}</button>
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 bg-white hover:bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] rounded-none uppercase tracking-wider text-xs font-semibold">Cancel</button>
      </div>
    </form>
  );
};

/** Admin's manual Yes/No for "student setup is verified" (no email is sent). */
const SetupVerification = ({ value, onVerify, busy }) => {
  const verified = value?.verified ?? null;
  const btn = (active, isYes) =>
    `px-4 py-1.5 rounded-none border text-xs uppercase tracking-wider font-semibold transition-colors ${
      active
        ? isYes
          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
          : "bg-rose-600 text-white border-rose-600 shadow-2xs"
        : "bg-white hover:bg-[#fffdf4] text-slate-700 border-[#ebdcaa]"
    }`;
  return (
    <div className="border border-[#ebdcaa] rounded-none p-4 mb-6 bg-white shadow-2xs flex items-center justify-between flex-wrap gap-3">
      <div>
        <p className="font-semibold text-xs uppercase tracking-wider text-[#1e1b4b]">Student setup verified?</p>
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-0.5">
          {verified === null
            ? "Not reviewed yet. Mark Yes once you have checked the created students and their classrooms."
            : `Marked ${verified ? "Yes" : "No"}${value?.updatedAt ? ` on ${new Date(value.updatedAt).toLocaleString()}` : ""}.`}
        </p>
      </div>
      <div className="flex gap-2" role="group" aria-label="Student setup verified">
        <button type="button" disabled={busy} aria-pressed={verified === true} onClick={() => onVerify(true)} className={btn(verified === true, true)}>
          Yes
        </button>
        <button type="button" disabled={busy} aria-pressed={verified === false} onClick={() => onVerify(false)} className={btn(verified === false, false)}>
          No
        </button>
      </div>
    </div>
  );
};
