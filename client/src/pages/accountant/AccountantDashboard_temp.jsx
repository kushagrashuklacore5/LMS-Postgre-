import React, { useState, useEffect } from 'react';
import { useAuth } from "../../auth/auth";
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
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
  Target,
  TrendingDown
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
import AccountantLayout from "../../components/AccountantLayout";
import { useTranslation } from "../../context/TranslationContext";

const AccountantDashboard = () => {
  const { t } = useTranslation();
  const { token, API } = useAuth();
  const navigate = useNavigate();

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
    recentTransactions: [],
    feeCollectionData: [],
    expenseData: [],
    monthlyRevenueData: [],
    monthlyExpenseData: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch vendor invoices data
      const invoicesRes = await fetch(`${API}/accountant/vendor-invoices`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        if (invoicesData.success) {
          const invoices = invoicesData.data || [];
          const pendingCount = invoices.filter(inv => inv.status === 'pending').length;
          const totalCount = invoices.length;
          const paidInvoices = invoices.filter(inv => inv.status === 'paid');
          const totalPaidAmount = paidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
          
          // Group paid invoices by month for expense data
          const monthlyExpenseData = paidInvoices.reduce((acc, invoice) => {
            const rawDate = invoice.paidDate || invoice.updatedAt || invoice.issueDate;
            if (rawDate) {
              const date = new Date(rawDate);
              if (!isNaN(date.getTime())) {
                const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                if (!acc[monthYear]) {
                  acc[monthYear] = 0;
                }
                acc[monthYear] += invoice.amount || 0;
              }
            }
            return acc;
          }, {});

          // Convert to array format for charts
          const monthlyExpenseArray = Object.entries(monthlyExpenseData).map(([month, amount]) => ({
            name: month,
            expenses: amount
          })).sort((a, b) => new Date(a.name) - new Date(b.name));
          
          setStats(prev => ({
            ...prev,
            pendingVendorInvoices: pendingCount,
            totalVendorInvoices: totalCount,
            totalExpenses: totalPaidAmount,
            monthlyExpenseData: monthlyExpenseArray
          }));
        }
      }

      // Fetch fees stats
      const feesRes = await fetch(`${API}/accountant/fees-stats`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (feesRes.ok) {
        const feesData = await feesRes.json();
        if (feesData.success) {
          const totalFees = feesData.data?.totalFeesCollected || 0;
          
          // Use the same fees data for monthly revenue calculation
          let monthlyRevenueArray = [];
          if (feesData.success && feesData.data?.recentPayments) {
            const payments = feesData.data.recentPayments;
            
            // Group payments by month for revenue data
            const monthlyRevenueData = payments.reduce((acc, payment) => {
              if (payment.paymentDate) {
                const date = new Date(payment.paymentDate);
                const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                if (!acc[monthYear]) {
                  acc[monthYear] = 0;
                }
                acc[monthYear] += payment.amount || 0;
              }
              return acc;
            }, {});

            // Convert to array format for charts
            monthlyRevenueArray = Object.entries(monthlyRevenueData).map(([month, amount]) => ({
              name: month,
              revenue: amount
            })).sort((a, b) => new Date(a.name) - new Date(b.name));
          }
          
          setStats(prev => ({
            ...prev,
            totalFeesCollected: totalFees,
            totalStudents: feesData.data?.totalStudents || 0,
            averageFeesPerStudent: feesData.data?.averageFeesPerStudent || 0,
            totalRevenue: totalFees,
            monthlyRevenueData: monthlyRevenueArray
          }));
        }
      }

    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  if (loading) {
    return (
      <AccountantLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-[#002366]"></div>
        </div>
      </AccountantLayout>
    );
  }

  if (error) {
    return (
      <AccountantLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="h-12 w-12 text-rose-600 mb-3" />
          <p className="text-slate-800 text-lg font-bold mb-3">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="bg-[#002366] hover:bg-[#001845] text-white px-5 py-2.5 rounded-none font-semibold text-sm transition"
          >
            {t('retry_loading', 'Retry Loading')}
          </button>
        </div>
      </AccountantLayout>
    );
  }

  return (
    <AccountantLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ebdcaa] pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight">{t('accountant_executive_dashboard', 'Accountant Executive Dashboard')}</h1>
            <p className="text-slate-600 text-sm mt-1">{t('accountant_dashboard_subtitle', 'Real-time revenue monitoring, vendor liabilities, and financial audit insights')}</p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="bg-[#002366] hover:bg-[#001845] text-white px-4 py-2.5 rounded-none font-semibold text-sm transition-all shadow-xs flex items-center gap-2 self-start sm:self-auto"
          >
            <RefreshCw size={16} className="text-[#B99652]" />
            {t('refresh_overview', 'Refresh Overview')}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-[#002366] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">{t('total_fees_collected', 'Total Fees Collected')}</span>
              <DollarSign className="h-6 w-6 text-[#002366]" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[#002366]">
              ₹{stats.totalFeesCollected.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t('direct_student_offline_payments', 'Direct student & offline payments')}</p>
          </div>

          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-[#B99652] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">{t('pending_vendor_invoices', 'Pending Vendor Invoices')}</span>
              <FileText className="h-6 w-6 text-[#B99652]" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-[#002366]">
              {stats.pendingVendorInvoices}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t('awaiting_corporate_disbursement', 'Awaiting corporate disbursement')}</p>
          </div>

          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-rose-600 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">{t('total_settled_expenses', 'Total Settled Expenses')}</span>
              <TrendingDown className="h-6 w-6 text-rose-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-rose-700">
              ₹{stats.totalExpenses.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t('cleared_operational_expenses', 'Cleared operational expenses')}</p>
          </div>
        </div>

        {/* Financial Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <div className="bg-white rounded-none border border-[#ebdcaa] p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-[#002366] flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-600" />
                {t('revenue_trajectory', 'Revenue Trajectory')}
              </h2>
              <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 rounded-none border border-emerald-200 uppercase">
                {t('income_flow', 'Income Flow')}
              </span>
            </div>
            <div className="h-64 flex items-center justify-center">
              {stats.monthlyRevenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={stats.monthlyRevenueData}
                    margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1e5c8" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ebdcaa', borderRadius: '0px' }}
                      labelStyle={{ color: '#002366', fontWeight: 'bold' }}
                      formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#002366" 
                      strokeWidth={3}
                      dot={{ fill: '#B99652', r: 5, strokeWidth: 2, stroke: '#002366' }}
                      name="Revenue (₹)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-600 font-medium text-sm">{t('no_revenue_data_yet', 'No revenue data available yet')}</p>
                  <p className="text-slate-400 text-xs mt-1">{t('collections_realtime_notice', 'Collections will populate this chart in real-time')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Expense Chart */}
          <div className="bg-white rounded-none border border-[#ebdcaa] p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-[#002366] flex items-center gap-2">
                <TrendingDown size={18} className="text-rose-600" />
                {t('expense_analysis', 'Expense Analysis')}
              </h2>
              <span className="text-xs bg-rose-50 text-rose-800 font-bold px-2.5 py-1 rounded-none border border-rose-200 uppercase">
                {t('outflow_audit', 'Outflow Audit')}
              </span>
            </div>
            <div className="h-64 flex items-center justify-center">
              {stats.monthlyExpenseData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthlyExpenseData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1e5c8" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ebdcaa', borderRadius: '0px' }}
                      labelStyle={{ color: '#002366', fontWeight: 'bold' }}
                      formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Expenses']}
                    />
                    <Legend />
                    <Bar 
                      dataKey="expenses" 
                      fill="#B99652" 
                      name="Expenses (₹)"
                      radius={[0, 0, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <TrendingDown className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-600 font-medium text-sm">{t('no_expense_records_yet', 'No expense records available yet')}</p>
                  <p className="text-slate-400 text-xs mt-1">{t('paid_invoices_graph_notice', 'Paid vendor invoices will populate this graph')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AccountantLayout>
  );
};

export default AccountantDashboard;
