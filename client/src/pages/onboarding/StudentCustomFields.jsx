import { useEffect, useState } from "react";
import axios from "axios";
import { ClipboardList, Loader2 } from "lucide-react";
import { useAuth } from "../../auth/auth";

/*
 * Custom student fields (Student Onboarding Agent, migration 003). Values are plain text rendered by React
 * (escaped), never HTML. The SERVER decides who may read what:
 *   admin   GET /api/onboarding/students/lms-student:<studentId>/custom-fields  (own school only, else 404)
 *   student GET /api/onboarding/me/custom-fields                               (own values only)
 * Retired fields still show their stored value (historical data), marked "retired".
 */

const show = (f) => (f.dataType === "boolean" ? (f.value === "true" ? "Yes" : f.value === "false" ? "No" : f.value) : f.value);

/** Admin: one student's custom fields, loaded only when the admin opens them. */
export function AdminStudentCustomFields({ studentId }) {
  const { token, API } = useAuth();
  const [state, setState] = useState({ status: "loading", fields: [] });
  useEffect(() => {
    let alive = true;
    axios.get(`${API}/onboarding/students/${encodeURIComponent(`lms-student:${studentId}`)}/custom-fields`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (alive) setState({ status: "ok", fields: r.data.customFields || [] }); })
      .catch((err) => { if (alive) setState({ status: err?.response?.status === 503 ? "unavailable" : "error", fields: [] }); });
    return () => { alive = false; };
  }, [API, token, studentId]);

  if (state.status === "loading") return <span className="text-xs text-gray-500 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading…</span>;
  if (state.status === "unavailable") return <span className="text-xs text-gray-500">Custom fields are not available yet.</span>;
  if (state.status === "error") return <span className="text-xs text-red-600">Custom fields could not be loaded.</span>;
  if (state.fields.length === 0) return <span className="text-xs text-gray-500">No custom field values.</span>;
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs" data-testid="admin-student-custom-fields">
      {state.fields.map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-gray-500">{f.label}{f.retired ? " (retired)" : ""}</dt>
          <dd className="text-gray-800 break-words">{show(f) ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Student dashboard: "My details" from the student's own custom fields; renders nothing when there are none. */
export function MyCustomFields() {
  const { token, API } = useAuth();
  const [fields, setFields] = useState([]);
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    axios.get(`${API}/onboarding/me/custom-fields`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (alive) setFields((r.data.customFields || []).filter((f) => f.value !== null && f.value !== "")); })
      .catch(() => { if (alive) setFields([]); }); // unavailable: show nothing
    return () => { alive = false; };
  }, [API, token]);
  if (fields.length === 0) return null;
  return (
    <div className="sd-panel" data-testid="student-custom-fields">
      <div className="sd-panel__head">
        <h2><ClipboardList size={15} strokeWidth={1.8} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />My details</h2>
      </div>
      <ul className="sd-mini-list">
        {fields.map((f) => (
          <li key={f.key}>
            <p className="sd-mini-list__title">{f.label}</p>
            <p className="sd-announcement__preview">{show(f)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
