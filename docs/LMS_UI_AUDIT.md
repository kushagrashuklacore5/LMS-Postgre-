# LMS UI/UX Audit (Phase 1)

Audit date: 22 October 2026
Scope: `LMS-main/client` (React frontend), with the backend (`LMS-main/server`) inspected only where the UI depends on it.
Status: audit only. No application code, CSS, dependency, database or configuration was changed.

## How to read this document

Every finding carries one label:

| Label | Meaning |
|---|---|
| **[V]** Verified | Confirmed by reading the source, or by a script run over the source (the scan method is given). |
| **[A]** Assumption | Inferred from code but not proven; it could be wrong. |
| **[M]** Manual test needed | Can only be confirmed by running the app in a browser. |

No browser or runtime testing was done in this phase. The only command executed against the code was the existing chatbot unit test suite (`node --test src/components/Chatbot/`), which passed 52 of 52 tests.

### Areas inspected

| Area | Depth |
|---|---|
| `client/src/App.jsx`, `main.jsx`, `auth/auth.jsx`, `components/ProtectedRoute.jsx` | Read in full |
| `i18n/index.js`, `i18n/languageRegistry.js`, `context/TranslationContext.jsx` (provider and `t()`), `SimpleTranslationContext.jsx`, all four language selector components | Read in full |
| `public/locales/en-IN/*.json`, `public/locales/hi-IN/*.json` | Key-by-key comparison by script |
| All six portal layouts (`AdminLayout`, `MentorLayout`, `StudentLayout`, `AccountantLayout`, `VendorLayout`, `SuperAdminLayout`), plus `storekeeper/Sidebar.tsx` and `storekeeper/StorekeeperDashboardSimple.jsx` | `AdminLayout` and the storekeeper files read in full; the rest read for structure, navigation and breakpoints |
| Chatbot: `components/Chatbot/LMSChatbot.jsx` and its three service files and tests | Component read in full; services read for endpoints, intents and rendering; tests run |
| `LMSChatbot 7.jsx` (workspace root, outside the app) | Read for structure |
| GuideBot: `guidebot/runtime/*`, `guidebot/tours/**` | Runtime read for translation logic; tours checked by script |
| `index.css`, `tailwind.config.js`, `index.html`, `vite.config.js`, `utils/axiosInstance.js` | Read |
| Every `.jsx` and `.tsx` file under `client/src` (about 82,000 lines) | Static scans by script: imports, `t()` usage, hardcoded strings, loading/error/empty patterns, `aria-*`, tables, colour literals, `alert()`, HTTP clients |
| `server/server.js`, `server/middleware/authMiddleware.js`, `roleMiddleware.js`, `config/database-switch.js`, `config/sqlite-db.js` (start of file) | Read for route mounts, auth behaviour and the active database |
| `pages/student/PayFees.jsx`, `pages/superadmin/SuperAdminDashboard.jsx`, `pages/internal/InternalAdminPortal.jsx`, `calendar/CalendarPage.jsx` | Spot-read for specific findings |

**Not inspected in depth:** the internal logic of individual pages beyond the scans and spot reads; backend controllers' business rules; the internals of `ai-modules/*`; database contents. The existing reports in `docs/` (`LMS_PRODUCT_AUDIT.md`, `LMS_CONNECTED_WORKFLOW_TEST_REPORT.md`, `LMS_FEATURE_COMPLETION_PLAN.md`) and `LMS_PRODUCT_QUALITY_AUDIT.md` cover business workflows. This document does not repeat them.

---

## 1. Current architecture

### 1.1 Stack [V]

| Layer | Technology |
|---|---|
| Frontend | React 18.2, Vite 4.5, React Router 6.30 (`BrowserRouter`, no data router), mixed JSX/TSX (TypeScript 5.9 present but not enforced) |
| Styling | Tailwind CSS 3.4, with large amounts of arbitrary-value classes (`bg-[#002366]`), some inline `style={{}}`, a global `index.css` (678 lines) and four component CSS files (`calendar.css`, `QuotaLimitModal.css`, `StorekeeperStyles.css`, `styles/stock-requests.css`) |
| UI libraries | No component library. Icons come from `lucide-react`. Also used: `recharts` (charts), `@fullcalendar/*` (calendar), `framer-motion`/`motion`, `driver.js` (tours), `react-toastify` (toasts), `react-globe.gl`/`three`/`dotted-map` (Home page visuals). `react-hot-toast` and `next-themes` are installed but have **0 imports**. |
| HTTP | Mixed: `fetch` in 98 files, direct `axios` in 43 files, and the shared `utils/axiosInstance.js` (which handles token refresh) in only **2** files |
| Realtime | `socket.io-client`, with one socket created in `AuthProvider` |
| i18n | `i18next` 26 + `react-i18next` 17 + http backend + language detector, wrapped by a custom `TranslationContext` (see section 4) |
| Backend | Node/Express 4 (`server/server.js`) with about 45 route modules mounted under `/api/*` |
| Database | SQLite by default (`server/data/lms_permanent.db`, via `config/sqlite-db.js`, which creates tables at boot). PostgreSQL only when `USE_POSTGRES=true`, but `config/postgres-db.js` does not exist [V]. Mongoose models under `server/models/` and a MongoDB `config/db.js` also exist; whether they are still used at runtime is [A]. |
| AI modules | `ai-modules/ai-assessment-agent` and `ai-modules/student-onboarding-agent`, mounted at `/api/assessment-agent`, `/api/onboarding` and `/api/student-setup` |

### 1.2 Provider tree and boot [V]

`main.jsx`: `StrictMode > AuthProvider > TranslationProvider > BrowserRouter > App`. `./i18n` is imported for its side effects before `App`.

`App.jsx` wraps the whole app in one `<div>`. That div is `h-screen w-screen overflow-hidden` on every route except `/`, `/home`, `/login` and `/register`, so each layout must manage its own scrolling. `App.jsx` also mounts one global `ToastContainer` and a `ControlledTermsModal`. The modal opens after login until `localStorage.terms_accepted_<userId>` is set.

