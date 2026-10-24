import React, { useEffect, useMemo, useState } from 'react';
import { onPayment, emitPayment, startSimulatedPayments } from './mockSocket';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Download, Filter } from 'lucide-react';

type Tx = {
  id: string;
  timestamp: string;
  fromTo: string;
  amount: number;
  type: 'Student Payment' | 'Vendor Payment';
  status: 'Success' | 'Pending' | 'Failed';
};

const initial: Tx[] = [];

export default function PaymentHistory() {
  const [txs, setTxs] = useState<Tx[]>(initial);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const perPage = 10;

  useEffect(() => {
    const unsub = onPayment((e) => {
      setTxs((s) => [{ id: e.id, timestamp: e.timestamp, fromTo: e.studentId || e.vendorId || '-', amount: e.amount, type: e.type, status: e.status }, ...s]);
    });

    startSimulatedPayments();
    return unsub;
  }, []);

  const filteredTxs = useMemo(() => {
    if (filterStatus === 'all') return txs;
    return txs.filter(t => t.status.toLowerCase() === filterStatus.toLowerCase());
  }, [txs, filterStatus]);

  const paged = useMemo(() => filteredTxs.slice((page - 1) * perPage, page * perPage), [filteredTxs, page]);

  const chartData = useMemo(() => {
    const byDate: Record<string, number> = {};
    txs.forEach(t => {
      const date = new Date(t.timestamp).toLocaleDateString();
      byDate[date] = (byDate[date] || 0) + t.amount;
    });
    return Object.entries(byDate).map(([date, amount]) => ({ date, amount }));
  }, [txs]);

  const stats = useMemo(() => ({
    total: txs.reduce((s, t) => s + (t.status === 'Success' ? t.amount : 0), 0),
    success: txs.filter(t => t.status === 'Success').length,
    failed: txs.filter(t => t.status === 'Failed').length,
    pending: txs.filter(t => t.status === 'Pending').length,
  }), [txs]);

  function exportCsv() {
    const headers = ['Date','Time','Transaction ID','From/To','Amount','Type','Status'];
    const rows = filteredTxs.map(t => [new Date(t.timestamp).toLocaleDateString(), new Date(t.timestamp).toLocaleTimeString(), t.id, t.fromTo, String(t.amount), t.type, t.status]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payment_history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Payment History</h1>
          <p className="text-gray-600 mt-2">Track all transactions and revenue trends</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-blue-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Revenue</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">₹{stats.total.toLocaleString('en-IN')}</p>
              </div>
              <span className="text-3xl">💰</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-green-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Successful</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.success}</p>
              </div>
              <span className="text-3xl">✓</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-yellow-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Pending</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.pending}</p>
              </div>
              <span className="text-3xl">⏳</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-red-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Failed</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.failed}</p>
              </div>
              <span className="text-3xl">✕</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Legend />
              <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Recent Transactions</h2>
            <button onClick={exportCsv} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition">
              <Download size={18} />
              Export CSV
            </button>
          </div>

          <div className="p-6 border-b border-gray-200 flex items-center gap-4">
            <Filter size={20} className="text-gray-600" />
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Transactions</option>
              <option value="success">Successful</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Date</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Time</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Transaction ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">From/To</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Amount</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Type</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paged.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 text-sm text-slate-900">{new Date(t.timestamp).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(t.timestamp).toLocaleTimeString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{t.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.fromTo}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">₹{t.amount.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.type}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        t.status === 'Success' ? 'bg-green-100 text-green-800' :
                        t.status === 'Failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">Page {page} of {Math.ceil(filteredTxs.length / perPage)}</span>
            <div className="flex gap-2">
              <button disabled={page===1} onClick={() => setPage(p=>Math.max(1,p-1))} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
              <button disabled={page*perPage >= filteredTxs.length} onClick={() => setPage(p=>p+1)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
