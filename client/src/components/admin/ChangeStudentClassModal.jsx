import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import ClassSectionSelect from "./ClassSectionSelect";

const emptySelection = { className: "", section: "", classroomId: "" };

const ChangeStudentClassModal = ({ open, student, onClose, onSuccess }) => {
  const { API, token } = useAuth();
  const { t } = useTranslation();

  const [current, setCurrent] = useState([]);
  const [fromClassroomId, setFromClassroomId] = useState("");
  const [selection, setSelection] = useState(emptySelection);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !student) return;

    const loadCurrent = async () => {
      try {
        setLoading(true);
        setError("");
        setSelection(emptySelection);
        const res = await fetch(`${API}/admin/students/${student.id}/classrooms`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || t("failed_to_load_classes"));
        const classrooms = data?.data?.classrooms || [];
        setCurrent(classrooms);
        setFromClassroomId(classrooms.length === 1 ? String(classrooms[0].id) : "");
      } catch (err) {
        setError(err.message || t("failed_to_load_classes"));
        setCurrent([]);
      } finally {
        setLoading(false);
      }
    };

    loadCurrent();
  }, [open, student, API, token]);

  if (!open || !student) return null;

  const submit = async () => {
    if (!selection.className) return toast.error(t("class_required"));
    if (!selection.classroomId) return toast.error(t("section_required"));
    if (current.length > 1 && !fromClassroomId) return toast.error(t("select_classroom_to_change"));

    try {
      setSaving(true);
      const res = await fetch(`${API}/admin/students/${student.id}/classroom`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroomId: Number(selection.classroomId),
          className: selection.className,
          section: selection.section,
          fromClassroomId: fromClassroomId ? Number(fromClassroomId) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || t("failed_to_update_class"));

      toast.success(data.message || t("student_class_updated"));
      onSuccess?.(data);
      onClose();
    } catch (err) {
      toast.error(err.message || t("failed_to_update_class"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-[#ebdcaa]">
          <h2 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">
            {t("change_class")}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1e1b4b]">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-700">
          <span className="font-semibold text-[#1e1b4b]">{student.name}</span>
          <span className="text-gray-500"> · {student.email}</span>
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">{t("loading")}</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="text-sm">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                {t("current_class")}
              </p>
              {current.length === 0 ? (
                <p className="text-gray-500">{t("not_in_any_class")}</p>
              ) : current.length === 1 ? (
                <p className="text-[#1e1b4b] font-medium">{current[0].name}</p>
              ) : (
                <select
                  value={fromClassroomId}
                  onChange={(e) => setFromClassroomId(e.target.value)}
                  className="w-full bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
                >
                  <option value="">{t("select_classroom_to_change")}</option>
                  {current.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ClassSectionSelect value={selection} onChange={setSelection} />
            </div>

            <p className="text-xs text-gray-500">{t("class_change_history_note")}</p>

            <button
              onClick={submit}
              disabled={saving}
              className="w-full bg-[#B99652] hover:bg-[#a38241] text-white py-2.5 rounded-none font-semibold text-sm shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? t("saving") : t("update_class")}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ChangeStudentClassModal;
