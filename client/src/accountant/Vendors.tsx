import React, { useState, useMemo } from 'react';
import { Plus, Search, Building2, Mail, Phone, User } from 'lucide-react';

type Vendor = {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  category?: string;
  registrationDate?: string;
};

const initial: Vendor[] = [
  { id: 'V1', name: 'ABC Supplies', contactPerson: 'Ravi Kumar', phone: '9999999999', email: 'abc@supplies.com', category: 'Stationery', registrationDate: '2025-10-01' },
  { id: 'V2', name: 'Tech Solutions', contactPerson: 'Amit Sharma', phone: '8888888888', email: 'tech@solutions.com', category: 'Electronics', registrationDate: '2025-11-15' },
  { id: 'V3', name: 'Office Furniture Co.', contactPerson: 'Priya Desai', phone: '7777777777', email: 'office@furniture.com', category: 'Furniture', registrationDate: '2025-12-01' },
];

export default function Vendors() {
  const [items, setItems] = useState<Vendor[]>(initial);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', category: '' });
  const [q, setQ] = useState('');

  function add() {
    if (!form.name.trim()) return;
    setItems(s => [{ id: 'V' + Date.now(), name: form.name, contactPerson: form.contactPerson, phone: form.phone, email: form.email, category: form.category, registrationDate: new Date().toISOString().slice(0,10) }, ...s]);
    setForm({ name: '', contactPerson: '', phone: '', email: '', category: '' });
  }

  const filtered = useMemo(() => 
    items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.category?.toLowerCase().includes(q.toLowerCase())), 
    [items, q]
  );

  const stats = useMemo(() => ({
    total: items.length,
    categories: new Set(items.map(i => i.category).filter(Boolean)).size,
  }), [items]);

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Vendor Management</h1>
          <p className="text-gray-600 mt-2">Manage and track school vendors and suppliers</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-blue-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Vendors</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total}</p>
              </div>
              <span className="text-3xl">🤝</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-green-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Categories</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.categories}</p>
              </div>
              <span className="text-3xl">📂</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Vendors List */}
          <div className="col-span-2">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Search Bar */}
              <div className="p-6 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-4 top-3 text-gray-400" size={20} />
                  <input 
                    value={q} 
                    onChange={e=>setQ(e.target.value)} 
                    placeholder="Search by vendor name or category..." 
                    className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Vendors Grid */}
              <div className="divide-y divide-gray-200">
                {filtered.map(v => (
                  <div key={v.id} className="p-6 hover:bg-slate-50 transition">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center">
                          <Building2 size={24} className="text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{v.name}</h3>
                          <span className="inline-block mt-2 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                            {v.category || 'Uncategorized'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">Registered: {v.registrationDate}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {v.contactPerson && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <User size={16} className="text-gray-400" />
                          <span>{v.contactPerson}</span>
                        </div>
                      )}
                      {v.phone && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone size={16} className="text-gray-400" />
                          <a href={`tel:${v.phone}`} className="hover:text-blue-600">{v.phone}</a>
                        </div>
                      )}
                      {v.email && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail size={16} className="text-gray-400" />
                          <a href={`mailto:${v.email}`} className="hover:text-blue-600 truncate">{v.email}</a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add Vendor Form */}
          <div className="col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Plus size={20} /> Add Vendor
              </h3>
              <div className="space-y-4">
                <input 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Vendor Name" 
                  value={form.name} 
                  onChange={e=>setForm(f=>({...f,name:e.target.value}))} 
                />
                <input 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Contact Person" 
                  value={form.contactPerson} 
                  onChange={e=>setForm(f=>({...f,contactPerson:e.target.value}))} 
                />
                <input 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Phone" 
                  value={form.phone} 
                  onChange={e=>setForm(f=>({...f,phone:e.target.value}))} 
                />
                <input 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Email" 
                  value={form.email} 
                  onChange={e=>setForm(f=>({...f,email:e.target.value}))} 
                />
                <input 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="Category" 
                  value={form.category} 
                  onChange={e=>setForm(f=>({...f,category:e.target.value}))} 
                />
                <button 
                  onClick={add}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:shadow-lg transition font-semibold"
                >
                  Add Vendor
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
