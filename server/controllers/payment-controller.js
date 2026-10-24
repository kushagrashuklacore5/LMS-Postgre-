const Razorpay = require('razorpay');

// Gateway credentials come from the environment only; nothing is hard-coded.
// Returns null when the gateway is not configured.
let razorpayClient = null;
function getRazorpay() {
  if (razorpayClient) return razorpayClient;
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  razorpayClient = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  return razorpayClient;
}

exports._setRazorpayClientForTesting = (client) => {
  razorpayClient = client;
};

const gatewayNotConfigured = (res) => res.status(503).json({
  success: false,
  message: 'Online payment gateway is not configured'
});

// Tests replace the gateway with a stand-in; production code never calls this.
let gatewayStandIn = null;
exports.setPaymentGatewayForTests = (client) => { gatewayStandIn = client; };

// Create order
const crypto = require('crypto');

function safeTimingEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const {
  prepareOrderDetails,
  recordCreatedPaymentOrder,
  calculateStudentInstallmentSummary,
  reconcileGatewayPayment,
  PaymentError
} = require('../services/installmentService');

function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}

// Create secure server-side order
exports.createOrder = async (req, res) => {
  try {
    const razorpay = getRazorpay() && (gatewayStandIn || getRazorpay());
    if (!razorpay) return gatewayNotConfigured(res);

    const db = getDatabaseFromRequest(req);
    const authUserId = req.user?.userId;
    const authRole = req.user?.role;

    if (!authUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // 1. Verify student scope & ownership
    const requestedStudentId = req.body.studentId ? Number(req.body.studentId) : authUserId;
    if (authRole === 'student' && requestedStudentId !== authUserId) {
      return res.status(403).json({ success: false, message: 'Access denied: You cannot create payment orders for another student.' });
    }

    const studentId = requestedStudentId;

    // 2. Prepare order details via server-authoritative installment service
    const orderPrep = await prepareOrderDetails(db, {
      studentId,
      feeStructureId: req.body.feeStructureId,
      planId: req.body.planId,
      installmentStage: req.body.installmentStage,
      amount: req.body.amount
    });

    // 3. Handle duplicate active order within 15 mins
    if (orderPrep.recentActiveOrder) {
      return res.status(200).json({
        success: true,
        orderId: orderPrep.recentActiveOrder.orderId,
        keyId: process.env.RAZORPAY_KEY_ID,
        amount: orderPrep.recentActiveOrder.amount,
        currency: orderPrep.recentActiveOrder.currency || 'INR',
        scheduleId: orderPrep.scheduleId,
        stageNumber: orderPrep.stageNumber,
        planName: orderPrep.planName,
        message: 'Active order reused for checkout'
      });
    }

    // 4. Create Razorpay order with server-calculated amount in paise
    const receiptId = `ORD_${studentId}_${orderPrep.stageNumber}_${Date.now().toString().slice(-6)}`;
    const options = {
      amount: orderPrep.orderAmountPaise, // integer paise
      currency: 'INR',
      receipt: receiptId,
      notes: {
        studentId: String(studentId),
        scheduleId: String(orderPrep.scheduleId),
        installmentStage: String(orderPrep.stageNumber),
        feeStructureId: String(orderPrep.feeStructureId)
      },
      payment_capture: 1
    };

    const order = await razorpay.orders.create(options);

    // 5. Persist order in payment_orders table
    await recordCreatedPaymentOrder(db, {
      orderId: order.id,
      studentId: studentId,
      scheduleId: orderPrep.scheduleId,
      installmentStage: orderPrep.stageNumber,
      feeStructureId: orderPrep.feeStructureId,
      amount: orderPrep.orderAmountRupees,
      currency: 'INR'
    });

    res.status(200).json({
      success: true,
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: orderPrep.orderAmountRupees,
      currency: 'INR',
      scheduleId: orderPrep.scheduleId,
      stageNumber: orderPrep.stageNumber,
      planName: orderPrep.planName,
      message: 'Order created successfully'
    });
  } catch (error) {
    console.error('Error creating secure Razorpay order:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      code: error.code || 'ORDER_CREATION_FAILED',
      message: error.message || 'Failed to create payment order'
    });
  }
};

