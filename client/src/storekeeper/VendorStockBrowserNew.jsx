import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import '../styles/stock-requests.css';
import { 
  Store, Search, Filter, ShoppingCart, Package, TrendingUp, 
  Eye, Plus, Star, Clock, CheckCircle, AlertTriangle, 
  DollarSign, Grid, List, Download, RefreshCw
} from 'lucide-react';

const VendorStockBrowser = () => {
  const { API, token } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    inStock: false,
    lowStock: false
  });
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareItems, setCompareItems] = useState([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    fetchVendors();
    
    // Listen for real-time stock updates from vendors
    const handleVendorStockUpdate = (event) => {
      console.log('Received vendor stock update event:', event.detail);
      
      if (event.detail.vendorId === selectedVendor?.id) {
        console.log('Refreshing stock for current vendor');
        fetchVendorStock(selectedVendor.id);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('vendorStockUpdated', handleVendorStockUpdate);
    }
    
    return () => {
      window.removeEventListener('vendorStockUpdated', handleVendorStockUpdate);
    };
  }, [selectedVendor, filters]);

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
      
      // Fetch vendor stock and categories in parallel
      const [stockRes, categoriesRes] = await Promise.all([
        fetch(`${API}/storekeeper/vendor/${vendorId}/stock`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/storekeeper/vendor/${vendorId}/categories`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (stockRes.ok) {
        const data = await stockRes.json();
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

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        if (categoriesData.success) {
          setCategories(categoriesData.data || []);
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
    if (item.quantity === 0) return { status: 'out', color: 'red', icon: XCircle, text: 'Out of Stock' };
    if (item.quantity <= item.min_stock) return { status: 'low', color: 'yellow', icon: AlertTriangle, text: 'Low Stock' };
    return { status: 'available', color: 'green', icon: CheckCircle, text: 'Available' };
  };

  const addToCompare = (item) => {
    if (!compareItems.find(i => i.id === item.id)) {
      setCompareItems(prev => [...prev, item]);
    }
  };

  const removeFromCompare = (itemId) => {
    setCompareItems(prev => prev.filter(item => item.id !== itemId));
  };

  const addToRequest = (item) => {
    if (!selectedItems.find(i => i.id === item.id)) {
      setSelectedItems(prev => [...prev, { ...item, requestQuantity: 1 }]);
    }
  };

  const updateRequestQuantity = (itemId, quantity) => {
    setSelectedItems(prev => 
      prev.map(item => 
        item.id === itemId ? { ...item, requestQuantity: quantity } : item
      )
    );
  };

  const removeFromRequest = (itemId) => {
    setSelectedItems(prev => prev.filter(item => item.id !== itemId));
  };

  const getCategories = () => {
    const categories = [...new Set(stockItems.map(item => item.category))];
    return categories.filter(Boolean);
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
          {compareItems.length > 0 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Eye size={20} />
              <span>Compare ({compareItems.length})</span>
            </button>
          )}
          {selectedItems.length > 0 && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <ShoppingCart size={20} />
              <span>Request ({selectedItems.length})</span>
            </button>
          )}
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
          /* Vendor Header */
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
                          onClick={() => addToCompare(item)}
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
                              {item.description && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{item.description}</p>
                              )}
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
                                onClick={() => addToCompare(item)}
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

      {/* Compare Modal */}
      {showCompareModal && (
        <CompareModal
          items={compareItems}
          onClose={() => setShowCompareModal(false)}
          onRemove={removeFromCompare}
        />
      )}

      {/* Request Modal */}
      {showRequestModal && (
        <RequestModal
          items={selectedItems}
          vendor={selectedVendor}
          onClose={() => setShowRequestModal(false)}
          onUpdateQuantity={updateRequestQuantity}
          onRemove={removeFromRequest}
          onSuccess={() => {
            setShowRequestModal(false);
            setSelectedItems([]);
          }}
        />
      )}
    </div>
  );
};

// Compare Modal Component
const CompareModal = ({ items, onClose, onRemove }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Compare Items ({items.length})</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <XCircle size={20} />
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.category}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    ₹{item.unit_price?.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="max-w-xs line-clamp-2">{item.description || 'N/A'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onRemove(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Request Modal Component
const RequestModal = ({ items, vendor, onClose, onUpdateQuantity, onRemove, onSuccess }) => {
  const { API, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: `Request from ${vendor.name}`,
    description: '',
    urgency_level: 'normal',
    expected_delivery_date: '',
    delivery_address: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    department: '',
    budget_code: '',
    requested_by: ''
  });

  const totalAmount = items.reduce((sum, item) => sum + (item.unit_price * item.requestQuantity), 0);

  const handleSubmit = async () => {
    setLoading(true);
    
    try {
      const requestData = {
        ...formData,
        items: items.map(item => ({
          item_name: item.name,
          category: item.category,
          quantity_requested: item.requestQuantity,
          unit_price: item.unit_price,
          vendor_id: vendor.id
        }))
      };

      const res = await fetch(`${API}/stock-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          onSuccess();
        }
      }
    } catch (error) {
      console.error('Error creating request:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Create Stock Request</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <XCircle size={20} />
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Request Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., IT Department"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date *</label>
                <input
                  type="date"
                  value={formData.expected_delivery_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Urgency Level</label>
                <select
                  value={formData.urgency_level}
                  onChange={(e) => setFormData(prev => ({ ...prev, urgency_level: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address *</label>
              <textarea
                value={formData.delivery_address}
                onChange={(e) => setFormData(prev => ({ ...prev, delivery_address: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter complete delivery address"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person *</label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Name of contact person"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone *</label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Phone number"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Email address"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Budget Code</label>
                <input
                  type="text"
                  value={formData.budget_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, budget_code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Budget reference code"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Requested By</label>
                <input
                  type="text"
                  value={formData.requested_by}
                  onChange={(e) => setFormData(prev => ({ ...prev, requested_by: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Person making request"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Request Items</h3>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-500">{item.category}</p>
                      <p className="text-sm font-semibold text-gray-900">
                        ₹{item.unit_price?.toLocaleString('en-IN')} × {item.requestQuantity} = 
                        ₹{(item.unit_price * item.requestQuantity).toLocaleString('en-IN')}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <label className="text-sm text-gray-600">Qty:</label>
                        <input
                          type="number"
                          min="1"
                          max={item.quantity}
                          value={item.requestQuantity}
                          onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      
                      <button
                        onClick={() => onRemove(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-900">Total Amount:</span>
                <span className="text-xl font-bold text-gray-900">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Send size={16} />
              )}
              <span>Submit Request</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorStockBrowser;
