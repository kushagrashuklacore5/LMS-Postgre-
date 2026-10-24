import { useEffect, useState } from "react";
import MentorLayout from "../../components/MentorLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import { Plus, Save, Edit, Trash2, X, BookOpen, Settings } from "lucide-react";
import ClassSubjectsModal from "../../components/mentor/ClassSubjectsModal";
import StudentSubjectsModal from "../../components/mentor/StudentSubjectsModal";
import { resultsRequest, subjectKey } from "../../components/mentor/resultSubjectsApi";

const blankSubjectRow = () => ({ name: "", marks: "", total: 100, status: "PASS", locked: false });

// A student whose subjects cannot be shown under the class subject columns
const hasCustomLayout = (row) => row.mode === "custom" || row.subjects.some((s) => s.source === "custom");

const findSaved = (row, name) =>
  (row.result?.subjects || []).find((s) => subjectKey(s.name) === subjectKey(name)) || null;

// Rows of the result form for one student: the student's current subjects
// (class subjects + own changes) plus anything already saved in this result.
const buildFormRows = (row, typed = []) => {
  const typedByKey = new Map(typed.map((r) => [subjectKey(r.name), r]));
  const rows = [];

  row.subjects.forEach((subject) => {
    const saved = findSaved(row, subject.name);
    const kept = typedByKey.get(subjectKey(subject.name));
    rows.push({
      name: subject.name,
      marks: kept?.marks ?? (saved ? String(saved.marks) : ""),
      total: saved ? Number(saved.total) : Number(subject.maxMarks),
      currentMax: Number(subject.maxMarks),
      status: kept?.status ?? saved?.status ?? "PASS",
      source: subject.source,
      locked: true,
    });
  });

  // Subjects saved earlier that the student no longer has are kept as they were
  (row.result?.subjects || []).forEach((saved) => {
    if (rows.some((r) => subjectKey(r.name) === subjectKey(saved.name))) return;
    rows.push({
      name: saved.name,
      marks: String(saved.marks ?? ""),
      total: Number(saved.total) || 100,
      status: saved.status || "PASS",
      source: "saved",
      locked: row.subjects.length > 0,
    });
  });

  // No subjects configured anywhere yet: type them in as before
  return rows.length > 0 ? rows : [blankSubjectRow()];
};

