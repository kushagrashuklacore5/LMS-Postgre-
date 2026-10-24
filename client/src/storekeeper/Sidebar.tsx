import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Package, Users2, FileText, LayoutDashboard, ClipboardList, LogOut, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { useAuth } from "../auth/auth";
import { useTranslation } from "../context/TranslationContext";
import RequestStatus from "./RequestStatus";
import whiteLogo from '../../../core5 logo new new-modified (1).png';

const items = [
  { name: "Inventory", nameKey: "inventory", icon: Package },
  { name: "Vendors", nameKey: "vendors", icon: Users2 },
  { name: "Vendor Stock", nameKey: "vendor_stock", icon: Package },
  { name: "Requirements", nameKey: "requirements", icon: ClipboardList },
  { name: "Reports", nameKey: "reports", icon: FileText },
];

export default function Sidebar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { logoutUser } = useAuth();
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLogout = () => {
    logoutUser?.();
    navigate('/login');
  };

  return (
    <aside className={`sticky top-0 h-screen flex-shrink-0 text-white shadow-xl flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-[#1e1b4b]`}>
      <div className="h-24 sm:h-28 border-b border-white/10 flex items-center justify-center">
        {!sidebarCollapsed ? (
          <img src={whiteLogo} alt="Core5 Academy" className="max-h-full w-auto object-contain" />
        ) : (
          <img src={whiteLogo} alt="Core5 Academy" className="h-16 w-auto object-contain" />
        )}
      </div>

      <nav className="flex-1 p-4 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-200">
        {items.map((item) => {
          const Icon = item.icon;
          // Handle special cases for multi-word items
          const path = item.name === "Vendor Stock" 
            ? "/storekeeper/vendor-stock"
            : `/storekeeper/${item.name.toLowerCase()}`;
          const active = loc.pathname.startsWith(path);
          const label = t(item.nameKey) !== item.nameKey ? t(item.nameKey) : item.name;
          return (
            <Link
              key={item.name}
              to={path}
              className={`flex items-center gap-3 px-4 py-3 rounded-none transition-all ${
                active
                  ? 'bg-[#B99652]/20 text-white border-l-4 border-[#B99652] shadow-sm font-semibold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <Icon size={20} className={active ? 'text-[#B99652]' : 'text-white/70'} />
              {!sidebarCollapsed && <span className="font-medium text-sm">{label}</span>}
            </Link>
          );
        })}
        
        {/* Request Status Section */}
        {!sidebarCollapsed && <RequestStatus />}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-2">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-between p-3 rounded-none bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold uppercase tracking-wider transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <>{t('nav_collapse') ?? 'Collapse'} <ChevronLeft size={18} /></>}
        </button>

        <button
          onClick={handleLogout}
          className={`w-full flex items-center p-3 rounded-none bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold uppercase tracking-wider transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={16} />
          {!sidebarCollapsed && <span className="ml-3">{t('nav_logout') ?? 'Logout'}</span>}
        </button>
      </div>
    </aside>
  );
}
