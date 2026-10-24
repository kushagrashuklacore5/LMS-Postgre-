import React, { useState, useEffect } from 'react';
import { useAuth } from "../../auth/auth";
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  CheckCircle, 
  AlertCircle,
  Clock,
  CreditCard,
  Download,
  RefreshCw,
  Eye,
  BarChart3,
  Database,
  Package,
  Building,
  UserCheck,
  Activity,
  FileCheck,
  Target
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import OfflineFeeModal from '../../components/OfflineFeeModal';

const AccountantDashboard = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);

  // Listen for payment events from VendorInvoiceManagement
  useEffect(() => {
    const handlePaymentSuccess = (event) => {
      console.log('🔔 Dashboard received payment event:', event.detail);
      
      // Refresh dashboard data to show updated stats
      fetchDashboardData();
      
      // Show success notification
      const invoiceNumber = event.detail?.invoiceNumber || 'Unknown';
      toast.success(`Payment received for Invoice #${invoiceNumber}`);
    };

    // Add event listener
    if (window.accountantPaymentEvents) {
      window.accountantPaymentEvents.addEventListener('paymentSuccess', handlePaymentSuccess);
    }

    // Cleanup on unmount
    return () => {
      if (window.accountantPaymentEvents) {
        window.accountantPaymentEvents.removeEventListener('paymentSuccess', handlePaymentSuccess);
      }
    };
  }, []);

  const [stats, setStats] = useState({
    totalFeesCollected: 0,
    totalStudents: 0,
    averageFeesPerStudent: 0,
    pendingVendorInvoices: 0,
    totalVendorInvoices: 0,
    totalRevenue: 0,
    totalPayments: 0,
    pendingPayments: 0,
    totalExpenses: 0,
    universityName: "",
    universityId: null,
  });

  const [chartData, setChartData] = useState({
    revenueByMonth: [],
    paymentStatus: [],
    feeCollection: [],
    expenseBreakdown: [],
  });

  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState(null);

  // Authentication check
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.role !== "accountant") {
      console.error('❌ Invalid user role:', user.role);
      toast.error("Access denied. Accountant role required.");
      navigate("/login");
      return;
    }
    // Load all transactions from database for accountant portal
    transactionStore.loadTransactions();
    loadAccountantData();

    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Enhanced data loading function with comprehensive error handling
  const loadAccountantData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Loading Accountant Dashboard Data...');
      console.log('🔍 API URL:', API);
      console.log('🔍 Token Present:', !!token);

      // Validate API and token
      if (!API || !token) {
        console.error('❌ API URL or token missing');
        const errorMsg = 'API configuration error. Please check your connection.';
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      // Create timeout controller for request cancellation
      const dashboardController = new AbortController();
      const dashboardTimeoutId = setTimeout(() => {
        dashboardController.abort();
        console.warn('⏰ Request timeout - aborting fetch');
        setError('Request timeout. Please check your connection.');
        toast.error('Request timeout. Please try again.');
      }, 10000); // 10 seconds

      // Main dashboard data fetch
      console.log('📊 Fetching dashboard data...');
      const res = await fetch(`${API}/accountant/dashboard`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: dashboardController.signal
      });

      // Clear timeout
      clearTimeout(dashboardTimeoutId);

      console.log('📡 Dashboard API Response Status:', res.status);
      console.log('📡 Dashboard API Response Headers:', Object.fromEntries(res.headers.entries()));

      if (!res.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await res.text();
          console.error('❌ Dashboard API Error:', res.status, errorText);

          // Enhanced error handling for different status codes
          if (res.status === 401) {
            const errorMsg = 'Session expired. Please login again.';
            setError(errorMsg);
            toast.error(errorMsg);
            setTimeout(() => navigate('/login'), 2000);
          } else if (res.status === 403) {
            const errorMsg = 'Access denied. Check your permissions.';
            setError(errorMsg);
            toast.error(errorMsg);
          } else if (res.status === 404) {
            const errorMsg = 'Dashboard endpoint not found.';
            setError(errorMsg);
            toast.error(errorMsg);
          } else if (res.status >= 500) {
            const errorMsg = 'Server error. Please try again later.';
            setError(errorMsg);
            toast.error(errorMsg);
          } else if (res.status === 0 || !navigator.onLine) {
            const errorMsg = 'Network error. Check your connection.';
            setError(errorMsg);
            toast.error(errorMsg);
          } else {
            const errorMsg = `Failed to load dashboard data: ${res.status}`;
            setError(errorMsg);
            toast.error(errorMsg);
          }
        } catch (textError) {
          console.error('❌ Error parsing error response:', textError);
          const errorMsg = 'Failed to parse server response.';
          setError(errorMsg);
          toast.error(errorMsg);
        }
        return;
      }

      const data = await res.json();
      console.log('📡 Dashboard API Response Data:', data);

      if (!data.success) {
        console.error('❌ Dashboard API returned success: false:', data.message);
        const errorMsg = data.message || 'Failed to load dashboard data.';
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      // Fee collection data fetch
      console.log('📊 Fetching fee stats...');
      const feesRes = await fetch(`${API}/accountant/fees-stats`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Fees API Response Status:', feesRes.status);

      let feesData = { totalFeesCollected: 0, totalStudents: 0, averageFeesPerStudent: 0 };
      if (feesRes.ok) {
        const feesResponse = await feesRes.json();
        console.log('📡 Fees API Response Data:', feesResponse);
        if (feesResponse.success) {
          feesData = feesResponse.data;
        } else {
          console.error('❌ Fees API returned success: false:', feesResponse.message);
        }
      } else {
        console.error('❌ Fees Network Error:', feesRes.status);
      }

      // Vendor invoices data fetch
      console.log('📋 Fetching vendor invoices...');
      
      // Create AbortController for timeout
      const invoicesController = new AbortController();
      const invoicesTimeoutId = setTimeout(() => invoicesController.abort(), 30000); // 30 second timeout
      
      const invoicesRes = await fetch(`${API}/accountant/vendor-invoices`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: invoicesController.signal
      });

      clearTimeout(invoicesTimeoutId);

      console.log('📡 Invoices API Response Status:', invoicesRes.status);

      let invoiceData = { totalVendorInvoices: 0, pendingVendorInvoices: 0 };
      if (invoicesRes.ok) {
        const invoicesResponse = await invoicesRes.json();
        console.log('📡 Invoices API Response Data:', invoicesResponse);
        if (invoicesResponse.success) {
          const invoices = invoicesResponse.data || [];
          invoiceData.totalVendorInvoices = invoices.length;
          invoiceData.pendingVendorInvoices = invoices.filter(inv => inv.status === 'pending').length;
        } else {
          console.error('❌ Invoices API returned success: false:', invoicesResponse.message);
        }
      } else {
        if (invoicesRes.status === 408) {
          console.error('❌ Invoices Request timeout');
        } else {
          console.error('❌ Invoices Network Error:', invoicesRes.status);
        }
      }

      // Update stats with comprehensive fallbacks
      setStats({
        totalFeesCollected: feesData.totalFeesCollected || 0,
        totalStudents: feesData.totalStudents || 0,
        averageFeesPerStudent: feesData.averageFeesPerStudent || 0,
        pendingVendorInvoices: invoiceData.pendingVendorInvoices,
        totalVendorInvoices: invoiceData.totalVendorInvoices,
        totalRevenue: data.totalRevenue || 0,
        totalPayments: data.totalPayments || 0,
        pendingPayments: data.pendingPayments || 0,
        totalExpenses: data.totalExpenses || 0,
        universityName: data.universityName || "University",
        universityId: data.universityId,
      });

      // Update chart data with comprehensive fallbacks
      setChartData({
        revenueByMonth: data.revenueByMonth || [
          { month: "Jan", revenue: 5000 },
          { month: "Feb", revenue: 7200 },
          { month: "Mar", revenue: 6800 },
          { month: "Apr", revenue: 8100 },
          { month: "May", revenue: 9500 },
          { month: "Jun", revenue: 10200 },
        ],
        paymentStatus: data.paymentStatus || [
          { name: "Paid", value: 65, color: "#10b981" },
          { name: "Pending", value: 25, color: "#f59e0b" },
          { name: "Failed", value: 10, color: "#ef4444" },
        ],
        feeCollection: data.feeCollection || [
          { grade: "Grade 1", collected: 25000, target: 30000 },
          { grade: "Grade 2", collected: 22000, target: 30000 },
          { grade: "Grade 3", collected: 28000, target: 30000 },
          { grade: "Grade 4", collected: 19000, target: 30000 },
        ],
        expenseBreakdown: data.expenseBreakdown || [
          { name: "Salaries", value: 40, color: "#3b82f6" },
          { name: "Utilities", value: 20, color: "#8b5cf6" },
          { name: "Materials", value: 25, color: "#ec4899" },
          { name: "Other", value: 15, color: "#14b8a6" },
        ],
      });

      console.log('✅ Accountant data loaded successfully');
      toast.success('Dashboard data loaded successfully');
      setError(null);

    } catch (error) {
      console.error('❌ Error loading accountant data:', error);
      const errorMsg = 'Failed to load dashboard data. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Utility functions
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const downloadReport = () => {
    toast.success("📥 Downloading financial report...");
    // TODO: Implement PDF generation
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // Enhanced loading state with better UX
  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffdf4] text-[#1e1b4b] flex items-center justify-center p-6">
        <div className="text-center bg-white p-8 border border-[#ebdcaa] rounded-none max-w-md w-full shadow-sm">
          <div className="animate-spin h-12 w-12 border-4 border-[#B99652] border-t-transparent rounded-none mx-auto mb-4"></div>
          <h2 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">Loading Accountant Dashboard</h2>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">Please wait while we fetch financial data...</p>
          {error && (
            <div className="mt-2 p-3 bg-red-50 text-red-700 rounded-none border border-red-200 text-xs">
              <p className="font-semibold">Error Detected</p>
              <p className="mt-0.5">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AccountantLayout>
      <div className="space-y-6 pb-6">
        
        {/* Header Banner */}
        <div className="bg-[#002366] text-white p-6 rounded-2xl shadow-md border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold uppercase tracking-wider border border-amber-400/30">
                Financial Operations
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Inter',sans-serif]">
              Accountant Overview
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              {stats.universityName} • Welcome back, <span className="text-amber-300 font-semibold">{user.name || 'Accountant'}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOfflineModalOpen(true)}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-lg hover:shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              💰 Collect Offline Fee
            </button>
            <button
              onClick={loadAccountantData}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 border border-white/20 shadow-sm cursor-pointer"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold mb-0.5">Connection Error</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              </div>
              <button
                onClick={loadAccountantData}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Primary Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Fees Collected */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Total Fees Collected</span>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <DollarSign size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              ₹{stats.totalFeesCollected.toLocaleString('en-IN')}
            </h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Real-time ledger recording</p>
          </div>

          {/* Students */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Active Students</span>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Users size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {stats.totalStudents}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Enrolled student accounts</p>
          </div>

          {/* Avg Fee */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Avg Fee / Student</span>
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <TrendingUp size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              ₹{stats.averageFeesPerStudent.toLocaleString('en-IN')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Average collection per seat</p>
          </div>

          {/* Pending Invoices */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Pending Invoices</span>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FileText size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {stats.pendingVendorInvoices}
            </h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Awaiting approval clearance</p>
          </div>
        </div>

        {/* Secondary Financial Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Vendor Invoices</span>
              <FileText className="text-amber-500" size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{stats.totalVendorInvoices}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total vendor bills processed</p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Gross Income</span>
              <DollarSign className="text-emerald-500" size={20} />
            </div>
            <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">₹{stats.totalRevenue.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total institutional revenue</p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Total Expenses</span>
              <TrendingUp className="text-rose-500" size={20} />
            </div>
            <h3 className="text-xl font-bold text-rose-600 dark:text-rose-400 mb-1">₹{stats.totalExpenses.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Operational expenditures</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-amber-500/40 transition-all">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FileText size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Vendor Invoices Portal</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {stats.pendingVendorInvoices} pending invoices awaiting review & settlement
                </p>
              </div>
            </div>
            <div className="pt-4">
              <button
                onClick={() => navigate('/accountant/vendor-invoices')}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
              >
                Manage Vendor Invoices
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-blue-500/40 transition-all">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <DollarSign size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Fee Collection Management</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Track student fee structures, dues status, and official tax invoices
                </p>
              </div>
            </div>
            <div className="pt-4">
              <button
                onClick={() => navigate('/accountant/fees')}
                className="w-full sm:w-auto px-5 py-2.5 bg-[#002366] hover:bg-[#001a4d] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
              >
                View Fee Collection
              </button>
            </div>
          </div>
        </div>

        {/* Financial Visualizations Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Fee Collection Bar Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center justify-between">
              <span>Fee Collection by Grade</span>
              <span className="text-xs font-semibold text-slate-400">Academic Session 2026</span>
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData.feeCollection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="grade" stroke="#64748b" textAnchor="end" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="collected" fill="#B99652" radius={[6, 6, 0, 0]} name="Collected" />
                <Bar dataKey="target" fill="#cbd5e1" radius={[6, 6, 0, 0]} name="Target" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payment Status Pie Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center justify-between">
              <span>Payment Status Breakdown</span>
              <span className="text-xs font-semibold text-slate-400">Real-Time Data</span>
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={chartData.paymentStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={85}
                  fill="#B99652"
                  dataKey="value"
                >
                  {chartData.paymentStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 1 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center text-xs text-slate-500 dark:text-slate-400 gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-medium">
              <Calendar size={14} className="text-amber-500" />
              <span>{formatDate(currentTime)}</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <Clock size={14} className="text-amber-500" />
              <span>{formatTime(currentTime)}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 font-medium">
            <div className="flex items-center gap-1.5">
              <User size={14} className="text-amber-500" />
              <span>{user.name || 'Accountant'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building size={14} className="text-amber-500" />
              <span>{stats.universityName}</span>
            </div>
          </div>
        </div>
      </div>

      <OfflineFeeModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
        onSuccess={() => {
          loadAccountantData();
        }}
      />
    </AccountantLayout>
  );
};

export default AccountantDashboard;
