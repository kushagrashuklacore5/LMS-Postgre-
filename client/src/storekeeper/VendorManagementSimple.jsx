import React, { useState, useEffect } from 'react';
import { Users2, Plus, Edit2, Trash2, Search, Package, ExternalLink, Star } from 'lucide-react';
import { useAuth } from '../auth/auth';

const VendorManagementSimple = () => {
  const { token, API } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [vendorStock, setVendorStock] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('vendors');

  // Check if we're on vendor-stock route and set active tab accordingly
  useEffect(() => {
    if (window.location.pathname.includes('vendor-stock')) {
      setActiveTab('stock');
    }
  }, []);

  useEffect(() => {
    loadVendors();
    loadVendorStock();
  }, []);

  const loadVendors = async () => {
    try {
      setLoading(true);
      setError('');
      
      const res = await fetch(`${API}/storekeeper/vendors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendors(data.data || []);
        } else {
          setError(data.message || 'Failed to load vendors');
        }
      } else {
        setError('Failed to load vendors');
      }
    } catch (err) {
      console.error('Error loading vendors:', err);
      setError('Error loading vendors');
    } finally {
      setLoading(false);
    }
  };

  const loadVendorStock = async () => {
    try {
      const res = await fetch(`${API}/storekeeper/vendor-stock`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendorStock(data.data || []);
        }
      }
    } catch (err) {
      console.error('Error loading vendor stock:', err);
    }
  };

  const filteredVendors = vendors.filter(vendor =>
    (vendor.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (vendor.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVendorStock = vendorStock.filter(stock =>
    (stock.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (stock.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalVendors: vendors.length,
    totalOrders: vendors.reduce((sum, vendor) => sum + (vendor.totalOrders || 0), 0),
    totalValue: vendors.reduce((sum, vendor) => sum + (vendor.totalValue || 0), 0),
    totalStockItems: vendorStock.reduce((sum, stock) => sum + (stock.quantity || 0), 0)
  };

  const handleViewVendor = (vendor) => {
    window.open(`/vendor/dashboard?vendor=${vendor.id}`, '_blank');
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-[#ebdcaa] rounded-none shadow-[0_4px_25px_rgba(185,150,82,0.06)] p-6 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
            Supplier & Vendor Network
          </h2>
          <p className="text-xs text-[#7a705a] mt-0.5">
            Manage authorized suppliers, contracted pricing, and vendor-managed warehouse stock
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a68444] text-white rounded-none font-bold text-xs border border-[#9b7b3e] shadow-xs transition-all self-start sm:self-auto">
          <Plus size={15} />
          <span>Add New Vendor</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[#ebdcaa]">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('vendors')}
            className={`py-2.5 px-1 border-b-2 font-bold text-xs sm:text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'vendors'
                ? 'border-[#B99652] text-[#1e1b4b]'
                : 'border-transparent text-[#7a705a] hover:text-[#1e1b4b]'
            }`}
          >
            <Users2 size={16} className={activeTab === 'vendors' ? 'text-[#B99652]' : ''} />
            <span>Authorized Vendors ({vendors.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`py-2.5 px-1 border-b-2 font-bold text-xs sm:text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'stock'
                ? 'border-[#B99652] text-[#1e1b4b]'
                : 'border-transparent text-[#7a705a] hover:text-[#1e1b4b]'
            }`}
          >
            <Package size={16} className={activeTab === 'stock' ? 'text-[#B99652]' : ''} />
            <span>Vendor Stock Catalog ({vendorStock.length})</span>
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
            <Users2 className="text-[#B99652]" size={15} />
            <span>Vendors</span>
          </span>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-1">
            {stats.totalVendors}
          </p>
          <p className="text-[11px] text-[#7a705a] mt-0.5">Active partners</p>
        </div>

        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
            <Package className="text-[#B99652]" size={15} />
            <span>Total Orders</span>
          </span>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-1">
            {stats.totalOrders}
          </p>
          <p className="text-[11px] text-[#7a705a] mt-0.5">Fulfillment count</p>
        </div>

        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
            <Package className="text-[#B99652]" size={15} />
            <span>Total Volume</span>
          </span>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-emerald-800 mt-1">
            ₹{stats.totalValue.toLocaleString()}
          </p>
          <p className="text-[11px] text-[#7a705a] mt-0.5">Disbursed transactions</p>
        </div>

        <div className="bg-[#fffdf4]/50 border border-[#ebdcaa] rounded-none p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a705a] flex items-center gap-1.5">
            <Package className="text-[#B99652]" size={15} />
            <span>Stocked Units</span>
          </span>
          <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#92400e] mt-1">
            {stats.totalStockItems}
          </p>
          <p className="text-[11px] text-[#7a705a] mt-0.5">In storage</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#7a705a]" size={16} />
          <input
            type="text"
            placeholder={activeTab === 'vendors' ? 'Search vendors by name or category...' : 'Search vendor stock by item or vendor...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#fffdf4]/40 border border-[#ebdcaa] rounded-none text-xs sm:text-sm text-[#1e1b4b] placeholder-[#7a705a]/60 focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-none p-4 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[#7a705a] text-xs">
          <div className="animate-spin h-6 w-6 border-2 border-[#B99652] border-t-transparent mr-2 rounded-none" />
          <span>Loading vendor data...</span>
        </div>
      ) : (
        <>
          {activeTab === 'vendors' && (
            <div className="overflow-x-auto border border-[#ebdcaa]">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-[#665e4d] bg-[#fffdf4] border-b border-[#ebdcaa] font-bold">
                    <th className="py-3 px-4">Vendor Name</th>
                    <th className="px-4">Contact Email</th>
                    <th className="px-4">Phone</th>
                    <th className="px-4">Category</th>
                    <th className="px-4">Rating</th>
                    <th className="px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 bg-white">
                  {filteredVendors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[#7a705a]">
                        No registered vendors found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <tr key={vendor.id} className="hover:bg-[#fffdf4]/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-[#1e1b4b]">
                          {vendor.name}
                        </td>
                        <td className="px-4 text-[#665e4d]">
                          {vendor.email || '—'}
                        </td>
                        <td className="px-4 text-[#665e4d]">
                          {vendor.phone || '—'}
                        </td>
                        <td className="px-4">
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-none bg-[#fff8e7] text-[#92400e] border border-[#fde68a]">
                            {vendor.category || "Supplies"}
                          </span>
                        </td>
                        <td className="px-4">
                          <div className="flex items-center text-amber-500">
                            {[...Array(5)].map((_, i) => (
                              <span key={i} className={i < Math.round(vendor.rating || 4) ? 'text-amber-500' : 'text-gray-300'}>
                                ★
                              </span>
                            ))}
                            <span className="ml-1 text-[11px] font-bold text-[#7a705a]">({vendor.rating || 4.5})</span>
                          </div>
                        </td>
                        <td className="px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleViewVendor(vendor)}
                              className="p-1.5 border border-[#ebdcaa] rounded-none text-[#1e1b4b] bg-white hover:bg-[#fffdf4] transition-colors"
                              title="Open Vendor Details"
                            >
                              <ExternalLink size={13} className="text-[#B99652]" />
                            </button>
                            <button className="p-1.5 border border-[#ebdcaa] rounded-none text-[#1e1b4b] bg-white hover:bg-[#fffdf4] transition-colors" title="Edit Vendor">
                              <Edit2 size={13} />
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

          {activeTab === 'stock' && (
            <div className="overflow-x-auto border border-[#ebdcaa]">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-[#665e4d] bg-[#fffdf4] border-b border-[#ebdcaa] font-bold">
                    <th className="py-3 px-4">Item Name</th>
                    <th className="px-4">Supplier</th>
                    <th className="px-4">Quantity Available</th>
                    <th className="px-4">Unit Rate</th>
                    <th className="px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 bg-white">
                  {filteredVendorStock.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[#7a705a]">
                        No vendor stock items listed.
                      </td>
                    </tr>
                  ) : (
                    filteredVendorStock.map((stock, index) => (
                      <tr key={index} className="hover:bg-[#fffdf4]/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-[#1e1b4b]">
                          {stock.itemName}
                        </td>
                        <td className="px-4 text-[#665e4d]">
                          {stock.vendorName || '—'}
                        </td>
                        <td className="px-4 font-bold text-[#1e1b4b]">
                          {stock.quantity} units
                        </td>
                        <td className="px-4 font-bold text-emerald-800">
                          ₹{(stock.unitPrice || 0).toFixed(2)}
                        </td>
                        <td className="px-4">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-none ${
                            stock.quantity > 0
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {stock.quantity > 0 ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VendorManagementSimple;
