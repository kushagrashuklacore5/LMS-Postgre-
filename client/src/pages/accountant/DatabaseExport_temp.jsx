import React, { useState, useEffect } from 'react';
import { useAuth } from "../../auth/auth";
import AccountantLayout from "../../components/AccountantLayout";
import { Database, Download, FileText, Calendar, DollarSign, CheckCircle, Clock, RefreshCw } from "lucide-react";

const AccountantDatabaseExport = () => {
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

  const exportToCSV = () => {
    if (invoices.length === 0) return;

    const headers = ['Invoice Number', 'Vendor Name', 'Description', 'Amount', 'Due Date', 'Status', 'Paid Date'];
    const csvData = invoices.map(invoice => [
      invoice.invoiceNumber,
      invoice.vendorName,
      invoice.description,
      invoice.amount,
      new Date(invoice.dueDate).toLocaleDateString(),
      invoice.status,
      invoice.paidDate ? new Date(invoice.paidDate).toLocaleDateString() : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    if (invoices.length === 0) return;

    const jsonData = {
      exportDate: new Date().toISOString(),
      totalInvoices: invoices.length,
      invoices: invoices
    };

    const jsonContent = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <AccountantLayout>
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">🗄️ Database Export</h2>
            <p className="text-gray-400">Export system data to various formats</p>
          </div>
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </AccountantLayout>
    );
  }

  return (
    <AccountantLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">🗄️ Database Export</h2>
            <p className="text-gray-400">Export system data to various formats</p>
          </div>
          <button
            onClick={fetchInvoices}
            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors"
          >
            <RefreshCw size={20} />
          </button>
        </div>

        {/* Export Options */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Export Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={exportToCSV}
              disabled={invoices.length === 0}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Download size={20} />
              <span>Export to CSV</span>
            </button>
            <button
              onClick={exportToJSON}
              disabled={invoices.length === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Database size={20} />
              <span>Export to JSON</span>
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-4">
            {invoices.length === 0 
              ? "No data available to export" 
              : `${invoices.length} invoices available for export`
            }
          </p>
        </div>

        {/* Data Preview */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl">
          <div className="p-6 border-b border-slate-700/50">
            <h3 className="text-xl font-semibold text-white">Data Preview</h3>
          </div>
          
          {invoices.length === 0 ? (
            <div className="p-12 text-center">
              <Database size={64} className="mx-auto text-gray-600 mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">No Data to Export</h3>
              <p className="text-gray-400">Data exports will be available once invoices are created in the system.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left p-4 text-gray-400 font-medium">Invoice #</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Vendor</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Amount</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Due Date</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Paid Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <FileText size={16} className="text-gray-400" />
                          <span className="text-white font-medium">{invoice.invoiceNumber}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-white">{invoice.vendorName}</p>
                          <p className="text-gray-400 text-sm">{invoice.description}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-white font-semibold">₹{invoice.amount.toLocaleString('en-IN')}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} className="text-gray-400" />
                          <span className="text-white">{new Date(invoice.dueDate).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium border ${
                          invoice.status === 'paid' 
                            ? 'text-green-500 bg-green-500/10 border-green-500/20'
                            : 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                        }`}>
                          {invoice.status === 'paid' ? <CheckCircle size={16} /> : <Clock size={16} />}
                          <span className="uppercase">{invoice.status}</span>
                        </span>
                      </td>
                      <td className="p-4">
                        {invoice.paidDate ? (
                          <div className="flex items-center space-x-2">
                            <CheckCircle size={16} className="text-green-500" />
                            <span className="text-white">{new Date(invoice.paidDate).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
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

export default AccountantDatabaseExport;
