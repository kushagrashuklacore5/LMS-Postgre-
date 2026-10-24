import axios from "axios";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { API_ORIGIN } from "../config/api";

const EditEventModal = ({ event, role, onClose, onRefresh }) => {
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(event.startStr);
  const [end, setEnd] = useState(event.endStr);
  const [loading, setLoading] = useState(false);

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("unstop_token");

const apiUrl = API_ORIGIN;

  const canModify =
    role === event.extendedProps.createdByRole;

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await axios.put(
        `${apiUrl}/api/calendar/${event.id}`,
        {
          title,
          startDate: new Date(start).toISOString(),
          endDate: new Date(end).toISOString(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      onRefresh();
      onClose();
    } catch (error) {
      alert("Update failed: " + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this event? This will remove it from all calendars.")) return;

    setLoading(true);
    try {
      await axios.delete(
        `${apiUrl}/api/calendar/${event.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      onRefresh();
      onClose();
    } catch (error) {
      alert("Delete failed: " + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">Event Details</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Event Title
            </label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canModify}
            />
          </div>

          {/* Start Date Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date & Time
            </label>
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={!canModify}
            />
          </div>

          {/* End Date Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date & Time
            </label>
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={!canModify}
            />
          </div>

          {/* Info message */}
          {!canModify && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              You cannot modify this event as you didn't create it.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50 rounded-b-lg">
          {/* Delete Button */}
          {canModify && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 size={18} />
              Delete Event
            </button>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-none text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold"
            >
              Close
            </button>
            {canModify && (
              <button
                onClick={handleUpdate}
                disabled={loading}
                className="px-5 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold shadow-sm"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditEventModal;
