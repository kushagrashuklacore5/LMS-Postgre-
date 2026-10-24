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
let y = 18;

function checkPageBreak(neededSpace = 15) {
  if (y + neededSpace > pageHeight - 18) {
    doc.addPage();
    y = 20;
    renderHeaderFooter();
  }
}

function renderHeaderFooter() {
  const pageCount = doc.internal.getNumberOfPages();
  // Header bar
  doc.setFillColor(30, 27, 75); // Deep Navy #1e1b4b
  doc.rect(0, 0, pageWidth, 5, 'F');
  doc.setFillColor(185, 150, 82); // Gold #B99652
  doc.rect(0, 5, pageWidth, 1.5, 'F');

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 150);
  doc.text('Core5 LMS — Engineering Development & Task Logs (Post 25 Sep 2026)', 14, pageHeight - 8);
  doc.text(`Page ${pageCount}`, pageWidth - 25, pageHeight - 8);
}

// Initial Header Footer
renderHeaderFooter();

// Title & Banner
doc.setFont('helvetica', 'bold');
doc.setFontSize(20);
doc.setTextColor(30, 27, 75);
doc.text('CORE5 LMS — DEVELOPMENT CHANGELOG', 14, y);
y += 7;

doc.setFontSize(10);
doc.setFont('helvetica', 'normal');
doc.setTextColor(185, 150, 82);
doc.text('PERIOD: 25 SEPTEMBER 2026 – 07 OCTOBER 2026 (ACTIVE LOGS)', 14, y);
y += 4;

doc.setDrawColor(185, 150, 82);
doc.setLineWidth(0.6);
doc.line(14, y, pageWidth - 14, y);
y += 8;

// Executive Summary
doc.setFont('helvetica', 'bold');
doc.setFontSize(13);
doc.setTextColor(30, 27, 75);
doc.text('1. Executive Overview', 14, y);
y += 6;

doc.setFont('helvetica', 'normal');
doc.setFontSize(9.5);
doc.setTextColor(50, 50, 60);
const summaryText = "This official log document details all major engineering milestones, architectural upgrades, UI/UX overhauls, database schema migrations, and enterprise integrations implemented in the Core5 LMS codebase after September 25, 2026.";
const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 28);
doc.text(splitSummary, 14, y);
y += splitSummary.length * 4.5 + 4;

// Section: Milestones
const milestones = [
  {
    title: 'Milestone A: Global Design System & Sharp Luxury Aesthetics',
    date: '25 Sep – 01 Oct 2026',
    items: [
      'Standardized Brand Tokens: Warm Gold (#B99652, #ebdcaa), Deep Navy (#1e1b4b), Luxury Cream (#fffdf4), and Sharp Geometry (rounded-none).',
      'Themed Global Toast Notifications (index.css): Re-styled React-Toastify alerts with gold borders, dark navy backgrounds, and crisp typography.',
      'AI Assessment Generator (AiAssessmentGenerator.jsx): Softened step badge font weights to font-medium, resolved heavy visual weight.',
      'SuperAdmin Top Bar: Removed redundant header titles, styled subscription countdown timers, active badges, and logout buttons.'
    ]
  },
  {
    title: 'Milestone B: SuperAdmin Multi-Tenant & Subscription System',
    date: '01 Oct – 05 Oct 2026',
    items: [
      'Pricing Cards & Test Upgrade: Overhauled SuperAdminSubscription.jsx with 1-click test upgrades (/api/subscriptions/test-upgrade) activating 1-year plans with immediate live user/institute propagation.',
      'Isolated Loading Spinners: Scoped button loading states per-plan to prevent multi-button loading anomalies.',
      'Automated Schedulers: Configured subscription-scheduler.js (hourly expiration checks) and plan-monitor.js (30s cache polling) for automated quota enforcement.',
      'Persistent SQLite Database Engine: Centralized storage at server/data/lms_permanent.db with multi-tenant table validation.'
    ]
  },
  {
    title: 'Milestone C: "Book a Demo" End-to-End Enterprise Lead System',
    date: '07 Oct 2026',
    items: [
      'Frontend Lead Capture (BookDemoModal.jsx): Real Axios API call (POST /api/demo-requests) with loading state ("Confirming Schedule..."), inline error alerts, and confirmed walkthrough state.',
      'Backend Ingestion & CRUD API (server/routes/demoRoutes.js): Full endpoints for POST (new demo inquiry), GET (list all leads), PATCH (status transition), and DELETE.',
      'Dual Email Notifications (server/services/emailService.js): Configured instant HTML lead alert to sakshi.mishra@core5.co.in with 1-click "Reply" button, plus automated confirmation email to client.',
      'SuperAdmin "Demo Leads" Management Panel: Added dedicated Demo Leads tab in sidebar with 4 metric cards (Total Inquiries, Pending Outreach, Scheduled, Completed), live search & status filters, and inline status dropdowns.'
    ]
  }
];

