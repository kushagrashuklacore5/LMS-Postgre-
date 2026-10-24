const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4'
});

const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
let y = 22;

function checkPageBreak(neededSpace = 15) {
  if (y + neededSpace > pageHeight - 18) {
    doc.addPage();
    y = 22;
  }
}

// Title & Banner Header
doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.setTextColor(30, 27, 75); // Deep Navy
doc.text('CORE5 LMS — PROJECT DEVELOPMENT CHANGELOG', 14, y);
y += 6;

doc.setFontSize(9.5);
doc.setFont('helvetica', 'bold');
doc.setTextColor(185, 150, 82); // Warm Gold
doc.text('TRACKING PERIOD: 25 SEPTEMBER 2026 – 23 OCTOBER 2026 (UPDATED)', 14, y);
y += 4;

doc.setDrawColor(185, 150, 82);
doc.setLineWidth(0.6);
doc.line(14, y, pageWidth - 14, y);
y += 7;

// Section 1: Executive Overview
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.setTextColor(30, 27, 75);
doc.text('1. Executive Overview', 14, y);
y += 5.5;

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.5);
doc.setTextColor(50, 50, 60);
const summaryText = "This official engineering log documents the chronological architecture, backend security integrations, UI/UX overhauls, database migrations, and feature releases completed across the Core5 LMS platform between September 25, 2026 and October 23, 2026. Key areas of advancement include multi-tenant subscription tiers, robust installment and payment systems, live financial export suites, rapid teacher workflows, full 20-language Indic i18n architecture, GuideBot tour controls localization, and streamlined authentication.";
const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 28);
doc.text(splitSummary, 14, y);
y += splitSummary.length * 4.2 + 5;