// Verify payment and reconcile installment atomically
exports.verifyPayment = async (req, res) => {
  try {
    const razorpay = getRazorpay() && (gatewayStandIn || getRazorpay());
    if (!razorpay) return gatewayNotConfigured(res);

    const db = getDatabaseFromRequest(req);
    const authUser = req.user;

    if (!authUser || !authUser.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (
      !razorpay_order_id || typeof razorpay_order_id !== 'string' ||
      !razorpay_payment_id || typeof razorpay_payment_id !== 'string' ||
      !razorpay_signature || typeof razorpay_signature !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PARAMETERS',
        message: 'Missing or invalid payment verification parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature required).'
      });
    }

    const orderId = razorpay_order_id.trim();
    const paymentId = razorpay_payment_id.trim();
    const signature = razorpay_signature.trim();

    // 1. Verify HMAC SHA-256 signature using timing-safe comparison
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
    const given = String(razorpay_signature);
    const isAuthentic =
      expectedSignature.length === given.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(given));
    if (!isAuthentic) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    if (!safeTimingEqual(expectedSignature, signature)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SIGNATURE',
        message: 'Payment verification failed: invalid signature.'
      });
    }

    // 2. Authoritative gateway fetch via server SDK
    let payment;
    try {
      payment = await razorpay.payments.fetch(paymentId);
    } catch (fetchErr) {
      console.error('Failed to fetch payment from Razorpay:', fetchErr.message);
      return res.status(503).json({
        success: false,
        code: 'GATEWAY_UNAVAILABLE',
        message: 'Could not connect to payment gateway to verify status. Please retry.'
      });
    }

    if (!payment || payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_NOT_CAPTURED',
        message: `Payment status is '${payment?.status || 'unknown'}'. Only captured payments can be credited.`
      });
    }

    // 3. Atomic reconciliation (one database transaction) inside installmentService
    const result = await reconcileGatewayPayment(db, {
      orderId,
      paymentId,
      signature,
      gatewayPayment: payment,
      authUser
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error verifying payment:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || 'VERIFICATION_FAILED',
      message: error.message || 'Payment verification failed'
    });
  }
};

