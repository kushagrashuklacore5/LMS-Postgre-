import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/auth";
import { useTranslation } from "../context/TranslationContext";
import {
  DollarSign,
  TrendingUp,
  FileText,
  Users,
  Calendar,
  Clock,
} from "lucide-react";

export default function WelcomeAccountant() {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalPayments: 0,
    pendingPayments: 0,
    totalExpenses: 0,
    universityName: "",
  });

  useEffect(() => {
    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Load accountant stats
    loadAccountantData();

    return () => clearInterval(timer);
  }, []);

  const loadAccountantData = async () => {
    try {
      const res = await fetch(`${API}/accountant/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStats({
          totalRevenue: data.totalRevenue || 0,
          totalPayments: data.totalPayments || 0,
          pendingPayments: data.pendingPayments || 0,
          totalExpenses: data.totalExpenses || 0,
          universityName: data.universityName || "CORE5 ACADEMY",
        });
      }
    } catch (err) {
      console.error("Error loading accountant data:", err);
    }
  };

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
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 max-w-4xl">
        {/* Logo and Welcome Message */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-6 shadow-2xl">
            <span className="text-4xl font-bold text-white">C5</span>
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Welcome Accountant
          </h1>
          <p className="text-xl text-gray-700 mb-2">
            {stats.universityName}
          </p>
          <p className="text-lg text-gray-600">
            Hello, <span className="font-semibold text-green-600">{user.name || "Accountant"}</span>
          </p>
        </div>

        {/* Date and Time Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Calendar size={24} />
              <span className="font-semibold">Today's Date</span>
            </div>
            <p className="text-2xl font-bold">{formatDate(currentTime)}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Clock size={24} />
              <span className="font-semibold">Current Time</span>
            </div>
            <p className="text-2xl font-bold">{formatTime(currentTime)}</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8">
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4 shadow-lg">
            <DollarSign className="mx-auto mb-2" size={24} />
            <p className="text-sm">Revenue</p>
            <p className="text-xl font-bold">${stats.totalRevenue?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4 shadow-lg">
            <TrendingUp className="mx-auto mb-2" size={24} />
            <p className="text-sm">Payments</p>
            <p className="text-xl font-bold">{stats.totalPayments || 0}</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white rounded-xl p-4 shadow-lg">
            <FileText className="mx-auto mb-2" size={24} />
            <p className="text-sm">Pending</p>
            <p className="text-xl font-bold">{stats.pendingPayments || 0}</p>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl p-4 shadow-lg">
            <Users className="mx-auto mb-2" size={24} />
            <p className="text-sm">Expenses</p>
            <p className="text-xl font-bold">${stats.totalExpenses?.toLocaleString() || 0}</p>
          </div>
        </div>

        {/* Navigation Hints */}
        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Start Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">1</div>
              <div>
                <p className="font-semibold text-green-800">Fees Collection</p>
                <p className="text-sm text-green-600">Manage student fee payments</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">2</div>
              <div>
                <p className="font-semibold text-blue-800">Payment History</p>
                <p className="text-sm text-blue-600">View detailed transaction records</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">3</div>
              <div>
                <p className="font-semibold text-purple-800">Inventory</p>
                <p className="text-sm text-purple-600">Track school supplies and materials</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">4</div>
              <div>
                <p className="font-semibold text-orange-800">Expenses</p>
                <p className="text-sm text-orange-600">Manage school expenses</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
