import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import {
  FileText,
  Package,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Users,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw
} from 'lucide-react';

const VendorDashboard = () => {
  const { API, token } = useAuth();
  const [stats, setStats] = useState({
    totalInvoices: 0,
    pendingInvoices: 0,
    paidInvoices: 0,
    totalRevenue: 0
  });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    // Auto-refresh every 30 seconds for real-time updates
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Debug: Log current user info
      console.log('🔍 Current user info:', { API, token: token ? 'present' : 'missing' });
      
      // Fetch vendor stats
      const statsRes = await fetch(`${API}/vendor/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('📊 Stats API Response Status:', statsRes.status);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        console.log('📊 Vendor Stats API Response:', statsData);
        if (statsData.success) {
          console.log('📈 Setting stats:', statsData.data);
          setStats(statsData.data);
        } else {
          console.error('❌ Stats API returned success: false:', statsData.message);
        }
      } else {
        console.error('❌ Stats API Error:', statsRes.status, statsRes.statusText);
        const errorText = await statsRes.text();
        console.error('❌ Error response:', errorText);
      }

      // Fetch recent invoices
      const invoicesRes = await fetch(`${API}/vendor/invoices?limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('📄 Invoices API Response Status:', invoicesRes.status);
      
      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        console.log('📄 Vendor Invoices API Response:', invoicesData);
        if (invoicesData.success) {
          setRecentInvoices(invoicesData.data);
        } else {
          console.error('❌ Invoices API returned success: false:', invoicesData.message);
        }
      } else {
        console.error('❌ Invoices API Error:', invoicesRes.status, invoicesRes.statusText);
        const errorText = await invoicesRes.text();
        console.error('❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon, change, changeType, color }) => (
    <div className="bg-[#fffdf4] rounded-none shadow-sm p-6 border border-[#ebdcaa] hover:border-[#B99652] transition-colors duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 rounded-none bg-[#B99652]/10 text-[#B99652] border border-[#ebdcaa]">
          {icon}
        </div>
        {change && (
          <div className={`flex items-center text-xs font-semibold uppercase tracking-wider ${
            changeType === 'positive' ? 'text-emerald-700' : 'text-red-700'
          }`}>
            {changeType === 'positive' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {change}
          </div>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{value}</p>
        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">{title}</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-[#fffdf4] border border-[#ebdcaa]">
        <div className="text-center">
          <div className="animate-spin rounded-none h-12 w-12 border-4 border-[#B99652] border-t-transparent mx-auto"></div>
          <p className="mt-4 text-[#1e1b4b] text-sm font-semibold tracking-wider uppercase">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
        <div>
          <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">Vendor Dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">Real-time overview of your business & invoices</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors self-start sm:self-auto"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Invoices"
          value={stats.totalInvoices}
          icon={<FileText size={22} className="text-[#B99652]" />}
          change="+12%"
          changeType="positive"
        />
        <StatCard
          title="Pending Invoices"
          value={stats.pendingInvoices}
          icon={<Clock size={22} className="text-[#B99652]" />}
          change="+3"
          changeType="positive"
        />
        <StatCard
          title="Total Revenue"
          value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}
          icon={<TrendingUp size={22} className="text-[#B99652]" />}
          change="+23%"
          changeType="positive"
        />
      </div>

      {/* Recent Invoices Card */}
      <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#ebdcaa]">
          <h3 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] flex items-center gap-2">
            <FileText className="text-[#B99652]" size={22} />
            Recent Invoices
          </h3>
          <span className="text-xs uppercase tracking-wider text-[#B99652] font-semibold">Latest 5 Records</span>
        </div>
        <div className="space-y-3">
          {recentInvoices.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText size={48} className="mx-auto mb-3 text-[#ebdcaa]" />
              <p className="text-base font-semibold text-[#1e1b4b]">No invoices yet</p>
              <p className="text-xs text-slate-500 mt-1">Your invoices will appear here once you create them</p>
            </div>
          ) : (
            recentInvoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-none border border-[#ebdcaa] hover:border-[#B99652] transition-colors gap-3">
                <div className="flex items-center space-x-4">
                  <div className={`p-2.5 rounded-none border ${
                    invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                    invoice.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {invoice.status === 'paid' ? <CheckCircle size={18} /> :
                     invoice.status === 'pending' ? <Clock size={18} /> :
                     <AlertCircle size={18} />}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1e1b4b] text-base">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{new Date(invoice.issueDate).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
                  <p className="font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] text-lg">₹{invoice.amount.toLocaleString('en-IN')}</p>
                  <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-none border ${
                    invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                    invoice.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>{invoice.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorDashboard;
