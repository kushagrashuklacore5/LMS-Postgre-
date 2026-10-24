import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  DollarSign
} from 'lucide-react';

const VendorInvoices = () => {
  const { API, token } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/vendor/invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setInvoices(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-violet-500 border-t-transparent"></div>
          <p className="mt-4 text-violet-600 font-medium">Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="text-violet-600" size={28} />
            Invoices
          </h1>
          <p className="text-gray-600">Manage your invoices and payments</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg"
        >
          <Plus size={20} />
          Create Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-violet-100">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-violet-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-violet-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-violet-200">
                <th className="px-6 py-4 text-left text-violet-700 font-semibold">Invoice</th>
                <th className="px-6 py-4 text-left text-violet-700 font-semibold">Client</th>
                <th className="px-6 py-4 text-left text-violet-700 font-semibold">Amount</th>
                <th className="px-6 py-4 text-left text-violet-700 font-semibold">Due Date</th>
                <th className="px-6 py-4 text-left text-violet-700 font-semibold">Status</th>
                <th className="px-6 py-4 text-left text-violet-700 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <FileText size={48} className="mx-auto mb-2 text-gray-300" />
                    <p>No invoices found</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FileText size={20} className="text-gray-400 mr-3" />
                        <div>
                          <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                          <p className="text-sm text-gray-500">{invoice.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">₹{invoice.amount.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(invoice.status)}
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowDetails(true);
                          }}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="p-1 text-gray-600 hover:text-gray-800"
                          title="Download"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          className="p-1 text-green-600 hover:text-green-800"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="p-1 text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 size={16} />
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

      {/* Invoice Details Modal */}
      {showDetails && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Invoice Details</h2>
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
                  <p className="font-semibold text-gray-900">{selectedInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {getStatusIcon(selectedInvoice.status)}
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(selectedInvoice.status)}`}>
                      {selectedInvoice.status}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Issue Date</p>
                  <p className="font-semibold text-gray-900">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="font-semibold text-gray-900">
                    {selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-semibold text-gray-900">₹{selectedInvoice.amount.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Paid Date</p>
                  <p className="font-semibold text-gray-900">
                    {selectedInvoice.paidDate ? new Date(selectedInvoice.paidDate).toLocaleDateString() : 'Not paid'}
                  </p>
                </div>
              </div>
              
              {selectedInvoice.description && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Description</p>
                  <p className="text-gray-900">{selectedInvoice.description}</p>
                </div>
              )}
              
              {selectedInvoice.items && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Items</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedInvoice.items.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{item.quantity}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">₹{item.price.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              ₹{(item.quantity * item.price).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-3">
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Close
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create New Invoice</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="INV-2026-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Enter invoice description..."
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorInvoices;
