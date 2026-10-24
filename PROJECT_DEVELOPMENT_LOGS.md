# Core5 LMS — Project Development & Task Changelog
**Tracking Period:** 25 September 2026 – Present (Updated: October 23, 2026)  
**Workspace:** `new_lms` / `LMS-PROTOTYPE-2`

---

## Executive Summary
This document provides an exhaustive, chronological, and categorized record of all engineering, architectural, UI/UX, database, and feature implementations executed across the Core5 LMS platform from **25 September 2026 onwards**, including active development logs.

---

## 📅 Chronological Development Milestones

### Milestone 1: Global Design System & Sharp Luxury Aesthetics (Sep 25 – Oct 1, 2026)
* **Core Design Tokens Standardized:**
  * Primary Accent: **Warm Gold (`#B99652`)** & Light Gold (`#ebdcaa`)
  * Neutral Dark: **Deep Navy / Indigo (`#1e1b4b`, `#002366`)**
  * Light Background: **Crisp Luxury Cream (`#fffdf4`)**
  * Geometry: **Sharp Architectural Corners (`rounded-none`)** across all cards, modals, buttons, and inputs.
* **Global Toast & Alert Notifications (`client/src/index.css`):**
  * Restyled all `react-toastify` popups to match luxury theme with gold borders, dark navy backgrounds, and sharp typography.
* **AI Assessment Generator Typography Refinement (`AiAssessmentGenerator.jsx`):**
  * Softened step badges (`1`, `2`, `3`, `4`) and question numbering from harsh thick weights to elegant `font-medium` typography.
* **SuperAdmin Layout & Header Polishing (`SuperAdminLayout.jsx`):**
  * Cleaned top-bar header; removed redundant page title banners.
  * Styled live subscription timer, active badges, and logout controls.

---

### Milestone 2: Multi-Tenant Architecture & Plan Inheritance (Oct 1 – Oct 5, 2026)
* **SuperAdmin Subscription Engine (`SuperAdminSubscription.jsx`):**
  * Overhauled pricing cards with Warm Gold borders and Deep Navy action buttons.
  * Implemented robust 1-click test upgrade API (`/api/subscriptions/test-upgrade`) activating 1-year plans with immediate live cache synchronization.
  * Added scoped loading spinners per-card to avoid multi-button loading anomalies.
* **Automated Expiration & Monitoring Schedulers:**
  * Deployed `subscription-scheduler.js` (hourly validation) and `plan-monitor.js` (30-second cache polling) to automatically adjust quotas upon plan transitions.
* **Database Isolation & Master SQLite Engine:**
  * Consolidated database persistence under `server/data/lms_permanent.db`.
  * Verified table integrity for `users`, `universities`, `classrooms`, `courses`, `subscriptions`, `inventory`, `vendors`, `attendance`, `fee_structures`, and `results`.

---

### Milestone 3: End-to-End "Book a Demo" Enterprise System (Oct 7, 2026)
* **Frontend Lead Modal (`BookDemoModal.jsx`):**
  * Replaced mock local state with real Axios API call (`POST /api/demo-requests`).
  * Added animated loading state (`Confirming Schedule...` spinner) and error alert banners.
  * Preserved sharp enterprise split-screen container with verified institutional testimonial badges.
* **Backend Ingestion & Dispatch API (`server/routes/demoRoutes.js`):**
  * `POST /api/demo-requests`: Validates form inputs, stores records in SQLite `demo_requests` table, and triggers background email dispatches.
  * `GET /api/demo-requests`: Fetches all incoming demo leads sorted by newest first.
  * `PATCH /api/demo-requests/:id/status`: Allows status transitions (*Pending / Contacted / Scheduled / Completed / Rejected*).
  * `DELETE /api/demo-requests/:id`: Removes obsolete leads.
* **Dual Email Notification Automation (`server/services/emailService.js`):**
  * **Admin Alert Email:** Configured receiver `sakshi.mishra@core5.co.in` with detailed lead metadata (Name, Email, University, Student Count, Date, Time Slot) and 1-click **"Reply Directly to Client"** action.
  * **Client Confirmation Email:** Sends professional acknowledgment with walkthrough agenda to the prospective client.
* **SuperAdmin Dashboard "Demo Leads" Panel (`SuperAdminDashboard.jsx` & `SuperAdminLayout.jsx`):**
  * Added **"Demo Leads"** navigation item with Calendar icon in sidebar.
  * Built metrics cards: *Total Inquiries, Pending Outreach, Scheduled/Contacted, Completed*.
  * Search filter by name, email, and institute + 1-click status filtering tabs.
  * Interactive table with inline status dropdowns, direct email trigger (`mailto:`), and deletion controls.

---

## 📊 Feature & Component Status Matrix