### 1.3 Authentication [V]

- `auth/auth.jsx`: the JWT and the user object are kept in `localStorage` (`token`, `user`, `userId`) and in React state. There is no token validation on mount beyond a JSON parse. The API base comes from `VITE_BACKEND_URL`, otherwise `http://localhost:5002/api` on localhost, otherwise `https://core5.io/api`.
- `ProtectedRoute`: has the user? Then a role match. `superadmin` may open `admin` routes, and `teacher` may open `mentor` routes. A role mismatch redirects to that role's dashboard.
- Backend `authMiddleware`: if the token is missing or invalid, the request continues as a **guest** user, except on `/superadmin/` URLs. The chatbot services document that this makes expired sessions return `200 []`, which looks like "no records". `roleMiddleware` lets `admin` through every role-protected route.
- The `/login` route renders `Home`, where login happens in `QuickLoginModal` (`POST /auth/login`). `pages/Login.jsx` is imported in `App.jsx` but no route uses it. `SuperAdminLogin` lives at `/superadmin/login`.

### 1.4 Routing problems [V]

| # | Finding | Location |
|---|---|---|
| R1 | `/mentor/course/:courseId` is declared twice (`CourseTeacherPortal`, then `MentorCourseDetails`). React Router picks the first, so `MentorCourseDetails` cannot be reached through that path. | `App.jsx:750-764`, `App.jsx:872-886` |
| R2 | `/superadmin/dashboard`, `/superadmin/subscription` and `/internal-admin-portal` are **not** wrapped in `ProtectedRoute`. Instead the components check the user themselves (`SuperAdminDashboard.jsx:88`; `InternalAdminPortal.jsx:15`, which checks a hardcoded email). | `App.jsx:1341-1348` |
| R3 | `/storekeeper/*` is declared twice, and so is `/accountant/*` (the specific `/accountant/...` routes are listed first). | `App.jsx:1144`, `1500`, `1518` |
| R4 | There is no 404 / catch-all route. An unknown URL renders an empty page inside the `overflow-hidden` wrapper. | `App.jsx` |
| R5 | `/test-terms` is a debug page in production routing, with inline styles. `TestDatabaseExport` is defined but unused. | `App.jsx:74-84`, `386-402` |
| R6 | The storekeeper landing URL is `/storekeeper/dashboard` (from `RootRedirect` and `ProtectedRoute`), but the nested routes in `StorekeeperDashboardSimple.jsx` have no `dashboard` entry. The `*` route redirects to `/storekeeper/dashboard`, which is the same URL. Expected result: the sidebar with an empty content area. [V] code / [M] visual | `StorekeeperDashboardSimple.jsx:25-48` |
| R7 | Routes mostly point at files named `_temp` or `Simple` (`AccountantDashboard_temp`, `PaymentHistory_temp`, `Expenses_temp`, `FeesCollection_temp`, `StorekeeperDashboardSimple`). Non-`_temp` siblings sit unused next to them. | `App.jsx:63-94` |
| R8 | Every page wraps itself in its layout (`<AdminLayout>…</AdminLayout>` inside each page) instead of using a layout route. The sidebar therefore remounts on every navigation, so collapsed state and open menus are lost. [V] code / [M] visual | all pages |
| R9 | `CalendarPage` (admin, mentor, student) and `/announcements` render **without** a portal layout, so the sidebar, language selector and chatbot are not shown. Calendar has a back button (`navigate(-1)`). | `calendar/CalendarPage.jsx:90`, `pages/Announcements.jsx` |

### 1.5 Dead or duplicate UI code [V]

A script checked every `.jsx` and `.tsx` file and found **47 component files that no file imports**. Examples: `pages/Login_backup.jsx`, `pages/TestUniversalPersistence.jsx`, `storekeeper/StorekeeperDashboard{,Debug,Fixed,Working}.*`, `storekeeper/VendorStockBrowser{Final,Fixed,Simple,Working}.jsx`, `VendorStockSimpleWorking.jsx`, `accountant/{AccountantDashboard,PaymentHistory,Vendors,WelcomeAccountant}.tsx`, `pages/accountant/{AccountantDashboard,PaymentHistory,DatabaseExport_temp,Inventory_temp}.jsx`, `components/{Footer,Footer_Original,HexSolutions,DataExport,AccountantExport,TermsModal,TransactionHistory,UniversalTranslator,RealTimeTranslator,PasswordDisplay,SimplePasswordDisplay}`, `components/admin/Add{Student,Teacher}Modal.jsx`, `components/mentor/RapidRollCallModal.jsx`, `ui/gaming-login.jsx`, and **`vendor/VendorRequests.jsx` and `vendor/VendorProfile.jsx`**.

Two of these matter for the redesign:

- **Vendor Requests (971 lines: quote, respond, bill) and Vendor Profile have no route and no navigation entry.** The vendor-side UI for answering stock requests is therefore unreachable, even though the endpoints (`/vendor/requests/:id/respond|quote|bill`, `/vendor/profile`) exist. [V]
- There are three or more parallel implementations of the same screens (stock browser, storekeeper dashboard, accountant pages). The redesign must start from the **routed** file, never from a sibling.

---

## 2. Design language today

### 2.1 Visual system [V]

Recent commits (see `git log`) moved most portals to a "luxury gold" theme: navy `#002366` / `#1e1b4b`, gold `#B99652` / `#f1be38`, cream backgrounds `#fffdf4` with a faint gold grid, square corners (`rounded-none`), and DM Serif Display headings. The theme is applied by **hardcoded hex values in each file**:

