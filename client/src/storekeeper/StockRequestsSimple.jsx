import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import '../styles/stock-requests.css';
import { 
  ShoppingCart, Plus, Filter, Search, FileText, Clock, CheckCircle, 
  XCircle, AlertTriangle, TrendingUp, Send, Store, Package, Eye,
  Edit, Trash2, Download, Calendar, DollarSign, User, Tag
} from 'lucide-react';

const StockRequestsSimple = () => {
  const { API, token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    delivered: 0,
    totalValue: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState({
    status: '',
    urgency: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });

  useEffect(() => {
    fetchDashboardStats();
    fetchRequests();
  }, [filters, pagination.page]);

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API}/stock-requests/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats(data.data.stats);
          setRecentActivity(data.data.recent);
        }
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        ...filters,
        page: pagination.page,
        limit: pagination.limit
      });
      
      const res = await fetch(`${API}/stock-requests?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRequests(data.data);
          setPagination(prev => ({
            ...prev,
            total: data.pagination.total,
            pages: data.pagination.pages
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
      setError('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'draft': return <FileText size={16} className="text-gray-600" />;
      case 'pending': return <Clock size={16} className="text-yellow-600" />;
      case 'approved': return <CheckCircle size={16} className="text-green-600" />;
      case 'rejected': return <XCircle size={16} className="text-red-600" />;
      case 'delivered': return <Package size={16} className="text-blue-600" />;
      default: return <AlertTriangle size={16} className="text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'text-gray-600 bg-gray-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'delivered': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'low': return 'text-blue-600 bg-blue-50';
      case 'normal': return 'text-green-600 bg-green-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'critical': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, page }));
  };

  const viewRequestDetails = async (requestId) => {
    try {
      const res = await fetch(`${API}/stock-requests/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSelectedRequest(data.data);
          setShowDetailsModal(true);
        }
      }
    } catch (error) {
      console.error('Error fetching request details:', error);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center py-8">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-500" />
          <p className="text-red-600 font-medium">{error}</p>
          <button 
            onClick={fetchRequests}
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
          <h1 className="text-2xl font-bold text-gray-900">Stock Requests</h1>
          <p className="text-gray-600">Manage and track stock requests</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-blue-100">
              <ShoppingCart size={24} className="text-blue-600" />
            </div>
            <TrendingUp size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
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
            <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
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
            <p className="text-2xl font-bold text-gray-900">{stats.approved}</p>
            <p className="text-sm text-gray-600">Approved</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-purple-100">
              <DollarSign size={24} className="text-purple-600" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">₹{stats.totalValue.toLocaleString('en-IN')}</p>
            <p className="text-sm text-gray-600">Total Value</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Filter size={20} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search requests..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="delivered">Delivered</option>
          </select>
          
          <select
            value={filters.urgency}
            onChange={(e) => handleFilterChange('urgency', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Urgency</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center py-8">
              <ShoppingCart size={48} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Stock Requests</h3>
              <p className="text-gray-500">No stock requests found</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Urgency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-medium text-gray-900">{request.request_number}</p>
                        <p className="text-sm text-gray-500">{request.title}</p>
                        <p className="text-xs text-gray-400">by {request.storekeeper_name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {request.item_count} items
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">₹{request.total_amount?.toLocaleString('en-IN') || '0'}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(request.status)}
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getUrgencyColor(request.urgency_level)}`}>
                        {request.urgency_level}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(request.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => viewRequestDetails(request.id)}
                          className="p-1 text-blue-600 hover:text-blue-800"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <div className="text-sm text-gray-700">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50"
              >
                Previous
              </button>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-1 rounded-md ${
                    page === pagination.page
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
                className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Request Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Request Details</h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Request Header */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Request Number</p>
                    <p className="font-semibold text-gray-900">{selectedRequest.request_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedRequest.status)}
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(selectedRequest.status)}`}>
                        {selectedRequest.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="font-semibold text-gray-900">₹{selectedRequest.total_amount?.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="font-semibold text-gray-900">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              
              {/* Request Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Request Information</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-gray-500">Title</p>
                    <p className="font-medium text-gray-900">{selectedRequest.title}</p>
                  </div>
                  {selectedRequest.description && (
                    <div>
                      <p className="text-sm text-gray-500">Description</p>
                      <p className="text-gray-900">{selectedRequest.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Urgency Level</p>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getUrgencyColor(selectedRequest.urgency_level)}`}>
                        {selectedRequest.urgency_level}
                      </span>
                    </div>
                    {selectedRequest.expected_delivery_date && (
                      <div>
                        <p className="text-sm text-gray-500">Expected Delivery</p>
                        <p className="font-medium text-gray-900">{selectedRequest.expected_delivery_date}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Items */}
              {selectedRequest.items && selectedRequest.items.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Items ({selectedRequest.items.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Unit Price</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedRequest.items.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2">
                              <p className="font-medium text-gray-900">{item.item_name}</p>
                              {item.vendor_name && (
                                <p className="text-xs text-gray-500">Vendor: {item.vendor_name}</p>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">{item.category}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{item.quantity_requested}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">₹{item.unit_price?.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2 text-sm font-semibold text-gray-900">₹{item.total_price?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Request Modal - Simplified */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Stock Request</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              // TODO: Implement request creation
              alert('Request creation functionality will be implemented');
              setShowCreateModal(false);
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter request title"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter request description"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Urgency Level</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockRequestsSimple;