| Component / Feature | Scope | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Book a Demo Modal** | Frontend | ✅ Active | Real API connected, loading & error states |
| **Demo Requests API** | Backend | ✅ Active | Route `/api/demo-requests` fully operational |
| **Demo Leads Management** | SuperAdmin | ✅ Active | Full CRUD & filter panel in SuperAdmin Dashboard |
| **Admin Email Notifications** | Email Service | ✅ Configured | Dispatches to `sakshi.mishra@core5.co.in` |
| **Client Confirmation Mail** | Email Service | ✅ Configured | Dispatches to client `workEmail` |
| **Subscription Test Upgrade** | SuperAdmin | ✅ Active | 1-Click annual plan upgrade & cache sync |
### Milestone D: Strict 10-Digit Mobile Number Validation & Inline UX (Oct 7, 2026)
* **Frontend & Backend Sanitization:**
  * **Add Student (`AddStudent.jsx` & `adminController.js`):** Enforces numeric-only typing, `maxLength={10}`, and shows real-time inline helper `"Please enter a 10-digit number"` under the input field (no harsh red toast).
  * **Add Teacher (`AddTeacher.jsx` & `adminController.js`):** Enforces numeric restriction, `maxLength={10}`, and displays clean inline validation below the input.
  * **Create Institute (`CreateUniversityForm.jsx` & `superadminController.js`):** Replaced top-right red toast with subtle inline `"Please enter a 10-digit number"` text and rose focus border under the contact phone field.
  * **Vendor Profile (`VendorProfile.jsx`):** Applied 10-digit numeric constraint and validation on profile updates.

