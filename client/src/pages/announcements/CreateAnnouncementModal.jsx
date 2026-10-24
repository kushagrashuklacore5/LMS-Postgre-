import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../../auth/auth";

const CreateAnnouncementModal = ({ open, onClose, courses = [], onSuccess }) => {
  const { user, token, API } = useAuth();

  const [form, setForm] = useState({
    title: "",
    message: "",
    publishFor: "student",
    courseId: "",
  });

  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!form.title || !form.message) {
      return toast.error("Title and message are required");
    }

    if (user.role === "mentor" && !form.courseId) {
      return toast.error("Please select a course");
    }

    try {
      setLoading(true);

      await fetch(`${API}/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          publishFor: user.role === "admin" ? form.publishFor : undefined,
          courseId: user.role === "mentor" ? form.courseId : undefined,
        }),
      });

      toast.success("Announcement published");
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Failed to publish announcement");
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
            <option value="student">Students</option>
            <option value="faculty">Faculty</option>
            <option value="both">Both</option>
          </select>
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
