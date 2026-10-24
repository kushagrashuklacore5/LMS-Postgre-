# Comprehensive LMS i18n & Localization Audit (Phase 1)

Date: 22 October 2026  
Scope: Frontend application (`LMS-main/client`) and user-facing localization contracts (`server/routes/userLanguageRoutes.js`).  
Status: Phase 1 Completed. Implementation continues in Phases 2–6.

---

## 1. Executive Summary & Architecture Inspection

### 1.1 Core i18n Engine & Registration
- **Engine**: `i18next` v26 + `react-i18next` v17 + `i18next-http-backend` + `i18next-browser-languagedetector`.
- **Initialization**: Centrally initialized in [`client/src/i18n/index.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/i18n/index.js).
  - `fallbackLng`: `en-IN` (Default).
  - Supported languages: strictly `en-IN` and `hi-IN` defined in [`languageRegistry.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/i18n/languageRegistry.js).
  - Namespaces registered: `['common', 'navigation', 'dashboard', 'forms', 'notifications', 'tours', 'chatbot']`.
  - HTTP backend path: `/locales/{{lng}}/{{ns}}.json`.
  - Detection: Reads custom `legacyLocalStorageDetector` (`selectedLanguage` then `i18nextLng`), falls back to `en-IN`.
- **Translation Contexts**:
  - Primary: [`TranslationContext.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/context/TranslationContext.jsx). Provides `useTranslation()`, returning `{ currentLanguage, supportedLanguages, isRTL, changeLanguage, t, isLoading, version, i18n, translations }`.
  - Secondary/Compatibility: [`SimpleTranslationContext.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/context/SimpleTranslationContext.jsx). Delegates directly to `i18n.t()`.
  - Direct `react-i18next` hook: `useTranslation(namespace)` is also imported directly in several components.