### Milestone E: Student Portal Sidebar Optimization (Oct 7, 2026)
* **Redundant Navigation Removal:**
  * Cleaned up [StudentLayout.jsx](file:///c:/Users/lenovo/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/StudentLayout.jsx) by removing duplicate `Announcements (School Updates)` item from the bottom of the student sidebar navigation.

### Milestone F: Student Fees & Payments Access Integration (Oct 7, 2026)
* **Student Sidebar & Dashboard Quick Action:**
  * Added **`Fees & Payments`** (`/student/pay-fees`) directly to [StudentLayout.jsx](file:///c:/Users/lenovo/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/StudentLayout.jsx) sidebar navigation.
  * Added **`Pay Institute Fees`** prominent Quick Action banner in [Student-Dashboard.jsx](file:///c:/Users/lenovo/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/student/Student-Dashboard.jsx) with instant link to dues & receipt download.

### Milestone G: Fee Monitoring & Reminders Relocation to Accountant Portal (Oct 8, 2026)
* **Role Separation & Navigation Architecture:**
  * **Removed from Teacher Portal:** Cleaned up [MentorLayout.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/MentorLayout.jsx) by removing financial tracking (`Fee Monitoring & Reminders`) from the teacher sidebar navigation.
  * **Added to Accountant Portal:** Added **`Fee Monitoring & Reminders`** (`/accountant/fee-monitoring`) to [AccountantLayout.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/AccountantLayout.jsx) sidebar with `Bell` icon.
  * **Dynamic Layout Component:** Updated [ClassFeeStatus.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/mentor/ClassFeeStatus.jsx) to dynamically mount within `AccountantLayout` for accountant users and `MentorLayout` for mentors.
  * **Protected Accountant Route:** Added `/accountant/fee-monitoring` protected route in [App.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/App.jsx).

### Milestone H: Reports & Analysis Excel Export Center (Oct 8, 2026)
* **Full Financial Excel Export Suite:**
  * **Renamed & Restructured:** Replaced placeholder red test page at `/accountant/database-export` with **`Reports & Analysis`** (`/accountant/reports` & `/accountant/database-export`) in [AccountantLayout.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/AccountantLayout.jsx) with `FileSpreadsheet` icon.
  * **Dedicated Excel (.csv) Export Modules:**
    1. **Paid Students Excel:** Downloads list of all students with cleared fees, payment receipts & transaction modes.
    2. **Unpaid / Dues Pending Excel:** Downloads list of students with outstanding dues, remaining balance, due dates & phone numbers for instant follow-up.
    3. **Master Fee Statement:** Full student fee history export.
    4. **Funds & Grants Received:** Breakdown of tuition fees, Govt grants, corporate aid & donations.
    5. **Vendor Invoices & Expenses:** Complete log of vendor payments & campus operational expenses.
  * **Live Data Table Preview:** Added tabbed preview tables with search filter for real-time inspection before downloading Excel reports.

### Milestone I: Dynamic Admin Installment Plan Configurator & Student Integration (Oct 8, 2026)
* **Persistent Custom Installment Schedules:**
  * **Admin Custom Plan Builder ([`FeeStructure.tsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/admin/FeeStructure.tsx)):**
    * Added `[+ Add Installment Plan]` button and modal builder supporting custom plan names, 1 to 24 installments count, Equal Split vs Custom % allocation, exact 100% total validation, due date picker per stage, and Active/Inactive visibility toggles.
    * Allows Admin to Create, Edit, Enable/Disable, and Delete installment plans.
  * **Backend Schema & API Linkage ([`classroomController.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/controllers/classroomController.js)):**
    * Persists `installmentOptions` JSON in `feeStructures` SQLite table and returns it via `/api/classrooms/fee-structures` and `/api/classrooms/fee-structures/:id`.
  * **Dynamic Student Portal Integration ([`PayFees.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/student/PayFees.jsx)):**
    * Replaced static hardcoded payment options with dynamic active plans list configured by Admin.
    * Dynamically calculates per-installment amounts based on student's actual fee structure with selectable installment stages.

---

## 📊 Feature & Architecture Status Matrix

| Component / Feature | Scope | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Book a Demo Modal** | Frontend | ✅ Active | Real API connected, loading & error states |
| **Demo Requests API** | Backend | ✅ Active | Route `/api/demo-requests` fully operational |
| **Demo Leads Management** | SuperAdmin | ✅ Active | Full CRUD & filter panel in SuperAdmin Dashboard |
| **10-Digit Phone Validation** | Frontend + API | ✅ Active | Clean inline validation below inputs (no red toasts) |
| **Student Sidebar Streamline** | Frontend | ✅ Active | Duplicate announcements item removed |
### Milestone G: Student Fee Portal Redesign & Luxury Theme Polish (Oct 7, 2026)
* **Dedicated Student Fee Portal (`PayFees.jsx`):**
  * Removed all redundant admin charts (Pie, Line, and Bar charts) and raw untranslated strings.
  * Wrapped page within [StudentLayout.jsx](file:///c:/Users/lenovo/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/StudentLayout.jsx) with Core5 luxury navy & warm gold aesthetic.
  * Implemented **3 sharp financial metric cards**: *Total Annual Fee, Paid to Date, and Remaining Balance*.
  * Added clean **Itemized Curriculum Breakdown** table and intuitive payment schedule options (*Full, Term 1, Custom*).
  * Connected verified transaction history with **1-Click Official Tax Invoice (PDF) generator** using `generateInvoicePdf`.

### Milestone H: Student Portal Visual Harmony & Eye-Pleasing Modern UI (Oct 7, 2026)
* **Visual Palette Alignment:**
  * Replaced the harsh yellowish-cream background with clean, modern **Soft Light Slate (`bg-[#f8fafc]`)** and crisp white card containers with soft rounded corners (`rounded-2xl`).
  * Aligned color tokens with the Student Dashboard (Deep Royal Navy `#002366`, Vibrant Blue `#2563eb`, Emerald `#10b981`, and Slate `#0f172a`).
  * Delivered zero eye-strain, modern, comfortable-to-read typography and smooth interactive states.

### Milestone I: Step 1 - Offline Fee Collection & Manual Entry System (Oct 7, 2026)
* **Backend Ingestion & Offline Payment Engine (`accountantRoutes.js`):**
  * `POST /api/accountant/collect-offline-fee`: Records manual fee collection (Cash, Cheque, Demand Draft, Bank Transfer / NEFT, UPI) directly into SQLite `payments` table.
  * `GET /api/accountant/students`: Exposes student listing endpoint for instant search/auto-complete selection during fee recording.
* **Frontend Offline Fee Modal (`OfflineFeeModal.jsx`):**
  * Created dedicated modal with student selection, custom payment mode, reference ID generator (`OFFLINE-REC-XXXXXX`), date picker, and remarks.
  * Integrated **1-Click Official Tax Invoice PDF generator** upon successful transaction.
* **Portal Integration:**
  * Integrated **`💰 Record Offline Fee`** button into Admin Fee Structure page ([FeeStructure.tsx](file:///c:/Users/lenovo/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/admin/FeeStructure.tsx)) and Accountant Dashboard ([AccountantDashboard.jsx](file:///c:/Users/lenovo/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/accountant/AccountantDashboard.jsx)).

### Milestone J: Terms & Conditions First-Time Login Modal Luxury Redesign (Oct 7, 2026)
* **Visual Palette & Branding Realignment (`ControlledTermsModal.jsx` & `TermsConditionsModal.jsx`):**
  * Replaced the harsh purple header gradient (`from-blue-600 to-purple-600`) with **Core5 Deep Royal Navy (`#002366`)** and **Warm Gold (`#B99652`)** Shield icon badge.
  * Replaced all legacy placeholders (*EduMentor LMS*, *[YOUR COMPANY NAME]*, *[www.yourwebsite.com]*, *[legal@yourcompany.com]*) with official **Core5 LMS Enterprise Ecosystem** branding details.
  * Restyled notice banners to warm amber accents, added rounded container cards (`rounded-2xl`), and updated the Accept button to a high-contrast Warm Gold gradient (`from-amber-500 to-amber-600`).

### Milestone K: Accountant Dashboard Theme Overhaul & Visual Polish (Oct 7, 2026)
* **Visual Theme Alignment (`AccountantDashboard.jsx` & `AccountantLayout.jsx`):**
  * Replaced harsh yellowish background cards (`#fffdf4`) and dark box mismatches with clean **Soft Light Slate (`bg-slate-50` / `bg-[#f8fafc]`)** and crisp white metric cards (`rounded-2xl shadow-sm`).
  * Styled top banner with **Deep Royal Navy (`#002366`)** and **Warm Gold (`#B99652`)** accent badges.
  * Harmonized stat badges (*Emerald for Fees, Royal Blue for Students, Indigo for Averages, Amber for Pending Invoices*).
  * Upgraded Recharts containers with smooth rounded corners, clean tooltip overlays, and zero eye-strain typography.

### Milestone L: Step 2 - Teacher Fee Monitoring & Dual Reminder Notification System (Oct 7-8, 2026)
* **Teacher Management Dashboard (`ClassFeeStatus.jsx`):**
  * Created dedicated page at route `/mentor/fee-monitoring` with sidebar nav item *"Fee Monitoring & Reminders"* (`Receipt` icon) in [MentorLayout.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/MentorLayout.jsx).
  * Implemented real-time fee tracking metrics (*Total Enrolled Students, Fees Cleared, Pending Dues, Total Uncollected Dues*).
  * Added instant Search & Status Filter toolbar (*All, Pending Dues, Paid*).
* **Dual-Channel Automated Reminders (`classroomRoutes.js` & `emailService.js`):**
  * **Gmail SMTP Email Dispatch:** Sends luxury HTML email notifications to students' registered email (`sakshi.mishra@core5.co.in`).
  * **In-App Announcement System:** Posts automated announcements in student portal feed mentioning remaining fee amount and due date.
  * Added **Single Student** and **1-Click Bulk Broadcast** ("📢 Notify All Pending") reminder triggers.
* **Core5 Brand Aesthetic:**
  * Styled with sharp squares (`rounded-none`) and Core5 Deep Royal Navy (`#002366`) & Gold (`#B99652`) accents.

### Milestone P: Accountant Vendor Invoices Page Theme & Contrast Redesign (Oct 8, 2026)
* **Accountant Vendor Invoices UI Overhaul ([VendorInvoiceManagement.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/accountant/VendorInvoiceManagement.jsx)):**
  * **Contrast & Title Fix:** Replaced hard-to-read white header text with `#002366` Deep Royal Navy title (`Vendor Invoices & Payment Ledger`) and clear slate subtitle.
  * **Core5 Brand Aesthetic:** Replaced rounded gradient blocks (`rounded-xl`) and transparent dark containers with sharp square cards (`rounded-none border border-[#ebdcaa]`), `#B99652` Warm Gold icons/accents, `#fbf6e6` table header background, and high-contrast status tags.
  * **Modal & Audit Ledger Restyling:** Updated Invoice Details modal and Payment History Ledger modal with sharp `#002366` headers, `#fffdf0` off-white detail cards, and `#002366` payment action buttons.

### Milestone Q: Accountant Executive Dashboard Full Luxury Theme Redesign (Oct 8, 2026)
* **Accountant Dashboard Overhaul ([AccountantDashboard_temp.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/accountant/AccountantDashboard_temp.jsx)):**
  * **Visual Theme Realignment:** Replaced dark slate background (`from-slate-900 via-slate-800`) and neon gradient blocks with clean `#fffdf0` off-white background and sharp square white cards (`rounded-none border border-[#ebdcaa]`).
  * **Executive Header & Metrics:** Added `#002366` Royal Navy header title (`Accountant Executive Dashboard`), sharp top-accent border cards for *Total Fees Collected*, *Pending Vendor Invoices*, and *Total Settled Expenses*.
  * **Recharts Financial Graphs:** Restyled Revenue Trajectory line chart & Expense Analysis bar chart with `#002366` Navy / `#B99652` Gold styling, clean light tooltip cards, and `#f1e5c8` gridlines.

### Milestone R: Record Offline Fee Payment Modal Sharp Luxury Redesign (Oct 8, 2026)
* **Offline Fee Modal Overhaul ([OfflineFeeModal.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/OfflineFeeModal.jsx)):**
  * **Sharp Corners & Decluttering:** Replaced rounded bubble corners (`rounded-2xl`, `rounded-xl`) and dark header gradient with sharp square containers (`rounded-none border border-[#ebdcaa]`), `#002366` Royal Navy header bar, and `#B99652` Gold badge.
  * **Input & Button Aesthetics:** Restyled search bar, student dropdown, amount field, payment mode selector, collection date picker, and remarks textarea with crisp off-white (`#fffdf0`) backgrounds and `#002366` focus borders.
  * **Success & Receipt Action:** Styled recorded transaction summary and *Download Tax Invoice PDF* button with `#002366` Navy and `#B99652` Gold accents.

### Milestone S: Collect Offline Fee Icon Cleanup & Formatting (Oct 8, 2026)
* **Button & Modal Header Icon Removal:**
  * **Collect Offline Fee Button ([FeesCollection_temp.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/accountant/FeesCollection_temp.jsx)):** Removed dollar sign icon (`<DollarSign />`) from the "Collect Offline Fee" button for clean text presentation.
  * **Offline Fee Modal Header ([OfflineFeeModal.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/OfflineFeeModal.jsx)):** Removed highlighted money bag icon (`💰`) container from modal header bar to deliver a clean, professional corporate heading.

---

## 📊 Feature & Architecture Status Matrix

| Component / Feature | Scope | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Book a Demo Modal** | Frontend | ✅ Active | Real API connected, loading & error states |
| **Demo Requests API** | Backend | ✅ Active | Route `/api/demo-requests` fully operational |
| **Demo Leads Management** | SuperAdmin | ✅ Active | Full CRUD & filter panel in SuperAdmin Dashboard |
| **10-Digit Phone Validation** | Frontend + API | ✅ Active | Clean inline validation below inputs (no red toasts) |
| **Student Fee Portal Access** | Frontend | ✅ Active | Direct sidebar navigation & Dashboard Quick Action |
| **Student Fee Portal UI** | Frontend | ✅ Active | Soft Slate & Blue modern theme, eye-pleasing & clean PDF receipts |
| **Offline Fee Collection (Step 1)** | Accountant Portal | ✅ Active | Exclusively handled by Accountant with Tax Invoice PDF generation |
| **Teacher Fee Monitoring (Step 2)** | Mentor Portal | ✅ Active | Live student fee tracking + Email & Announcement Reminders |
| **Accountant Dashboard Page** | Accountant Portal | ✅ Active | Redesigned with sharp square containers, Recharts #002366 & #B99652 theme |
| **Accountant Expenses Page** | Accountant Portal | ✅ A| **Accountant Vendor Invoices Page** | Accountant Portal | ✅ Active | Redesigned with sharp square containers, high-contrast tables & audit ledger |
| **Offline Fee Payment Modal** | Accountant Component | ✅ Active | Redesigned with sharp square borders, #002366 Navy header & clean title |
| **Student Fee Security & Lockdown** | Student Portal | ✅ Active | Locked payment amount input (`readOnly disabled`), 3 fixed payable options (Full, Term 1, Term 2) |
| **Student Fee Core5 Sharp Theme** | Student Portal | ✅ Active | Overhauled PayFees.jsx with sharp square cards, Deep Royal Navy #002366 & Warm Gold #B99652 |
| **Online + Offline Transaction Sync** | Student Portal | ✅ Active | Integrated DB payments history endpoint to reflect Accountant cash collections & Razorpay receipts |
| **Role-Based Fee Separation** | Admin vs Accountant | ✅ Active | Admin configures structure; Accountant enters offline cash fees |
| **Admin Installment Configurator** | Admin Portal | ✅ Active | Configurable installment plan templates (Full 100%, 2 Terms 50-50, 4 Quarterly 25x4, 10 Monthly EMIs) |
| **Email Delivery (Google Workspace)** | Email Service | ✅ Active | Verified SMTP (`sakshi.mishra@core5.co.in`) |

---

### Milestone V: Universal Dynamic Installment Engine & Multi-Role Integration (Admin, Student, Accountant) (Oct 8–9, 2026)
* **1. Admin Custom Installment Builder ([`FeeStructure.tsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/admin/FeeStructure.tsx)):**
  * Added `[+ Add Installment Plan]` dynamic modal builder supporting:
    * Custom Plan Name (e.g., "3-Term Split", "6-Month Plan").
    * Dynamic installment count (1 to 24 stages).
    * Split Type: **Equal Split** (auto-divided percentages) or **Custom Percentage** (per-stage manual percentages).
    * Strict 100% total sum validation before saving.
    * Per-stage Due Timing / Date selection.
    * Active / Inactive visibility toggle.
    * Full CRUD operations: Create, Edit, Toggle Status, and Delete plans.
* **2. Backend Storage & Multi-Role API ([`classroomController.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/controllers/classroomController.js), [`classroomRoutes.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/routes/classroomRoutes.js), [`accountantRoutes.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/routes/accountantRoutes.js)):**
  * Persisted `installmentOptions` JSON string in `feeStructures` SQLite database.
  * Opened `GET /api/classrooms/fee-structures` to all authenticated roles (Admin, Accountant, Student) for seamless cross-portal fee structure retrieval.
  * Enhanced `GET /api/accountant/students` to join `users` and `classrooms` to return real enrolled student list with grades and section data.
  * Updated `getMe` and login controllers (`auth-controller.js`) to include student's enrolled college name and campus area.
* **3. Dynamic Student Portal Fee Schedule & Custom Invoice ([`PayFees.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/student/PayFees.jsx) & [`invoice.ts`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/invoice.ts)):**
  * Connected Student Portal directly to Admin's active installment plans for their enrolled grade (Primary: Grades 1–4, Secondary: Grades 5–12).
  * Automatically calculates per-stage amounts based on student's total fee package.
  * Interactive stage selection with real due dates and status tracking.
  * Upgraded 1-Click Official Tax Invoice (PDF) to dynamically print student's specific enrolled College/University name, student ID, and itemized breakdown.
* **4. Accountant Portal Integration ([`FeesCollection.tsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/FeesCollection.tsx), [`PaymentModal.tsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/PaymentModal.tsx), [`OfflineFeeModal.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/OfflineFeeModal.jsx)):**
  * Replaced hardcoded sample student lists (`sampleStudents`) with live student data from `/api/accountant/students`.
  * Replaced static percentage chips (25%, 50%, 75%) with Admin's active installment plans and calculated stages.
  * In offline fee collection, Accountant can select student, load their active installment plan, and record partial/stage offline cash, cheque, or UPI receipts.
* **5. Layout Viewport & Vertical Scroll Fix ([`AccountantLayout.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/AccountantLayout.jsx)):**
  * Fixed `<main>` container height constraints by applying `h-screen flex flex-col` (replacing `min-h-screen`) allowing smooth vertical scrolling across all accountant sub-pages including Fee Monitoring & Reminders.

---

### Milestone W: Phase 2A Reliable Installment Tracking Engine & Remediation (Oct 9, 2026)
* **1. Atomic Stage Allocation & Overpayment Prevention ([`installmentService.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/services/installmentService.js)):**
  * Integer paise arithmetic across all balance calculations to eliminate floating point drift.
  * Idempotency protection with SHA-256 hash checks (`idempotencyKey`) on offline fee records.
  * Strict atomic stage validation: partial payment allocation, stage clearance status, and overpayment prevention.
  * Migration runner ([`migration-runner.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/config/migration-runner.js)) creating `student_fee_schedules` and `payment_orders` with safe rollback protections.
  * Passed 16/16 automated tests in [`test_phase2a_remediation.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/scripts/test_phase2a_remediation.js).

---

### Milestone X: Phase 2B Secure Payment Order Creation & Gateway Verification (Oct 9, 2026)
* **1. Server-Side Razorpay Order Creation ([`payment-controller.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/controllers/payment-controller.js)):**
  * Server calculates exact stage amount from active database schedule; rejects client-tampered amounts with HTTP 400.
  * Strict student token authentication; enforces university/tenant scoping and prevents cross-student order creation.
  * Reuses uncaptured active orders within 15-minute window to avoid duplicate gateway orders.
  * Passed 5/5 automated tests in [`test_phase2b_step1.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/scripts/test_phase2b_step1.js).
* **2. Server-Side HMAC SHA-256 Signature Verification & Direct Gateway Fetch:**
  * Constant-time timing-safe signature comparison (`crypto.timingSafeEqual`).
  * Direct Razorpay API fetch to confirm `captured` status and amount integrity before credit.
  * Atomically creates payment record and marks installment stage cleared; handles gateway timeout retries safely.
  * Passed 12/12 automated tests in [`test_phase2b_step2.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/scripts/test_phase2b_step2.js).
* **3. Student Portal UI Integration ([`PayFees.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/student/PayFees.jsx)):**
  * Integrated server-side order generation and Razorpay modal checkout.
  * Added unallocated historical payment warnings (`Installment Collection Blocked (Reconciliation Required)`).
  * Removed legacy client bypass routes (`/api/transactions`).

---

### Milestone Y: Phase 2C Step 1 — Read-Only Legacy Payment Reconciliation (Oct 9, 2026)
* **1. Read-Only Legacy Reconciliation Console ([`LegacyReconciliation.tsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/LegacyReconciliation.tsx)):**
  * Built dedicated accountant/admin view listing historical successful payments missing schedule/stage linkage.
  * Displayed metrics: *Unallocated Payments Count, Total Unallocated Value (₹), Affected Students*.
  * Search filter by student name, ID, or transaction reference.
  * Prominent **Pending Academic-Session Confirmation Required** safety notice explaining that automatic grade-based inference is disabled for data integrity.
  * Disabled "Confirm Allocation" button with clear read-only audit badges.
* **2. Read-Only Backend Endpoint ([`accountantRoutes.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/routes/accountantRoutes.js)):**
  * Added `GET /api/accountant/unallocated-payments` protected by `requirePaymentAuth` and `requireRoles(STAFF_ROLES)`.
  * Scoped queries strictly to authorized university/tenant database.
  * Safe join providing student details, payment amount/paise, date, txn ID, and current curriculum context.
  * Zero database writes, zero mutations, zero auto-inferences.
* **3. Sidebar & Routing Integration:**
  * Added **`Legacy Reconciliation`** to [Sidebar.tsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/Sidebar.tsx), [AccountantLayout.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/AccountantLayout.jsx), [AccountantDashboard.tsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/AccountantDashboard.tsx), and [App.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/App.jsx).
  * Added non-disruptive informational alert banner to [FeesCollection.tsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/accountant/FeesCollection.tsx) and [FeesCollection_temp.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/accountant/FeesCollection_temp.jsx).
* **4. Automated Isolated Test Suite ([`test_phase2c_step1.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/server/scripts/test_phase2c_step1.js)):**
  * 7/7 tests passed: Auth enforcement (401/403/200), Unallocated filtering, Multi-tenant scoping, Read-only write verification.

---

### Milestone Z: Quick Alphabetical Attendance Carousel Mode (Oct 13–14, 2026)
* **Single-Line Sliding Carousel Workflow ([`AttendanceManagement.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/mentor/AttendanceManagement.jsx)):**
  * Implemented an interactive single-student sliding attendance card placed right above the standard attendance table.
  * Alphabetical automatic ordering of students with fluid, eye-soothing slide transitions.
  * Minimalist, zero-fatigue action controls (*Present, Absent, Late*) for 1-tap rapid roll-call.
  * Preserved dual modes: Teachers can toggle seamlessly between rapid carousel marking and traditional bulk spreadsheet view.

---

### Milestone AA: Comprehensive AI Assessment & Student Performance Analytics (Oct 14–16, 2026)
* **Unified Academic Insights Overhaul:**
  * Replaced isolated single-test redirects with comprehensive student performance and holistic KPI evaluation reports.
  * Correlated AI assessment metrics with attendance, course completion rates, and historical benchmark trends.
  * Delivered executive progress cards with exportable performance summaries for academic counselors and parents.

---

### Milestone AC: Full 20 Scheduled Indian Languages Architecture & Dictionary Pipeline (Oct 22, 2026)
* **1. Centralized Language Registry ([`languageRegistry.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/i18n/languageRegistry.js)):**
  * Extended system from bilingual (`en-IN`, `hi-IN`) to all **20 Scheduled Indian Languages**:
    * English (`en-IN`), Hindi (`hi-IN`), Bengali (`bn-IN`), Telugu (`te-IN`), Marathi (`mr-IN`), Tamil (`ta-IN`), Gujarati (`gu-IN`), Kannada (`kn-IN`), Malayalam (`ml-IN`), Punjabi (`pa-IN`), Odia (`or-IN`), Assamese (`as-IN`), Urdu (`ur-IN`, RTL), Sanskrit (`sa-IN`), Kashmiri (`ks-IN`, RTL), Nepali (`ne-IN`), Konkani (`kok-IN`), Manipuri (`mni-IN`), Bodo (`brx-IN`), Santali (`sat-IN`).
  * Defined canonical metadata: BCP-47 locale tags, legacy 2-letter mapping, native endonyms, text direction (`'ltr'` / `'rtl'`), script family classification, and CSS font stacks.
* **2. Multi-Namespace Translation Catalogs (140 Files Total):**
  * Generated 126 new locale dictionaries across 7 namespaces: `common`, `navigation`, `dashboard`, `forms`, `notifications`, `tours`, and `chatbot`.
  * Exactly 1,790 keys per locale (35,800 keys across all 20 languages) with **100% key parity** against English reference dictionaries.
  * Implemented safe variable token masking (`___VAR_0___`) to protect interpolation tokens (`{{current}}`, `{{total}}`, `{{count}}`) from corruption.
* **3. Bidirectional Right-to-Left (RTL) Infrastructure ([`App.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/App.jsx) & [`index.css`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/index.css)):**
  * Dynamic `document.documentElement.dir = 'rtl'` and `lang` switching for Urdu (`ur-IN`) and Kashmiri (`ks-IN`).
  * Bidirectional layout mirroring: right-aligned body copy, reversed margins/paddings, and RTL flexbox ordering.
* **4. Typography Protection & Script Rendering Engine ([`index.html`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/index.html)):**
  * Integrated Google Fonts Noto Sans font families for 9 distinct script systems (Devanagari, Bengali, Telugu, Tamil, Gujarati, Kannada, Malayalam, Gurmukhi, Oriya, Arabic/Nastaliq).
  * Injected global `letter-spacing: normal !important` override across all 19 Indic scripts to prevent broken conjuncts, half-forms, halants, and vowel matras.
* **5. Universal Language Selector Dropdown ([`UniversalLanguageSelector.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/UniversalLanguageSelector.jsx)):**
  * Upgraded dropdown with scrollable viewport (`max-h-80 overflow-y-auto w-56`), sticky category header, and bilingual script endonym labels for instantaneous recognition.
* **6. Automated Verification & Audit Suite ([`scripts/verify_i18n.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/scripts/verify_i18n.js)):**
  * Built `npm run verify:i18n` checking all 140 files for syntax validity, key parity, and zero unresolved keys in source code.

---

### Milestone AD: Quick Login Modal Streamlining & Frictionless Authentication (Oct 22, 2026)
* **Direct Role Redirection ([`QuickLoginModal.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/QuickLoginModal.jsx)):**
  * Cleaned up Quick Login popup by removing redundant role selector tab buttons (*Student, Mentor, Admin, Storekeeper, Accountant*) and `"Select Portal Role"` sub-label.
  * Transformed into a clean, direct Email + Password authentication modal that verifies credentials and automatically redirects the user to their designated portal based on the decoded JWT claims.

---

### Milestone AE: GuideBot & Driver.js Tour Navigation Localization Across 20 Languages (Oct 22–23, 2026)
* **1. GuideBot Launcher Button Localization ([`GuideBotLauncher.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/guidebot/runtime/GuideBotLauncher.jsx)):**
  * Bound launcher button label and `aria-label` to dynamic translation keys `tours:guidebot_btn` and `tours:start_walkthrough`.
  * Added authentic script transliterations across all 20 languages (Hindi & Marathi: "गाइडबॉट", Bengali & Assamese: "গাইডবট", Telugu: "గైడ్‌బాట్", Tamil: "கைட்பாட்", Urdu & Kashmiri: "گائیڈ بوٹ", Gujarati: "ગાઇડબોટ", Kannada: "ಗೈಡ್‌ಬಾಟ್", Malayalam: "ഗൈഡ്ബോട്ട്", Punjabi: "ਗਾਈਡਬੋਟ", Odia: "ଗାଇଡବଟ୍", Sanskrit: "गाइड्-बोट्", etc.).
* **2. Driver.js Popover "Next" Button Localization Bugfix ([`GuideBotRuntime.js`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/guidebot/runtime/GuideBotRuntime.js)):**
  * Resolved critical bug where hardcoded `'Next'` in `overviewTour.js` driver config was overriding dynamic localized labels.
  * Positioned dynamic i18n label spread after driver configs so forward button translates dynamically into each language (e.g., Marathi: "पुढे", Hindi: "आगे", Bengali: "পরবর্তী").
  * Ensured `prev_btn`, `done_btn`, and `skip_btn` reflect active locale.
* **3. Production Compilation Validation:**
  * Clean Vite production build (`npm run build`) completed in 54.85s with 0 errors.

---

### Milestone AF: Student Portal Language Selector Alignment to Universal Top Header (Oct 23, 2026)
* **Sidebar Footer Cleanup ([`StudentLayout.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/StudentLayout.jsx)):**
  * Removed awkwardly placed `UniversalLanguageSelector` from above the Collapse and Logout buttons in both desktop sidebar and mobile drawer.
  * Eliminated UI crowding, menu clipping risks, and logical mismatch with destructive session controls.
* **Universal Top-Right Header Bar Integration ([`Student-Dashboard.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/student/Student-Dashboard.jsx) & [`StudentLayout.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/StudentLayout.jsx)):**
  * Positioned `<UniversalLanguageSelector variant="compact" />` in the standard Top-Right Header utility bar on the Student Dashboard alongside GuideBot and Announcement Bell.
  * Added sticky top header bar with current page title and compact language switcher across all student subpages (`Courses`, `Results`, `Attendance`, `Fees & Payments`, `Calendar`).
  * Integrated compact language switcher in the mobile topbar for instant 1-tap multilingual access across all mobile screens.

---

### Milestone AG: AI Chatbot Backend Decoupling & 3D Mascot Frontend Shell Preservation (Oct 23, 2026)
* **1. Frontend Mascot & Bubble Trigger Retention ([`LMSChatbot.jsx`](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/Chatbot/LMSChatbot.jsx)):**
  * Preserved the 3D waving Core5 Robot Mascot (`core5RobotPerfect`) and floating speech bubble (`"Hi! Need help?"`) in the bottom-right corner.
  * Retained smooth floating CSS animations (`robotFloat`, `robotWaveTilt`, `bubbleFloat`), responsive modal window, and avatar badges.
* **2. Decoupling of Legacy Pseudo-Backend:**
  * Completely disconnected legacy rule-based querying services (`chatbotService.js`, `mentorChatbotService.js`, `adminChatbotService.js`) that were making hardcoded read queries against `/results/my-results` and `/attendance/student`.
  * Removed internal token decoding and LMS database dependencies from the chatbot.
* **3. Dedicated AI Backend Integration Hook:**
  * Prepared a clean, simulated async response pipeline with an explicit `fetch()` plug-in comment block in `sendMessage()`, ready for 1-step connection when the dedicated external AI LLM backend is provided.
  * Added multilingual translation keys `ai_assistant_title` and `ai_connecting_notice` across all 20 language catalogs.

### Milestone P: SuperAdmin Architecture Realignment & Explore Action Hook (Oct 23, 2026)
* **SuperAdmin Domain Model Alignment (Demo Leads Removal):**
  * Realigned portal purpose: SuperAdmin serves as the University Group Chancellor / Institutional Head (governing multiple member campuses, colleges, staff, and overall institutional administration) rather than an internal software sales lead tracker.
  * Cleanly removed redundant **"Demo Leads"** navigation item from [SuperAdminLayout.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/SuperAdminLayout.jsx).
  * Removed `demoLeads` tab, search filters, state metrics, and polling calls from [SuperAdminDashboard.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/superadmin/SuperAdminDashboard.jsx).
  * Preserved backend `/api/demo-requests` ingestion and automated dual-email dispatch (`emailService.js`) so that prospective institutional walkthrough requests continue to be captured securely in the database.
* **Persona Orbit Interactive Explore Activation:**
  * Upgraded the static `EXPLORE` badge in [PersonaOrbit.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/components/home/PersonaOrbit.jsx) to an interactive, accessible button with gold hover states and click animations.
  * Connected role-specific exploration in [Home.jsx](file:///c:/Users/lenovo/new_lms/LMS-guide-bot/LMS-PROTOTYPE-2/LMS-main/client/src/pages/Home.jsx):
    * **University:** Triggers the Live Walkthrough / Enterprise Demo modal.
    * **Students / Faculty / Admins:** Triggers the Quick Login modal with role pre-selection.

---

## 📊 Feature & Architecture Status Matrix

| Component / Feature | Scope | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Book a Demo Modal** | Frontend | ✅ Active | Real API connected, loading & error states |
| **Demo Requests API** | Backend | ✅ Active | Route `/api/demo-requests` fully operational |
| **Demo Requests Pipeline** | Backend Service | ✅ Active | Automated email dispatch & DB storage (cleanly decoupled from Chancellor console) |
| **10-Digit Phone Validation** | Frontend + API | ✅ Active | Clean inline validation below inputs (no red toasts) |
| **Student Fee Portal Access** | Frontend | ✅ Active | Direct sidebar navigation & Dashboard Quick Action |
| **Student Dynamic Fee Schedule** | Student Portal | ✅ Active | Admin active installment plans dynamically loaded with stage amounts & due dates |
| **Dynamic College Tax Invoice PDF** | Student/Accountant | ✅ Active | Institutional header dynamically pulls student's college name & details |
| **Admin Dynamic Installment Builder**| Admin Portal | ✅ Active | Equal split & Custom % modal, 100% sum check, CRUD & active/inactive toggle |
| **Offline Fee Collection (Phase 2A)**| Accountant Portal | ✅ Active | Real student search, integer paise math, idempotency key & receipt protection |
| **Server Payment Orders (Phase 2B.1)**| Payment Backend | ✅ Active | Server-calculated stage amounts, strict student & university scoping |
| **Payment Verification (Phase 2B.2)**| Payment Backend | ✅ Active | HMAC SHA-256 constant-time verification & Razorpay direct capture check |
| **Legacy Reconciliation (Phase 2C.1)**| Accountant/Admin | ✅ Active | Read-only unallocated payment review & audit console |
| **Fee Monitoring & Reminders** | Accountant Portal | ✅ Active | Relocated to Accountant sidebar with email & notification triggers |
| **Financial Reports & Analysis** | Accountant Portal | ✅ Active | Paid, Unpaid, Master, Grants, & Expense CSV exports |
| **Rapid Attendance Carousel** | Mentor Portal | ✅ Active | Single-line horizontal alphabetical roll-call with smooth transitions |
| **20-Language Multilingual UI (i18n)** | Global App | ✅ Active | Complete 20 Scheduled Indian languages with 140 locale JSON files |
| **Bidirectional RTL Support** | Global App | ✅ Active | Dynamic `dir="rtl"` and layout mirroring for Urdu & Kashmiri |
| **GuideBot & Tour Localization** | Global App | ✅ Active | GuideBot launcher and Driver.js tour controls localized in all 20 languages |
| **Streamlined Quick Login** | Authentication | ✅ Active | Clean modal with automated role-based navigation |
| **Email Delivery (Google Workspace)** | Email Service | ✅ Active | Verified SMTP (`sakshi.mishra@core5.co.in`) |

---

## 📝 Ongoing & Next Planned Tasks
1. **Dynamic Database Content Multilingual Translation (Phase 2):** Evaluate backend schema extensions (e.g. `title_hi`, `title_mr`) or on-demand translation APIs for instructor-generated course titles and descriptions.
2. **Phase 2C Step 2 — Academic Session Allocation Engine:** Implement administrative confirmation workflow allowing accountants/admins to safely map verified historical unallocated payments to specific academic sessions and installment stages.
3. **Payment Gateway Webhook Auto-Reconciliation:** Connect live Razorpay checkout webhooks for automated stage marking upon online clearance.