milestones.forEach((m, idx) => {
  checkPageBreak(35);
  
  // Box Container Header
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, y - 4, pageWidth - 28, 8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 27, 75);
  doc.text(m.title, 17, y + 1.5);

  doc.setFontSize(8.5);
  doc.setTextColor(185, 150, 82);
  doc.text(m.date, pageWidth - 45, y + 1.5);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 60);

  m.items.forEach(item => {
    checkPageBreak(12);
    doc.setFillColor(185, 150, 82);
    doc.circle(18, y + 1.5, 0.8, 'F');
    const textLines = doc.splitTextToSize(item, pageWidth - 38);
    doc.text(textLines, 22, y + 2.5);
    y += textLines.length * 4.2 + 2;
  });

  y += 3;
});

// Section: Feature Matrix
checkPageBreak(40);
doc.setFont('helvetica', 'bold');
doc.setFontSize(13);
doc.setTextColor(30, 27, 75);
doc.text('2. Feature & Architecture Status Matrix', 14, y);
y += 6;

const tableHeaders = ['Feature / Module', 'Component Scope', 'Status', 'Technical Summary'];
const tableRows = [
  ['Book a Demo Modal', 'client/src/components', 'ACTIVE', 'Real API connect, loading spinner & error banners'],
  ['Demo Requests API', 'server/routes/demoRoutes.js', 'ACTIVE', 'POST, GET, PATCH, DELETE endpoints verified'],
  ['SuperAdmin Demo Leads', 'SuperAdminDashboard.jsx', 'ACTIVE', 'Full leads management, filter tabs, status updater'],
  ['Lead Email Automation', 'server/services/emailService.js', 'ACTIVE', 'Admin alert & client confirmation templates'],
  ['Subscription Upgrade', 'SuperAdminSubscription.jsx', 'ACTIVE', '1-Click annual plan upgrade & cache sync'],
  ['Global Design Tokens', 'client/src/index.css', 'ACTIVE', 'Warm Gold (#B99652), Navy (#1e1b4b), Sharp corners'],
  ['AI Assessment Agent', 'AiAssessmentGenerator.jsx', 'ACTIVE', 'Softened typography, automated quiz generation'],
  ['SQLite Persistent DB', 'server/data/lms_permanent.db', 'ACTIVE', 'Stable SQLite engine with all verified tables']
];

// Table Drawing
doc.setFillColor(30, 27, 75);
doc.rect(14, y, pageWidth - 28, 7, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8);
doc.setTextColor(255, 255, 255);
doc.text(tableHeaders[0], 16, y + 4.5);
doc.text(tableHeaders[1], 55, y + 4.5);
doc.text(tableHeaders[2], 105, y + 4.5);
doc.text(tableHeaders[3], 125, y + 4.5);
y += 7;

doc.setFont('helvetica', 'normal');
doc.setFontSize(8);

tableRows.forEach((row, rIdx) => {
  checkPageBreak(8);
  if (rIdx % 2 === 0) {
    doc.setFillColor(250, 250, 252);
    doc.rect(14, y, pageWidth - 28, 6.5, 'F');
  }
  doc.setDrawColor(230, 230, 235);
  doc.line(14, y + 6.5, pageWidth - 14, y + 6.5);

  doc.setTextColor(30, 27, 75);
  doc.setFont('helvetica', 'bold');
  doc.text(row[0], 16, y + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 90);
  doc.text(row[1], 55, y + 4.2);

  doc.setTextColor(16, 120, 60); // Green
  doc.setFont('helvetica', 'bold');
  doc.text(row[2], 105, y + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 70);
  doc.text(row[3], 125, y + 4.2);

  y += 6.5;
});

// Section: Next Milestones
y += 6;
checkPageBreak(30);
doc.setFont('helvetica', 'bold');
doc.setFontSize(13);
doc.setTextColor(30, 27, 75);
doc.text('3. Upcoming Immediate Tasks', 14, y);
y += 6;

const nextTasks = [
  'SMTP Credentials Update: Configure Zoho App Password or Gmail SMTP in server/.env for external live inbox delivery.',
  'Assessment Results Sync: Connect student test submissions to classroom results view & mentor overview.',
  'Continuous Changelog Appending: Automatic documentation update on each subsequent task inside new_lms.'
];

doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(50, 50, 60);

nextTasks.forEach(task => {
  checkPageBreak(10);
  doc.setFillColor(185, 150, 82);
  doc.rect(17, y + 1.2, 2, 2, 'F');
  const lines = doc.splitTextToSize(task, pageWidth - 36);
  doc.text(lines, 22, y + 2.5);
  y += lines.length * 4.2 + 2;
});

// Save PDF to destination
const outputPath = path.resolve(__dirname, '../../../PROJECT_DEVELOPMENT_LOGS_SINCE_25_SEP_2026.pdf');
const pdfData = doc.output('arraybuffer');
fs.writeFileSync(outputPath, Buffer.from(pdfData));
console.log('✅ PDF generated successfully at:', outputPath);
