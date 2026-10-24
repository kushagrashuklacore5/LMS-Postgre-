---
id: admin-fee-structure
title: Set up fee structures and installment plans (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Fee Structure"
prerequisites: ["At least one classroom exists"]
related: [accountant-fees-and-payments, student-results-attendance-fees, admin-classrooms]
sources: [client/src/pages/admin/FeeStructure.tsx, server/controllers/classroomController.js]
verified: true
last_verified: 2026-10-21
---

# Set up fee structures and installment plans (Admin)

The page is titled **Fee Structure Management**: "Configure fee structures for Primary (Grades 1-4) and Secondary (Grades 5-12)". There is one structure for **Primary** and one for **Secondary**.

## Create a structure

1. In the Admin sidebar, click **Fee Structure**.
2. In **Create Primary Fee Structure** (Grades 1-4), or **Create Secondary Fee Structure** (Grades 5-12), fill in the **Fee Breakdown**:
   - **Tuition Fee**, **Transport Fee**, **Computer Lab Fee**, **Library Fee**, **Sports Fee**, **Examination Fee**, **Miscellaneous Fee**;
   - the **Due Date**.

   The **Total Fee Amount** is calculated for you.
3. Under **Dynamic Student Installment & Payment Plans**:
   - Ready-made plans are listed, for example "1-Time Full Clearance (100%)", "2 Semester Terms (50% + 50%)" and "4 Quarterly Installments (25% x 4)".
   - Click **Add Installment Plan** to make your own. Give it a **Plan Name**, set the **Number of Installments** (1 to 24), choose **Equal Split** or **Custom %**, and click **Save Installment Plan**.
4. Click **Save Primary Structure** or **Save Secondary Structure**.

**Setup Progress** shows how many structures exist. Saved structures appear under **Created Fee Structures**, where **Edit** and then **Update Structure** change them.

## Rules

- **A class must exist first.** The page asks you to create a class before saving.
- **Only one structure per category.** A second "Primary" is refused; edit the existing one instead.
- **No negative amounts.**
- **Custom % plans must total exactly 100%.** Otherwise: "Total percentage must equal exactly 100%."
- **Keep at least one payment plan.**

Saving a structure updates the fee totals of the students in the matching grades of your school.

## Questions this answers

- How do I set fees? / Fee structure kaise banaun?
- How do I create installment / EMI plans?
- How do I change the fee amount?
- Why can't I save the fee structure? (No class yet, it already exists, or the percentages are not 100%)
