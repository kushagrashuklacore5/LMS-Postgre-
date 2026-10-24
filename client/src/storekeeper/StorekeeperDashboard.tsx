import React from "react";

import { Routes, Route, Navigate } from "react-router-dom";

import Sidebar from "./Sidebar";

import WelcomeStorekeeper from "./WelcomeStorekeeper";

import InventoryManagement from "./InventoryManagement";

import VendorManagement from "./VendorManagement";

import StockRequestsNew from "./StockRequestsNew";

import VendorStockBrowserNew from "./VendorStockBrowserNew";

import Requirements from "./Requirements";

import Reports from "./Reports";



export default function StorekeeperDashboard() {

  return (

    <div className="flex bg-gray-50 min-h-screen">

      <Sidebar />

      <main className="flex-1 p-6">

        <Routes>

          <Route path="" element={<WelcomeStorekeeper />} />

          <Route path="welcome" element={<WelcomeStorekeeper />} />

          <Route path="inventory" element={<InventoryManagement />} />

          <Route path="vendors" element={<VendorManagement />} />

          <Route path="stock-requests" element={<StockRequestsNew />} />

          <Route path="vendor-stock" element={<VendorStockBrowserNew />} />

          <Route path="requirements" element={<Requirements />} />

          <Route path="reports" element={<Reports />} />

        </Routes>

      </main>

    </div>

  );

}

