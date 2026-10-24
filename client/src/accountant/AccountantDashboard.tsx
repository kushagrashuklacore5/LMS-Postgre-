import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import FeesCollection from "./FeesCollection";
import AccountantTransactionHistory from "../components/AccountantTransactionHistory";
import VendorInvoiceManagement from "../pages/accountant/VendorInvoiceManagement";
import Inventory from "./Inventory";
import Expenses from "./Expenses";
import AccountantExport from "../components/AccountantExportFixed";
import RealTimeNotification from "../components/RealTimeNotification";
import LegacyReconciliation from "./LegacyReconciliation";

export default function AccountantDashboard() {
  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">
        <Routes>
          <Route path="" element={<FeesCollection category={"Primary"} />} />
          <Route path="fees-collection" element={<FeesCollection category={"Primary"} />} />
          <Route path="fees-collection/primary" element={<FeesCollection category={"Primary"} />} />
          <Route path="fees-collection/secondary" element={<FeesCollection category={"Secondary"} />} />
          <Route path="legacy-reconciliation" element={<LegacyReconciliation />} />
          <Route path="payment-history" element={<AccountantTransactionHistory />} />
          <Route path="vendor-invoices" element={<VendorInvoiceManagement />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="database-export" element={<AccountantExport />} />
        </Routes>
      </main>
      <RealTimeNotification />
    </div>
  );
}