// Section 2: Chronological Milestones
const milestones = [
  {
    title: 'Milestone 1: Global Design Tokens & Luxury Brand Aesthetics',
    date: '25 Sep – 01 Oct 2026',
    items: [
      'Standardized Brand Tokens: Warm Gold (#B99652, #ebdcaa), Deep Navy (#1e1b4b, #002366), Crisp Cream (#fffdf4), and Sharp Geometry (rounded-none).',
      'Global Alert Restyling (index.css): Customized React-Toastify notifications with dark navy backgrounds, gold framing, and sharp typography.',
      'AI Assessment Generator (AiAssessmentGenerator.jsx): Polished step badges (1, 2, 3, 4) to font-medium typography, eliminating heavy visual clutter.',
      'SuperAdmin Header: Streamlined top navigation, unified live subscription countdown, tenant status pills, and secure logout controls.'
    ]
  },
  {
    title: 'Milestone 2: Multi-Tenant Plan Inheritance & Subscriptions',
    date: '01 Oct – 05 Oct 2026',
    items: [
      'SuperAdmin Pricing Engine: Overhauled SuperAdminSubscription.jsx with instant 1-click test upgrade API (/api/subscriptions/test-upgrade) with real-time tenant quota sync.',
      'Isolated Button Loaders: Scoped mutation loaders per plan tier to prevent cross-card spinning anomalies.',
      'Automated Quota Schedulers: Configured subscription-scheduler.js (hourly checks) and plan-monitor.js (30s cache polling) for automated tier enforcement.',
      'Persistent SQLite Master: Consolidated persistent database operations under server/data/lms_permanent.db with verified relational integrity.'
    ]
  },
  {
    title: 'Milestone 3: End-to-End Enterprise "Book a Demo" System',
    date: '07 Oct 2026',
    items: [
      'Frontend Lead Capture (BookDemoModal.jsx): Real Axios API dispatch (POST /api/demo-requests), animated loading states, and error boundary handling.',
      'Backend Ingestion & Dispatch API (server/routes/demoRoutes.js): Full REST CRUD endpoints for demo inquiries, status transitions, and archiving.',
      'Dual Email Automation (server/services/emailService.js): Configured direct lead notification to sakshi.mishra@core5.co.in with 1-click reply action, plus confirmation to clients.',
      'SuperAdmin Demo Leads Panel: Added dedicated sidebar module with metric counters (Inquiries, Pending, Scheduled, Completed), instant search, and status filters.'
    ]
  },
  {
    title: 'Milestone 4: Strict 10-Digit Mobile Sanitization & Inline Validation',
    date: '07 Oct 2026',
    items: [
      'Inline Helper UX: Replaced jarring top-right red alert popups with subtle, real-time "Please enter a 10-digit number" inline helpers.',
      'Global Portals Sanitization: Applied numeric-only constraints and 10-digit validation across Add Student, Add Teacher, Create Institute, and Vendor forms.'
    ]
  },
  {
    title: 'Milestone 5: Student Navigation Streamlining & Fee Access',
    date: '07 Oct 2026',
    items: [
      'Sidebar Decluttering: Cleaned up StudentLayout.jsx by eliminating redundant secondary announcement links.',
      'Student Fee Shortcut: Positioned prominent "Pay Institute Fees" banner in Student-Dashboard.jsx and direct "Fees & Payments" sidebar navigation.'
    ]
  },
  {
    title: 'Milestone 6: Student Fee Portal Redesign & Modern Soothing Palette',
    date: '07 Oct 2026',
    items: [
      'Visual Theme Overhaul (PayFees.jsx): Replaced harsh cream tone with eye-pleasing Soft Light Slate (bg-[#f8fafc]) and clean white cards, eliminating eye strain.',
      'Financial Summary Metrics: Designed 3 clear metric cards (Total Annual Fee, Paid to Date, Outstanding Balance) and itemized curriculum breakdown.',
      '1-Click Official Tax Invoice: Embedded generateInvoicePdf allowing students to instantly generate and download official institute fee receipts.'
    ]
  },
  {
    title: 'Milestone 7: Offline Fee Collection Engine (Step 1)',
    date: '07 Oct 2026',
    items: [
      'Backend Recording Endpoint: Built POST /api/accountant/collect-offline-fee to record manual cash, cheque, DD, NEFT, and UPI transactions directly into payments table.',
      'Accountant Modal (OfflineFeeModal.jsx): Integrated student auto-search, dynamic receipt reference generator (OFFLINE-REC-XXXXXX), and date picker.',
      'Official Tax Invoice PDF: Generates downloadable compliant receipt immediately upon recording offline cash transactions.'
    ]
  },
  {
    title: 'Milestone 8: Terms & Conditions Modal Luxury Redesign',
    date: '07 Oct 2026',
    items: [
      'Enterprise Branding: Replaced generic placeholder company references with official Core5 LMS ecosystem legal terms.',
      'Theme Alignment: Styled first-time login modal with Royal Navy (#002366) headers, Warm Gold shield badge, and high-contrast acceptance buttons.'
    ]
  },
  {
    title: 'Milestone 9: Fee Monitoring Relocation to Accountant Portal (Step 2)',
    date: '07–08 Oct 2026',
    items: [
      'Role Separation: Removed fee management from teacher sidebar and integrated dedicated Fee Monitoring & Reminders (/accountant/fee-monitoring) in Accountant portal.',
      'Dual Notification Dispatch: Integrated 1-click single student and bulk reminder broadcasts sending luxury HTML emails via SMTP and in-app dashboard announcements.'
    ]
  },
  {
    title: 'Milestone 10: Financial Reports & Analysis Excel (.csv) Center',
    date: '08 Oct 2026',
    items: [
      'Comprehensive Financial Exports (DatabaseExport.jsx): Built dedicated export center supporting 5 distinct CSV datasets: Paid Students, Unpaid Dues, Master Ledger, Grants/Aid, and Vendor Invoices.',
      'Live Table Preview: Implemented interactive tabbed preview tables with search filtering for live audit before spreadsheet download.'
    ]
  },
  {
    title: 'Milestone 11: Accountant Executive Dashboard & Ledger Polish',
    date: '08 Oct 2026',
    items: [
      'Visual Overhaul (AccountantDashboard.jsx): Replaced dark slate blocks with crisp off-white cards, Royal Navy headers, and Warm Gold borders.',
      'Recharts Financial Graphs: Restyled Revenue Trajectory and Expense Breakdown charts with navy/gold styling, custom tooltips, and light gridlines.',
      'Vendor Invoices & Ledger: Overhauled vendor payment audit tables with high-contrast text and payment history modal dialogs.'
    ]
  },
  {
    title: 'Milestone 12: Admin Dynamic Installment Plan Configurator',
    date: '08–09 Oct 2026',
    items: [
      'Admin Plan Builder (FeeStructure.tsx): Added modal configurator supporting custom plan names, 1 to 24 installment stages, Equal Split vs Custom % allocation, strict 100% total validation, and stage due dates.',
      'Multi-Role API Synchronization: Persisted installment plans in SQLite feeStructures; dynamically rendered configured stages across Student PayFees.jsx and Accountant portals.'
    ]
  },
  {
    title: 'Milestone 13: Phase 2A Reliable Installment Engine & Integer Math',
    date: '09 Oct 2026',
    items: [
      'Integer Paise Arithmetic: Migrated installment balances and fee tracking to integer paise, completely eliminating floating-point drift.',
      'Idempotency Protection: Added SHA-256 idempotency key validation on payments to guarantee zero accidental duplicate charges.',
      'Atomic Stage Allocation: Enforces sequential stage clearance, prevents overpayments, and verified via 16/16 passing automated tests.'
    ]
  },
  {
    title: 'Milestone 14: Phase 2B Secure Payment Orders & Gateway Verification',
    date: '09 Oct 2026',
    items: [
      'Server-Calculated Orders (payment-controller.js): Server computes exact stage amount from active database schedule, rejecting client-tampered amounts.',
      'HMAC SHA-256 Verification: Implemented constant-time signature comparison (crypto.timingSafeEqual) and direct Razorpay capture check before recording clearance.',
      'Tenant Scoping: Strict student JWT authentication prevents cross-tenant or cross-student order tampering.'
    ]
  },
  {
    title: 'Milestone 15: Phase 2C Step 1 Read-Only Legacy Payment Reconciliation',
    date: '09 Oct 2026',
    items: [
      'Audit Console (LegacyReconciliation.tsx): Read-only view identifying historical payments missing schedule linkages, displaying unallocated totals and affected students.',
      'Protected Endpoint: GET /api/accountant/unallocated-payments with strict role checks, zero database writes, and complete tenant isolation.'
    ]
  },
  {
    title: 'Milestone 16: Rapid Attendance Carousel Mode (Alphabetical 1-by-1)',
    date: '13–14 Oct 2026',
    items: [
      'Sliding Carousel UX (AttendanceManagement.jsx): Added a single-line horizontal sliding card mode positioned directly above the standard attendance table.',
      'Alphabetical Ordering: Automatically sequences students alphabetically with smooth micro-animations, eliminating visual cognitive load.',
      'Streamlined Roll-Call: Minimalist Present, Absent, and Late action buttons allowing teachers to conduct rapid roll-calls in seconds.'
    ]
  },
  {
    title: 'Milestone 17: AI Assessment & Academic Insights Overhaul',
    date: '14–16 Oct 2026',
    items: [
      'Cohesive Academic Analytics: Connected assessment results directly to student performance deep dive reports rather than isolated test pages.',
      'KPI Benchmark Correlation: Unified test scores with course completion progress and attendance patterns for counseling and parent reviews.'
    ]
  },
  {
    title: 'Milestone 18: Production Multilingual Architecture (i18n) — Phase 1',
    date: '19–22 Oct 2026',
    items: [
      'i18next Integration: Integrated i18next and react-i18next into the React 18 client with localStorage persistence and graceful fallback to en-IN.',
      'Bilingual Support: Built localization catalogs supporting English (en-IN) and Hindi (hi-IN).',
      'Universal Language Selector: Deployed consistent navy/gold dropdown language switcher across SuperAdmin, Admin, Mentor, Student, Accountant, and Vendor layouts.'
    ]
  },
  {
    title: 'Milestone 19: Full 20 Scheduled Indian Languages Architecture & Pipeline',
    date: '22 Oct 2026',
    items: [
      '20 Languages Supported: Extended from bilingual to en, hi, bn, te, mr, ta, gu, kn, ml, pa, or, as, ur, sa, ks, ne, kok, mni, brx, sat.',
      '140 Catalog Files: Generated 126 new dictionaries across 7 namespaces (common, navigation, dashboard, forms, notifications, tours, chatbot) with 100% key parity (1,790 keys/locale).',
      'Bidirectional RTL: Dynamic dir="rtl" and CSS mirroring for Urdu (ur-IN) and Kashmiri (ks-IN).',
      'Typography Preservation: Google Fonts Noto Sans for 9 Indic scripts and global letter-spacing: normal override to protect conjuncts, halants, and vowel matras.',
      'Verification Suite: Deployed npm run verify:i18n checking all 140 files for valid syntax and zero missing keys.'
    ]
  },
  {
    title: 'Milestone 20: Streamlined Quick Login Modal & Direct Role Redirection',
    date: '22 Oct 2026',
    items: [
      'Role Redundancy Removal: Removed manual role tab buttons (Student, Mentor, Admin, etc.) and "Select Portal Role" subtitle.',
      'Token-Based Redirection: Converted into a clean Email + Password modal with automated JWT role decoding and portal dispatch.'
    ]
  },
  {
    title: 'Milestone 21: GuideBot & Driver.js Tour Localization Across 20 Languages',
    date: '22–23 Oct 2026',
    items: [
      'GuideBot Button Localization: Transliterated GuideBot launcher button and start_walkthrough tooltip across all 20 scripts.',
      'Tour Popover Bugfix: Fixed Driver.js Next button English override bug; dynamically bound forwardLabel to i18n.t("tours:next_btn") (e.g. Marathi "पुढे", Hindi "आगे", Bengali "পরবর্তী").',
      'Production Bundle Validation: Production Vite build passed in 54.85 seconds with 0 errors.'
    ]
  },
  {
    title: 'Milestone 22: Student Portal Language Selector Alignment to Top Header',
    date: '23 Oct 2026',
    items: [
      'Sidebar Footer Cleanup: Removed language dropdown from above Collapse and Logout buttons to eliminate visual clutter and session navigation mismatch.',
      'Top-Right Header Bar Integration: Positioned compact language selector in the standard top-right utility header across Student Dashboard and all student subpages.',
      'Mobile Topbar Access: Added sticky mobile topbar switcher for instant 1-tap switching without opening drawer.'
    ]
  },
  {
    title: 'Milestone 23: AI Chatbot Backend Decoupling & 3D Mascot Retention',
    date: '23 Oct 2026',
    items: [
      '3D Mascot Retained: Preserved 3D waving Core5 Robot Mascot and "Hi! Need help?" speech bubble in bottom-right corner.',
      'Legacy Backend Decoupled: Removed old rule-based database services (chatbotService, mentorChatbotService, adminChatbotService).',
      'AI Hook Prepared: Structured clean async response pipeline with explicit fetch() plug-in comment ready for friend\'s AI backend.'
    ]
  },
  {
    title: 'Milestone 24: Home Landing Page Polish & Pricing Carousel Dynamic Consistency',
    date: '23 Oct 2026',
    items: [
      'Dividing Line Removal: Eliminated border-y border-amber-900/10 dividing line on capabilities marquee and adjacent border on why-us section for seamless vertical flow.',
      'Core UI Component Localization Immunity: Preserved 4 key feature showcase items in fixed English branding text to prevent translation degradation.',
      'Dynamic Pricing CTA Consistency: Linked solid golden button (bg-[#B99652] text-white shadow-md) dynamically to active center card (isCenter) with arrow (→); inactive cards cleanly adopt gold outline.'
    ]
  }
];