- **No design tokens.** `tailwind.config.js` defines `primary: #2563EB` (blue), `secondary`, `success`, `warning`, `danger`, `background`, `text`. None of them match the gold or navy theme, and the theme does not use them. A scan of routed pages finds 265 hex literals in `SuperAdminDashboard.jsx`, 260 in `StudentImport.jsx`, 240 in `CourseTeacherPortal.jsx`, 177 in `ClassroomDetail.jsx`, and so on.
- **Theme drift across portals:**
  - `VendorLayout` main area: `from-violet-50 via-purple-50 to-indigo-50`, plus a white header.
  - Accountant and Storekeeper sidebars: `#1e1b4b`. Admin, Mentor, Student, Vendor and SuperAdmin sidebars: `#002366`.
  - The chatbot input and send button use purple `#5b3fd9` / `#d8ceff`.
  - `GuideBotLauncher` uses gold, although its comment says it uses Tailwind `primary` blue.
  - Commit `83bf7fe` deliberately gave the student Courses page "purple/lavender accents and rounded corners", which conflicts with the square-corner rule.
- **Typography conflict:** `index.css:71-73` sets `h1…h6 { font-family: 'Plus Jakarta Sans' … !important }`. **171 of the 244** `font-['DM_Serif_Display']` usages are on `h1`–`h6` elements, so the global `!important` rule overrides them and those headings do **not** render in DM Serif. [V] CSS cascade / [M] visual. Fonts loaded: Inter, Poppins, Plus Jakarta Sans, DM Serif Display, Caveat, plus a local "Mansory" font and a "Polymath" font that is not loaded anywhere.
- **Duplicated sidebar markup:** each layout copies the same sidebar (mountain SVG backdrop, avatar, nav list, collapse and logout buttons, a separate mobile drawer) in 300–650 lines. The copies have drifted: different breakpoints, different active styles (`border-l-4` vs `border-l-3` plus a border box), and different drawer implementations.
- **Feedback mechanisms:** `react-toastify` is used in 70 files, but **42 files still use `alert()` or `confirm()`**. The worst are `InventoryManagement.tsx` (14), `SuperAdminSubscription.jsx` (12), `VendorRequests.jsx` (8) and `components/Requirements.tsx` (8, routed as the Storekeeper and Mentor "Requirements" page).
- **344 `console.log` calls** remain in components, including ones in render paths (`App.jsx:262` logs on every render).

### 2.2 Accessibility [V] by scan, [M] for full assessment

- `aria-*` attributes are almost absent. **Only 4 of the ~80 routed pages scanned have any**: Home 10, `StudentImport` 12, `QuickLoginModal` 1, `StudentAssignment` 1. Layout headers, the language selector, the chatbot and `GuideBotLauncher` do have aria attributes.
- Hamburger and close buttons in the Admin, Accountant and SuperAdmin layouts are icon-only (`ChevronRight`) with **no `aria-label`**. They also use a right-chevron icon for both "open" and "close". `StudentLayout` is the exception (`aria-label="Open navigation menu"`).
- Only 2 files declare `role="dialog"`, out of 49 files that implement modals. There is no focus trap or focus return in custom modals [A]. The chatbot dialog closes on Escape but does not trap focus.
- Nav items show which page is active through colour only, with no `aria-current`.
- Contrast: `text-white/50` and `text-white/70` on navy, and `text-[10px]` grey labels, are likely to fail WCAG AA for small text. [M] needs measurement.
- `<html lang>` is set by `App.jsx:296-320`, which only knows `'ar'`. In Hindi it stays `lang="en"`, so screen readers announce Hindi text with English pronunciation. [V]

### 2.3 Responsive behaviour [V] by code, [M] visual

| Layout | Desktop sidebar | Mobile navigation | Gap |
|---|---|---|---|
| Admin | `hidden md:block` | hamburger `md:hidden` | none, but the drawer uses `.mobile-sidebar` (`lg:hidden`) |
| **Mentor** | `hidden lg:block` | **none**: `mobileMenuOpen` is declared but never used | **No navigation at all below 1024px** |
| **Student** | `hidden lg:block` | hamburger `md:hidden` | **768–1023px (tablets): no sidebar and no hamburger** |
| Accountant | `hidden lg:block` | hamburger `lg:hidden` | none |
| Vendor | `hidden lg:block` | hamburger `lg:hidden` | none |
| SuperAdmin | `hidden lg:block` | separate mobile header `lg:hidden` | none |
| **Storekeeper** | `sticky w-64` sidebar, **always visible** | **none** | On phones the 256px sidebar is always shown and the content gets about 120px |

Other responsive risks:

- The app root is `h-screen overflow-hidden`, so every page depends on an inner `overflow-y-auto` container. Pages without one can clip content. [M]
- Tables: 33 `<table>` elements across routed pages. Some lack an `overflow-x-auto` wrapper: `AttendanceManagement`, `ClassResults`, `AssignStudentsToClassroom`, `StudentAttendance`. [V] scan
- Dynamic Tailwind classes (`lg:ml-${…}` in `SuperAdminLayout:468` and `VendorLayout:265`) only work because the same literal classes happen to appear in other files. Removing those other usages would break the layout offset. [V]

---

## 3. Portal-wise page inventory

Columns: **i18n** = the file imports a translation hook, and N = how many `t('…')` calls it makes. **States** = whether the code has a loading flag (L), error handling (E) and an empty-state branch (∅); this comes from a regex scan, so the lack of a match is reliable but a match does not prove the state is visible [A]. **Notes** are verified unless labelled otherwise.

### 3.1 Public / authentication

| Route | Component | i18n | States | Notes |
|---|---|---|---|---|
| `/`, `/home`, `/login` | `pages/Home.jsx` (1,292 lines) + `components/QuickLoginModal.jsx` | Home: hook imported but **0 `t()` calls**; modal: 22 | Home: none; modal: L E | Marketing page with 3D globe and persona orbit. Login is a modal on top of it. `/login` and `/home` show the same page. |
| `/register` | `pages/Register.jsx` | 0 `t()` | L E | |
| `/setup-password` | `pages/StudentSetupPassword.jsx` | none | E | Part of the onboarding AI module. Fully hardcoded English. |
| `/superadmin/login` | `pages/superadmin/SuperAdminLogin.jsx` | 18 | L E | Separate visual style from the main login. |
| (global) | `ControlledTermsModal.jsx` | none | — | Blocking terms modal after first login. Hardcoded English. |

