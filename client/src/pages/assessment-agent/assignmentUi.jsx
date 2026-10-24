import axios from "axios";
import { useTranslation } from "../../context/TranslationContext";

/*
 * AI Assessment Agent - Descriptive Assignments: small shared UI helpers (badges, dates, sizes,
 * safe download). Used only by the assignment pages.
 */

export const ASSIGNMENT_STATUS = {
  draft: ["Draft", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
  published: ["Published", "bg-emerald-50 text-emerald-700 border border-emerald-200"],
  closed: ["Closed", "bg-slate-100 text-slate-700 border border-slate-300"],
};

/** Per-student submission status (server-computed). */
export const SUBMISSION_STATUS = {
  not_submitted: ["Not submitted", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
  submitted: ["Submitted — awaiting evaluation", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"],
  evaluated: ["Evaluated", "bg-emerald-50 text-emerald-700 border border-emerald-200"],
  missed: ["Missed", "bg-rose-50 text-rose-700 border border-rose-200"],
};
export const STUDENT_STATUS = { ...SUBMISSION_STATUS, submitted: ["Submitted · awaiting evaluation", "bg-[#fff8e7] text-[#92400e] border border-[#fde68a]"] };

/** The teacher's assignment workflow, shown on the list and in the editor. */
export const TEACHER_FLOW = ["Draft", "Publish", "Submissions", "AI evaluation", "Review", "Final marks"];

/** Translation keys for the status labels above; unknown labels render as-is. */
const BADGE_LABEL_KEYS = {
  Draft: "dashboard:asg_status_draft",
  Published: "dashboard:asg_status_published",
  Closed: "dashboard:st_closed",
  "Not submitted": "dashboard:asg_status_not_submitted",
  "Submitted — awaiting evaluation": "dashboard:asg_status_awaiting_evaluation",
  "Submitted · awaiting evaluation": "dashboard:asg_status_awaiting_evaluation_student",
  Evaluated: "dashboard:asg_status_evaluated",
  Missed: "dashboard:asg_status_missed",
};

export function Badge({ map, value, testId }) {
  const { t } = useTranslation();
  const [label, cls] = map[value] || [value, "bg-[#fffdf4] text-[#665e4d] border border-[#ebdcaa]"];
  const text = BADGE_LABEL_KEYS[label] ? t(BADGE_LABEL_KEYS[label]) : label;
  return <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-none whitespace-nowrap ${cls}`} data-testid={testId} data-status={value}>{text}</span>;
}

/**
 * Horizontal workflow tracker. `current` = index of the active step (earlier steps show as done);
 * `optional` step indexes are labelled as such. Purely visual.
 */
export function Stepper({ steps, current = -1, optional = [], testId }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" data-testid={testId}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-none px-2.5 py-1 font-bold text-[11px] border transition-all ${
              active
                ? "bg-[#B99652] text-white border-[#9b7b3e] shadow-xs"
                : done
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-white text-[#7a705a] border-[#ebdcaa]"
            }`}>
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded-none text-[10px] font-bold ${
                active ? "bg-white/25 text-white" : done ? "bg-emerald-600 text-white" : "bg-[#fffdf4] text-[#7a705a]"
              }`}>
                {done ? "✓" : i + 1}
              </span>
              <span>{label}</span>
              {optional.includes(i) && <span className="font-normal opacity-75 text-[10px]">(optional)</span>}
            </span>
            {i < steps.length - 1 && <span className="text-[#ebdcaa] font-bold" aria-hidden>→</span>}
          </li>
        );
      })}
    </ol>
  );
}

export const fmtDateTime =(iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** Due-date wording relative to now ("Due in 3 days", "Overdue"). Display only; the server decides. */
/** Pass the translator `t` to get localized text; without it the English text is returned. */
export function dueText(iso, t) {
  if (!iso) return t ? t("dashboard:asg_no_due_date") : "No due date";
  const ms = Date.parse(iso) - Date.now();
  const when = fmtDateTime(iso);
  if (ms <= 0) return t ? t("dashboard:asg_was_due", { when }) : `Was due ${when}`;
  const days = Math.floor(ms / 86400000);
  if (days >= 2) return t ? t("dashboard:asg_due_in_days", { n: days, when }) : `Due in ${days} days · ${when}`;
  const hours = Math.max(1, Math.floor(ms / 3600000));
  if (t) return t(hours === 1 ? "dashboard:asg_due_in_hour" : "dashboard:asg_due_in_hours", { n: hours, when });
  return `Due in ${hours} hour${hours === 1 ? "" : "s"} · ${when}`;
}

/* <input type="datetime-local"> works in local time; the server stores UTC ISO. */
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const toIso = (local) => (local ? new Date(local).toISOString() : null);

/** Downloads an authenticated PDF as a file (never rendered inside the app). */
export async function downloadPdf(url, auth, filename) {
  const res = await axios.get(url, { ...auth, responseType: "blob" });
  const href = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = filename || "submission.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const apiError = (err, fallback) => err?.response?.data?.error?.message || fallback;
