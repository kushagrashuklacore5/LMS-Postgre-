import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";

const labelClass = "block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5";
const selectClass =
  "w-full bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] disabled:bg-gray-100 disabled:text-gray-400";

const sortClasses = (a, b) => {
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  return String(a).localeCompare(String(b));
};

/**
 * Class + Section dropdowns backed by the existing classrooms of the admin's
 * university. A classroom is a class (grade) + section, so choosing both
 * resolves to exactly one classroom id.
 *
 * value: { className, section, classroomId }
 */
const ClassSectionSelect = ({ value, onChange }) => {
  const { API, token } = useAuth();
  const { t } = useTranslation();

  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ grade: "", section: "" });
  const [creating, setCreating] = useState(false);

  const loadClassrooms = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API}/classrooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || t("failed_to_load_classes"));
      const list = data?.data || data;
      setClassrooms(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      setError(err.message || t("failed_to_load_classes"));
      setClassrooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
  }, [API, token]);

  /* Create the class + section here (admins may create classrooms), then select it. */
  const createClassroom = async () => {
    const grade = draft.grade.trim();
    const section = draft.section.trim();
    if (!grade) return toast.error(t("class_required"));
    if (!section) return toast.error(t("section_required"));

    try {
      setCreating(true);
      const res = await fetch(`${API}/classrooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ grade, section }),
      });
      const data = await res.json().catch(() => ({}));

      // 409 = that class and section already exists: just select it
      const created = res.status === 409 ? data.classroom : data?.data?.classroom;
      if (!created || (!res.ok && res.status !== 409)) {
        throw new Error(data.message || t("failed_to_create_class"));
      }

      await loadClassrooms();
      onChange({ className: String(created.grade), section: created.section || "", classroomId: String(created.id) });
      toast[res.status === 409 ? "info" : "success"](res.status === 409 ? data.message : `${created.name} ${t("class_created")}`);
      setShowCreate(false);
      setDraft({ grade: "", section: "" });
    } catch (err) {
      toast.error(err.message || t("failed_to_create_class"));
    } finally {
      setCreating(false);
    }
  };

  const classLabel = (name) => (/^\d+$/.test(String(name)) ? `Grade ${name}` : String(name));

  const renderCreatePanel = () => (
    <div className="md:col-span-2">
      {showCreate ? (
        <div className="border border-[#ebdcaa] bg-white p-3 space-y-3" data-testid="create-class-panel">
          <p className="text-xs text-gray-600">{t("create_class_hint")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t("class")}</label>
              <input
                list="existing-classes"
                className={selectClass}
                placeholder="e.g. 9 or BSc"
                maxLength={50}
                value={draft.grade}
                onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
                data-testid="create-class-name"
              />
              <datalist id="existing-classes">
                {classNames.map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            <div>
              <label className={labelClass}>{t("section")}</label>
              <input
                className={selectClass}
                placeholder="e.g. A"
                maxLength={50}
                value={draft.section}
                onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                data-testid="create-class-section"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createClassroom}
              disabled={creating}
              className="bg-[#B99652] hover:bg-[#a38241] text-white px-4 py-2 rounded-none font-semibold text-xs disabled:opacity-50"
              data-testid="create-class-submit"
            >
              {creating ? t("saving") : t("create_class")}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[#ebdcaa] text-xs font-semibold text-gray-700">
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft({ grade: value.className || "", section: "" }); setShowCreate(true); }}
          className="text-xs font-semibold text-[#B99652] hover:text-[#a38241]"
          data-testid="create-class-open"
        >
          {t("class_not_listed")}
        </button>
      )}
    </div>
  );

  const classNames = useMemo(
    () => [...new Set(classrooms.map((c) => String(c.grade)))].sort(sortClasses),
    [classrooms]
  );

  const sections = useMemo(
    () =>
      classrooms
        .filter((c) => String(c.grade) === String(value.className))
        .sort((a, b) => String(a.section || "").localeCompare(String(b.section || ""))),
    [classrooms, value.className]
  );

  // Two classrooms can share the same class + section; show which one is which
  const sectionLabel = (classroom) => {
    const name = classroom.section || t("no_section");
    const duplicates = sections.filter((c) => String(c.section || "") === String(classroom.section || ""));
    return duplicates.length > 1 ? `${name} (${classroom.name} #${classroom.id})` : name;
  };

  const handleClassChange = (className) => {
    const options = classrooms.filter((c) => String(c.grade) === String(className));
    // A class with a single classroom needs no extra click
    if (options.length === 1) {
      onChange({ className, section: options[0].section || "", classroomId: String(options[0].id) });
    } else {
      onChange({ className, section: "", classroomId: "" });
    }
  };

  const handleSectionChange = (classroomId) => {
    const classroom = sections.find((c) => String(c.id) === String(classroomId));
    onChange({
      className: value.className,
      section: classroom?.section || "",
      classroomId: classroom ? String(classroom.id) : "",
    });
  };

  if (error) {
    return (
      <div className="md:col-span-2 border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
        <span>{error}</span>
        <button type="button" onClick={loadClassrooms} className="font-semibold underline">
          {t("retry")}
        </button>
      </div>
    );
  }

  if (!loading && classNames.length === 0) {
    return (
      <>
        <div className="md:col-span-2 border border-[#ebdcaa] bg-white px-3.5 py-3 text-sm text-gray-600">
          {t("no_classes_available")}
        </div>
        {renderCreatePanel()}
      </>
    );
  }

  return (
    <>
      <div>
        <label className={labelClass}>
          {t("class")} <span className="text-red-500">*</span>
        </label>
        <select
          name="className"
          data-tour="select-student-class"
          value={value.className}
          onChange={(e) => handleClassChange(e.target.value)}
          disabled={loading}
          className={selectClass}
        >
          <option value="">{loading ? t("loading_classes") : t("select_class")}</option>
          {classNames.map((name) => (
            <option key={name} value={name}>
              {classLabel(name)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>
          {t("section")} <span className="text-red-500">*</span>
        </label>
        <select
          name="section"
          data-tour="select-student-section"
          value={value.classroomId}
          onChange={(e) => handleSectionChange(e.target.value)}
          disabled={loading || !value.className || sections.length === 0}
          className={selectClass}
        >
          <option value="">{value.className ? t("select_section") : t("select_class_first")}</option>
          {sections.map((classroom) => (
            <option key={classroom.id} value={String(classroom.id)}>
              {sectionLabel(classroom)}
            </option>
          ))}
        </select>
        {value.className && !loading && sections.length === 0 && (
          <p className="mt-1.5 text-xs text-red-600">{t("no_sections_for_class")}</p>
        )}
      </div>
      {renderCreatePanel()}
    </>
  );
};

export default ClassSectionSelect;
