import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import {
  Package,
  Search,
  Filter,
  Eye,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  DollarSign,
  User
} from 'lucide-react';

const VendorOrders = () => {
  const { API, token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/vendor/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOrders(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.vendor?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'processing':
        return <Package size={16} className="text-blue-600" />;
      case 'shipped':
        return <Truck size={16} className="text-purple-600" />;
      case 'pending':
        return <Clock size={16} className="text-yellow-600" />;
      case 'cancelled':
        return <AlertCircle size={16} className="text-red-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'processing':
        return 'text-blue-600 bg-blue-50';
      case 'shipped':
        return 'text-purple-600 bg-purple-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'cancelled':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API}/vendor/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          fetchOrders(); // Refresh orders
          setShowDetails(false);
        }
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-600">Manage and track your orders</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <Package size={48} className="mx-auto mb-2 text-gray-300" />
                    <p>No orders found</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Package size={20} className="text-gray-400 mr-3" />
                        <div>
                          <p className="font-medium text-gray-900">#{order.id}</p>
                          <p className="text-sm text-gray-500">{order.vendor}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{order.item}</p>
                      {order.description && (
                        <p className="text-sm text-gray-500">{order.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">{order.qty}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {order.date ? new Date(order.date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(order.status)}
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDetails(true);
                          }}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      {showDetails && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Order Details</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Order ID</p>
                  <p className="font-semibold text-gray-900">#{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {getStatusIcon(selectedOrder.status)}
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Item</p>
                  <p className="font-semibold text-gray-900">{selectedOrder.item}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Quantity</p>
                  <p className="font-semibold text-gray-900">{selectedOrder.qty}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Order Date</p>
                  <p className="font-semibold text-gray-900">
                    {selectedOrder.date ? new Date(selectedOrder.date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">University</p>
                  <p className="font-semibold text-gray-900">
                    {selectedOrder.university_name || 'Main University'}
                  </p>
                </div>
              </div>
              
              {selectedOrder.description && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Description</p>
                  <p className="text-gray-900">{selectedOrder.description}</p>
                </div>
              )}
              
              {/* Status Update Actions */}
              <div>
                <p className="text-sm text-gray-500 mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(selectedOrder.id, 'processing')}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      Start Processing
                    </button>
                  )}
                  {selectedOrder.status === 'processing' && (
                    <button
                      onClick={() => updateOrderStatus(selectedOrder.id, 'shipped')}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm"
                    >
                      Mark as Shipped
                    </button>
                  )}
                  {selectedOrder.status === 'shipped' && (
                    <button
                      onClick={() => updateOrderStatus(selectedOrder.id, 'completed')}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm"
                    >
                      Mark as Completed
                    </button>
                  )}
                  {(selectedOrder.status === 'pending' || selectedOrder.status === 'processing') && (
                    <button
                      onClick={() => updateOrderStatus(selectedOrder.id, 'cancelled')}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorOrders;
