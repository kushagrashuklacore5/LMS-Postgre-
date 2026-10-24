import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { ShoppingCart, Plus, Package, Clock, CheckCircle, XCircle, AlertTriangle, TrendingUp, Send, Store } from 'lucide-react';

const StockRequest = () => {
  const { API, token } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [requests, setRequests] = useState([]);
  const [vendorStock, setVendorStock] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    vendorId: '',
    itemName: '',
    category: 'Electronics',
    quantity: 1,
    unitPrice: 0,
    urgencyLevel: 'normal',
    description: ''
  });

  useEffect(() => {
    console.log('StockRequest component mounted');
    console.log('Current API:', API);
    console.log('Current token:', token);
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      console.log('Fetching data...');
      
      const vendorsRes = await fetch(`${API}/storekeeper/vendors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Vendors response:', vendorsRes.status);
      
      if (vendorsRes.ok) {
        const vendorsData = await vendorsRes.json();
        console.log('Vendors data:', vendorsData);
        if (vendorsData.success) {
          setVendors(vendorsData.data || []);
        }
      }

      const requestsRes = await fetch(`${API}/storekeeper/stock-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Requests response:', requestsRes.status);
      
      if (requestsRes.ok) {
        const requestsData = await requestsRes.json();
        console.log('Requests data:', requestsData);
        if (requestsData.success) {
          setRequests(requestsData.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data');
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
          setVendorStock(data.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching vendor stock:', error);
      setError('Failed to fetch vendor stock');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/storekeeper/stock-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await fetchData();
          setShowRequestModal(false);
          resetForm();
          alert('Stock request sent successfully!');
        }
      }
    } catch (error) {
      console.error('Error sending request:', error);
    }
  };

  const handleSubmitDirectRequest = async (item) => {
    try {
      const requestData = {
        vendorId: selectedVendor,
        itemName: item.name,
        category: item.category,
        quantity: 1,
        unitPrice: item.unit_price,
        urgencyLevel: 'normal',
        description: `Direct request for ${item.name} from vendor stock`
      };
      
      const res = await fetch(`${API}/storekeeper/direct-stock-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });

      if (res.ok) {
        await fetchData();
        alert('Stock request sent successfully!');
      }
    } catch (error) {
      console.error('Error sending direct request:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      vendorId: '',
      itemName: '',
      category: 'Electronics',
      quantity: 1,
      unitPrice: 0,
      urgencyLevel: 'normal',
      description: ''
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <Clock size={16} className="text-yellow-600" />;
      case 'accepted': return <CheckCircle size={16} className="text-green-600" />;
      case 'denied': return <XCircle size={16} className="text-red-600" />;
      default: return <AlertTriangle size={16} className="text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'accepted': return 'text-green-600 bg-green-50';
      case 'denied': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center py-8">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-500" />
          <p className="text-red-600 font-medium">{error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Management</h1>
          <p className="text-gray-600">Request materials or browse vendor inventory</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowStockModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Store size={20} />
            <span>Browse Vendor Stock</span>
          </button>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>New Request</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-blue-100">
              <ShoppingCart size={24} className="text-blue-600" />
            </div>
            <TrendingUp size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
            <p className="text-sm text-gray-600">Total Requests</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-yellow-100">
              <Clock size={24} className="text-yellow-600" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {requests.filter(r => r.status === 'pending').length}
            </p>
            <p className="text-sm text-gray-600">Pending</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-green-100">
              <CheckCircle size={24} className="text-green-600" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {requests.filter(r => r.status === 'accepted').length}
            </p>
            <p className="text-sm text-gray-600">Accepted</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-red-100">
              <XCircle size={24} className="text-red-600" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {requests.filter(r => r.status === 'denied').length}
            </p>
            <p className="text-sm text-gray-600">Denied</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity & Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <ShoppingCart size={48} className="mx-auto mb-2 text-gray-300" />
                    <p>No stock requests found</p>
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-medium text-gray-900">{request.item_name}</p>
                        <p className="text-sm text-gray-500">{request.category}</p>
                        {request.description && (
                          <p className="text-xs text-gray-400 mt-1">{request.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {request.vendor_name || 'Unknown Vendor'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">{request.quantity_requested}</p>
                      <p className="text-sm text-gray-500">₹{request.unit_price?.toLocaleString('en-IN') || 'N/A'}</p>
                      <p className="text-xs text-gray-400">
                        Total: ₹{(request.quantity_requested * (request.unit_price || 0)).toLocaleString('en-IN')}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(request.status)}
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(request.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showStockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Browse Vendor Stock</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Vendor</label>
                <select
                  value={selectedVendor}
                  onChange={(e) => {
                    setSelectedVendor(e.target.value);
                    if (e.target.value) {
                      fetchVendorStock(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="">Select a vendor to browse their stock</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </div>

              {selectedVendor && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Stock Items - {vendors.find(v => v.id === selectedVendor)?.name}
                  </h3>
                  
                  {vendorStock.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Package size={48} className="mx-auto mb-2 text-gray-300" />
                      <p>No stock items found for this vendor</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {vendorStock.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <p className="font-medium text-gray-900">{item.name}</p>
                                  <p className="text-sm text-gray-500">{item.category}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <p className="font-semibold text-gray-900">{item.quantity}</p>
                                <p className="text-xs text-gray-500">Min: {item.min_stock}</p>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                ₹{item.unit_price?.toLocaleString('en-IN') || 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setFormData({
                                        vendorId: selectedVendor,
                                        itemName: item.name,
                                        category: item.category,
                                        quantity: 1,
                                        unitPrice: item.unit_price,
                                        urgencyLevel: 'normal',
                                        description: `Requesting ${item.name} from vendor stock`
                                      });
                                      setShowStockModal(false);
                                      setShowRequestModal(true);
                                    }}
                                    className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                  >
                                    <ShoppingCart size={16} />
                                    <span>Request</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleSubmitDirectRequest(item);
                                    }}
                                    className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                  >
                                    <Send size={16} />
                                    <span>Raise Request</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowStockModal(false);
                  setSelectedVendor('');
                  setVendorStock([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-6">New Stock Request</h2>
            
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <select
                    required
                    value={formData.vendorId}
                    onChange={(e) => setFormData({...formData, vendorId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                  <input
                    type="text"
                    required
                    value={formData.itemName}
                    onChange={(e) => setFormData({...formData, itemName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Stationery">Stationery</option>
                    <option value="Books">Books</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({...formData, unitPrice: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Urgency Level</label>
                  <select
                    required
                    value={formData.urgencyLevel}
                    onChange={(e) => setFormData({...formData, urgencyLevel: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  placeholder="Describe your requirements..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRequestModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Send size={16} />
                  <span>Send Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockRequest;
