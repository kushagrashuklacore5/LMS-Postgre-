import { useEffect, useState } from "react";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useAuth } from "../../auth/auth";
import { toast } from "react-toastify";
import { resultsRequest, isValidMaxMarks, MAX_MARKS_LIMIT } from "./resultSubjectsApi";

const inputClass =
  "px-3 py-2 text-sm bg-white border border-[#ebdcaa]/80 rounded-none focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366]";

const SourceBadge = ({ source }) => {
  if (source === "custom") {
    return <span className="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 font-medium">Custom</span>;
  }
  if (source === "override") {
    return <span className="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 font-medium">Override</span>;
  }
  return null;
};

/**
 * Subjects of ONE student in a classroom. The student inherits the class
 * subjects; everything changed here applies to this student only.
 */
const StudentSubjectsModal = ({ classroomId, student, onClose, onChanged }) => {
  const { API, token } = useAuth();
  const base = `/subjects/classroom/${classroomId}/student/${student.id}`;

  const [config, setConfig] = useState(null);
  const [maxDrafts, setMaxDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: "", maxMarks: "100" });
  const [confirmReplace, setConfirmReplace] = useState(false);

  const applyConfig = (data) => {
    setConfig(data);
    setMaxDrafts({});
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        applyConfig(await resultsRequest(API, token, base));
      } catch (err) {
        setError(err.message || "Failed to load subjects");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [API, token, base]);

  // Runs one change, refreshes this modal and tells the results page to reload
  const change = async (request, successMessage) => {
    try {
      setBusy(true);
      applyConfig(await request());
      onChanged();
      if (successMessage) toast.success(successMessage);
      return true;
    } catch (err) {
      toast.error(err.message || "Failed to update subjects");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selectorOf = (subject) =>
    subject.classSubjectId ? { classSubjectId: subject.classSubjectId } : { name: subject.name };

  const saveMaxMarks = (subject) => {
    const draft = maxDrafts[subject.name];
    if (draft === undefined || Number(draft) === Number(subject.maxMarks)) return;
    if (!isValidMaxMarks(draft)) {
      toast.error(`Maximum marks must be between 1 and ${MAX_MARKS_LIMIT}`);
      setMaxDrafts((prev) => ({ ...prev, [subject.name]: undefined }));
      return;
    }
    change(
      () =>
        resultsRequest(API, token, `${base}/max-marks`, {
          method: "PUT",
          body: { ...selectorOf(subject), maxMarks: Number(draft) },
        }),
      `Maximum marks for ${subject.name} updated for ${student.name}`
    );
  };

  const removeSubject = (subject) =>
    change(
      () => resultsRequest(API, token, `${base}/subjects`, { method: "DELETE", body: selectorOf(subject) }),
      `${subject.name} removed for ${student.name}`
    );

  const restoreSubject = (classSubjectId, message) =>
    change(
      () => resultsRequest(API, token, `${base}/restore-defaults`, { method: "POST", body: { classSubjectId } }),
      message
    );

  const addSubject = async () => {
    if (!newSubject.name.trim()) return toast.error("Subject name is required");
    if (!isValidMaxMarks(newSubject.maxMarks)) {
      return toast.error(`Maximum marks must be between 1 and ${MAX_MARKS_LIMIT}`);
    }
    const added = await change(
      () =>
        resultsRequest(API, token, `${base}/subjects`, {
          method: "POST",
          body: { name: newSubject.name.trim(), maxMarks: Number(newSubject.maxMarks) },
        }),
      `${newSubject.name.trim()} added for ${student.name}`
    );
    if (added) setNewSubject({ name: "", maxMarks: "100" });
  };

  const replaceAll = async () => {
    const replaced = await change(
      () =>
        resultsRequest(API, token, `${base}/replace-all`, {
          method: "PUT",
          body: { confirm: true, subjects: [] },
        }),
      `${student.name} now uses custom subjects. Add them below.`
    );
    if (replaced) setConfirmReplace(false);
  };

  const useClassDefaults = () => {
    if (!window.confirm(`Remove all custom subject changes for ${student.name} and use the class subjects again?`)) {
      return;
    }
    change(
      () => resultsRequest(API, token, `${base}/restore-defaults`, { method: "POST", body: {} }),
      `${student.name} now uses the class subjects`
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-none max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-[#1e1b4b]">Edit Subjects</h3>
            <p className="text-sm text-gray-600">
              {student.name}
              {config && (
                <span className="text-gray-400">
                  {" "}
                  · {config.mode === "custom" ? "Custom subjects" : "Uses class subjects"}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading subjects...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Changes here apply to this student only. The class subjects stay the same for everyone else.
              </p>

              {/* Current subjects */}
              <div className="space-y-2">
                {config.subjects.length === 0 && (
                  <p className="text-sm text-gray-500 border border-dashed border-gray-300 p-3">
                    No subjects yet. Add the subjects for this student below.
                  </p>
                )}

                {config.subjects.map((subject) => (
                  <div key={subject.name} className="flex items-center gap-2 border border-gray-200 bg-gray-50 p-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{subject.name}</span>
                        <SourceBadge source={subject.source} />
                      </div>
                      {subject.source === "override" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            restoreSubject(subject.classSubjectId, `${subject.name} uses the class maximum marks again`)
                          }
                          className="text-xs text-[#B99652] hover:text-[#a38241] font-medium"
                        >
                          Reset to class default ({subject.defaultMaxMarks})
                        </button>
                      )}
                    </div>

                    <label className="text-xs text-gray-500">Max</label>
                    <input
                      type="number"
                      min="1"
                      max={MAX_MARKS_LIMIT}
                      disabled={busy}
                      value={maxDrafts[subject.name] ?? String(subject.maxMarks)}
                      onChange={(e) => setMaxDrafts((prev) => ({ ...prev, [subject.name]: e.target.value }))}
                      onBlur={() => saveMaxMarks(subject)}
                      onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                      className={`w-20 ${inputClass}`}
                      title="Maximum marks for this student"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeSubject(subject)}
                      className="text-red-600 hover:text-red-700 p-1"
                      title={`Remove ${subject.name} for this student`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Class subjects removed for this student */}
              {config.removed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Removed for this student</p>
                  {config.removed.map((subject) => (
                    <div
                      key={subject.classSubjectId}
                      className="flex items-center justify-between border border-dashed border-gray-300 p-2.5"
                    >
                      <span className="text-sm text-gray-500 line-through">{subject.name}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => restoreSubject(subject.classSubjectId, `${subject.name} restored for ${student.name}`)}
                        className="text-xs text-[#B99652] hover:text-[#a38241] font-medium flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add a subject for this student */}
              <div className="border-t pt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">Add Subject</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubject.name}
                    onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                    placeholder="Subject name"
                    className={`flex-1 min-w-0 ${inputClass}`}
                  />
                  <input
                    type="number"
                    min="1"
                    max={MAX_MARKS_LIMIT}
                    value={newSubject.maxMarks}
                    onChange={(e) => setNewSubject({ ...newSubject, maxMarks: e.target.value })}
                    placeholder="Max"
                    className={`w-20 ${inputClass}`}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={addSubject}
                    className="px-3 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-sm font-medium flex items-center gap-1 disabled:bg-gray-400"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>

              {/* Replace all / back to class defaults */}
              <div className="border-t pt-4 space-y-3">
                {confirmReplace ? (
                  <div className="border border-red-200 bg-red-50 p-3 space-y-3">
                    <p className="text-sm text-red-800">
                      Replace all subjects for <strong>{student.name}</strong>? Every subject currently listed will be
                      removed for this student only, and you can then add the student&apos;s own subjects. The class
                      subjects and results that are already saved are not changed.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmReplace(false)}
                        className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-none text-sm font-medium bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={replaceAll}
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-none text-sm font-medium disabled:bg-gray-400"
                      >
                        Replace All Subjects
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmReplace(true)}
                      className="px-3 py-2 border border-red-300 text-red-700 hover:bg-red-50 rounded-none text-sm font-medium"
                    >
                      Replace All Subjects
                    </button>
                    {config.customized && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={useClassDefaults}
                        className="px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-none text-sm font-medium flex items-center gap-1"
                      >
                        <RotateCcw className="w-4 h-4" /> Use Class Defaults
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 bg-[#B99652] text-white rounded-none hover:bg-[#a38241] transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentSubjectsModal;
