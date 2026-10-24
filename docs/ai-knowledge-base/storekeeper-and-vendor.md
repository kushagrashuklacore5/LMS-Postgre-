---
id: storekeeper-and-vendor
title: Storekeeper and vendor portals (overview)
intent: feature-explanation
portal: storekeeper, vendor
roles: [storekeeper, vendor]
navigation: "Storekeeper dashboard; Vendor sidebar → Dashboard / Invoices / Orders / Stock / Payments"
related: [teacher-requirements, accountant-fees-and-payments]
sources: [client/src/storekeeper/StorekeeperDashboardSimple.jsx, client/src/components/VendorLayout.jsx, server/config/accessPolicy.js, server/routes/requirement-routes.js, server/routes/orders-routes.js]
verified: partial
last_verified: 2026-10-21
---

# Storekeeper and vendor portals

These portals were only partly verified. Their screen-by-screen steps are **not** documented here. Do not give step-by-step instructions for them beyond what is written below.

## Storekeeper

- **Who:** manages the school's store.
- **Work:**
  - reviews teachers' **Requirements**;
  - places **orders** with vendors;
  - handles **stock requests** and inventory;
  - records **expenses**, which the accountant or admin approves.
- **Reports:** the storekeeper dashboard includes **Inventory & Requisition Reports** ("Export and audit reports for storekeeper inventories").

## Vendor

- **Who:** an outside supplier, who signs in on the same login page.
- **Sidebar:** **Dashboard**, **Invoices**, **Orders**, **Stock**, **Payments**.
- **Work:** vendors respond to stock requests with **quotes** and **bills**, update **order** status, and manage their own **stock**.

## Questions this answers

- What does the storekeeper do?
- Can vendors log in? (Yes, with their own portal)
- How does a teacher's item request reach the store? (Teacher **Requirements** → storekeeper)