### 3.2 SuperAdmin (`SuperAdminLayout`, tab-driven)

The navigation is mostly **query-string tabs on one page** (`/superadmin/dashboard?tab=universities|demoLeads|createUniversity|createUser|users`) plus `/superadmin/subscription`.

| Route / tab | Component | i18n | States | Notes |
|---|---|---|---|---|
| `/superadmin/dashboard` (all tabs) | `SuperAdminDashboard.jsx` (1,621 lines) | **none** | L E ∅ | 265 hex literals, 19 toasts. The route is unprotected; the component redirects non-superadmins (R2). |
| `?tab=createUniversity` | `CreateUniversityForm.jsx` | none | L E ∅ | |
| `?tab=createUser` | `CreateUserForm.jsx` | hook, 0 `t()` | L E | |
| `/superadmin/subscription` | `SuperAdminSubscription.jsx` | none | L E | **12 `alert()` calls**, 30 inline styles |
| `/internal-admin-portal` | `InternalAdminPortal.jsx` | none | L E ∅ | Gated by a hardcoded email (`portal@core5.co.in`). Not linked from any UI. |
| Layout | `SuperAdminLayout.jsx` | none | — | Nav labels hardcoded English ("Overview", "Institutes", "Demo Leads", …). Has `GuideBotLauncher` (superadmin-overview-v1). **No chatbot.** |

### 3.3 Admin (`AdminLayout`)

Sidebar: Dashboard, Users, Courses, Database Export, Fee Structure, Calendar, Add Student, Add Teacher, Classrooms, Import Students. Header: language selector, GuideBot (admin-overview-v1), announcement bell. Admin chatbot. Footer `LoginFooter`.

| Route | Component | i18n (`t()`) | States | Notes |
|---|---|---|---|---|
| `/admin/dashboard` | `Admin-Dashboard.jsx` | 17 | L E | |
| `/admin/users` | `UserList.jsx` | 33 | L E ∅ | table |
| `/admin/mentors` | `MentorApproval.jsx` | 35 | L E ∅ | **not in sidebar**, reachable only by URL or links [A] |
| `/admin/analytics` | `Analytics.jsx` | 19 | L E | **not in sidebar** |
| `/admin/create-course` | `CreateCourseAdmin.jsx` | 25 | L E ∅ | labelled "Courses" in the nav |
| `/admin/fee-structure` | `FeeStructure.tsx` (1,116 lines) | 31 (uses `react-i18next` directly) | L E | 164 hex literals, 14 toasts |
| `/admin/add-student`, `/admin/add-teacher` | `AddStudent.jsx`, `AddTeacher.jsx` | 26 / 23 | L E | `AddTeacher` uses the key `professional_information`, which exists in no dictionary, so the raw key is displayed [V] |
| `/admin/classrooms`, `/admin/classrooms/:id` | `Classrooms.jsx` (+ `CreateClassroomModal.jsx`), `ClassroomDetails.jsx` | 14 / 20 / 10 | L E ∅ | keys `failed_to_delete_classroom` and `grade_level` are missing from every dictionary |
| `/admin/student-import` | `StudentImport.jsx` (1,843 lines, AI module) | 14 | L E ∅ | Largest admin page: 260 hex literals, 6 tables. The only admin page with aria attributes (12). |
| `/admin/database-export` | `pages/admin/DatabaseExport.jsx` | **none** | L E ∅ | 119 hex literals |
| `/admin/calendar` | `calendar/CalendarPage` | none | E | No layout (R9) |
| `/admin/announcements` | `pages/Announcements.jsx` | 3 | L E ∅ | No layout (R9) |

### 3.4 Mentor / Teacher (`MentorLayout`)

Sidebar: Dashboard; Classrooms group (My Classrooms, Attendance, Class Results, Requirements, AI Assessments → `/teacher/assessments`); Calendar. Header: language selector, GuideBot (mentor-overview-v1), announcement bell. Mentor chatbot. **No mobile navigation** (section 2.3).

| Route | Component | i18n (`t()`) | States | Notes |
|---|---|---|---|---|
| `/mentor/dashboard` | `MentorDashboard.jsx` | 14 | L E ∅ | |
| `/mentor/classrooms`, `/mentor/classroom/:id` | `MentorClassrooms.jsx`, `ClassroomDetail.jsx` (857 lines) | 6 / 3 | L E ∅ | `ClassroomDetail`: 177 hex literals, mostly hardcoded text |
| `/mentor/classroom` | `MyClassroom.jsx` | hook, 0 | L E ∅ | |
| `/mentor/attendance` | `AttendanceManagement.jsx` | 14 | L E ∅ | table without horizontal scroll |
| `/mentor/results`, `/mentor/add-result` | `ClassResults.jsx`, `AddResult.jsx` | 28 / 0 | L E ∅ | Gradebook entry. `AddResult` is fully hardcoded. |
| `/mentor/course/:courseId` | `CourseTeacherPortal.jsx` (1,525 lines) | hook, **0** | L E ∅ | 240 hex literals, 32 toasts. Shadows `MentorCourseDetails` (R1). |
| `/mentor/course/:id/materials` | `CourseMaterialsUpload.jsx` | hook, 0 | L E ∅ | |
| `/mentor/create-course`, `/mentor/add-chapter`, `/mentor/assign-students`, `/mentor/progress` | `CreateCourse`, `AddChapter`, `AssignStudents`, `Progress` | 23 / 21 / 15 / 44 | L E (∅ varies) | `CreateCourse` uses the missing keys `update_course` and `course_updated_successfully` |
| `/mentor/create-assessment`, `/mentor/assessment/:id` | `CreateAssessment.jsx`, `DesignAssessment.jsx` | 1 / 0 | E only, **no loading state** | |
| `/mentor/fee-monitoring` | `ClassFeeStatus.jsx` (shared with Accountant) | **none** | L E ∅ | Picks `MentorLayout` or `AccountantLayout` by role |
| `/mentor/requirements` | `pages/mentor/Requirements.jsx` → `components/Requirements.tsx` (650 lines) | none | L E ∅ | **8 `alert()` calls** |
| `/mentor/calendar` | `CalendarPage` | none | E | No layout |
| `/teacher/assessments`, `/teacher/assessments/assignments`, `/teacher/assessments/students/:id` | `TeacherAssessments.jsx` (764 lines), `TeacherAssignments.jsx`, `StudentPerformance.jsx` (AI module) | **none** | E ∅, **no loading flag** | Different URL prefix (`/teacher/…`) from the rest of the portal |

