import React, { useState, useEffect } from 'react';
import { Package, AlertCircle, Plus, Edit2, Trash2, Search, Layers, IndianRupee } from 'lucide-react';
import { useAuth } from '../auth/auth';

const InventoryManagementSimple = () => {
  const { token, API } = useAuth();
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError('');
      
      const res = await fetch(`${API}/storekeeper/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setItems(data.data || []);
        } else {
          setError(data.message || 'Failed to load inventory');
        }
      } else {
        setError('Failed to load inventory');
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError('Error loading inventory');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item =>
    (item.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: items.length,
    lowStock: items.filter(item => item.quantity < 10).length,
    totalValue: items.reduce((sum, item) => sum + (item.quantity * (item.unitPrice || 0)), 0)
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
            Inventory Management
          </h2>
          <p className="text-xs text-[#7a705a] mt-0.5">
            Real-time stock catalog, quantities, valuation, and supply status
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs border border-[#9b7b3e] shadow-xs transition-all self-start sm:self-auto">
          <Plus size={15} />
          <span>Add Stock Item</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
              <Package className="text-[#B99652]" size={16} />
              <span>Total Items</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
              Active
            </span>
          </div>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-2">
            {stats.total}
          </p>
          <p className="text-xs text-[#7a705a] mt-1">Catalogued in store</p>
        </div>

        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
              <AlertCircle className="text-amber-700" size={16} />
              <span>Low Stock Alerts</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-amber-50 text-amber-800 border border-amber-200">
              Warning
            </span>
          </div>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-amber-800 mt-2">
            {stats.lowStock}
          </p>
          <p className="text-xs text-[#7a705a] mt-1">Items below 10 units</p>
        </div>

        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
              <Layers className="text-[#B99652]" size={16} />
              <span>Total Stock Value</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200">
              Asset
            </span>
          </div>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-emerald-800 mt-2">
            ₹{stats.totalValue.toLocaleString()}
          </p>
          <p className="text-xs text-[#7a705a] mt-1">Current cumulative valuation</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#7a705a]" size={16} />
          <input
            type="text"
            placeholder="Search by item name or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#fffdf4]/40 border border-[#ebdcaa] rounded-none text-xs sm:text-sm text-[#1e1b4b] placeholder-[#7a705a]/60 focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-none p-4 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[#7a705a] text-xs">
          <div className="animate-spin h-6 w-6 border-2 border-[#B99652] border-t-transparent mr-2 rounded-none" />
          <span>Loading inventory data...</span>
        </div>
      ) : (
        /* Items Table */
        <div className="overflow-x-auto border border-[#ebdcaa]">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-[#665e4d] bg-[#fffdf4] border-b border-[#ebdcaa] font-bold">
                <th className="py-3 px-4">Item Name</th>
                <th className="px-4">Category</th>
                <th className="px-4">Stock Quantity</th>
                <th className="px-4">Unit Price</th>
                <th className="px-4">Vendor</th>
                <th className="px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebdcaa]/60 bg-white">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#7a705a]">
                    No inventory items found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#fffdf4]/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-[#1e1b4b]">
                      <div>{item.itemName}</div>
                      {item.description && (
                        <div className="text-[11px] font-normal text-[#7a705a] truncate max-w-xs">{item.description}</div>
                      )}
                    </td>
                    <td className="px-4">
                      <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                        {item.category || "General"}
                      </span>
                    </td>
                    <td className="px-4 font-bold">
                      <span className={item.quantity < 10 ? 'text-amber-800 font-bold' : 'text-[#1e1b4b]'}>
                        {item.quantity} units {item.quantity < 10 && <span className="text-[10px] text-amber-700 font-normal ml-1">(Low)</span>}
                      </span>
                    </td>
                    <td className="px-4 font-bold text-[#1e1b4b]">
                      ₹{(item.unitPrice || 0).toFixed(2)}
                    </td>
                    <td className="px-4 text-[#665e4d]">
                      {item.vendorName || '—'}
                    </td>
                    <td className="px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button className="p-1.5 border border-[#ebdcaa] rounded-none text-[#1e1b4b] bg-white hover:bg-[#fffdf4] transition-colors" title="Edit Item">
                          <Edit2 size={13} className="text-[#B99652]" />
                        </button>
                        <button className="p-1.5 border border-rose-200 rounded-none text-rose-600 bg-white hover:bg-rose-50 transition-colors" title="Delete Item">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InventoryManagementSimple;
