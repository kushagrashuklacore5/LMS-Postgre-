import { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useAuth } from "../../auth/auth";
import { toast } from "react-toastify";
import { resultsRequest, subjectKey, isValidMaxMarks, MAX_MARKS_LIMIT } from "./resultSubjectsApi";

const inputClass =
  "px-3 py-2 text-sm bg-white border border-[#ebdcaa]/80 rounded-none focus:outline-none focus:ring-2 focus:ring-[#002366]/30 focus:border-[#002366]";

/**
 * Configure the subjects (and their maximum marks) of a class/section once.
 * Every student of the classroom inherits this list for result entry.
 */
const ClassSubjectsModal = ({ classroom, subjects, onClose, onSaved }) => {
  const { API, token } = useAuth();
  const [rows, setRows] = useState(
    subjects.length > 0
      ? subjects.map((s) => ({ id: s.id, name: s.name, maxMarks: String(s.maxMarks) }))
      : [{ id: null, name: "", maxMarks: "100" }]
  );
  const [saving, setSaving] = useState(false);

  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const save = async () => {
    const filled = rows.filter((row) => row.name.trim() !== "" || row.id);

    const seen = new Set();
    for (const row of filled) {
      if (!row.name.trim()) return toast.error("Subject name is required");
      const key = subjectKey(row.name);
      if (seen.has(key)) return toast.error(`Duplicate subject: ${row.name.trim()}`);
      seen.add(key);
      if (!isValidMaxMarks(row.maxMarks)) {
        return toast.error(`Maximum marks for ${row.name.trim()} must be between 1 and ${MAX_MARKS_LIMIT}`);
      }
    }

    try {
      setSaving(true);
      await resultsRequest(API, token, `/subjects/classroom/${classroom.id}`, {
        method: "PUT",
        body: {
          subjects: filled.map((row) => ({
            id: row.id || undefined,
            name: row.name.trim(),
            maxMarks: Number(row.maxMarks),
          })),
        },
      });
      toast.success("Class subjects saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to save class subjects");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-[#1e1b4b]">Class Subjects</h3>
            <p className="text-sm text-gray-600">{classroom.name}</p>
          </div>
          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-gray-600">
            Set the subjects and maximum marks once. Every student in this class gets them automatically when you
            enter results.
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
              <span className="col-span-7">Subject</span>
              <span className="col-span-4">Max Marks</span>
            </div>

            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(index, "name", e.target.value)}
                  placeholder="Subject name"
                  className={`col-span-7 ${inputClass}`}
                />
                <input
                  type="number"
                  min="1"
                  max={MAX_MARKS_LIMIT}
                  value={row.maxMarks}
                  onChange={(e) => updateRow(index, "maxMarks", e.target.value)}
                  placeholder="100"
                  className={`col-span-4 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-1 flex justify-center text-red-600 hover:text-red-700"
                  title="Remove subject"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { id: null, name: "", maxMarks: "100" }])}
            className="text-sm text-[#B99652] hover:text-[#a38241] font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add Subject
          </button>

          <p className="text-xs text-gray-500">
            Changes apply to results you enter from now on. Results that are already saved keep the subjects and
            maximum marks they were saved with.
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-none hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-[#B99652] text-white rounded-none hover:bg-[#a38241] transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2 font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Subjects"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassSubjectsModal;