### 3.5 Student (`StudentLayout`)

Sidebar: Dashboard, Courses, My Tests, Assignments, Results, Attendance, Calendar, Fees. Language selector in the sidebar. Student chatbot. **No GuideBotLauncher**: the student onboarding and overview tours are registered, but no layout button starts them [V]. Tablet navigation gap (section 2.3).

| Route | Component | i18n (`t()`) | States | Notes |
|---|---|---|---|---|
| `/student/dashboard` | `Student-Dashboard.jsx` | 7 | L E ∅ | 172 hex literals, mostly hardcoded |
| `/student/courses`, `/student/course/:id` | `Courses.jsx`, `CourseViewer.jsx` (1,164 lines) | 26 / 17 | L E ∅ | `CourseViewer` uses the missing keys `chapter_completed`, `error_marking_complete`, `failed_load_course` |
| `/student/assessment/:id` | `AttemptAssessment.jsx` | 19 (`react-i18next`) | L E | |
| `/student/assessment-agent/tests`, `/attempts/:id`, `/assignments`, `/assignments/:id` | `StudentTests`, `StudentAttempt`, `StudentAssignments`, `StudentAssignment` (AI module) | **none** | E ∅, **no loading flag** | |
| `/student/results` | `StudentResults.jsx` | 19 (`react-i18next`) | L E ∅ | |
| `/student/attendance` | `StudentAttendance.jsx` | 6 | L E ∅ | table without horizontal scroll |
| `/student/pay-fees` | `PayFees.jsx` (939 lines) | 3 | L E ∅ | Razorpay checkout. **If loading the fee structure fails, the page falls back to a hardcoded ₹8,050 structure with due date 2026-11-30** (`PayFees.jsx:48-68`, `161-162`), so a student can see fees that are not real. [V] code / [M] behaviour |
| `/student/subscription`, `/student/timetable`, `/student/certificates` | `Subscription.jsx`, `Timetable.jsx`, `Certificates.jsx` | 0 / 9 / 14 | L E | **not in sidebar**. `Subscription` uses 3 `alert()` calls. |
| `/student/calendar` | `CalendarPage` | none | E | No layout |

### 3.6 Accountant (`AccountantLayout`)

Sidebar: Dashboard, Fee Monitoring, Fee Collection, Legacy Reconciliation, Vendor Invoices, Expenses, Reports & Analysis. Header: language selector, announcement bell. **No chatbot, no GuideBot.**

| Route | Component (routed file) | i18n | States | Notes |
|---|---|---|---|---|
| `/accountant/dashboard` (also `/accountant/*`) | `AccountantDashboard_temp.jsx` | **none** | L E ∅ | |
| `/accountant/fees` | `FeesCollection_temp.jsx` + `OfflineFeeModal.jsx` | none / partial | L E ∅ | `OfflineFeeModal` uses the missing keys `choose_payment_plan`, `full_payment_single`, `applicable_structure` |
| `/accountant/fee-monitoring` | `pages/mentor/ClassFeeStatus.jsx` | none | L E ∅ | Shared with mentor |
| `/accountant/payment-history` | `PaymentHistory_temp.jsx` | none | L E ∅ | **not in sidebar** |
| `/accountant/legacy-reconciliation` | `LegacyReconciliationPage.jsx` → `accountant/LegacyReconciliation.tsx` | none | L E ∅ | |
| `/accountant/vendor-invoices` | `VendorInvoiceManagement.jsx` | none | L E ∅ | 13 toasts |
| `/accountant/expenses` | `Expenses_temp.jsx` | none | L E ∅ | |
| `/accountant/database-export`, `/accountant/reports` | `pages/accountant/DatabaseExport.jsx` | none | L ∅ | Two URLs for the same page |

The accountant pages are almost entirely untranslated: about 404 hardcoded JSX text nodes against 98 `t()` calls across the folder.

### 3.7 Storekeeper (`storekeeper/Sidebar.tsx`, no shared layout)

Sidebar: Inventory, Vendors, Vendor Stock, Requirements, Reports, plus an embedded `RequestStatus` widget. **No Dashboard link** (see R6), no language selector, no announcement bell, no chatbot, no GuideBot, **no mobile drawer**. Nav labels are hardcoded English. The logo is imported from outside `src` (`'../../../core5 logo new new-modified (1).png'`).

| Route | Component | i18n | States | Notes |
|---|---|---|---|---|
| `/storekeeper` (index), `/storekeeper/welcome` | `WelcomeStorekeeper.tsx` | hook, 0 | none | |
| `/storekeeper/dashboard` | none (redirects to itself, R6) | — | — | [M] |
| `/storekeeper/inventory` | `InventoryManagementSimple.jsx` | none | L E ∅ | |
| `/storekeeper/vendors`, `/storekeeper/vendor-stock` | `VendorManagementSimple.jsx` (both URLs) | none | L E ∅ | "Vendor Stock" and "Vendors" show the same page |
| `/storekeeper/requirements` | `components/Requirements.tsx` | none | L E ∅ | 8 `alert()` calls |
| `/storekeeper/reports` | inline placeholder JSX | none | — | **Placeholder only**: a heading and one sentence |

