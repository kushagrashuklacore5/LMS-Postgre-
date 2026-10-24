import { jsPDF } from "jspdf";

export interface InvoicePayload {
  schoolName?: string;
  instituteAddress?: string;
  instituteContact?: string;
  student: { 
    id: string; 
    name: string; 
    className: string;
    collegeName?: string;
    email?: string;
  };
  feeBreakdown: { label: string; amount: number }[];
  transactionId: string;
  paymentDate: string;
  transactionAmount?: number;
  paymentOption?: string;
  paymentMode?: string;
  academicYear?: string;
}

export function generateInvoicePdf(payload: InvoicePayload) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Color Palette
  const primaryNavy: [number, number, number] = [0, 35, 102];      // #002366
  const goldAccent: [number, number, number] = [185, 150, 82];     // #B99652
  const textDark: [number, number, number] = [30, 41, 59];         // #1E293B
  const textMuted: [number, number, number] = [100, 116, 139];     // #64748B
  const borderLight: [number, number, number] = [226, 232, 240];   // #E2E8F0
  const bgLight: [number, number, number] = [248, 250, 252];       // #F8FAFC
  const emeraldSuccess: [number, number, number] = [5, 150, 105];  // #059669

  // Resolve dynamic college/school info
  const collegeName = (
    payload.student?.collegeName || 
    payload.schoolName || 
    'Core5 Academic Institution'
  ).trim();

  const studentName = payload.student?.name || 'Enrolled Student';
  const studentClass = payload.student?.className || 'Academic Session 2026';
  const studentId = payload.student?.id || 'STU-1001';
  const studentEmail = payload.student?.email || '';
  const paymentDate = payload.paymentDate || new Date().toLocaleDateString('en-GB');
  const txnIdStr = String(payload.transactionId || `TXN_${Date.now()}`);
  const txnShort = txnIdStr.length > 12 ? txnIdStr.slice(-10) : txnIdStr;
  const transactionAmount = Number(payload.transactionAmount || 0);
  const paymentMethod = payload.paymentMode || payload.paymentOption || 'Razorpay Online';
  const academicYear = payload.academicYear || '2026–2027';

  // Address lines
  const addressLine1 = payload.instituteAddress || 'Main Campus, Institutional Academic Complex';
  const addressLine2 = payload.instituteContact || 'Website: core5academy.edu | Email: finance@university.edu';

  // 1. TOP HEADER BARS
  doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.rect(0, 0, 210, 4, 'F');

  doc.setFillColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.rect(0, 4, 210, 1.5, 'F');

  // 2. INSTITUTIONAL BRANDING HEADER
  // College Monogram Icon
  const monogram = collegeName
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'ED';

  doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.roundedRect(15, 10, 16, 16, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(monogram, 23, 20.5, { align: 'center' });

  // Institution Title
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const maxTitleWidth = 100;
  const splitTitle = doc.splitTextToSize(collegeName.toUpperCase(), maxTitleWidth);
  doc.text(splitTitle, 35, 16);

  const titleLinesCount = Array.isArray(splitTitle) ? splitTitle.length : 1;
  const subY = 16 + (titleLinesCount * 4.5);

  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(addressLine1, 35, subY);
  doc.text(addressLine2, 35, subY + 3.8);

  // Right Side Header Receipt Card
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(140, 10, 55, 22, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text('TAX INVOICE & RECEIPT', 167.5, 16, { align: 'center' });

  // Verified Pill
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(147, 19, 41, 6.5, 1.5, 1.5, 'FD');

  doc.setTextColor(emeraldSuccess[0], emeraldSuccess[1], emeraldSuccess[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('VERIFIED & PAID', 167.5, 23.5, { align: 'center' });

  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Academic Session: ${academicYear}`, 167.5, 29.5, { align: 'center' });

  // Divider Line
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.5);
  doc.line(15, 36, 195, 36);

  // 3. TWO-COLUMN METADATA CARDS
  // Left: Student Information Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.roundedRect(15, 40, 87, 27, 1.5, 1.5, 'FD');

  doc.setFillColor(241, 245, 249);
  doc.rect(15, 40, 87, 6, 'F');
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('STUDENT & ENROLLMENT DETAILS', 19, 44.5);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text(studentName, 19, 51.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`Student ID : ${studentId}`, 19, 56.5);
  doc.text(`Course / Class : ${studentClass}`, 19, 61);
  if (studentEmail) {
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`Email : ${studentEmail}`, 19, 65.5);
  }

  // Right: Receipt & Payment Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.roundedRect(108, 40, 87, 27, 1.5, 1.5, 'FD');

  doc.setFillColor(241, 245, 249);
  doc.rect(108, 40, 87, 6, 'F');
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('PAYMENT & TRANSACTION DETAILS', 112, 44.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  doc.text('Receipt No.', 112, 51.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`: INV-${txnShort}`, 142, 51.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Payment Date', 112, 56.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`: ${paymentDate}`, 142, 56.5);

  doc.setFont('helvetica', 'normal');
  doc.text('Transaction Ref', 112, 61);
  doc.setFont('helvetica', 'bold');
  doc.text(`: ${txnIdStr.slice(0, 18)}`, 142, 61);

  doc.setFont('helvetica', 'normal');
  doc.text('Payment Mode', 112, 65.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text(`: ${paymentMethod}`, 142, 65.5);

  // 4. ITEMIZED FEE BREAKDOWN TABLE
  let startTableY = 72;
  
  // Table Header Bar
  doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.rect(15, startTableY, 180, 7.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('#', 20, startTableY + 5);
  doc.text('FEE COMPONENT & PARTICULARS', 35, startTableY + 5);
  doc.text('ACADEMIC TERM', 125, startTableY + 5);
  doc.text('AMOUNT (INR)', 190, startTableY + 5, { align: 'right' });

  let currentY = startTableY + 7.5;
  const items = Array.isArray(payload.feeBreakdown) && payload.feeBreakdown.length > 0
    ? payload.feeBreakdown
    : [{ label: 'Tuition & Academic Term Fee', amount: transactionAmount }];

  items.forEach((item, index) => {
    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(15, currentY, 180, 7, 'F');
    }

    // Row border line
    doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.setLineWidth(0.3);
    doc.line(15, currentY + 7, 195, currentY + 7);

    // Row text
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    doc.text(String(index + 1), 20, currentY + 4.8);
    doc.text(item.label, 35, currentY + 4.8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Annual Session', 125, currentY + 4.8);

    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${Number(item.amount).toLocaleString('en-IN')}`, 190, currentY + 4.8, { align: 'right' });

    currentY += 7;
  });

  // Table Outer Frame
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.5);
  doc.rect(15, startTableY, 180, currentY - startTableY);

  // 5. TOTALS & SUMMARY SECTION
  currentY += 6;

  // Amount In Words / Verification note on left
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text('PAYMENT SETTLEMENT SUMMARY', 15, currentY + 4);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('Official clearance issued upon confirmed settlement through university gateway.', 15, currentY + 8.5);
  doc.text(`Receipt Reference Token: ${txnIdStr}`, 15, currentY + 12.5);

  // Financial Box on right
  const summaryBoxX = 115;
  const summaryBoxWidth = 80;

  // Subtotal row
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal Fee Amount:', summaryBoxX, currentY + 4);
  doc.text(`Rs. ${transactionAmount.toLocaleString('en-IN')}`, 190, currentY + 4, { align: 'right' });

  // Institutional Discount row
  doc.text('Institutional Scholarship / Waiver:', summaryBoxX, currentY + 8.5);
  doc.text('Rs. 0', 190, currentY + 8.5, { align: 'right' });

  // Taxes
  doc.text('Taxes (GST Exempt - Education):', summaryBoxX, currentY + 13);
  doc.text('Rs. 0', 190, currentY + 13, { align: 'right' });

  currentY += 16;

  // NET TOTAL PAID HIGHLIGHT BAR
  doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.rect(summaryBoxX, currentY, summaryBoxWidth, 9, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL AMOUNT PAID', summaryBoxX + 4, currentY + 6);
  doc.setFontSize(10);
  doc.text(`Rs. ${transactionAmount.toLocaleString('en-IN')}`, 190, currentY + 6, { align: 'right' });

  currentY += 15;

  // 6. OFFICIAL NOTES & DIGITAL AUDIT SEAL
  // Left: Institutional Guidelines
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.roundedRect(15, currentY, 95, 32, 1.5, 1.5, 'FD');

  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text('INSTITUTIONAL TERMS & GUIDELINES', 19, currentY + 5.5);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  const terms = [
    '1. This receipt is computer-generated and serves as official fee clearance.',
    '2. Retain this invoice copy for exam registration & semester clearance.',
    '3. Fees deposited are subject to the standard university refund regulations.',
    '4. For fee queries, present this receipt at the Campus Accounts Office.'
  ];
  terms.forEach((t, i) => {
    doc.text(t, 19, currentY + 10.5 + (i * 4.5));
  });

  // Right: Accounts Seal Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.setLineWidth(0.6);
  doc.roundedRect(120, currentY, 75, 32, 1.5, 1.5, 'FD');

  doc.setTextColor(goldAccent[0], goldAccent[1], goldAccent[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('★ DIGITAL VERIFICATION SEAL ★', 157.5, currentY + 6, { align: 'center' });

  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  const sealTitle = collegeName.length > 25 ? collegeName.slice(0, 24) + '...' : collegeName;
  doc.text(sealTitle.toUpperCase(), 157.5, currentY + 12, { align: 'center' });

  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('ACCOUNTS & FINANCE DEPARTMENT', 157.5, currentY + 16.5, { align: 'center' });
  doc.text('Electronically Verified & Cleared', 157.5, currentY + 21, { align: 'center' });

  doc.setDrawColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.setLineWidth(0.3);
  doc.line(135, currentY + 26, 180, currentY + 26);
  doc.setFontSize(6);
  doc.text('Authorized Finance Officer', 157.5, currentY + 29.5, { align: 'center' });

  // 7. BOTTOM FOOTER
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.setLineWidth(0.5);
  doc.line(15, 280, 195, 280);

  doc.setFontSize(6.8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(`Official Academic Fee Receipt • ${collegeName} • Generated: ${paymentDate}`, 15, 286);
  doc.text('Page 1 of 1 (Original Student Copy)', 190, 286, { align: 'right' });

  return doc;
}
