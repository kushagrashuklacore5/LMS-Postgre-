import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, AlertCircle, CheckCircle, Plus } from 'lucide-react';
import { useAuth } from '../auth/auth';
import { useTranslation } from '../context/TranslationContext';

type Expense = {
  id: string | number;
  type?: string;
  description: string;
  amount: number;
  dueDate?: string;
  date?: string;
  status: 'Paid'|'Pending'|'pending'|'approved';
  category?: string;
  createdAt?: string;
};

const initial: Expense[] = [
  { id: 'E1', type: 'Maintenance Bills', description: 'AC repair', amount: 5000, dueDate: '2026-01-10', status: 'Pending' },
  { id: 'E2', type: 'Staff Salaries', description: 'January salaries', amount: 120000, dueDate: '2026-02-01', status: 'Pending' },
  { id: 'E3', type: 'Utilities', description: 'Electricity and water bills', amount: 15000, dueDate: '2026-01-25', status: 'Paid' },
];

export default function Expenses() {
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState<Expense[]>(initial);
  const [apiItems, setApiItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: 'Maintenance Bills', description: '', amount: 0, dueDate: '', status: 'Pending' });

  // Load expenses from API
  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API}/expenses`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Fetched expenses:', data);
          const formattedData = (Array.isArray(data) ? data : []).map((exp: any) => ({
            ...exp,
            status: exp.status === 'pending' ? 'Pending' : exp.status === 'approved' ? 'Paid' : exp.status
          }));
          setApiItems(formattedData);
          // Merge API data with initial data
          setItems([...formattedData, ...initial.filter(i => !formattedData.find(a => a.id === i.id))]);
        }
      } catch (error) {
        console.error('Error fetching expenses:', error);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchExpenses();
      // Refresh every 10 seconds
      const interval = setInterval(fetchExpenses, 10000);
      return () => clearInterval(interval);
    }
  }, [token, API]);

  function add() {
    if (!form.description.trim() || !form.dueDate) return;
    const ex: Expense = { id: 'E' + Date.now(), type: form.type, description: form.description, amount: Number(form.amount), dueDate: form.dueDate, status: form.status as any };
    setItems(s => [ex, ...s]);
    setForm({ type: 'Maintenance Bills', description: '', amount: 0, dueDate: '', status: 'Pending' });
  }

  const summary = useMemo(() => {
    const byMonth: Record<string, number> = {};
    items.forEach(i => {
      const dateStr = i.dueDate || i.date || i.createdAt || new Date().toISOString();
      const key = new Date(dateStr).toLocaleString('default', { month: 'short', year: 'numeric' });
      byMonth[key] = (byMonth[key] || 0) + i.amount;
    });
    return Object.entries(byMonth).map(([name, value]) => ({ name, value }));
  }, [items]);

  const stats = useMemo(() => ({
    total: items.reduce((a, b) => a + b.amount, 0),
    paid: items.filter(i => i.status === 'Paid' || i.status === 'approved').reduce((a, b) => a + b.amount, 0),
    pending: items.filter(i => i.status === 'Pending' || i.status === 'pending').reduce((a, b) => a + b.amount, 0),
    overdue: items.filter(i => (i.status === 'Pending' || i.status === 'pending') && (i.dueDate || i.date) && new Date(i.dueDate || i.date || '') < new Date()).length,
  }), [items]);

  function dueColor(due: string | undefined) {
    if (!due) return 'bg-gray-100 text-gray-800';
    const now = new Date();
    const dt = new Date(due);
    const diff = (dt.getTime() - now.getTime()) / (1000*60*60*24);
    if (diff < 0) return 'bg-red-100 text-red-800';
    if (diff <= 7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  function dueLabelColor(due: string | undefined) {
    if (!due) return 'N/A';
    const now = new Date();
    const dt = new Date(due);
    const diff = (dt.getTime() - now.getTime()) / (1000*60*60*24);
    if (diff < 0) return 'Overdue';
    if (diff <= 7) return 'Due Soon';
    return 'On Track';
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">{t('expenses')}</h1>
          <p className="text-gray-600 mt-2">{t('track_all_school_expenses')}</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-blue-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('total_expenses')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">₹{stats.total.toLocaleString('en-IN')}</p>
              </div>
              <span className="text-3xl">💸</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-green-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('paid')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">₹{stats.paid.toLocaleString('en-IN')}</p>
              </div>
              <span className="text-3xl">✓</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-yellow-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('pending')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">₹{stats.pending.toLocaleString('en-IN')}</p>
              </div>
              <span className="text-3xl">⏳</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-red-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('expenses')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.overdue}</p>
              </div>
              <span className="text-3xl">🚨</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp size={24} className="text-blue-600" />
            {t('expenses')}
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Expenses Table */}
          <div className="col-span-2">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-slate-900">{t('expenses')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">{t('category')}</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">{t('description')}</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">{t('amount')}</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">{t('due_date')}</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">{t('status')}</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map(i => (
                      <tr key={i.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{i.type || i.category || 'Other'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{i.description}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">₹{i.amount.toLocaleString('en-IN')}</td>
                        <td className="px-6 py-4 text-sm">
                          {(i.dueDate || i.date) && (
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${dueColor(i.dueDate || i.date)}`}>
                              {new Date(i.dueDate || i.date || '').toLocaleDateString()} · {dueLabelColor(i.dueDate || i.date)}
                            </span>
                          )}
                          {!i.dueDate && !i.date && (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">No Due Date</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            i.status === 'Paid' || i.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {i.status === 'Pending' || i.status === 'pending' ? 'Pending' : 'Paid'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {(i.status === 'Pending' || i.status === 'pending') && (
                            <button 
                              onClick={() => setItems(s => s.map(x => x.id === i.id ? {...x, status: 'Paid'} : x))}
                              className="text-blue-600 hover:text-blue-700 font-semibold"
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Add Expense Form */}
          <div className="col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Plus size={20} /> {t('add_new_expense')}
              </h3>
              <div className="space-y-4">
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  value={form.type} 
                  onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                >
                  <option>{t('maintain_bills')}</option>
                  <option>{t('staff_salaries')}</option>
                  <option>{t('transportation_expenses')}</option>
                  <option>{t('utilities')}</option>
                  <option>{t('other')}</option>
                </select>
                <input 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder={t('description')} 
                  value={form.description} 
                  onChange={e=>setForm(f=>({...f,description:e.target.value}))} 
                />
                <input 
                  type="number" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder={t('amount')} 
                  value={form.amount} 
                  onChange={e=>setForm(f=>({...f,amount:Number(e.target.value)}))} 
                />
                <input 
                  type="date" 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  value={form.dueDate} 
                  onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} 
                />
                <button 
                  onClick={add}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:shadow-lg transition font-semibold"
                >
                  {t('add_new_expense')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