// Render Milestones
milestones.forEach((m) => {
  checkPageBreak(30);

  // Box Header
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(215, 222, 232);
  doc.rect(14, y - 3.5, pageWidth - 28, 7.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 27, 75);
  doc.text(m.title, 17, y + 1.5);

  doc.setFontSize(8);
  doc.setTextColor(185, 150, 82);
  doc.text(m.date, pageWidth - 46, y + 1.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(50, 50, 60);

  m.items.forEach(item => {
    checkPageBreak(10);
    doc.setFillColor(185, 150, 82);
    doc.circle(18, y + 1.2, 0.7, 'F');
    const textLines = doc.splitTextToSize(item, pageWidth - 38);
    doc.text(textLines, 22, y + 2.2);
    y += textLines.length * 3.8 + 1.8;
  });

  y += 2.5;
});

// Section 3: Feature Matrix
checkPageBreak(38);
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.setTextColor(30, 27, 75);
doc.text('2. Comprehensive Feature & Architecture Status Matrix', 14, y);
y += 5.5;

const tableHeaders = ['Feature / Module', 'Component Scope', 'Status', 'Technical Summary'];
const tableRows = [
  ['Book a Demo Modal', 'client/src/components', 'ACTIVE', 'Real API connect, loading spinner & error banners'],
  ['Demo Requests API', 'server/routes/demoRoutes.js', 'ACTIVE', 'POST, GET, PATCH, DELETE endpoints verified'],
  ['SuperAdmin Demo Leads', 'SuperAdminDashboard.jsx', 'ACTIVE', 'Full leads management, filter tabs, status updater'],
  ['10-Digit Mobile Validation', 'Frontend Forms + API', 'ACTIVE', 'Subtle inline validation text below input fields'],
  ['Installment Builder', 'Admin / FeeStructure.tsx', 'ACTIVE', 'Dynamic stages (1-24), equal or custom %, 100% check'],
  ['Student Fee Portal', 'client/src/pages/student/PayFees.jsx', 'ACTIVE', 'Live installment plan fetch, balance sync, Razorpay modal'],
  ['Tax Invoice Generator', 'client/src/accountant/invoice.ts', 'ACTIVE', '1-Click compliant institutional PDF tax receipts'],
  ['Offline Fee Collection', 'Accountant / OfflineFeeModal.jsx', 'ACTIVE', 'Integer paise arithmetic, idempotency key protection'],
  ['Server Payment Orders', 'server/controllers/payment-controller.js', 'ACTIVE', 'Server-side stage amount computation, anti-tampering'],
  ['HMAC Verification', 'server/controllers/payment-controller.js', 'ACTIVE', 'Constant-time crypto.timingSafeEqual & gateway capture check'],
  ['Legacy Reconciliation', 'Accountant / LegacyReconciliation.tsx', 'ACTIVE', 'Read-only audit console for unallocated legacy records'],
  ['Fee Monitoring & Reminders', 'Accountant / ClassFeeStatus.jsx', 'ACTIVE', 'SMTP email & student dashboard announcement triggers'],
  ['Financial Reports Export', 'Accountant / DatabaseExport.jsx', 'ACTIVE', 'Tabular preview & CSV export for paid, dues, grants, expenses'],
  ['Attendance Carousel', 'Mentor / AttendanceManagement.jsx', 'ACTIVE', 'Single-line horizontal sliding card, alphabetical order'],
  ['20-Language i18n Suite', 'client/src/i18n, locales/*', 'ACTIVE', 'All 20 Scheduled Indian languages, 140 files, 100% key parity'],
  ['Bidirectional RTL Engine', 'client/src/App.jsx, index.css', 'ACTIVE', 'RTL direction & CSS mirroring for Urdu and Kashmiri'],
  ['GuideBot Tour Localization', 'client/src/guidebot/*', 'ACTIVE', 'Driver.js forward labels & GuideBot launcher in 20 languages'],
  ['Streamlined Quick Login', 'client/src/components/QuickLoginModal', 'ACTIVE', 'Clean login form with direct token role-based redirection'],
  ['Global Design Tokens', 'client/src/index.css', 'ACTIVE', 'Warm Gold (#B99652), Navy (#1e1b4b), Sharp corners'],
  ['SQLite Persistent DB', 'server/data/lms_permanent.db', 'ACTIVE', 'Stable SQLite engine with all verified relational tables'],
  ['Email Delivery', 'server/services/emailService.js', 'ACTIVE', 'Verified SMTP dispatch (sakshi.mishra@core5.co.in)']
];

// Table Header
doc.setFillColor(30, 27, 75);
doc.rect(14, y, pageWidth - 28, 6.5, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(7.5);
doc.setTextColor(255, 255, 255);
doc.text(tableHeaders[0], 16, y + 4.2);
doc.text(tableHeaders[1], 55, y + 4.2);
doc.text(tableHeaders[2], 106, y + 4.2);
doc.text(tableHeaders[3], 126, y + 4.2);
y += 6.5;

doc.setFont('helvetica', 'normal');
doc.setFontSize(7.5);

tableRows.forEach((row, rIdx) => {
  checkPageBreak(7);
  if (rIdx % 2 === 0) {
    doc.setFillColor(250, 250, 252);
    doc.rect(14, y, pageWidth - 28, 5.8, 'F');
  }
  doc.setDrawColor(230, 230, 235);
  doc.line(14, y + 5.8, pageWidth - 14, y + 5.8);

  doc.setTextColor(30, 27, 75);
  doc.setFont('helvetica', 'bold');
  doc.text(row[0], 16, y + 3.9);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 90);
  doc.text(row[1], 55, y + 3.9);

  doc.setTextColor(16, 120, 60); // Green
  doc.setFont('helvetica', 'bold');
  doc.text(row[2], 106, y + 3.9);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 70);
  const textTrunc = doc.splitTextToSize(row[3], pageWidth - 142);
  doc.text(textTrunc[0] || row[3], 126, y + 3.9);

  y += 5.8;
});