// Generate professional invoice
exports.generateInvoice = async (req, res) => {
  try {
    const { transaction, student, paymentOption, totalFees } = req.body;
    const path = require('path');
    const fs = require('fs');
    
    // Read and convert logo to base64
    let logoBase64 = '';
    try {
      const logoPath = path.join(__dirname, '../../core5 logo with hat.png');
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = logoBuffer.toString('base64');
    } catch (logoError) {
      console.log('Logo not found, continuing without logo');
    }
    
    // Create professional HTML invoice
    const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Fee Receipt</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                background: #f5f5f5;
            }
            .invoice-container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header-top {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 20px;
                margin-bottom: 20px;
            }
            .logo-section {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            .logo-img {
                height: 60px;
                width: auto;
            }
            .company-info {
                text-align: left;
            }
            .company-info h2 {
                margin: 0;
                font-size: 1.8em;
                font-weight: 700;
                color: white;
            }
            .company-info p {
                margin: 3px 0 0 0;
                font-size: 0.8em;
                opacity: 0.95;
                color: white;
            }
            .header h1 {
                margin: 0;
                font-size: 2em;
                font-weight: 300;
            }
            .header p {
                margin: 5px 0 0 0;
                opacity: 0.9;
            }
            .content {
                padding: 40px;
            }
            .invoice-info {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
                border-bottom: 2px solid #eee;
                padding-bottom: 20px;
            }
            .invoice-info div {
                flex: 1;
            }
            .invoice-info h3 {
                margin: 0 0 10px 0;
                color: #333;
                font-size: 1.2em;
            }
            .invoice-info p {
                margin: 5px 0;
                color: #666;
            }
            .student-details {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 30px;
            }
            .student-details h3 {
                margin: 0 0 15px 0;
                color: #333;
                border-bottom: 2px solid #667eea;
                padding-bottom: 5px;
            }
            .details-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
            }
            .detail-item {
                display: flex;
                justify-content: space-between;
            }
            .detail-label {
                font-weight: 600;
                color: #555;
            }
            .detail-value {
                color: #333;
            }
            .payment-details {
                background: #e8f5e8;
                border: 2px solid #4caf50;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 30px;
            }
            .payment-details h3 {
                margin: 0 0 15px 0;
                color: #2e7d32;
            }
            .amount-section {
                text-align: center;
                background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
                color: white;
                padding: 25px;
                border-radius: 8px;
                margin: 20px 0;
            }
            .amount-section .amount {
                font-size: 2.5em;
                font-weight: bold;
                margin: 10px 0;
            }
            .footer {
                text-align: center;
                padding: 30px;
                background: #f8f9fa;
                border-top: 2px solid #eee;
            }
            .footer p {
                margin: 5px 0;
                color: #666;
            }
            .watermark {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 100px;
                color: rgba(0,0,0,0.05);
                font-weight: bold;
                pointer-events: none;
            }
            .status-badge {
                display: inline-block;
                background: #4caf50;
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 0.9em;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <div class="watermark">PAID</div>
            
            <div class="header">
                <div class="header-top">
                    <div class="logo-section">
                        ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Core5 Academy" class="logo-img" />` : ''}
                        <div class="company-info">
                            <h2>CORE5 ACADEMY</h2>
                            <p>9th floor, A Wing, KAILASH BUSINESS PARK</p>
                            <p>901/902, Park Site Rd, Vikhroli (W)</p>
                            <p>HMPL Surya Nagar, Vikhroli West</p>
                            <p>Mumbai, Maharashtra 400079</p>
                        </div>
                    </div>
                </div>
                <h1>Fee Receipt</h1>
                <p>Learning Management System</p>
                <p>Official Payment Confirmation</p>
            </div>
            
            <div class="content">
                <div class="invoice-info">
                    <div>
                        <h3>Receipt Details</h3>
                        <p><strong>Receipt No:</strong> ${transaction.id}</p>
                        <p><strong>Date:</strong> ${new Date(transaction.timestamp).toLocaleDateString('en-IN')}</p>
                        <p><strong>Time:</strong> ${new Date(transaction.timestamp).toLocaleTimeString('en-IN')}</p>
                        <p><strong>Status:</strong> <span class="status-badge">PAID</span></p>
                    </div>
                    <div>
                        <h3>Payment Method</h3>
                        <p><strong>Gateway:</strong> Razorpay</p>
                        <p><strong>Transaction ID:</strong> ${transaction.id}</p>
                        <p><strong>Payment Type:</strong> ${paymentOption.charAt(0).toUpperCase() + paymentOption.slice(1)}</p>
                        <p><strong>Mode:</strong> Online</p>
                    </div>
                </div>
                
                <div class="student-details">
                    <h3>Student Information</h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="detail-label">Student Name:</span>
                            <span class="detail-value">${student.name}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Student ID:</span>
                            <span class="detail-value">${student.id}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Email:</span>
                          <span class="detail-value">${student.email || 'student@example.com'}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">Phone:</span>
                          <span class="detail-value">${student.phone || '+91 9876543210'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="payment-details">
                    <h3>Payment Breakdown</h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <span class="detail-label">Total Annual Fees:</span>
                            <span class="detail-value">₹${totalFees.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Payment Option:</span>
                            <span class="detail-value">${paymentOption.charAt(0).toUpperCase() + paymentOption.slice(1)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Amount Paid:</span>
                            <span class="detail-value">₹${transaction.amount.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Balance Remaining:</span>
                            <span class="detail-value">₹${(totalFees - transaction.amount).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                    
                    <div class="amount-section">
                        <p>Amount Paid Successfully</p>
                        <div class="amount">₹${transaction.amount.toLocaleString('en-IN')}</div>
                        <p>Thank you for your payment!</p>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <p><strong>CORE5 ACADEMY</strong></p>
                <p>9th floor, A Wing, KAILASH BUSINESS PARK</p>
                <p>901/902, Park Site Rd, Vikhroli (W)</p>
                <p>HMPL Surya Nagar, Vikhroli West, Mumbai, Maharashtra 400079</p>
                <p>Phone: +91 9876543210 | Email: accounts@core5academy.edu</p>
                <br>
                <p><em>This is a computer-generated receipt and does not require a signature.</em></p>
                <p><em>For any queries, please contact the accounts department.</em></p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Try to generate PDF with Puppeteer, fallback to HTML if it fails
    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      const page = await browser.newPage();
      await page.setContent(invoiceHTML, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      await browser.close();
      
      // Convert PDF to base64 for frontend download
      const base64Invoice = pdfBuffer.toString('base64');
      
      res.status(200).json({
        success: true,
        invoice: base64Invoice,
        type: 'pdf'
      });
    } catch (puppeteerError) {
      console.log('Puppeteer failed, attempting PDFKit fallback:', puppeteerError.message);
      // Fallback: generate a simple PDF using PDFKit to ensure accountant always receives a PDF
      try {
        const PDFDocument = require('pdfkit');

        const doc = new PDFDocument({ size: 'A4', margin: 40 });

        // Pipe PDF to buffer using get-stream
        let buffers = [];
        doc.on('data', (d) => buffers.push(d));
        const endPromise = new Promise((resolve, reject) => {
          doc.on('end', () => resolve());
          doc.on('error', reject);
        });

        // Header
        doc.fillColor('#ffffff').rect(0, 0, doc.page.width, 100).fill('#334155');
        doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('Fee Receipt', 40, 30);
        doc.moveDown();

        // Receipt / Payment info
        doc.fillColor('#000000').fontSize(10).font('Helvetica');
        doc.text(`Receipt No: ${transaction.id}`, 40, 120);
        doc.text(`Date: ${new Date(transaction.timestamp).toLocaleDateString('en-IN')}`, 40, 135);
        doc.text(`Time: ${new Date(transaction.timestamp).toLocaleTimeString('en-IN')}`, 40, 150);
        doc.text(`Transaction ID: ${transaction.id}`, 320, 120);
        doc.text(`Payment Type: ${paymentOption.charAt(0).toUpperCase() + paymentOption.slice(1)}`, 320, 135);

        // Student details
        doc.moveDown().moveDown();
        doc.font('Helvetica-Bold').text('Student Information', { underline: true });
        doc.moveDown(0.5);
        doc.font('Helvetica').text(`Name: ${student.name}`);
        doc.text(`Student ID: ${student.id}`);
        doc.text(`Email: ${student.email || 'student@example.com'}`);
        doc.text(`Phone: ${student.phone || '+91 9876543210'}`);

        // Payment breakdown
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Payment Breakdown');
        doc.moveDown(0.5);
        doc.font('Helvetica').text(`Total Annual Fees: ₹${totalFees.toLocaleString('en-IN')}`);
        doc.text(`Payment Option: ${paymentOption.charAt(0).toUpperCase() + paymentOption.slice(1)}`);
        doc.text(`Amount Paid: ₹${transaction.amount.toLocaleString('en-IN')}`);
        doc.text(`Balance Remaining: ₹${(totalFees - transaction.amount).toLocaleString('en-IN')}`);

        doc.moveDown(1);
        doc.fontSize(18).font('Helvetica-Bold').text(`Amount: ₹${transaction.amount.toLocaleString('en-IN')}`, { align: 'center' });

        doc.moveDown(2);
        doc.fontSize(9).font('Helvetica').text('This is a computer-generated receipt and does not require a signature.', { align: 'center' });

        doc.end();

        await endPromise;
        const pdfBuffer = Buffer.concat(buffers);
        const base64Invoice = pdfBuffer.toString('base64');

        return res.status(200).json({ success: true, invoice: base64Invoice, type: 'pdf' });
      } catch (pdfFallbackError) {
        console.error('PDFKit fallback failed:', pdfFallbackError);
        // As a last resort, return the HTML encoded invoice
        const base64Invoice = Buffer.from(invoiceHTML).toString('base64');
        return res.status(200).json({ success: true, invoice: base64Invoice, type: 'html' });
      }
    }
    
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice'
    });
  }
};

// Payment history is read from the payments table (the same table the fee pages write).
// These two handlers used a MongoDB model that this application never connects to.
const PAYMENT_COLUMNS = `p.id, p.studentId, p.amount, p.type, p.status, p.transactionId, p.razorpay_payment_id,
  p.razorpay_order_id, p.description, p.createdAt, u.name AS studentName, u.email AS studentEmail`;

const paymentRows = (req, where, params) =>
  new Promise((resolve, reject) => {
    const db = req.tenant?.database || require('../config/database-switch');
    db.all(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN users u ON u.id = p.studentId
       WHERE ${where} ORDER BY p.createdAt DESC, p.id DESC`,
      params,
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });

// One student's payments. The route has already checked that a student asks only for
// their own id and that the student belongs to the caller's school.
exports.getTransactionHistory = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (!/^\d+$/.test(String(studentId))) {
      return res.status(400).json({ success: false, message: 'A valid student ID is required.' });
    }
    const transactions = await paymentRows(req, 'p.studentId = ? AND u.university_id = ?', [studentId, req.user.universityId]);
    res.status(200).json({ success: true, transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching transactions' });
  }
};

// All payments of the caller's school, for the accountant portal
exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await paymentRows(req, 'u.university_id = ?', [req.user.universityId]);
    res.status(200).json({ success: true, transactions });
  } catch (error) {
    console.error('Error fetching all transactions:', error.message);
    res.status(500).json({ success: false, message: 'Error fetching transactions' });
  }
};
