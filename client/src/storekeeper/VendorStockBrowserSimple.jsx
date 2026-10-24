import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import '../styles/stock-requests.css';
import { 
  Store, Search, Filter, ShoppingCart, Package, TrendingUp, 
  Eye, Plus, Star, Clock, CheckCircle, AlertTriangle, 
  DollarSign, Grid, List, Download, RefreshCw
} from 'lucide-react';

const VendorStockBrowserSimple = () => {
  const { API, token } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    inStock: false,
    lowStock: false
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    if (selectedVendor) {
      fetchVendorStock(selectedVendor.id);
    }
  }, [selectedVendor, filters]);

  const fetchVendors = async () => {
    try {
      const res = await fetch(`${API}/storekeeper/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendors(data.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
      setError('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const fetchVendorStock = async (vendorId) => {
    try {
      setLoading(true);
      
      const res = await fetch(`${API}/storekeeper/vendor/${vendorId}/stock`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          let items = data.data || [];
          
          // Apply filters
          if (filters.search) {
            items = items.filter(item => 
              item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
              item.category.toLowerCase().includes(filters.search.toLowerCase())
            );
          }
          
          if (filters.category) {
            items = items.filter(item => item.category === filters.category);
          }
          
          if (filters.inStock) {
            items = items.filter(item => item.quantity > 0);
          }
          
          if (filters.lowStock) {
            items = items.filter(item => item.quantity <= item.min_stock);
          }
          
          setStockItems(items);
        }
      }
    } catch (error) {
      console.error('Error fetching vendor stock:', error);
      setError('Failed to fetch vendor stock');
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (item) => {
    if (item.quantity === 0) return { status: 'out', color: 'red', icon: AlertTriangle, text: 'Out of Stock' };
    if (item.quantity <= item.min_stock) return { status: 'low', color: 'yellow', icon: AlertTriangle, text: 'Low Stock' };
    return { status: 'available', color: 'green', icon: CheckCircle, text: 'Available' };
  };

  const addToRequest = (item) => {
    alert('Add to request functionality will be available in the vendor stock browser');
  };

  if (error && !selectedVendor) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center py-8">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-500" />
          <p className="text-red-600 font-medium">{error}</p>
          <button 
            onClick={fetchVendors}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Stock Browser</h1>
          <p className="text-gray-600">Browse and compare vendor inventory</p>
        </div>
        <div className="flex space-x-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
            >
              <Grid size={20} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
            >
              <List size={20} />
            </button>
          </div>
          
          <button
            onClick={() => fetchVendorStock(selectedVendor?.id)}
            className="flex items-center space-x-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {!selectedVendor ? (
        /* Vendor Selection */
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Vendor</h2>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-8">
              <Store size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No vendors available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  onClick={() => setSelectedVendor(vendor)}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer hover:border-blue-300"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{vendor.name}</h3>
                    <div className="flex items-center space-x-1">
                      <Star size={16} className="text-yellow-500 fill-current" />
                      <span className="text-sm text-gray-600">{vendor.rating || '0.0'}</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">{vendor.category}</p>
                  
                  {vendor.email && (
                    <p className="text-xs text-gray-500 mb-1">{vendor.email}</p>
                  )}
                  
                  {vendor.phone && (
                    <p className="text-xs text-gray-500 mb-2">{vendor.phone}</p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{vendor.totalOrders || 0} orders</span>
                    <span>₹{(vendor.totalValue || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Vendor Header */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    setSelectedVendor(null);
                    setStockItems([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  ← Back
                </button>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedVendor.name}</h2>
                  <p className="text-gray-600">{selectedVendor.category}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                  >
                    <Grid size={20} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                  >
                    <List size={20} />
                  </button>
                </div>
                
                <button
                  onClick={() => fetchVendorStock(selectedVendor.id)}
                  className="flex items-center space-x-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <Filter size={20} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Search size={16} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={filters.inStock}
                  onChange={(e) => setFilters(prev => ({ ...prev, inStock: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">In Stock Only</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={filters.lowStock}
                  onChange={(e) => setFilters(prev => ({ ...prev, lowStock: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Low Stock</span>
              </label>
            </div>
          </div>

          {/* Stock Items */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              </div>
            ) : stockItems.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center py-8">
                  <Package size={48} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">No stock items found</p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
                {stockItems.map((item) => {
                  const stockStatus = getStockStatus(item);
                  const StatusIcon = stockStatus.icon;
                  
                  return (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 text-sm">{item.name}</h3>
                        <div className="flex items-center space-x-1">
                          <StatusIcon size={14} className={`text-${stockStatus.color}-600`} />
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500 mb-3">{item.category}</p>
                      
                      <div className="space-y-2 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Stock:</span>
                          <span className={`text-sm font-medium ${
                            stockStatus.status === 'out' ? 'text-red-600' :
                            stockStatus.status === 'low' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {item.quantity}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Min Stock:</span>
                          <span className="text-sm text-gray-600">{item.min_stock}</span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Price:</span>
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{item.unit_price?.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                      </div>
                      
                      {item.description && (
                        <p className="text-xs text-gray-600 mb-3 line-clamp-2">{item.description}</p>
                      )}
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => addToRequest(item)}
                          disabled={item.quantity === 0}
                          className={`flex-1 flex items-center justify-center space-x-1 px-2 py-1 rounded text-xs ${
                            item.quantity === 0
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          <ShoppingCart size={12} />
                          <span>Add to Request</span>
                        </button>
                        
                        <button
                          className="p-1 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stockItems.map((item) => {
                      const stockStatus = getStockStatus(item);
                      const StatusIcon = stockStatus.icon;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{item.name}</p>
                              <p className="text-sm text-gray-500">{item.category}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.category}</td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-medium ${
                              stockStatus.status === 'out' ? 'text-red-600' :
                              stockStatus.status === 'low' ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>
                              {item.quantity}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.min_stock}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                            ₹{item.unit_price?.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2">
                              <StatusIcon size={16} className={`text-${stockStatus.color}-600`} />
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                stockStatus.status === 'out' ? 'text-red-600 bg-red-50' :
                                stockStatus.status === 'low' ? 'text-yellow-600 bg-yellow-50' :
                                'text-green-600 bg-green-50'
                              }`}>
                                {stockStatus.text}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => addToRequest(item)}
                                disabled={item.quantity === 0}
                                className={`flex items-center space-x-1 px-3 py-1 rounded text-xs ${
                                  item.quantity === 0
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                <ShoppingCart size={12} />
                                <span>Add</span>
                              </button>
                              <button
                                className="p-1 border border-gray-300 rounded hover:bg-gray-50"
                              >
                                <Eye size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default VendorStockBrowserSimple;