### 3.8 Vendor (`VendorLayout`, applied in `App.jsx`)

Sidebar: Dashboard, Invoices, Orders, Stock, Payments. Language selector. **No chatbot, no GuideBot, no announcement bell.** Violet/indigo gradient background, which differs from every other portal. **No `t()` calls in any vendor file.**

| Route | Component | States | Notes |
|---|---|---|---|
| `/vendor/dashboard` | `VendorDashboard.jsx` | L E ∅ | |
| `/vendor/invoices` | `VendorInvoices.jsx` | L E ∅ | |
| `/vendor/orders` | `VendorOrders.jsx` | L E ∅ | |
| `/vendor/stock` | `VendorStock.jsx` | L E ∅ | 2 `alert()` calls |
| `/vendor/payments` | `VendorPayments.jsx` | L E ∅ | |
| (unrouted) | `VendorRequests.jsx`, `VendorProfile.jsx` | — | **Unreachable** (section 1.5) |

### 3.9 Cross-portal summary

| Capability | SuperAdmin | Admin | Mentor | Student | Accountant | Storekeeper | Vendor |
|---|---|---|---|---|---|---|---|
| Shared layout component | yes | yes | yes | yes | yes | sidebar only | yes |
| Mobile navigation | yes | yes | **no** | partial (tablet gap) | yes | **no** | yes |
| Language selector | yes | yes | yes | yes | yes | **no** | yes |
| Announcement bell | yes | yes | yes | (in page) [A] | yes | **no** | **no** |
| Chatbot | **no** | yes | yes | yes | **no** | **no** | **no** |
| GuideBot launcher | yes | yes | yes | **no** (tours exist) | **no** | **no** | **no** |
| Nav labels translated | **no** | yes | yes | yes | partial [A] | **no** | **no** |

---

## 4. Multilingual (English/Hindi) audit

### 4.1 How it works [V]

1. `i18n/index.js` initialises i18next with `HttpBackend` (`/locales/{{lng}}/{{ns}}.json`), a custom detector (localStorage `selectedLanguage`, then `i18nextLng`, then the browser `navigator`), `fallbackLng: 'en-IN'`, `supportedLngs: ['en-IN','hi-IN']`, and 7 namespaces (`common`, `navigation`, `dashboard`, `forms`, `notifications`, `tours`, `chatbot`). It also sets `fallbackNS` to all namespaces, so an un-prefixed key is searched in every namespace, and `useSuspense: false`.
2. `i18n/languageRegistry.js` registers 12 Indian languages and activates two. `normalizeLanguageCode` maps legacy `en`/`hi` to `en-IN`/`hi-IN`.
3. `context/TranslationContext.jsx` (4,996 lines) is the hook **most components use** (77 files). Its `t(key)` tries `i18n.t(key)` first, then the in-file `EN_TRANSLATIONS` dictionary (about 1,333 keys, **English only**), then returns the raw key. The file also contains about 3,170 lines of `AR_TRANSLATIONS` and `UR_TRANSLATIONS` that are never read.
4. 8 files use `react-i18next`'s `useTranslation` directly: the chatbot, `GuideBotLauncher`, `AnnouncementBell`, `CreateAnnouncementModal`, `FeeStructure`, `AttemptAssessment` and `StudentResults`, plus the i18n setup file itself.
5. `UniversalLanguageSelector` (behind the `GlobalLanguageSelector`, `LanguageSelector` and `SimpleLanguageSelector` aliases) calls `changeLanguage`. That runs `i18n.changeLanguage`, writes localStorage, and fires a best-effort `POST /user/language-preference`. The saved preference is **not read back on login** [A: no client GET call found]. `axiosInstance` sends an `x-language` header, but only 2 files use it.

### 4.2 Switching without reload [V] code / [M] visual

- Components using the custom context re-render on a language change, because the context value object changes (`currentLanguage` and `version` state).
- Components using `react-i18next` re-render through its own subscription.
- `GuideBotRuntime` listens to `languageChanged`.
- The chatbot regenerates its greeting only while the user has sent no messages. Earlier assistant messages stay in the language they were written in. (The replies are English anyway; see 4.5.)

So switching **does** update the UI without a reload, but only for strings that go through `t()` and exist in the Hindi JSON.

### 4.3 Coverage [V], by script over every `t('literal')` call

| Measure | Value |
|---|---|
| Key parity, `en-IN` vs `hi-IN` JSON, in all 7 namespaces | **100%** (547 keys each; none missing either way) |
| Distinct keys used in code via `t('…')` | 616 |
| …that resolve in the JSON (so they can show Hindi) | **297 (48%)** |
| …that resolve only in the legacy `EN_TRANSLATIONS` (**English even in Hindi mode**) | **292 (47%)** |
| …that resolve **nowhere** (the raw key is shown in both languages unless a default is passed) | **27 (4%)**, e.g. `professional_information`, `failed_to_delete_classroom`, `grade_level`, `update_course`, `chapter_completed`, `failed_load_course`, `choose_payment_plan`, `error_loading_announcements`, `locked`, `add_new_expense`, plus 7 footer keys used only by unreferenced files |

Approximate hardcoded user-facing text, counted by regex as JSX text nodes plus literal `placeholder`/`title`/`label` attributes plus literal toast messages. Counts include unreferenced files in the same folders.

| Portal | `t()` calls | Hardcoded JSX text | Hardcoded attributes | Hardcoded toasts |
|---|---|---|---|---|
| Public/Auth | 22 | ~135 | ~16 | ~3 |
| SuperAdmin | 18 | ~177 | ~20 | ~27 |
| Admin | 272 | ~178 | ~41 | ~19 |
| Mentor (including AI assessments) | 187 | ~550 | ~122 | ~90 |
| Student (including AI tests) | 130 | ~216 | ~10 | ~12 |
| Accountant | 98 | ~404 | ~28 | ~23 |
| Storekeeper | 24 | ~496 | ~41 | ~6 |
| Vendor | **0** | ~193 | ~26 | 0 |
| Shared (calendar, announcements, chatbot) | 60 | ~26 | ~2 | 0 |

