import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/auth';
import { 
  ShoppingCart, CheckCircle, XCircle, Clock, FileText, 
  DollarSign, Calendar, User, MapPin, Phone, Mail,
  Package, AlertTriangle, X, Download, Send, RefreshCw, 
  TrendingUp, PackageOpen
} from 'lucide-react';

const VendorRequests = () => {
  const { API, token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billData, setBillData] = useState({
    bill_number: '',
    due_date: '',
    items: [],
    subtotal: 0,
    tax_rate: 5, // Default tax rate in percentage
    gst_rate: 18, // Default GST rate in percentage
    tax: 0,
    gst: 0,
    total: 0,
    notes: '',
    payment_terms: '',
    delivery_terms: ''
  });
  const [quoteData, setQuoteData] = useState({
    items: [],
    subtotal: 0,
    tax: 0,
    gst: 18,
    total: 0,
    notes: ''
  });
  const [stockUpdates, setStockUpdates] = useState([]);
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);

  // Fetch vendor requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!token) {
        console.error('No authentication token available');
        setRequests([]);
        return;
      }

      const response = await fetch(`${API}/vendor/requests`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Failed to parse response data');
      }
      
      if (data.success) {
        setRequests(data.data || []);
        console.log(`✅ Fetched ${data.data?.length || 0} vendor requests`);
      } else {
        throw new Error(data.message || 'Failed to fetch requests');
      }
    } catch (err) {
      console.error('Error fetching vendor requests:', err);
      setError(err.message || 'Failed to fetch requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [API, token]);

  // Initialize and set up polling
  useEffect(() => {
    fetchRequests();
    
    // Set up polling for real-time updates
    const interval = setInterval(() => {
      if (token) {
        fetchRequests();
      }
    }, 30000); // Poll every 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchRequests, token]);

  // Handle accept request
  const handleAcceptRequest = async (request) => {
    if (!confirm(`Are you sure you want to accept this request?\n\nThis will update your stock quantities and notify the storekeeper.`)) {
      return;
    }

    try {
      setLoading(true);
      
      console.log('🔄 Accepting request:', request.id);
      
      const response = await fetch(`${API}/vendor/requests/${request.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'accept',
          note: 'Request accepted by vendor - stock quantities updated'
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to accept request';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          errorMessage = `Failed to accept request (${response.status} ${response.statusText})`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Failed to parse response data');
      }
      
      if (data.success) {
        alert(`Request approved successfully!\n\n✅ Stock quantities updated\n✅ Request ID: ${request.id}`);
        
        // Show stock updates if any
        if (data.data?.stockUpdates && data.data.stockUpdates.length > 0) {
          setStockUpdates(data.data.stockUpdates);
          setShowStockUpdateModal(true);
        }
        
        // Open bill modal if requested
        if (data.data?.openBillModal && data.data?.billData) {
          setSelectedRequest(request);
          
          // Initialize bill data
          const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const billNumber = `BILL-${Date.now()}`;
          
          // Prepare items for bill
          const billItems = data.data.billData.items.map(item => ({
            item_name: item.item_name,
            category: item.category,
            quantity: item.quantity_requested,
            unit_price: item.unit_price,
            total: item.unit_price * item.quantity_requested
          }));
          
          // Calculate totals
          const subtotal = billItems.reduce((sum, item) => sum + item.total, 0);
          const tax = subtotal * (billData.tax_rate / 100);
          const gst = subtotal * (billData.gst_rate / 100);
          const total = subtotal + tax + gst || 0; // Ensure total is never null
          
          setBillData({
            bill_number: billNumber,
            due_date: dueDate,
            items: billItems,
            subtotal,
            tax_rate: billData.tax_rate,
            gst_rate: billData.gst_rate,
            tax,
            gst,
            total,
            notes: `Bill for request #${data.data.billData.requestNumber}`,
            payment_terms: 'Net 30',
            delivery_terms: 'Standard Delivery'
          });
          
          setShowBillModal(true);
        }
        
        // Refresh requests to show updated status
        fetchRequests();
      } else {
        throw new Error(data.message || 'Accept failed');
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      alert(`Error accepting request: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle reject request
  const handleRejectRequest = async (requestId, requestTitle) => {
    if (!confirm(`Are you sure you want to reject this request?\n\n${requestTitle}`)) {
      return;
    }

    try {
      setLoading(true);
      
      console.log('❌ Rejecting request:', requestId);
      
      const response = await fetch(`${API}/vendor/requests/${requestId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'reject',
          note: 'Request rejected by vendor'
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to reject request';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          errorMessage = `Failed to reject request (${response.status} ${response.statusText})`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Failed to parse response data');
      }
      
      if (data.success) {
        alert(`Request rejected successfully\n\nRequest ID: ${requestId}`);
        
        // Refresh requests to show updated status
        fetchRequests();
      } else {
        throw new Error(data.message || 'Reject failed');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert(`Error rejecting request: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Update bill item
  const handleBillItemChange = (index, field, value) => {
    const newItems = [...billData.items];
    
    if (field === 'unit_price') {
      newItems[index].unit_price = value;
      newItems[index].total = value * newItems[index].quantity;
    } else if (field === 'quantity') {
      newItems[index].quantity = value;
      newItems[index].total = value * newItems[index].unit_price;
    }
    
    // Recalculate totals
    const subtotal = newItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const tax = subtotal * (billData.tax_rate / 100);
    const gst = subtotal * (billData.gst_rate / 100);
    const total = subtotal + tax + gst || 0;
    
    setBillData({
      ...billData,
      items: newItems,
      subtotal,
      tax,
      gst,
      total
    });
  };

  const handleTaxRateChange = (field, value) => {
    const newTaxRate = field === 'tax_rate' ? parseFloat(value) || 0 : billData.tax_rate;
    const newGstRate = field === 'gst_rate' ? parseFloat(value) || 0 : billData.gst_rate;
    
    // Recalculate totals with new tax rates
    const subtotal = billData.subtotal;
    const tax = subtotal * (newTaxRate / 100);
    const gst = subtotal * (newGstRate / 100);
    const total = subtotal + tax + gst || 0;
    
    setBillData({
      ...billData,
      [field]: parseFloat(value) || 0,
      tax,
      gst,
      total
    });
  };

  // Send bill
  const sendBill = async () => {
    if (!selectedRequest) return;
    
    try {
      setLoading(true);
      
      const response = await fetch(`${API}/vendor/requests/${selectedRequest.id}/bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...billData,
          vendor_id: selectedRequest.vendor_id || 0
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to send bill';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          errorMessage = `Failed to send bill (${response.status} ${response.statusText})`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Failed to parse response data');
      }
      
      if (data.success) {
        setShowBillModal(false);
        alert('Bill sent successfully to storekeeper and accountant!');
        
        // Refresh requests to show updated status
        fetchRequests();
      } else {
        throw new Error(data.message || 'Bill sending failed');
      }
    } catch (error) {
      console.error('Error sending bill:', error);
      alert(`Error sending bill: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Submit quote
  const submitQuote = async () => {
    if (!selectedRequest) return;
    
    try {
      setLoading(true);
      
      const response = await fetch(`${API}/vendor/requests/${selectedRequest.id}/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: quoteData.items,
          subtotal: quoteData.subtotal,
          tax: quoteData.tax,
          gst: quoteData.gst,
          total: quoteData.total,
          notes: quoteData.notes
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to submit quote';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (jsonError) {
          errorMessage = `Failed to submit quote (${response.status} ${response.statusText})`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Failed to parse response data');
      }
      
      if (data.success) {
        setShowQuoteModal(false);
        setShowBillModal(true);
        alert('Quote submitted successfully!');
      } else {
        throw new Error(data.message || 'Quote submission failed');
      }
    } catch (error) {
      console.error('Error submitting quote:', error);
      alert(`Error submitting quote: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'text-gray-600 bg-gray-50';
      case 'submitted': return 'text-blue-600 bg-blue-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'quoted': return 'text-purple-600 bg-purple-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'draft': return FileText;
      case 'submitted': return Clock;
      case 'pending': return Clock;
      case 'quoted': return FileText;
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      default: return AlertTriangle;
    }
  };

  // Get urgency color
  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'critical': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
        <span className="ml-3 text-gray-600">Loading requests...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 mb-2">Error Loading Requests</h3>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={fetchRequests}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
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
          <p className="text-gray-600">Review and respond to stock requests from storekeepers</p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
            </div>
            <ShoppingCart className="text-blue-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Pending</p>
              <p className="text-2xl font-bold text-gray-900">
                {requests.filter(r => r.status === 'pending').length}
              </p>
            </div>
            <Clock className="text-yellow-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Approved</p>
              <p className="text-2xl font-bold text-gray-900">
                {requests.filter(r => r.status === 'approved').length}
              </p>
            </div>
            <CheckCircle className="text-green-500" size={32} />
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {requests.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Requests</h3>
            <p className="text-gray-500">No stock requests available at the moment</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {requests.map((request) => {
              const StatusIcon = getStatusIcon(request.status);
              
              return (
                <div key={request.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-center space-x-3 mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">{request.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {request.status?.toUpperCase()}
                        </span>
                      </div>
                      
                      {/* Urgency Badge */}
                      {request.urgency_level && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getUrgencyColor(request.urgency_level)}`}>
                          {request.urgency_level.toUpperCase()}
                        </span>
                      )}
                      
                      {/* Description */}
                      <p className="text-gray-600 mb-3">{request.description}</p>
                      
                      {/* Request Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center space-x-2 text-gray-500">
                          <Calendar size={16} />
                          <span>Delivery: {formatDate(request.expected_delivery_date)}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-gray-500">
                          <User size={16} />
                          <span>{request.requested_by || 'Storekeeper'}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-gray-500">
                          <MapPin size={16} />
                          <span className="truncate">{request.delivery_address || 'No address'}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 text-gray-500">
                          <Phone size={16} />
                          <span>{request.contact_phone || 'No phone'}</span>
                        </div>
                        
                        {request.budget_code && (
                          <div className="flex items-center space-x-2 text-gray-500">
                            <DollarSign size={16} />
                            <span>Budget: {request.budget_code}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Delivery Address */}
                      {request.delivery_address && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-2 text-sm text-gray-600 mb-1">
                            <MapPin size={14} />
                            <span>Delivery Address</span>
                          </div>
                          <p className="text-sm text-gray-900">{request.delivery_address}</p>
                        </div>
                      )}
                      
                      {/* Request Items */}
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Requested Items:</h4>
                        <div className="space-y-2">
                          {request.items?.map((item, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <Package size={16} className="text-gray-400" />
                                <div>
                                  <p className="font-medium text-gray-900">{item.item_name}</p>
                                  <p className="text-sm text-gray-500">{item.category}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">
                                  Qty: {item.quantity_requested}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {formatCurrency(item.unit_price)} each
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex flex-col space-y-2 ml-4">
                      {(request.status === 'pending' || request.status === 'draft' || request.status === 'submitted') && (
                        <>
                          <button
                            onClick={() => handleAcceptRequest(request)}
                            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            disabled={loading}
                          >
                            <CheckCircle size={16} />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={() => handleRejectRequest(request.id, request.title)}
                            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            disabled={loading}
                          >
                            <XCircle size={16} />
                            <span>Reject</span>
                          </button>
                        </>
                      )}
                      
                      {request.status === 'quoted' && (
                        <div className="text-center">
                          <span className="text-sm text-gray-500">Quote submitted</span>
                        </div>
                      )}
                      
                      {request.status === 'approved' && (
                        <div className="text-center">
                          <span className="text-sm text-green-600 font-medium">✓ Approved</span>
                        </div>
                      )}
                      
                      {request.status === 'rejected' && (
                        <div className="text-center">
                          <span className="text-sm text-red-600 font-medium">✗ Rejected</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stock Update Modal */}
      {showStockUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <TrendingUp className="text-green-600" size={24} />
                <h3 className="text-xl font-bold text-gray-900">Stock Updates</h3>
              </div>
              <button
                onClick={() => setShowStockUpdateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Stock Updates List */}
            <div className="space-y-3">
              {stockUpdates.map((update, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <PackageOpen className="text-blue-600" size={16} />
                      <span className="font-medium text-gray-900">{update.itemName}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-medium ${update.quantityDeducted > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {update.quantityDeducted > 0 ? `-${update.quantityDeducted}` : `+${update.quantityDeducted}`}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span>Old: {update.oldQuantity}</span>
                    <span> → </span>
                    <span>New: {update.newQuantity}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center py-4">
              <button
                onClick={() => setShowStockUpdateModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Modal */}
      {showBillModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <FileText className="text-blue-600" size={24} />
                <h3 className="text-xl font-bold text-gray-900">Generate Bill</h3>
              </div>
              <button
                onClick={() => setShowBillModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Bill Header */}
            <div className="border-2 border-gray-800 p-6 mb-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">TAX INVOICE</h1>
                <p className="text-gray-600">Bill #: {billData.bill_number}</p>
                <p className="text-gray-600">Date: {new Date().toLocaleDateString()}</p>
                <p className="text-gray-600">Due Date: {billData.due_date}</p>
              </div>
              
              {/* Bill To */}
              <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Bill To:</h3>
                  <p className="text-gray-700">Storekeeper</p>
                  <p className="text-gray-700">Department: {selectedRequest.department || 'N/A'}</p>
                  <p className="text-gray-700">Delivery Address: {selectedRequest.delivery_address || 'N/A'}</p>
                  <p className="text-gray-700">Contact: {selectedRequest.contact_phone || 'N/A'}</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Request Details:</h3>
                  <p className="text-gray-700">Request #: {selectedRequest.request_number || 'N/A'}</p>
                  <p className="text-gray-700">Expected Delivery: {selectedRequest.expected_delivery_date || 'N/A'}</p>
                  <p className="text-gray-700">Budget Code: {selectedRequest.budget_code || 'N/A'}</p>
                </div>
              </div>
              
              {/* Items Table */}
              <table className="w-full mb-6">
                <thead className="border-b-2 border-gray-800">
                  <tr>
                    <th className="text-left py-2">Item Description</th>
                    <th className="text-center py-2">Qty</th>
                    <th className="text-right py-2">Unit Price</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {billData.items.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2">
                        <div>
                          <p className="font-medium text-gray-900">{item.item_name}</p>
                          <p className="text-sm text-gray-500">{item.category}</p>
                        </div>
                      </td>
                      <td className="text-center py-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateBillItem(index, 'quantity', parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          min="1"
                        />
                      </td>
                      <td className="text-right py-2">
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateBillItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="text-right py-2 font-semibold text-gray-900">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-800">
                  <tr>
                    <td colSpan="3" className="text-right py-2 font-semibold">Subtotal:</td>
                    <td className="text-right py-2 font-semibold">{formatCurrency(billData.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan="3" className="text-right py-2 font-semibold">Tax:</td>
                    <td className="text-right py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={billData.tax_rate}
                          onChange={(e) => handleTaxRateChange('tax_rate', e.target.value)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-right"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className="text-sm text-gray-600">%</span>
                        <span className="font-semibold">{formatCurrency(billData.tax)}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="3" className="text-right py-2 font-semibold">GST:</td>
                    <td className="text-right py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={billData.gst_rate}
                          onChange={(e) => handleTaxRateChange('gst_rate', e.target.value)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-right"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className="text-sm text-gray-600">%</span>
                        <span className="font-semibold">{formatCurrency(billData.gst)}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="3" className="text-right py-2 font-semibold text-lg text-gray-900">Total:</td>
                    <td className="text-right py-2 font-semibold text-lg text-gray-900">{formatCurrency(billData.total)}</td>
                  </tr>
                </tfoot>
              </table>
              
              {/* Bill Details */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Payment Terms:</h3>
                  <input
                    type="text"
                    value={billData.payment_terms}
                    onChange={(e) => setBillData({...billData, payment_terms: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Delivery Terms:</h3>
                  <input
                    type="text"
                    value={billData.delivery_terms}
                    onChange={(e) => setBillData({...billData, delivery_terms: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              
              {/* Notes */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Notes:</h3>
                <textarea
                  value={billData.notes}
                  onChange={(e) => setBillData({...billData, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows="3"
                />
              </div>
              
              {/* Footer */}
              <div className="text-center text-sm text-gray-600 mt-6">
                <p>Thank you for your business!</p>
                <p>Payment due within {billData.payment_terms}</p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBillModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendBill}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                disabled={loading}
              >
                <Send size={16} />
                <span>{loading ? 'Sending...' : 'Send Bill to Storekeeper & Accountant'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 mt-8">
        <p>© 2024 LMS Vendor Portal. All rights reserved.</p>
        <p className="text-xs text-gray-400">Last updated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default VendorRequests;