const ClassResults = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation();

  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [term, setTerm] = useState("General");
  const [entry, setEntry] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [resultForm, setResultForm] = useState(null);
  const [showClassSubjects, setShowClassSubjects] = useState(false);
  const [subjectsStudent, setSubjectsStudent] = useState(null);

  const termName = term.trim() || "General";
  const classSubjects = entry?.classSubjects || [];
  const rows = entry?.students || [];
  const dirtyCount = Object.keys(drafts).length;

  // Fetch the classrooms this mentor is allowed to manage
  const fetchClassrooms = async () => {
    try {
      const list = await resultsRequest(API, token, "/subjects/classrooms");
      setClassrooms(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length > 0) {
        setSelectedClassroom(list[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch classrooms:", err);
      toast.error("Failed to load classrooms");
    } finally {
      setLoading(false);
    }
  };

  // Students of the classroom with their subjects and the result saved for the term
  const loadEntry = async (classroomId = selectedClassroom, keepDrafts = false) => {
    if (!classroomId) {
      setEntry(null);
      return null;
    }
    try {
      setEntryLoading(true);
      setEntryError("");
      const data = await resultsRequest(
        API,
        token,
        `/subjects/classroom/${classroomId}/students?term=${encodeURIComponent(termName)}`
      );
      setEntry(data);
      // Marks typed in the table survive a subject change; a classroom/term switch starts clean
      if (!keepDrafts) setDrafts({});
      return data;
    } catch (err) {
      console.error("Failed to fetch results:", err);
      setEntry(null);
      setEntryError(err.message || "Failed to load results");
      return null;
    } finally {
      setEntryLoading(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, []);

  useEffect(() => {
    // Small delay so typing a term does not reload on every key press
    const timer = setTimeout(() => loadEntry(selectedClassroom), 350);
    return () => clearTimeout(timer);
  }, [selectedClassroom, termName]);

  /* ================= MARKS GRID ================= */
  // One cell of the grid: a class subject for one student (null = removed for that student)
  const cellFor = (row, classSubject) => {
    const subject = row.subjects.find((s) => Number(s.classSubjectId) === Number(classSubject.id));
    if (!subject) return null;

    const saved = findSaved(row, subject.name);
    const draft = drafts[row.student.id]?.[classSubject.id];
    return {
      subject,
      total: saved ? Number(saved.total) : Number(subject.maxMarks),
      marks: draft?.marks ?? (saved ? String(saved.marks) : ""),
      status: draft?.status ?? saved?.status ?? "PASS",
    };
  };

  const updateCell = (row, classSubject, patch) => {
    const cell = cellFor(row, classSubject);
    setDrafts((prev) => ({
      ...prev,
      [row.student.id]: {
        ...prev[row.student.id],
        [classSubject.id]: { marks: cell.marks, status: cell.status, ...patch },
      },
    }));
  };

  const postResult = (studentId, subjects, comments) =>
    resultsRequest(API, token, "/add", {
      method: "POST",
      body: {
        classroomId: Number(selectedClassroom),
        studentId: Number(studentId),
        subjects,
        term: termName,
        comments: comments || "",
      },
    });

  // Save every student row that was changed in the grid
  const handleSaveAll = async () => {
    const changed = rows.filter((row) => drafts[row.student.id]);
    const payloads = [];

    for (const row of changed) {
      const cells = classSubjects.map((cs) => cellFor(row, cs)).filter(Boolean);
      const entered = cells.filter((cell) => cell.marks !== "");

      for (const cell of entered) {
        const marks = Number(cell.marks);
        if (!Number.isFinite(marks) || marks < 0 || marks > cell.total) {
          toast.error(`${row.student.name}: marks for ${cell.subject.name} must be between 0 and ${cell.total}`);
          return;
        }
      }

      // Saved subjects that are not grid columns stay untouched
      const kept = (row.result?.subjects || []).filter(
        (saved) => !cells.some((cell) => subjectKey(cell.subject.name) === subjectKey(saved.name))
      );
      const subjects = [
        ...kept,
        ...entered.map((cell) => ({
          name: cell.subject.name,
          marks: Number(cell.marks),
          total: cell.total,
          status: cell.status,
        })),
      ];
      if (subjects.length > 0) payloads.push({ row, subjects });
    }

    if (payloads.length === 0) {
      toast.error(t('please_add_subject_with_marks'));
      return;
    }

    try {
      setSavingAll(true);
      let saved = 0;
      for (const { row, subjects } of payloads) {
        try {
          await postResult(row.student.id, subjects, row.result?.comments);
          saved++;
        } catch (err) {
          toast.error(`${row.student.name}: ${err.message}`);
        }
      }
      if (saved > 0) toast.success(`Results saved for ${saved} student${saved === 1 ? "" : "s"}`);
      await loadEntry();
    } finally {
      setSavingAll(false);
    }
  };

  /* ================= RESULT FORM (ONE STUDENT) ================= */
  const openResultForm = (row = null) => {
    setResultForm({
      studentId: row ? String(row.student.id) : "",
      editing: !!row,
      hasConfig: row ? row.subjects.length > 0 : false,
      rows: row ? buildFormRows(row) : [],
      comments: row?.result?.comments || "",
    });
  };

  const selectFormStudent = (studentId) => {
    const row = rows.find((r) => String(r.student.id) === String(studentId));
    setResultForm((prev) => ({
      ...prev,
      studentId,
      hasConfig: row ? row.subjects.length > 0 : false,
      rows: row ? buildFormRows(row) : [],
      comments: row?.result?.comments || "",
    }));
  };

  const updateFormRow = (index, field, value) => {
    setResultForm((prev) => ({
      ...prev,
      rows: prev.rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
  };

  // Save Result
  const handleSaveResult = async (e) => {
    e.preventDefault();

    if (!resultForm.studentId) {
      toast.error(t('please_select_student'));
      return;
    }

    const filled = resultForm.rows.filter((r) => r.name.trim() && r.marks !== "");
    if (filled.length === 0) {
      toast.error(t('please_add_subject_with_marks'));
      return;
    }

    for (const subject of filled) {
      const marks = Number(subject.marks);
      const total = Number(subject.total) || 100;
      if (!Number.isFinite(marks) || marks < 0 || marks > total) {
        toast.error(`Marks for ${subject.name} must be between 0 and ${total}`);
        return;
      }
    }

    try {
      setSaving(true);
      await postResult(
        resultForm.studentId,
        filled.map((r) => ({
          name: r.name.trim(),
          marks: Number(r.marks),
          total: Number(r.total) || 100,
          status: r.status,
        })),
        resultForm.comments
      );

      toast.success(resultForm.editing ? t('result_updated_successfully') : t('result_added_successfully'));
      // Observed by GuideBot (ActionGuard) only — fires strictly after the request succeeded.
      if (resultForm.editing) window.dispatchEvent(new CustomEvent('guidebot:action-success', { detail: { actionId: 'result-updated' } }));
      setResultForm(null);
      loadEntry();
    } catch (err) {
      console.error("Error saving result:", err);
      toast.error(err.message || t('failed_to_save_result'));
    } finally {
      setSaving(false);
    }
  };

  // Delete Result
  const handleDeleteResult = async (resultId) => {
    if (window.confirm(t('confirm_delete_result'))) {
      try {
        const res = await fetch(`${API}/results/${resultId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(t('failed_to_delete_result'));

        toast.success(t('result_deleted_successfully'));
        loadEntry();
      } catch (err) {
        console.error("Error deleting result:", err);
        toast.error(t('failed_to_delete_result'));
      }
    }
  };

  // A student's subjects changed: reload and keep the marks already typed in the form
  const handleSubjectsChanged = async () => {
    const data = await loadEntry(selectedClassroom, true);
    if (!data) return;
    setResultForm((prev) => {
      if (!prev?.studentId) return prev;
      const row = data.students.find((r) => String(r.student.id) === String(prev.studentId));
      if (!row) return prev;
      return { ...prev, hasConfig: row.subjects.length > 0, rows: buildFormRows(row, prev.rows) };
    });
  };

  const resultSummary = (row) => {
    const subjects = row.result?.subjects || [];
    if (subjects.length === 0) return <span className="text-gray-400">Not entered</span>;
    return subjects.map((s) => `${s.name} ${s.marks}/${s.total}`).join(", ");
  };

  if (loading) return <MentorLayout><div className="p-6">{t('loading')}</div></MentorLayout>;

  const currentClassroom = classrooms.find((c) => c.id === selectedClassroom);
  const formRow = resultForm ? rows.find((r) => String(r.student.id) === String(resultForm.studentId)) : null;

  return (
    <MentorLayout>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight mb-2">{t('results_management')}</h1>
          <p className="text-gray-600">{t('add_manage_student_results')}</p>
        </div>

        {/* Controls */}
        <div data-tour="results-controls" className="bg-white border border-[#ebdcaa]/60 rounded-none p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-xs">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">
                {t('select_classroom')}
              </label>
              <select
                value={String(selectedClassroom || "")}
                onChange={(e) => setSelectedClassroom(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa]/80 rounded-none text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366] transition-all"
              >
                <option value="">{t('choose_classroom')}</option>
                {classrooms.map(classroom => (
                  <option key={classroom.id} value={String(classroom.id)}>
                    {classroom.name} (Grade {classroom.grade})
                  </option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">
                Term
              </label>
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="e.g., First Term"
                className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa]/80 rounded-none text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366] transition-all"
              />
            </div>

            <button
              data-tour="results-add-button"
              onClick={() => openResultForm()}
              disabled={!selectedClassroom || !entry}
              className="bg-[#B99652] hover:bg-[#a38241] text-white px-6 py-2.5 rounded-none font-semibold text-sm shadow-sm hover:shadow transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{t('add_result')}</span>
            </button>
          </div>
          {classrooms.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">You are not assigned to any classroom yet.</p>
          )}
        </div>

        {/* Class subjects (configured once, inherited by every student) */}
        {entry && (
          <div className="bg-white border border-[#ebdcaa]/60 rounded-none p-6 mb-6 shadow-sm">
            <div className="flex justify-between items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] mb-2">Class Subjects</h2>
                {classSubjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {classSubjects.map((subject) => (
                      <span key={subject.id} className="bg-[#fffdf4] border border-[#ebdcaa] text-sm text-[#1e1b4b] px-3 py-1">
                        {subject.name} <span className="text-gray-500">· {subject.maxMarks}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    No subjects are configured for this class yet. Configure them once and every student gets them
                    automatically — until then you can still type subjects for each result.
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowClassSubjects(true)}
                className="border border-[#B99652] text-[#B99652] hover:bg-[#fffdf4] px-4 py-2 rounded-none font-semibold text-sm transition-all flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                <span>Configure Subjects</span>
              </button>
            </div>
          </div>
        )}

        {/* Results Table */}
        {entryLoading && !entry ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : entryError ? (
          <div className="bg-white border border-red-200 rounded-lg p-12 text-center">
            <p className="text-red-600 mb-3">{entryError}</p>
            <button onClick={() => loadEntry()} className="text-sm text-[#B99652] font-semibold underline">
              Retry
            </button>
          </div>
        ) : selectedClassroom && rows.length > 0 ? (
          <div data-tour="results-table" className="bg-white border border-[#ebdcaa]/60 rounded-none shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#fffdf4] border-b border-[#ebdcaa]/60">
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('serial_no')}</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('student_name')}</th>
                    {classSubjects.length > 0 ? (
                      classSubjects.map((subject) => (
                        <th key={subject.id} className="px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-[#1e1b4b] whitespace-nowrap">
                          {subject.name}
                          <span className="block font-medium normal-case text-gray-500">/ {subject.maxMarks}</span>
                        </th>
                      ))
                    ) : (
                      <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Subjects</th>
                    )}
                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('status')}</th>
                    <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const resultStatus = row.result?.overallStatus?.toLowerCase();
                    const custom = hasCustomLayout(row);

                    return (
                      <tr key={row.student.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{row.student.name}</div>
                          <div className="text-xs text-gray-500">{row.student.email}</div>
                        </td>

                        {classSubjects.length === 0 ? (
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {custom && <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 font-medium mr-2">Custom</span>}
                            {resultSummary(row)}
                          </td>
                        ) : custom ? (
                          <td colSpan={classSubjects.length} className="px-4 py-3 text-sm text-gray-600">
                            <button
                              onClick={() => openResultForm(row)}
                              className="text-[#B99652] hover:text-[#a38241] font-semibold"
                            >
                              Custom Subjects • Edit
                            </button>
                            <span className="ml-3">{resultSummary(row)}</span>
                          </td>
                        ) : (
                          classSubjects.map((classSubject) => {
                            const cell = cellFor(row, classSubject);
                            if (!cell) {
                              return (
                                <td key={classSubject.id} className="px-3 py-3 text-center text-sm text-gray-400" title="Removed for this student">
                                  —
                                </td>
                              );
                            }
                            return (
                              <td key={classSubject.id} className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max={cell.total}
                                    value={cell.marks}
                                    onChange={(e) => updateCell(row, classSubject, { marks: e.target.value })}
                                    className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded-none focus:outline-none focus:border-[#B99652]"
                                    aria-label={`${row.student.name} ${classSubject.name} marks`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateCell(row, classSubject, { status: cell.status === "FAIL" ? "PASS" : "FAIL" })}
                                    className={`w-6 h-6 text-[11px] font-bold ${cell.status === "FAIL" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
                                    title={cell.status === "FAIL" ? "Fail — click to mark Pass" : "Pass — click to mark Fail"}
                                  >
                                    {cell.status === "FAIL" ? "F" : "P"}
                                  </button>
                                </div>
                                {cell.total !== Number(classSubject.maxMarks) && (
                                  <span className="block text-[11px] text-amber-700" title="Maximum marks differ from the class default for this student">
                                    / {cell.total}
                                  </span>
                                )}
                              </td>
                            );
                          })
                        )}

                        <td className="px-4 py-3 text-center">
                          {resultStatus === "pass" ? (
                            <span className="bg-green-100 text-green-800 text-xs px-2.5 py-1 rounded-full font-medium">
                              {t('pass')} · {row.result.overallPercentage}%
                            </span>
                          ) : resultStatus === "fail" ? (
                            <span className="bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-full font-medium">
                              {t('fail')} · {row.result.overallPercentage}%
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div data-tour={index === 0 ? 'results-first-action' : undefined} className="flex justify-center gap-2">
                            <button
                              onClick={() => openResultForm(row)}
                              data-tour={index === 0 ? 'results-first-edit' : undefined}
                              className="text-[#B99652] hover:text-[#a38241] p-1 transition-colors"
                              title="Edit result"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setSubjectsStudent(row.student)}
                              className="text-[#1e1b4b] hover:text-[#002366] p-1 transition-colors"
                              title="Edit subjects for this student"
                            >
                              <BookOpen className="w-4 h-4" />
                            </button>
                            {row.result && (
                              <button
                                onClick={() => handleDeleteResult(row.result.id)}
                                className="text-red-600 hover:text-red-700 p-1"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
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

            {classSubjects.length > 0 && (
              <div className="flex justify-between items-center gap-4 flex-wrap px-4 py-3 bg-[#fffdf4] border-t border-[#ebdcaa]/60">
                <p className="text-xs text-gray-600">
                  Type marks straight into the table, then save. P / F marks a subject as Pass or Fail.
                </p>
                <button
                  onClick={handleSaveAll}
                  disabled={savingAll || dirtyCount === 0}
                  className="bg-[#B99652] hover:bg-[#a38241] text-white px-6 py-2 rounded-none font-semibold text-sm shadow-sm transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {savingAll ? "Saving..." : dirtyCount > 0 ? `Save All Results (${dirtyCount})` : "Save All Results"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-500">
              {!selectedClassroom ? t('please_select_classroom') : t('no_students_in_classroom')}
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Result Modal */}
      {resultForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div data-tour="results-edit-form" className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold">
                {editingResult ? t('edit_result') : t('add_result')}
              </h3>
              <button onClick={() => setResultForm(null)}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveResult} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('student')} *
                </label>
                <select
                  value={resultForm.studentId}
                  onChange={(e) => selectFormStudent(e.target.value)}
                  disabled={resultForm.editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required
                >
                  <option value="">{t('student')}</option>
                  {students.map(student => (
                    <option key={student._id || student.id} value={String(student._id || student.id)}>
                      {student.name} ({student.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('term') || "Term"}
                </label>
                <input
                  type="text"
                  value={termName}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                />
              </div>

              {resultForm.studentId && (
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      {t('subjects') || "Subjects"} *
                    </label>
                    {resultForm.hasConfig ? (
                      <button
                        type="button"
                        onClick={() => {
                          const formRow = rows.find((r) => String(r.student.id) === String(resultForm.studentId));
                          if (formRow) setSubjectsStudent(formRow.student);
                        }}
                        className="text-sm text-[#B99652] hover:text-[#a38241] font-medium"
                      >
                        {t('edit_subjects') || "Edit Subjects"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setResultForm((prev) => ({ ...prev, rows: [...prev.rows, blankSubjectRow()] }))}
                        className="text-sm text-[#B99652] hover:text-[#a38241] font-medium"
                      >
                        + {t('add_subject')}
                      </button>
                    )}
                  </div>

                  {!resultForm.hasConfig && (
                    <p className="text-xs text-gray-500 mb-3">
                      No subjects are configured for this student yet. Use Configure Subjects on the results page to
                      set them once for the whole class.
                    </p>
                  )}

                  <div className="space-y-3">
                    {resultForm.rows.map((subject, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                        {subject.locked ? (
                          <div className="flex items-center gap-2">
                            <span className="flex-1 text-sm font-medium text-gray-900">{subject.name}</span>
                            {subject.source === "custom" && (
                              <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 font-medium">Custom</span>
                            )}
                            {subject.source === "override" && (
                              <span className="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 font-medium">Override</span>
                            )}
                            {subject.source === "saved" && (
                              <span className="bg-gray-200 text-gray-700 text-[11px] px-2 py-0.5 font-medium">Saved earlier</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={subject.name}
                              onChange={(e) => updateFormRow(index, 'name', e.target.value)}
                              placeholder={t('subject_name')}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                              required
                            />
                            {resultForm.rows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setResultForm((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }))}
                                className="text-red-600 hover:text-red-700 text-sm font-medium px-2"
                              >
                                {t('remove')}
                              </button>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 items-center">
                          <input
                            type="number"
                            value={subject.marks}
                            onChange={(e) => updateFormRow(index, 'marks', e.target.value)}
                            placeholder={t('marks')}
                            min="0"
                            max={subject.total}
                            className="px-2 py-1 text-sm border border-gray-300 rounded"
                            required={!subject.locked}
                          />
                          {subject.locked ? (
                            <span className="text-sm text-gray-600">out of {subject.total}</span>
                          ) : (
                            <input
                              type="number"
                              value={subject.total}
                              onChange={(e) => updateFormRow(index, 'total', e.target.value)}
                              placeholder={t('total_marks')}
                              min="0"
                              className="px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          )}
                          <select
                            value={subject.status}
                            onChange={(e) => updateFormRow(index, 'status', e.target.value)}
                            className="px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            <option value="PASS">{t('pass')}</option>
                            <option value="FAIL">{t('fail')}</option>
                          </select>
                        </div>

                        {subject.locked && subject.currentMax !== undefined && subject.currentMax !== subject.total && (
                          <button
                            type="button"
                            onClick={() => updateFormRow(index, 'total', subject.currentMax)}
                            className="text-xs text-[#B99652] hover:text-[#a38241] font-medium"
                          >
                            This result was saved out of {subject.total}. Use the current maximum ({subject.currentMax})
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('comments')}
                </label>
                <textarea
                  value={resultForm.comments}
                  onChange={(e) => setResultForm({ ...resultForm, comments: e.target.value })}
                  placeholder={t('optional_comments')}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#B99652] text-sm"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setResultForm(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-none hover:bg-gray-50 transition-colors font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#B99652] text-white rounded-none hover:bg-[#a38241] transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2 font-medium"
                >
                  <Save className="w-4 h-4" />
                  {saving ? t('saving') : t('save_result')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClassSubjects && currentClassroom && (
        <ClassSubjectsModal
          classroom={currentClassroom}
          subjects={classSubjects}
          onClose={() => setShowClassSubjects(false)}
          onSaved={handleSubjectsChanged}
        />
      )}

      {subjectsStudent && (
        <StudentSubjectsModal
          classroomId={selectedClassroom}
          student={subjectsStudent}
          onClose={() => setSubjectsStudent(null)}
          onChanged={handleSubjectsChanged}
        />
      )}
    </MentorLayout>
  );
};

export default ClassResults;