**Files with no translation import at all** include every Vendor page, every Accountant routed page, every Storekeeper page, `SuperAdminDashboard`, `SuperAdminSubscription`, `CreateUniversityForm`, `InternalAdminPortal`, all `assessment-agent/*` pages, `ClassFeeStatus`, `pages/admin/DatabaseExport`, the whole `calendar/*`, `ControlledTermsModal`, `StudentSetupPassword`, the mentor modals and drawers (`OverallAiReportModal`, `SpeedAttendanceBar`, `StudentAnalyticsDrawer`), and `SuperAdminLayout` and `VendorLayout`.

Hardcoded English strings also sit inside translated layouts, for example `AdminLayout`'s "Active", "Admin", "Admin Portal" and the `admin@example.com` fallback.

### 4.4 Fallback and missing keys [V]

- A key that exists in English JSON but not in Hindi JSON falls back to English through `fallbackLng`. That works, but because the JSON files are at parity it never happens today.
- A legacy key: i18next misses, so `EN_TRANSLATIONS` returns English. Hindi users see English silently, with no missing-key warning (`debug: false`, no `missingKeyHandler`).
- An unknown key returns the raw key (`professional_information`). Several components defend against this with `t(key) !== key ? t(key) : 'English'` (for example `AdminLayout.getItemLabel`). `t('nav_collapse') ?? 'Collapse'` does nothing, because `t` never returns null or undefined.
- `<html lang>` and `dir` never reflect Hindi (section 2.2). The Urdu (RTL) entry exists in the registry but is inactive. The RTL handling in `App.jsx` checks for `'ar'`, a code that `normalizeLanguageCode` can never produce.

### 4.5 Hindi in specific surfaces

| Surface | Status |
|---|---|
| Layouts and navigation | Admin, Mentor, Student and Accountant nav use keys (mostly in `navigation.json`). SuperAdmin, Vendor and Storekeeper nav are hardcoded. [V] |
| Forms | `forms.json` has 212 keys, but most forms outside the Admin portal do not use them. [V] |
| Modals | Terms modal, offline-fee modal (partial), quota modal, calendar modals and mentor AI modals are mostly English. [V] |
| Tables | Column headers are hardcoded in most tables. [V] by scan / [A] per table |
| Toasts and notifications | About 180 literal toast messages. `notifications.json` (25 keys) is barely used. Server-generated messages (API `message` fields) are English. [V] / [A] for the server side |
| Chatbot | The UI chrome (title, chips, placeholder, aria labels) is translated through `chatbot.json`. **The answers are not.** Every reply string, card heading, table header, error and "unsupported" message is English HTML built in the service files, and `detectIntent` matches **English keywords only**, so a question typed in Hindi returns "Sorry, I didn't understand". Chips still work because they send fixed English messages. [V] |
| Onboarding tours | The three launchable tours (`*-overview-v1`) are mostly untranslated: of their step IDs, 11 of 15 (admin), 42 of 48 (mentor) and 12 of 15 (superadmin) have no `tours.json` key, so English defaults from the tour config are used. The `*-onboarding-v1` tours are fully keyed, but **no UI starts them**. [V] |
| Tour key collisions | Tour copy is keyed by step ID only (`tours:${stepId}_title`), and **10 step IDs are shared across portals**: `welcome-dashboard`, `nav-dashboard`, `nav-results`, `nav-attendance`, `dashboard-statistics`, `recent-activity`, `nav-calendar`, `nav-classrooms`, `welcome-overview`, `attendance-summary`. Because the JSON key wins over the tour's own text, the mentor `welcome-dashboard` step shows the **student** wording ("…average progress, and attendance percentage") in both languages. [V] (`GuideBotRuntime.js:476-482`) |
| Typography | No loaded web font covers Devanagari for body text (Plus Jakarta Sans and Inter do not; Poppins does but is only used for buttons; DM Serif Display does not). Hindi therefore falls back to an OS font (Nirmala UI/Mangal on Windows), so Hindi and Latin text sit in different typefaces. [A] font coverage per foundry specs / [M] visual |
| Overflow | Hindi strings in `hi-IN/*.json` are on average about 1.6–2.1× the byte length of English (UTF-8, so less in rendered width). Risk points: fixed-width sidebar labels (`truncate`, `w-64`), chips (`truncate` in a 2-column grid inside a 390px chatbot), `uppercase tracking-wider` buttons (letter-spacing on Devanagari breaks conjunct shaping), `text-[10px]` labels, and table headers. [A] / [M] |

---

## 5. Chatbot audit

### 5.1 Component [V]

`components/Chatbot/LMSChatbot.jsx` (396 lines), "Eklavya":

- **Mounted in** `AdminLayout` (`role="admin"`), `MentorLayout` (`role="mentor"`) and `StudentLayout` (default `role="student"`). It is not available in the SuperAdmin, Accountant, Storekeeper or Vendor portals.
- **Visibility:** renders `null` unless `user.role === mode.role`. A `teacher`-role user in the Mentor portal therefore sees **no chatbot**, because only the exact role `mentor` matches. [V] code
- **State:** local `useState` (`isOpen`, `messages[]`, `input`, `loading`). There is no persistence, so the conversation is lost on every navigation, because layouts remount per page (R8). The first auto-open is remembered in localStorage under a separate key per role (`core5_chatbot[_mentor|_admin]:autoOpened:<userId>`).
- **Rendering:** assistant messages are HTML strings rendered with `dangerouslySetInnerHTML`. The services escape every API value with `esc()`, and the tests cover this. User messages render as text.
- **Styling:** Tailwind arbitrary values; a navy header; purple input and send button (`#5b3fd9`), which is off-theme; a 390×580 floating panel (`min(…, calc(100vw - 48px))`); a robot mascot trigger with a speech bubble; keyframes injected through an inline `<style>` on every render.
- **Accessibility:** `role="dialog"`, `aria-label`, `aria-live="polite"` on the message list, Escape to close. `aria-hidden` toggles, but there is no focus management. Hidden content is `invisible` and not unmounted.

