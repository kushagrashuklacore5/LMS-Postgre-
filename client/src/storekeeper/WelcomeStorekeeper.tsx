import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/auth";
import { useTranslation } from "../context/TranslationContext";
import {
  Calendar,
  Clock,
  Package,
  Users2,
  ClipboardList,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function WelcomeStorekeeper() {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="flex items-center justify-center min-h-[85vh] bg-[#fffdf4] overflow-y-auto p-4 sm:p-6">
      <div className="text-center p-6 sm:p-9 max-w-3xl w-full bg-white border border-[#ebdcaa] rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.06)]">
        {/* Logo and Welcome Message */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#B99652] to-[#a38243] text-white border border-[#ebdcaa] rounded-none mb-5 shadow-xs">
            <Package size={36} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1.5">
            Storekeeper & Logistics Portal
          </h1>
          <p className="text-xs uppercase tracking-wider text-[#B99652] font-bold mb-3">
            Core5 Academy — Inventory, Warehouse & Requisitions
          </p>
          <p className="text-xs sm:text-sm text-[#7a705a]">
            Welcome back, <strong className="text-[#1e1b4b] font-semibold">{user.name || "Storekeeper"}</strong>
          </p>
        </div>

        {/* Date and Time Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto mb-6">
          <div className="bg-[#fffdf4]/60 text-[#1e1b4b] border border-[#ebdcaa] rounded-none p-4 text-left">
            <div className="flex items-center gap-2 mb-1.5 text-[#B99652]">
              <Calendar size={16} />
              <span className="text-[11px] uppercase tracking-wider font-bold">Today's Date</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{formatDate(currentTime)}</p>
          </div>
          <div className="bg-[#fffdf4]/60 text-[#1e1b4b] border border-[#ebdcaa] rounded-none p-4 text-left">
            <div className="flex items-center gap-2 mb-1.5 text-[#B99652]">
              <Clock size={16} />
              <span className="text-[11px] uppercase tracking-wider font-bold">Live Time</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{formatTime(currentTime)}</p>
          </div>
        </div>

        {/* Quick Hub Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
          <Link
            to="/storekeeper/inventory"
            className="group p-4 bg-[#fffdf4]/40 hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] transition-all rounded-none flex flex-col justify-between"
          >
            <div>
              <div className="w-8 h-8 bg-[#fff8e7] border border-[#fde68a] text-[#92400e] flex items-center justify-center font-bold mb-2">
                <Package size={16} />
              </div>
              <h4 className="text-xs font-bold text-[#1e1b4b]">Inventory</h4>
              <p className="text-[11px] text-[#7a705a] mt-0.5">Manage catalog items</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#B99652] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Open</span>
              <ArrowRight size={12} />
            </div>
          </Link>

          <Link
            to="/storekeeper/vendors"
            className="group p-4 bg-[#fffdf4]/40 hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] transition-all rounded-none flex flex-col justify-between"
          >
            <div>
              <div className="w-8 h-8 bg-[#fff8e7] border border-[#fde68a] text-[#92400e] flex items-center justify-center font-bold mb-2">
                <Users2 size={16} />
              </div>
              <h4 className="text-xs font-bold text-[#1e1b4b]">Vendors</h4>
              <p className="text-[11px] text-[#7a705a] mt-0.5">Supplier directory</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#B99652] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Open</span>
              <ArrowRight size={12} />
            </div>
          </Link>

          <Link
            to="/storekeeper/requirements"
            className="group p-4 bg-[#fffdf4]/40 hover:bg-[#fffdf4] border border-[#ebdcaa] hover:border-[#B99652] transition-all rounded-none flex flex-col justify-between"
          >
            <div>
              <div className="w-8 h-8 bg-[#fff8e7] border border-[#fde68a] text-[#92400e] flex items-center justify-center font-bold mb-2">
                <ClipboardList size={16} />
              </div>
              <h4 className="text-xs font-bold text-[#1e1b4b]">Requirements</h4>
              <p className="text-[11px] text-[#7a705a] mt-0.5">Requisitions pipeline</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#B99652] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Open</span>
              <ArrowRight size={12} />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
