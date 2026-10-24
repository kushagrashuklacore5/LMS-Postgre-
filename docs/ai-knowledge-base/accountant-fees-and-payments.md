---
id: accountant-fees-and-payments
title: Fee collection, offline payments, reminders and vendor invoices (Accountant)
intent: task-procedure
portal: accountant
roles: [accountant, admin]
navigation: "Accountant sidebar → Fee Collection / Fee Monitoring & Reminders / Vendor Invoices / Expenses / Reports & Analysis"
related: [admin-fee-structure, student-results-attendance-fees, reports-and-counts]
sources: [client/src/components/AccountantLayout.jsx, client/src/pages/accountant/FeesCollection_temp.jsx, client/src/components/OfflineFeeModal.jsx, client/src/pages/mentor/ClassFeeStatus.jsx, client/src/pages/accountant/VendorInvoiceManagement.jsx, client/src/pages/accountant/Expenses_temp.jsx, server/services/installmentService.js, server/config/accessPolicy.js]
verified: true
last_verified: 2026-10-21
---

# Accountant: fees and payments

## Record a fee paid at the office (offline payment)

1. Click **Fee Collection**. The page is titled **Fee Collection & Financial Ledger**.
2. Click **Collect Offline Fee**. The form is **Record Offline Fee Payment**.
3. Fill in:
   - **Select Student**: type the name or email to filter.
   - Check the **Applicable Structure** and the **Total Official Fee**, then **Choose Payment Plan**.
   - **Amount Received (₹)**: a positive amount, at most 2 decimals.
   - **Payment Mode**: Cash Collection, Cheque Deposit, Bank Transfer (NEFT/RTGS), Demand Draft (DD), or Counter UPI / QR Code.
   - **Receipt / Transaction No.**, the **Collection Date**, and optional **Notes / Plan Reference**.
4. Click **Submit & Generate Receipt**.
5. You will see "Payment Successfully Recorded!" Click **Download Tax Invoice PDF** for the receipt.

The payment then appears under **Recent Fee Payments & Tax Receipts**, and in the student's own **Fees & Payments** history. Submitting the same payment twice by accident does not record it twice.

## See fee totals

- **Fee Collection** shows **Total Fees Collected**, **Total Students** and **Average Fee / Student**.
- **Recent Fee Payments & Tax Receipts** lists the payments.

## Remind students with dues

**Known problem:** for accountants, this page currently loads no data and **Send Reminder** does not work, because the server allows it only for teachers (Gap).

The page is meant to work like this:

1. Click **Fee Monitoring & Reminders** (**Student Fee Status & Reminders**). It shows:
   - **Total Enrolled**, **Fees Cleared**, **Pending Fee Dues** and **Total Dues Amount**;
   - each student with **Paid**, **Partial** or **Pending Dues**.
2. Click **Send Reminder** for a student with dues.

Until this is fixed, use **Fee Collection** for fee totals and recorded payments.

## Vendor invoices and expenses

- **Vendor Invoices** (**Vendor Invoices & Payment Ledger**):
  - filter by status (**All Statuses**, **Pending**, **Paid**, **Overdue**);
  - click **Pay Now**, review the **Invoice Details**, and click **Process Payment**;
  - **Payment History** shows the paid invoices, with **Download Receipt**.
- **Expenses** (**Institutional Expenses & Vendor Outflows**) shows the cleared and pending outflows and every vendor invoice.

## Limitations

- **Online student payments** (Razorpay) are switched off at the moment. Students pay at the office, and you record those payments here.
- **Reports & Analysis** combines student fee data (which, as above, does not load for accountants) with vendor invoices (which do load). The fee part is currently empty for accountants (Gap).

## Questions this answers

- How do I record a cash fee payment? / Cash fees kaise entry karun?
- How do I give a fee receipt?
- How do I see pending fees / defaulters?
- How do I send a fee reminder?
- How do I pay a vendor invoice?
- How much fee has been collected?