// Section 4: Upcoming Immediate Tasks
y += 5;
checkPageBreak(25);
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.setTextColor(30, 27, 75);
doc.text('3. Upcoming Engineering Roadmap', 14, y);
y += 5.5;

const nextTasks = [
  'Multilingual Expansion (Phase 2): Expand string extraction into grading matrices and dynamic assessment engines; add regional languages (Tamil, Telugu, Marathi).',
  'Phase 2C Step 2 Session Confirmation: Administrative confirmation workflow to safely map verified historical unallocated payments to specific academic years.',
  'Payment Gateway Webhook Auto-Reconciliation: Connect live Razorpay checkout webhooks for automated stage marking upon online clearance.'
];

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.2);
doc.setTextColor(50, 50, 60);

nextTasks.forEach(task => {
  checkPageBreak(8);
  doc.setFillColor(185, 150, 82);
  doc.rect(17, y + 1, 1.8, 1.8, 'F');
  const lines = doc.splitTextToSize(task, pageWidth - 36);
  doc.text(lines, 22, y + 2.2);
  y += lines.length * 3.8 + 1.8;
});

// Post-Processing: Header & Footer on All Pages
const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);

  // Top Accent Header
  doc.setFillColor(30, 27, 75); // Deep Navy #1e1b4b
  doc.rect(0, 0, pageWidth, 4.5, 'F');
  doc.setFillColor(185, 150, 82); // Warm Gold #B99652
  doc.rect(0, 4.5, pageWidth, 1.2, 'F');

  // Bottom Footer
  doc.setDrawColor(230, 230, 235);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(130, 130, 140);
  doc.text('Core5 LMS — Engineering Development & Task Logs (Post 25 Sep 2026)', 14, pageHeight - 6);
  doc.text(`Page ${i} of ${totalPages}`, pageWidth - 28, pageHeight - 6);
}

// Save PDF
const outputPath = path.resolve(__dirname, '../../../../PROJECT_DEVELOPMENT_LOGS_SINCE_25_SEP_2026.pdf');
const pdfData = doc.output('arraybuffer');
fs.writeFileSync(outputPath, Buffer.from(pdfData));
console.log(`✅ PDF generated successfully at: ${outputPath} (Total Pages: ${totalPages})`);