### 5.2 Service layer ("backend") [V]

**There is no chatbot backend, LLM or chat API.** The three service modules are pure client-side functions that `node --test` can test:

| Service | Endpoints called (existing LMS REST APIs, Bearer token) | Intent topics |
|---|---|---|
| `chatbotService.js` (student) | `GET /results/my-results`, `/attendance/student`, `/classrooms/student-classrooms`, `/announcements` | results, attendance, classroom/timetable, announcements. Fees, courses, events, live classes and tests return "not supported yet" messages. There is also a privacy block for questions about other students. |
| `mentorChatbotService.js` | `GET /classrooms/my-classrooms`, `/classrooms/:id/students`, `/results/classroom/:id`, `/courses/mentor` | classrooms, students, class results, courses. **Filters classrooms on the client** because `/classrooms/my-classrooms` is not scoped to the mentor on the server (documented in the file header). |
| `adminChatbotService.js` | `GET /admin/dashboard`, `/classrooms`, `/admin/mentors`, `/admin/users` | overview counts, classrooms, mentors, students. Deliberately shows no money figures. |

All three are **read-only**. Each service checks token expiry on the client, because the backend treats expired tokens as guests. It also compares the JWT `role` claim with the expected role.

Public contract used by the component: `handleMessage(text, { API, token, user }) → Promise<htmlString>`, `esc()`, `shouldAutoOpen(storage, userId)`, `markAutoOpened(storage, userId)`.

Tests: `chatbotService.test.js`, `mentorChatbotService.test.js` and `adminChatbotService.test.js` give **52 tests, 52 passing** (run on 22 Oct 2026).

### 5.3 The workspace-root prototype `LMSChatbot 7.jsx` [V]

This 1,078-line standalone component lives outside the app. It has a **hardcoded mock `DB`** containing real-looking names and emails, a role switcher, inline styles in a dark slate theme, and a rule-based `chatEngine`. Its header says admins and teachers can **create and post announcements and events**. It calls no API, has no i18n and does not use `useAuth`. It is a design and behaviour reference only. If any of its UI is adopted, its write actions would be a **new feature** with new API needs, not a reskin.

### 5.4 What can be replaced safely

| Part | Replaceable without touching the "backend"? |
|---|---|
| `LMSChatbot.jsx` markup, styling, animations, launcher button, panel layout | **Yes.** It is pure presentation. |
| Message state and the open/close logic inside the component | Yes, as long as the auto-open keys and per-role behaviour are kept. |
| Rendering of answers | Only if the new UI accepts **HTML strings** from `handleMessage`. Structured cards would mean changing the services' `render*` functions, which is a logic change, so their tests must be updated with it. |
| `*ChatbotService.js` files | **No.** Treat them as the chatbot backend: endpoints, scoping rules, privacy blocking and escaping all live there. |
| Mount points in the three layouts and the `role` prop | Must be preserved (or extended deliberately). |

The recommended integration approach is in `LMS_UI_REDESIGN_PLAN.md` section 6.

---

## 6. Loading, empty, success and error states

[V] by scan, with per-page visual quality left to manual testing.

- Most data pages have a `loading` flag and some empty-state branch. **Pages with no loading flag:** all AI-module assessment pages (`TeacherAssessments`, `TeacherAssignments`, `StudentPerformance`, `StudentTests`, `StudentAttempt`, `StudentAssignments`, `StudentAssignment`), `CreateAssessment`, `DesignAssessment`, `CalendarPage` and `WelcomeStorekeeper`.
- There is **no shared Skeleton, Spinner, EmptyState or ErrorState component**. Each page invents its own, so spinner styles, empty copy and retry options are inconsistent. [V] (no such component exists in `components/`)
- Success feedback is mixed: toasts in 70 files, `alert()` in 42, and inline banners elsewhere.
- Error feedback: there are no React error boundaries (none found), so a render error blanks the whole app. Network errors often reach only `console.warn` (for example in the `PayFees` fallbacks). Expired sessions can look like empty data, because the server treats them as guests (section 1.3).
- The **fabricated-data fallback** in `PayFees` (section 3.5) is the most serious state problem: a failure state is presented as real data.

---

## 7. Summary of top UI/UX problems

Ordered by user impact. All are [V] unless marked otherwise.

1. **No mobile navigation in Mentor and Storekeeper, and a tablet gap in Student.** These are core daily-use portals.
2. **Hindi is about half-implemented.** 47% of translation keys used in code are English-only, Vendor, Accountant and Storekeeper are almost entirely English, chatbot answers are English, and `<html lang>` is wrong.
3. **Each portal has its own copy of the layout,** and those copies have drifted in theme, breakpoints and features (chatbot, GuideBot, bell, language selector).
4. **No design tokens.** The theme is held together by thousands of hex literals, the Tailwind palette (blue) contradicts it, and the heading-font rule cancels 171 DM Serif usages.
5. **No shared state components** (loading, empty, error), `alert()` in 42 files, and no error boundary.
6. **Routing defects:** duplicate mentor course route, storekeeper landing page with no content, no 404 page, unrouted Vendor Requests and Profile, and Calendar and Announcements outside the portal shell.
7. **Accessibility is mostly absent** below the layout level: no `aria-current`, unlabeled icon buttons, modals without dialog semantics or focus handling.
8. **About 47 dead or duplicate files** make it easy to edit the wrong file.
9. **Tours:** the student tour cannot be launched, onboarding tours are never started, and step-ID collisions show the wrong text.
10. **The chatbot** is missing from four portals and from teacher-role users, loses its conversation on every navigation, and answers only in English.