### 1.2 Language Switchers & Selectors
- **Primary Component**: [`UniversalLanguageSelector.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/UniversalLanguageSelector.jsx).
- **Aliases**: `LanguageSelector.jsx`, `GlobalLanguageSelector.jsx`, `SimpleLanguageSelector.jsx` (all delegate to `UniversalLanguageSelector`).
- **Switching Mechanism**: Calls `changeLanguage(code)` which executes `i18n.changeLanguage(target)`, updates `localStorage.selectedLanguage` and `localStorage.i18nextLng`, fires `POST /api/user/language-preference` when authenticated, and increments `version` state to trigger immediate component re-renders.

### 1.3 Critical Audit Findings
1. **Unmigrated In-Memory Dictionary (`EN_TRANSLATIONS`)**:
   - `TranslationContext.jsx` contains an in-memory dictionary `EN_TRANSLATIONS` with **1,672 keys**.
   - The JSON namespace files in `public/locales/en-IN/` only had **562 keys**.
   - Over **1,279 keys** existed *only* in English in `EN_TRANSLATIONS`. When the active language is set to `hi-IN`, lookups for these keys fail in `hi-IN/*.json` and fall back to the English string in `EN_TRANSLATIONS`. This caused components in Hindi mode to display English.
2. **Missing Backend Preference Restoration**:
   - `POST /api/user/language-preference` exists and saves preference on manual toggle.
   - `GET /api/user/language-preference` exists on the server, but was **never invoked upon user login or application mount**. Consequently, if an authenticated user logged in from a new browser or session, their saved language preference was not restored.
3. **HTML Lang & Devanagari Typography**:
   - `App.jsx` contained a legacy check setting `document.documentElement.lang = 'ar'` or `'en'`, ignoring `hi-IN`.
   - `index.html` did not preload the `Noto Sans Devanagari` font family, risking inconsistent font fallback across OS environments.
   - Global uppercase styles (`text-transform: uppercase`) and wide `letter-spacing` in headings and buttons can break Hindi Devanagari matras and conjuncts.
4. **Hardcoded UI Strings in Routed Portals**:
   - Out of 244 source files scanned, 81 files currently import `useTranslation` while 163 do not.
   - High concentrations of hardcoded English strings exist in:
     - Accountant portal (`FeesCollection_temp.jsx`, `PaymentHistory_temp.jsx`, `Expenses_temp.jsx`, `OfflineFeeModal.jsx`, `LegacyReconciliation.tsx`)
     - Admin portal (`Admin-Dashboard.jsx`, `FeeStructure.tsx`, `AddStudent.jsx`, `AddTeacher.jsx`, `UserList.jsx`, `Classrooms.jsx`, `DatabaseExport.jsx`)
     - Student portal (`PayFees.jsx`, `StudentResults.jsx`, `StudentAttendance.jsx`, `Student-Dashboard.jsx`)
     - Mentor portal (`ClassFeeStatus.jsx`, `Mentor-Dashboard.jsx`, `ClassroomDetail.jsx`, `AttendanceManagement.jsx`)
     - Storekeeper & Vendor portals (`StorekeeperDashboardSimple.jsx`, `VendorDashboard.jsx`, `VendorOrders.jsx`)
     - Shared modals (`ControlledTermsModal.jsx`, `AnnouncementBell.jsx`, `CreateAnnouncementModal.jsx`)

---

## 2. Portal & Route Inventory

| Portal | Route Path | Active Component | Translation Status |
|---|---|---|---|
| **Public** | `/` | `Home.jsx` | Partially localized. Hero headline/subtitle preserved in English per explicit user requirement. Quick login tabs and nav bar translated. |
| **Public** | `/login`, `/home` | `Home.jsx` (with `QuickLoginModal.jsx`) | Form labels, buttons, role selectors need complete parity. |
| **Public** | `/register` | `Register.jsx` | Contains hardcoded form titles and validation messages. |
| **Public** | `/student-setup` | `StudentSetupPassword.jsx` | Password setup onboarding strings hardcoded. |
| **SuperAdmin** | `/superadmin/login` | `SuperAdminLogin.jsx` | Form labels and submit buttons need dictionary keys. |
| **SuperAdmin** | `/superadmin/dashboard` | `SuperAdminDashboard.jsx` | Tab headers, university cards, status badges need localization. |
| **SuperAdmin** | `/superadmin/subscription` | `SuperAdminSubscription.jsx` | Subscription plan cards, tier limits, pricing strings. |
| **SuperAdmin** | `/internal-admin-portal` | `InternalAdminPortal.jsx` | Internal control actions and statistics. |
| **Admin** | `/admin/dashboard` | `Admin-Dashboard.jsx` | Quick stats, quick action buttons, recent activity. |
| **Admin** | `/admin/add-student` | `AddStudent.jsx` | Form fields (name, email, roll number, class, guardian details). |
| **Admin** | `/admin/add-teacher` | `AddTeacher.jsx` | Teacher registration fields and qualifications. |
| **Admin** | `/admin/users` | `UserList.jsx` | Table headers, status filters, action buttons (edit/delete/reset). |
| **Admin** | `/admin/classrooms` | `Classrooms.jsx`, `ClassroomDetails.jsx` | Classroom creation modal, student assignment list. |
| **Admin** | `/admin/fee-structure` | `FeeStructure.tsx` | Fee installment breakdown, tuition/term fee fields, action buttons. |
| **Admin** | `/admin/database-export` | `DatabaseExport.jsx` | Export format buttons (Excel, CSV, JSON), table download links. |
| **Admin** | `/admin/student-import` | `StudentImport.jsx` | AI mapping prompts, file upload zone, column matcher. |
| **Admin** | `/admin/mentor-approval` | `MentorApproval.jsx` | Pending mentor requests, approve/reject buttons. |
| **Admin** | `/admin/analytics` | `Analytics.jsx` | Metrics labels, charts captions. |
| **Student** | `/student/dashboard` | `Student-Dashboard.jsx` | Course cards, progress bars, upcoming exams, attendance summary. |
| **Student** | `/student/pay-fees` | `PayFees.jsx` | Installment breakdown, Razorpay pay buttons, payment history table. |
| **Student** | `/student/results` | `StudentResults.jsx` | Term exam selector, marks table, grade badges. |
| **Student** | `/student/attendance` | `StudentAttendance.jsx` | Monthly calendar, present/absent counts, percentage badge. |
| **Student** | `/student/my-tests` | `StudentTests.jsx`, `StudentAttempt.jsx` | Test lists, start test buttons, timer, question numbers. |
| **Student** | `/student/assignments` | `StudentAssignments.jsx`, `StudentAssignment.jsx` | Due dates, upload submission, status badges. |
| **Student** | `/student/certificates` | `Certificates.jsx` | Download certificate buttons, completion dates. |
| **Mentor** | `/mentor/dashboard` | `Mentor-Dashboard.jsx` | Assigned classrooms, pending assessments, quick attendance. |
| **Mentor** | `/mentor/classrooms` | `MentorClassrooms.jsx`, `ClassroomDetail.jsx` | Class student rosters, roll numbers, action buttons. |
| **Mentor** | `/mentor/attendance` | `AttendanceManagement.jsx` | Date picker, Present/Absent toggle, Mark All Present, Save. |
| **Mentor** | `/mentor/class-results` | `ClassResults.jsx`, `AddResult.jsx` | Subject marks entry, save results, student dropdown. |
| **Mentor** | `/mentor/fee-status` | `ClassFeeStatus.jsx` | Student fee installment status, Send Reminder button. |
| **Mentor** | `/mentor/assessments` | `TeacherAssessments.jsx`, `CreateAssessment.jsx` | AI generation prompts, question editors, publish buttons. |
| **Mentor** | `/mentor/assignments` | `TeacherAssignments.jsx` | Create assignment modal, student submissions list. |
| **Accountant** | `/accountant/dashboard` | `AccountantDashboard_temp.jsx` | Financial overview cards, daily collection, monthly totals. |
| **Accountant** | `/accountant/payment-history`| `PaymentHistory_temp.jsx` | Transaction table, receipt download, payment method filter. |
| **Accountant** | `/accountant/fees-collection`| `FeesCollection_temp.jsx` | Collect fee form, cash/cheque/online selector, student search. |
| **Accountant** | `/accountant/expenses` | `Expenses_temp.jsx` | Expense category, invoice attachment, add expense modal. |
| **Accountant** | `/accountant/vendor-invoices`| `VendorInvoiceManagement.jsx` | Vendor bill verification, payment status, approve bill. |
| **Accountant** | `/accountant/database-export`| `DatabaseExport.jsx` | Financial audit ledger exports. |
| **Storekeeper** | `/storekeeper/dashboard` | `StorekeeperDashboardSimple.jsx` | Stock stats, low inventory warnings, quick links. |
| **Storekeeper** | `/storekeeper/inventory` | `InventoryManagementSimple.jsx` | Item list, current quantity, minimum threshold, restock action. |
| **Storekeeper** | `/storekeeper/vendors` | `VendorManagementSimple.jsx` | Approved vendors, contact details, stock requests. |
| **Storekeeper** | `/storekeeper/requirements`| `Requirements.tsx` | Teacher supply requests, approve/reject/fulfill actions. |
| **Vendor** | `/vendor/dashboard` | `VendorDashboard.jsx` | Active purchase orders, pending deliveries, payment balance. |
| **Vendor** | `/vendor/orders` | `VendorOrders.jsx` | Order status, delivery date, item details, update status. |
| **Vendor** | `/vendor/stock` | `VendorStock.jsx` | Product catalog, unit price, stock availability. |
| **Vendor** | `/vendor/invoices` | `VendorInvoices.jsx` | Submit invoice, invoice number, due date, amount. |
| **Vendor** | `/vendor/payments` | `VendorPayments.jsx` | Received payments, transaction ID, bank reference. |

---

## 3. Localization Verification Checklist

### Phase 2: Translation Dictionaries Completeness
- [x] Identify all 1,279 unmigrated keys in `EN_TRANSLATIONS`.
- [ ] Migrate keys into standard JSON namespaces (`common.json`, `navigation.json`, `dashboard.json`, `forms.json`, `notifications.json`).
- [ ] Ensure 100% Hindi (`hi-IN`) parity for all migrated keys with accurate, contextual terminology.
- [ ] Verify that no key falls back to key name or English dictionary when Hindi is active.
- [ ] Maintain variable interpolation compatibility (e.g., `{count}`, `{name}`, `{{count}}`).

### Phase 3: Portal UI Connection
- [ ] Connect Layout navigation bars: `StudentLayout`, `MentorLayout`, `AdminLayout`, `SuperAdminLayout`, `AccountantLayout`, `VendorLayout`, `Sidebar.tsx`.
- [ ] Connect Authentication & Landing: `QuickLoginModal`, `SuperAdminLogin`, `Home.jsx` (respecting English Hero exception).
- [ ] Connect Student Portal pages: `Student-Dashboard`, `PayFees`, `StudentResults`, `StudentAttendance`.
- [ ] Connect Mentor Portal pages: `Mentor-Dashboard`, `AttendanceManagement`, `ClassFeeStatus`, `ClassResults`.
- [ ] Connect Admin Portal pages: `Admin-Dashboard`, `FeeStructure`, `AddStudent`, `AddTeacher`, `UserList`, `DatabaseExport`.
- [ ] Connect Accountant Portal pages: `AccountantDashboard_temp`, `PaymentHistory_temp`, `FeesCollection_temp`, `Expenses_temp`, `OfflineFeeModal`.
- [ ] Connect Storekeeper & Vendor pages: `StorekeeperDashboardSimple`, `VendorDashboard`, `VendorOrders`.
- [ ] Connect Shared modals: `ControlledTermsModal`, `AnnouncementBell`, `CreateAnnouncementModal`.

### Phase 4: Switching & Preference Persistence
- [ ] Real-time switching without page reload across all active views.
- [ ] Synchronize `GET /api/user/language-preference` on login/mount without creating infinite request loops.
- [ ] Ensure `x-language` header is consistently sent with API requests via `axiosInstance`.
- [ ] Verify localStorage keys: `selectedLanguage` and `i18nextLng`.

### Phase 5: Document Lang, Fonts & Number/Currency Formatting
- [ ] Dynamically update `document.documentElement.lang` (`en` for `en-IN`, `hi` for `hi-IN`).
- [ ] Add `Noto Sans Devanagari` font link in `index.html` and configure font family in `index.css`.
- [ ] Prevent letter-spacing distortion on Devanagari characters via CSS rule `:lang(hi)`.
- [ ] Format INR currencies and dates with locale sensitivity (`Intl.NumberFormat('en-IN'/'hi-IN')`).

### Phase 6: Automated Validation & Report
- [ ] Enhance `verify_i18n.js` to assert dictionary parity, check for empty values, and verify referenced keys.
- [ ] Run test suite and Vite build.
- [ ] Generate `docs/LMS_I18N_IMPLEMENTATION_REPORT.md`.

---
*Proceeding directly to Phase 2: Dictionary Completion & Migration.*
