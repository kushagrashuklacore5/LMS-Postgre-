import { useEffect, useState } from "react";
import axios from "axios";
import ClassSectionCoursePicker from "../components/ClassSectionCoursePicker";
import { API_ORIGIN } from "../config/api";

const CreateEventModal = ({ role, onClose, onSuccess }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [publishFor, setPublishFor] = useState("student");
  const [target, setTarget] = useState({ classroomId: "", courseId: "" }); // class + section, optional course
  const [forCourse, setForCourse] = useState(false);
  const isTeacher = role === "mentor" || role === "teacher";
  const forClass = isTeacher || publishFor === "class"; // admin may also choose one class and section
  // A teacher's "Whole class and section" needs no dropdowns: it goes to all their classes and sections
  const allMyClasses = isTeacher && !forCourse;
  const showPicker = forClass && !allMyClasses;
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  // 🔐 Get token (matches your authMiddleware)
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("unstop_token");

  // ================= SUGGEST NOTIFICATION WORDING =================
  // The server returns a short message only; who is notified is always decided by the server.
  const suggestMessage = async () => {
    if (!title.trim()) {
      alert("Enter the event title first.");
      return;
    }
    setSuggesting(true);
    try {
      const apiUrl = API_ORIGIN;
      const baseUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;
      const res = await axios.post(
        `${baseUrl}/api/announcements/suggest-text`,
        { type: "CALENDAR_EVENT", title, date: startDate ? new Date(startDate).toISOString() : undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotifyMessage(res.data.message || "");
    } catch (error) {
      alert(error.response?.data?.message || "Could not suggest a message. You can type your own.");
    } finally {
      setSuggesting(false);
    }
  };

  // ================= CREATE EVENT =================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      alert("Authentication token missing. Please login again.");
      return;
    }

    if (showPicker && !target.classroomId) {
      alert("Please select a class and section");
      return;
    }
    if (showPicker && forCourse && !target.courseId) {
      alert("Please select a course");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        title,
        description,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      };

      if (allMyClasses) {
        payload.allClasses = true; // the server uses the classes this teacher is assigned to
      } else if (forClass) {
        // The server checks that this user may use the class, section and course
        payload.classroomId = Number(target.classroomId);
        if (forCourse) payload.courseId = Number(target.courseId);
      } else {
        payload.publishFor = publishFor;
      }

      if (notify) {
        payload.notify = true;
        if (notifyMessage.trim()) payload.notifyMessage = notifyMessage.trim();
      }

      const apiUrl = API_ORIGIN;
      // Ensure we don't double the /api prefix
      const baseUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;
      
      const res = await axios.post(
        `${baseUrl}/api/calendar`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      console.log(`✅ Calendar event created:`, res.data);

      // Observed by GuideBot (ActionGuard) only — fires strictly after the
      // create request has succeeded.
      window.dispatchEvent(
        new CustomEvent('guidebot:action-success', { detail: { actionId: 'calendar-event-created' } })
      );

      onSuccess(); // refresh calendar
      onClose();   // close modal
    } catch (error) {
      console.error("CREATE EVENT ERROR:", error.response?.data || error);
      alert(
        error.response?.data?.message ||
          "Failed to create event. Check backend logs."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div data-tour="calendar-create-event-modal" className="bg-white rounded-lg w-full max-w-lg p-6">
        <h2 className="text-xl font-bold mb-4">Create Calendar Event</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* TITLE */}
          <input
            type="text"
            placeholder="Event Title"
            className="w-full border rounded px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          {/* DESCRIPTION */}
          <textarea
            placeholder="Description (optional)"
            className="w-full border rounded px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* DATES */}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />

            <input
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          {/* ADMIN OPTIONS */}
          {role === "admin" && (
            <div>
              <label className="block text-sm font-medium mb-2">Display for:</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={publishFor}
                onChange={(e) => setPublishFor(e.target.value)}
                required
              >
                <option value="student">Students Only</option>
                <option value="faculty">Faculty/Mentors Only</option>
                <option value="both">Both Students & Faculty</option>
                <option value="class">One class and section</option>
              </select>
            </div>
          )}

          {/* CLASS -> SECTION -> OPTIONAL COURSE (teachers always; admin when chosen above) */}
          {forClass && (
            <div>
              <div className="flex gap-4 mb-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!forCourse} onChange={() => { setForCourse(false); setTarget((t) => ({ classroomId: isTeacher ? "" : t.classroomId, courseId: "" })); }} />
                  Whole class and section
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={forCourse} onChange={() => setForCourse(true)} />
                  One course
                </label>
              </div>
              {showPicker ? (
                <ClassSectionCoursePicker value={target} onChange={setTarget} courseMode={forCourse ? "required" : "none"} />
              ) : (
                <p className="text-xs text-gray-500">This event goes to all the classes and sections you are assigned to.</p>
              )}
            </div>
          )}

          {/* NOTIFY PARTICIPANTS */}
          <div className="border border-[#ebdcaa] bg-[#fffdf4] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[#B99652]"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                data-testid="calendar-notify"
              />
              Notify participants
            </label>

            {notify && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  {!forClass
                    ? "Everyone this event is displayed for gets a notification."
                    : forCourse
                      ? "Students enrolled in the selected course get a notification."
                      : allMyClasses
                        ? "Students of all your classes and sections get a notification."
                        : "Students of the selected class and section get a notification."}
                </p>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  maxLength={180}
                  placeholder="Notification message (leave empty to use the standard message)"
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  data-testid="calendar-notify-message"
                />
                <button
                  type="button"
                  onClick={suggestMessage}
                  disabled={suggesting}
                  className="text-xs font-semibold text-[#B99652] hover:text-[#a38241] disabled:opacity-60"
                >
                  {suggesting ? "Suggesting..." : "Suggest a message"}
                </button>
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-none bg-gray-200 text-gray-700 font-semibold text-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-none bg-[#B99652] hover:bg-[#a38241] text-white font-semibold text-xs shadow-sm transition"
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventModal;
