import React, { useState, useEffect } from 'react';
import { useAuth } from "../../auth/auth";
import AccountantLayout from "../../components/AccountantLayout";
import { TrendingDown, FileText, Calendar, DollarSign, CheckCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";

const Expenses = () => {
  const { token, API } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/accountant/vendor-invoices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setInvoices(data.data || []);
        } else {
          setError('Failed to fetch invoices');
        }
      } else {
        setError('Failed to fetch invoices');
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'pending':
        return 'bg-[#B99652]/15 text-[#8c6d31] border-[#B99652]/40';
      case 'overdue':
        return 'bg-rose-50 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={13} />;
      case 'pending':
        return <Clock size={13} />;
      case 'overdue':
        return <AlertCircle size={13} />;
      default:
        return <FileText size={13} />;
    }
  };

  const getInvoiceDateInfo = (invoice) => {
    if (invoice.status !== 'paid') {
      return { formattedDate: null, sourceLabel: null };
    }

    const candidates = [
      { raw: invoice.paidDate, label: null },
      { raw: invoice.updatedAt, label: 'Updated' },
      { raw: invoice.issueDate, label: 'Issued' }
    ];

    for (const candidate of candidates) {
      if (candidate.raw) {
        const date = new Date(candidate.raw);
        if (!isNaN(date.getTime())) {
          return {
            formattedDate: date.toLocaleDateString(),
            sourceLabel: candidate.label
          };
        }
      }
    }

    return { formattedDate: null, sourceLabel: null };
  };

  const totalExpenses = invoices.reduce((sum, invoice) => {
    return invoice.status === 'paid' ? sum + (invoice.amount || 0) : sum;
  }, 0);

  const pendingExpenses = invoices.reduce((sum, invoice) => {
    return invoice.status === 'pending' ? sum + (invoice.amount || 0) : sum;
  }, 0);

  if (loading) {
    return (
      <AccountantLayout>
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
          <div className="p-12 text-center text-[#002366]">
            <div className="w-8 h-8 border-3 border-[#B99652] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading institutional expense records...
          </div>
        </div>
      </AccountantLayout>
    );
  }

  if (error) {
    return (
      <AccountantLayout>
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
          <div className="bg-white border border-rose-300 rounded-none p-6 text-center shadow-xs">
            <AlertCircle className="h-10 w-10 text-rose-600 mx-auto mb-3" />
            <p className="text-rose-700 font-semibold mb-3">{error}</p>
            <button
              onClick={fetchInvoices}
              className="bg-[#002366] hover:bg-[#001845] text-white px-5 py-2 rounded-none font-bold text-xs uppercase tracking-wider transition-all"
            >
              Retry Loading
            </button>
          </div>
        </div>
      </AccountantLayout>
    );
  }

  return (
    <AccountantLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#ebdcaa]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight">
              Institutional Expenses & Vendor Outflows
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Track school operational expenses, vendor invoice payouts, and pending liabilities.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={fetchInvoices}
              className="bg-white hover:bg-[#fffdf4] text-[#002366] p-2.5 rounded-none border border-[#ebdcaa] shadow-xs transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-rose-600 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Cleared Expenses</span>
              <div className="p-2 bg-rose-500/10 text-rose-600 rounded-none border border-rose-500/20">
                <TrendingDown size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-rose-700">₹{totalExpenses.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-500">Paid vendor invoices</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#B99652] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Outflows</span>
              <div className="p-2 bg-[#B99652]/15 text-[#8c6d31] rounded-none border border-[#B99652]/30">
                <Clock size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-[#8c6d31]">₹{pendingExpenses.toLocaleString('en-IN')}</h3>
            <p className="text-xs text-[#8c6d31] font-medium">Awaiting payment</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#002366] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Vendor Invoices</span>
              <div className="p-2 bg-[#002366]/10 text-[#002366] rounded-none border border-[#002366]/20">
                <FileText size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{invoices.length}</h3>
            <p className="text-xs text-slate-500">Tracked invoice files</p>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="bg-white rounded-none border border-[#ebdcaa] shadow-xs overflow-hidden">
          <div className="bg-[#fbf6e6] p-4 border-b border-[#ebdcaa] flex justify-between items-center">
            <h3 className="text-base font-bold text-[#002366]">All Vendor Invoices & Operational Expenses</h3>
            <span className="text-xs font-semibold text-[#8c6d31] uppercase tracking-wider">
              {invoices.length} Total Records
            </span>
          </div>

          {invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-base font-semibold text-[#002366]">No Invoices Found</p>
              <p className="text-xs text-slate-400 mt-1">No institutional expense invoices have been registered yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fbf6e6]/60 text-[#002366] text-xs uppercase tracking-wider font-bold border-b border-[#ebdcaa]">
                    <th className="px-6 py-4">Invoice #</th>
                    <th className="px-6 py-4">Vendor & Description</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Available Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 text-sm">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-[#fffdf4] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-[#B99652]" />
                          <span className="font-bold text-[#002366]">{invoice.invoiceNumber}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-900">{invoice.vendorName}</p>
                          <p className="text-slate-500 text-xs">{invoice.description}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        ₹{Number(invoice.amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-slate-400" />
                          <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-none text-xs font-semibold border ${getStatusColor(invoice.status)}`}>
                          {getStatusIcon(invoice.status)}
                          <span className="uppercase">{invoice.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium">
                        {(() => {
                          const { formattedDate, sourceLabel } = getInvoiceDateInfo(invoice);
                          if (!formattedDate) {
                            return <span className="text-slate-400">—</span>;
                          }
                          return (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 text-emerald-700">
                                <CheckCircle size={14} />
                                <span>{formattedDate}</span>
                              </div>
                              {sourceLabel && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({sourceLabel})
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AccountantLayout>
  );
};

export default Expenses;
