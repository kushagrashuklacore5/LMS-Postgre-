# Workflows: fees, procurement, platform

These areas were analysed less deeply than teaching and learning. Statements are Verified unless labelled otherwise, and untraced parts say so.

## Fees

### Fee structures (admin)

- **Pages and API:** `/admin/fee-structure` (`FeeStructure.tsx`), using `GET/POST /api/classrooms/fee-structures` and `PUT /api/classrooms/fee-structures/:id`.
- **Categories:** "Primary" (grades 1–4) and "Secondary" (grades 5–12). There is one structure per category per school.
- **Contents:** each structure has component fees (tuition, transport, lab, library, sports, examination, miscellaneous), a total, a due date and `installmentOptions`.
- **Preconditions:** the school needs at least one class first. Negative fees are refused (400; tested in E2E AD-6).
- **Side effect:** saving a structure updates `students.totalFees` and `pendingFees` for students in classes of the matching grades of **that school only** (`classroomController.applyFeeStructureToStudents`).

### Installments and student fee schedules

- **Where:** `server/services/installmentService.js`.
- **Schedules:** a student's schedule (`student_fee_schedules`) is a snapshot of the applicable fee structure and the chosen plan, stored in paise (`totalFeePaise`).
- **Allocation:** payments are allocated to installment stages. `calculateStudentInstallmentSummary` builds per-stage summaries.
- **Not traced:** the detailed allocation rules.

### Offline fee collection (accountant or admin)

- **API:** `POST /api/accountant/collect-offline-fee`, with `requirePaymentAuth` and `requireRoles(STAFF_ROLES)`.
- **Checks** (`installmentService.validateOfflinePayload`, line 296):
  - a valid student;
  - a positive amount with at most two decimals, below the per-payment maximum;
  - a valid installment stage;
  - a payment method from the allowed list;
  - an **idempotency key** (1–128 characters) that is **required**, so a repeated request does not record the payment twice.

### Online payment (Razorpay): currently off

- **APIs:** `POST /api/payments/create-order` and `/verify-payment` (`server/controllers/payment-controller.js`).
- **Without keys:** while `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are absent, both answer **503** ("gateway not configured"). This is the intended state for now (project decision: payments stay off until a paying customer arrives).
- **With keys:**
  - The amount is validated in paise, from ₹1 up to an upper bound.
  - Verification recomputes the gateway's HMAC signature with the key secret and compares it.
  - The browser's claim of a payment is never trusted on its own.
- **Student pages:** `/student/pay-fees` and `/student/subscription`.

### Accountant views

`/api/accountant/*`:

- dashboard, payments, fee statistics, student lists, installment status, payment history;
- expenses and vendor invoices, including `pay-invoice` (a write).

- **Staff roles:** `STAFF_ROLES` = `accountant`, `admin` (`server/middleware/paymentAuth.js`, line 65).
- **Students:** they may read their own installment status and payment history through the same paths (`accessPolicy.js`, lines 118–120).
  - `resolveStudentScope()` (`paymentAuth.js`, lines 45–63) forces a student to their own id; naming another student gives 403 "You can only access your own fee records".
  - Staff must name a valid student id (400 otherwise).

## Subscriptions and plans (school or platform)

- **Plans** (`server/config/subscriptionPlans.js`):
  - Standard and Professional, priced by `PLAN_PRICE_STANDARD_INR` and `PLAN_PRICE_PROFESSIONAL_INR` for `PLAN_PERIOD_DAYS`;
  - a free trial lasts `TRIAL_DURATION_DAYS`.
- **APIs:**
  - `/api/subscriptions/*`: current plan, feature check, order, verify, free trial, cancel;
  - `/api/plan-inheritance/*` and `/api/plan-monitor/*`.
- **Quotas:**
  - Plan limits are enforced by `server/middleware/quotaMiddleware.js`. Examples: course quota per class per teacher, the live-class feature, student counts.
  - A school's plan is inherited from its platform owner (`plan-inheritance`; not traced).
- **Background jobs:** `schedulers/subscription-scheduler.js` and `plan-monitor.js` (Documented; not traced).

## Procurement

| Step | Who | API |
|---|---|---|
| Teacher raises a requirement (items, priority) | mentor, admin | `POST /api/requirements`, `GET /api/requirements/my-requests` |
| Requirement reviewed | admin, storekeeper, accountant | `GET /api/requirements`, `PATCH /api/requirements/:itemId/status` |
| Order placed | admin, storekeeper | `POST /api/orders`, `PATCH /api/orders/:orderId/status` |
| Orders seen by finance | admin, accountant | `GET /api/orders` |
| Stock requests and templates | storekeeper, accountant, admin | `/api/stock-requests/*`, `/api/stock-requests/templates/*` |
| Vendor quotes and bills a request; manages own stock and orders | vendor | `/api/vendor/requests/:id/quote`, `/bill`, `/respond`, `/api/vendor/stock`, `/orders` |
| Expenses recorded and approved | storekeeper (create), admin and accountant (approve) | `/api/expenses`, `PATCH /api/expenses/:expenseId/status` |

**Evidence:** the `roleMiddleware` lists in `requirement-routes.js`, `orders-routes.js` and `expenses-routes.js`; `accessPolicy.js`, lines 126–134.

**Not traced:**

- Status values and transitions of requirements, orders, stock requests and quotes.
- Whether `vendor` routes scope every query to the vendor's own id. The gate comment says so (`apiAccessGate.js`, line 7).

## Platform owner (superadmin)

- **Frontend:** `/superadmin/login`, `/superadmin/dashboard`, `/superadmin/subscription`, and `/internal-admin-portal`. In `App.jsx` these routes have **no `requiredRole`**; protection relies on the API.
- **API:** `/api/superadmin/*`. The gate allows the `superadmin` role only, except login and refresh.
  - Schools: `create-university`, `universities`, `DELETE universities/:id`.
  - Users: `create-user` for a school's admin, `users`, `PUT` and `DELETE users/:id`.
  - Platform-owner accounts: `internal/*` (create, reset password, delete, disable).
- **Data access:** the platform owner reads across schools. `isPlatformOwner()` skips the school filter in `schoolScope.js` and `universalRoutes.js`. Whole-database Excel export (`/api/database-export`, `/api/accountant-export`) is limited to this role, because it is not school-scoped.
- **Demo requests:** the marketing "Book a demo" form posts publicly to `POST /api/demo-requests`. The platform owner lists, updates and deletes them.
- **Gap (authentication):** how the platform owner signs in is not consistent.
  - `POST /api/superadmin/login` reads a `superadmins` table that does not exist in the local SQLite database.
  - `/internal/*` update and delete `users` rows with `role = 'superadmin'`.
  - The automated tests and the browser E2E use a `users` row with role `superadmin` that signs in through `/login`.
  - See [12](12_GAPS_AND_OPEN_QUESTIONS.md).
