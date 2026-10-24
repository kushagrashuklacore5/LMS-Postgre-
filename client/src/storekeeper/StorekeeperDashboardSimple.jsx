import React from 'react';
import './StorekeeperStyles.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/auth';
import { useTranslation } from '../context/TranslationContext';
import UniversalLanguageSelector from '../components/UniversalLanguageSelector';

// Import components directly
import Sidebar from './Sidebar';
import WelcomeStorekeeper from './WelcomeStorekeeper';
import InventoryManagementSimple from './InventoryManagementSimple';
import VendorManagementSimple from './VendorManagementSimple';
import Requirements from './Requirements';

const StorekeeperDashboard = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <div className="flex bg-[#fffdf4] h-screen overflow-hidden text-[#1e1b4b]">
      <Sidebar />
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#fffdf4]">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-[#fffdf4]/90 backdrop-blur-md border-b border-[#ebdcaa]/40 px-6 py-3.5 flex items-center justify-between">
          <h1 className="text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-wide">
            {t('storekeeper_role') !== 'storekeeper_role' ? t('storekeeper_role') : 'Storekeeper'}
          </h1>
          <div className="flex items-center gap-3">
            <UniversalLanguageSelector variant="compact" />
          </div>
        </header>

        <div className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="h-full overflow-y-auto scrollable-content">
              <Routes>
                <Route path="" element={<WelcomeStorekeeper />} />
                <Route path="welcome" element={<WelcomeStorekeeper />} />
                <Route path="inventory" element={<InventoryManagementSimple />} />
                <Route path="vendors" element={<VendorManagementSimple />} />
                <Route path="vendor-stock" element={<VendorManagementSimple />} />
                <Route path="requirements" element={<Requirements />} />
                <Route
                  path="reports"
                  element={
                    <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6">
                      <h2 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-2">
                        {t('reports') !== 'reports' ? t('reports') : 'Inventory & Requisition Reports'}
                      </h2>
                      <p className="text-xs text-[#7a705a]">
                        {t('reports_and_analysis') !== 'reports_and_analysis' ? t('reports_and_analysis') : 'Export and audit reports for storekeeper inventories.'}
                      </p>
                    </div>
                  }
                />
                <Route path="*" element={<Navigate to="/storekeeper/dashboard" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StorekeeperDashboard;
