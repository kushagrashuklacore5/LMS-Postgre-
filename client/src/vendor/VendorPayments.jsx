import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

const VendorPayments = () => {
  const { API, token } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingPayments: 0,
    paidPayments: 0,
    thisMonthRevenue: 0
  });

  useEffect(() => {
    fetchPayments();
    fetchPaymentStats();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/vendor/payments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPayments(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentStats = async () => {
    try {
      const res = await fetch(`${API}/vendor/payment-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching payment stats:', error);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const paymentDate = new Date(payment.paidDate || payment.dueDate);
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      switch (dateFilter) {
        case 'this-month':
          matchesDate = paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
          break;
        case 'last-month':
          const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
          const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
          matchesDate = paymentDate.getMonth() === lastMonth && paymentDate.getFullYear() === lastMonthYear;
          break;
        case 'this-year':
          matchesDate = paymentDate.getFullYear() === currentYear;
          break;
        default:
          matchesDate = true;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'pending':
        return <Clock size={16} className="text-yellow-600" />;
      case 'overdue':
        return <AlertCircle size={16} className="text-red-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'overdue':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const StatCard = ({ title, value, icon, change, changeType, color }) => (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${color}`}>
          {icon}
        </div>
        {change && (
          <div className={`flex items-center text-sm ${
            changeType === 'positive' ? 'text-green-600' : 'text-red-600'
          }`}>
            {changeType === 'positive' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            {change}
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600">{title}</p>
      </div>
    </div>
  );

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
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600">Track your earnings and payment history</p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
          <Download size={20} />
          <span>Export Report</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}
          icon={<DollarSign size={24} className="text-green-600" />}
          color="bg-green-100"
          change="+15%"
          changeType="positive"
        />
        <StatCard
          title="This Month"
          value={`₹${stats.thisMonthRevenue.toLocaleString('en-IN')}`}
          icon={<Calendar size={24} className="text-blue-600" />}
          color="bg-blue-100"
          change="+8%"
          changeType="positive"
        />
        <StatCard
          title="Paid Payments"
          value={stats.paidPayments}
          icon={<CheckCircle size={24} className="text-purple-600" />}
          color="bg-purple-100"
          change="+12"
          changeType="positive"
        />
        <StatCard
          title="Pending"
          value={stats.pendingPayments}
          icon={<Clock size={24} className="text-yellow-600" />}
          color="bg-yellow-100"
          change="-3"
          changeType="negative"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search payments..."
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
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Time</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="this-year">This Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <DollarSign size={48} className="mx-auto mb-2 text-gray-300" />
                    <p>No payments found</p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <DollarSign size={20} className="text-gray-400 mr-3" />
                        <div>
                          <p className="font-medium text-gray-900">{payment.invoiceNumber}</p>
                          <p className="text-sm text-gray-500">{payment.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {payment.paidDate ? new Date(payment.paidDate).toLocaleDateString() : 
                       payment.dueDate ? new Date(payment.dueDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(payment.status)}
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {payment.dueDate ? new Date(payment.dueDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowDetails(true);
                          }}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-600 hover:text-gray-800"
                          title="Download Receipt"
                        >
                          <Download size={16} />
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

      {/* Payment Details Modal */}
      {showDetails && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
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
                  <p className="text-sm text-gray-500">Invoice Number</p>
                  <p className="font-semibold text-gray-900">{selectedPayment.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {getStatusIcon(selectedPayment.status)}
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(selectedPayment.status)}`}>
                      {selectedPayment.status}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-semibold text-gray-900">₹{selectedPayment.amount.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="font-semibold text-gray-900">{selectedPayment.paymentMethod || 'Bank Transfer'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="font-semibold text-gray-900">
                    {selectedPayment.dueDate ? new Date(selectedPayment.dueDate).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Paid Date</p>
                  <p className="font-semibold text-gray-900">
                    {selectedPayment.paidDate ? new Date(selectedPayment.paidDate).toLocaleDateString() : 'Not paid'}
                  </p>
                </div>
              </div>
              
              {selectedPayment.description && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Description</p>
                  <p className="text-gray-900">{selectedPayment.description}</p>
                </div>
              )}
              
              {selectedPayment.transactionId && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Transaction Details</p>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm"><span className="font-medium">Transaction ID:</span> {selectedPayment.transactionId}</p>
                    {selectedPayment.paymentMethod && (
                      <p className="text-sm mt-1"><span className="font-medium">Method:</span> {selectedPayment.paymentMethod}</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Download Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPayments;
