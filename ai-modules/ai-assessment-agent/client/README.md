# AI Assessment Agent: client integration

The UI source lives in the **LMS client**, not in this folder. The client is a
Vite + React app that resolves `react`, `axios` and the LMS layout components
from `client/node_modules` and `client/src`. Files outside `client/` cannot
import them without extra build configuration.

| LMS file | Purpose |
|---|---|
| `client/src/pages/assessment-agent/TeacherAssessments.jsx` | Teacher page: list, create, edit, questions (incl. explanation), publish/unpublish, **Generate with AI** button |
| `client/src/pages/assessment-agent/AiAssessmentGenerator.jsx` | Step 2: generation form, review/edit of proposals (edit, change correct option, explanation, remove, regenerate one, add manual), **Save as draft** |
| `client/src/pages/assessment-agent/AssessmentReport.jsx` | Step 3: teacher results report (opened with **Report** on a published test) |
| `client/src/pages/assessment-agent/StudentTests.jsx` | Step 3: student **My Tests** list (start / resume / view result) |
| `client/src/pages/assessment-agent/StudentAttempt.jsx` | Step 3: take the test (autosaved answers, server-based countdown), then the result |
| `client/src/pages/assessment-agent/QuestionEditor.jsx` + `questionForm.js` | Question-type picker and editor (single MCQ / multiple select / numerical), shared by the AI review screen and manual editing |
| `client/src/pages/assessment-agent/TeacherAssignments.jsx` | Descriptive Assignments (teacher): list, draft editor with question builder and marks tally, publish/close, submission dashboard with downloads and manual marks. Route `/teacher/assessments/assignments` (link on the AI Assessments page) |
| `client/src/pages/assessment-agent/AssignmentSubmissions.jsx` | Teacher submission dashboard (Prompt 2): AI status per row, "Evaluate with AI" (one request per click, elapsed seconds), AI suggestion panel, per-question final-marks review form ("Accept" only pre-fills; "Save final marks" is the only write) |
| `client/src/pages/assessment-agent/StudentAssignments.jsx` + `StudentAssignment.jsx` | Descriptive Assignments (student): list with status, assignment view with PDF dropzone, upload progress and confirmation. Routes `/student/assessment-agent/assignments[/:id]` (link on My Tests) |
| `client/src/pages/assessment-agent/assignmentUi.jsx` | Shared badges, date/size formatting and authenticated PDF download for the assignment pages |
| `client/src/pages/assessment-agent/AiPerformanceReport.jsx` | AI Performance Report inside the performance page: report focus + instructions, explicit Generate/Regenerate (one request per click), status, the 7 report sections with clickable evidence |
| `client/src/pages/assessment-agent/StudentPerformance.jsx` | Add-on: Student Performance Analyst. Metrics, charts (recharts) and history, plus an optional AI interpretation. Opened from **View performance** in `AssessmentReport.jsx` |
| `client/src/App.jsx` | Imports plus four routes, all marked "AI Assessment Agent": `/teacher/assessments` and `/teacher/assessments/students/:studentId` (mentor), `/student/assessment-agent/tests` and `/student/assessment-agent/attempts/:attemptId` (student) |

Both pages use the LMS's own `MentorLayout`, `useAuth()` (`token`, `API`),
axios and react-toastify.

- Generated questions exist only in the component's state until the teacher
  clicks **Save as draft**. Leaving the page discards them, after a
  confirmation.
- While generating, the form and buttons are disabled, so a request can't be
  submitted twice. The server also refuses a second concurrent generation.
- The **Generate with AI** button is disabled when `GET /teacher/ai/status`
  reports AI as unavailable. Manual creation is always available.
- The browser never sees AI configuration or credentials. It shows only the
  server's safe error messages.

To integrate into another LMS, copy the pages, replace `MentorLayout` and
`useAuth` with that LMS's equivalents, and point `API` at the router's mount.

Step 3 student pages:
- The countdown is display-only. It is computed as `deadlineAt - (Date.now() +
  offset)`, where `offset` comes from the server's `serverNow`, so a wrong
  device clock doesn't matter.
- At zero, the page simply reloads the attempt, and the server returns the
  finalized result.
- Refreshing the attempt page resumes the same attempt with its saved answers.

Not yet built: sidebar links in `MentorLayout` / `StudentLayout`. Adding them
needs changes to shared LMS layouts, so it was left out.
