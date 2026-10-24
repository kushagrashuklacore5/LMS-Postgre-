import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/auth';

// Lazy load components to prevent import issues
const Sidebar = React.lazy(() => import('./Sidebar'));
const WelcomeStorekeeper = React.lazy(() => import('./WelcomeStorekeeper'));
const InventoryManagement = React.lazy(() => import('./InventoryManagement'));
const VendorManagement = React.lazy(() => import('./VendorManagement'));
const StockRequestsNew = React.lazy(() => import('./StockRequestsNew'));
const VendorStockBrowserNew = React.lazy(() => import('./VendorStockBrowserNew'));
const Requirements = React.lazy(() => import('./Requirements'));
const Reports = React.lazy(() => import('./Reports'));

const StorekeeperDashboard = () => {
  const { user } = useAuth();
  console.log('🔍 StorekeeperDashboard rendering...');
  console.log('User:', user);
  
  if (!user) {
    console.log('❌ No user found, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading Storekeeper Dashboard...</p>
          </div>
        </div>
      }>
        <Sidebar />
        
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Storekeeper Dashboard</h1>
              <p className="text-gray-600">Welcome, {user?.name || 'Storekeeper'}!</p>
            </div>
            
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
          </div>
        </main>
      </div>
    </div>
  );
};

export default StorekeeperDashboard;
