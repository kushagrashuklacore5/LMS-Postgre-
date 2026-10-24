import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../../auth/auth";
import ClassSectionCoursePicker from "../ClassSectionCoursePicker";

const CreateAnnouncementModal = ({
  open,
  onClose,
  courses = [],
  onSuccess,
  onQuotaExceeded,
}) => {
  const { user, token, API } = useAuth();
  const isTeacher = user?.role === "mentor" || user?.role === "teacher";
  const [target, setTarget] = useState({ classroomId: "", courseId: "" });
  const [forCourse, setForCourse] = useState(false); // false = all of this teacher's classes and sections

  const [form, setForm] = useState({
    title: "",
    message: "",
    publishFor: "students",
    courseId: "",
  });

  const [loading, setLoading] = useState(false);

  if (!open) return null;

  /* ================= HANDLE INPUT ================= */
  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      return toast.error("Title and message are required");
    }

    // Class and section are chosen only for a course announcement
    if (isTeacher && forCourse && !target.classroomId) {
      return toast.error("Please select a class and section");
    }
    if (isTeacher && forCourse && !target.courseId) {
      return toast.error("Please select a course");
    }

    try {
      setLoading(true);

      // 🔒 FOR MENTORS: CHECK ANNOUNCEMENT LIMIT ON FREE PLAN
      if (user.role === "mentor") {
        try {
          const featureRes = await fetch(`${API}/subscriptions/check-feature-access`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (featureRes.ok) {
            const featureData = await featureRes.json();
            const maxAnnouncements = featureData?.features?.announcements?.max || 0;

            // If on free plan, check announcement count
            if (featureData.currentPlan === 'free' && maxAnnouncements > 0) {
              const announcementRes = await fetch(`${API}/announcements`, {
                headers: { Authorization: `Bearer ${token}` }
              });

              if (announcementRes.ok) {
                const allAnnouncements = await announcementRes.json();

                // Count only announcements created by this mentor
                const mentorAnnouncements = allAnnouncements.filter(
                  ann => ann.createdByRole === 'mentor'
                );

                const currentCount = mentorAnnouncements.length;

                // Check if limit is reached
                if (currentCount >= maxAnnouncements) {
                  onQuotaExceeded?.({
                    type: 'quota',
                    resourceType: 'announcements',
                    currentUsage: currentCount,
                    limit: maxAnnouncements,
                    message: `Your account is on the Free plan — upgrade to post more than ${maxAnnouncements} announcement(s).`
                  });
                  return;
                }
              }
            }
          }
        } catch (err) {
          console.error('Feature check error:', err);
        }
      }

      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
      };

      // ADMIN PAYLOAD
      if (user.role === "admin") {
        payload.publishFor = form.publishFor;
      }

      // MENTOR PAYLOAD
      if (isTeacher) {
        if (forCourse) {
          payload.classroomId = Number(target.classroomId);
          payload.courseId = Number(target.courseId);
        } else {
          payload.allClasses = true; // the server sends it to every class and section this teacher is assigned to
        }
      }

      const res = await fetch(`${API}/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(failure.message || "Failed to publish announcement");
      }

      toast.success("Announcement published");

      // RESET FORM
      setForm({
        title: "",
        message: "",
        publishFor: "students",
        courseId: "",
      });
      setTarget({ classroomId: "", courseId: "" });
      setForCourse(false);

      onSuccess?.(); // 🔔 refresh bell instantly
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to publish announcement");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-5">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Announcement</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* TITLE */}
        <input
          type="text"
          name="title"
          placeholder="Announcement title"
          className="w-full border rounded px-3 py-2 mb-3"
          value={form.title}
          onChange={handleChange}
        />

        {/* MESSAGE */}
        <textarea
          name="message"
          placeholder="Write announcement..."
          rows={4}
          className="w-full border rounded px-3 py-2 mb-3"
          value={form.message}
          onChange={handleChange}
        />

        {/* ADMIN OPTIONS */}
        {user.role === "admin" && (
          <select
              name="publishFor"
              value={form.publishFor}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 mb-3"
            >
              <option value="students">Students</option>
              <option value="mentors">Faculty</option>
              <option value="both">Both</option>
            </select>
        )}

        {/* MENTOR OPTIONS: class -> section -> optional course (only what this teacher is assigned to) */}
        {isTeacher && (
          <>
            <div className="flex gap-4 mb-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={!forCourse} onChange={() => { setForCourse(false); setTarget({ classroomId: "", courseId: "" }); }} />
                Whole class and section
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={forCourse} onChange={() => setForCourse(true)} />
                One course
              </label>
            </div>
            {forCourse ? (
              <ClassSectionCoursePicker value={target} onChange={setTarget} courseMode="required" />
            ) : (
              <p className="text-xs text-gray-500 mb-3">This goes to all the classes and sections you are assigned to.</p>
            )}
          </>
        )}

        {/* ACTIONS */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-primary text-white rounded"
          >
            {loading ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateAnnouncementModal;
