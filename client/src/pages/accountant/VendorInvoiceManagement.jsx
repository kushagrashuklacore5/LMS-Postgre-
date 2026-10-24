import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/auth';
import AccountantLayout from '../../components/AccountantLayout';
import { toast } from 'react-toastify';
import {
  FileText,
  DollarSign,
  Calendar,
  User,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Eye,
  Download,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';

// Simple event emitter for real-time updates
const eventEmitter = new EventTarget();

// Global event to notify dashboard of payment updates
window.accountantPaymentEvents = eventEmitter;

const VendorInvoiceManagement = () => {
  const { token, API } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  useEffect(() => {
    fetchInvoices();
    fetchPaymentHistory();
  }, []);

  const fetchPaymentHistory = async () => {
    try {
      const res = await fetch(`${API}/accountant/payment-history`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPaymentHistory(data.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching payment history:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching invoices...');
      
      const res = await fetch(`${API}/accountant/vendor-invoices`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Failed to fetch invoices: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('📡 Response data:', data);
      
      if (data.success) {
        setInvoices(data.data || []);
        console.log(`✅ Loaded ${data.data?.length || 0} invoices`);
      } else {
        throw new Error(data.message || 'Failed to load invoices');
      }
    } catch (error) {
      console.error('❌ Error fetching invoices:', error);
      toast.error(error.message || 'Failed to load vendor invoices');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (invoiceId) => {
    try {
      setProcessingPayment(invoiceId);
      
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        toast.error('Invoice not found');
        return;
      }

      // Load Razorpay script dynamically (like student portal)
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);

      script.onload = () => {
        const options = {
          key: (import.meta.env.VITE_RAZORPAY_KEY_ID || ''), // Same key as student portal
          amount: invoice.amount * 100, // Convert to paise
          currency: 'INR',
          name: 'Vendor Payment',
          description: `Payment for invoice ${invoice.invoiceNumber}`,
          image: 'https://example.com/your-logo.png',
          prefill: {
            name: 'Accountant',
            email: 'accountant@university.edu',
            contact: '9999999999'
          },
          notes: {
            invoiceId: invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            vendorName: invoice.vendorName,
            payment_type: 'vendor_invoice'
          },
          handler: async function (response) {
            // Payment successful - immediate UI updates
            try {
              const token = localStorage.getItem('token') || '';
              const paymentData = {
                invoiceId: invoiceId,
                invoiceNumber: invoice.invoiceNumber,
                vendorName: invoice.vendorName,
                amount: invoice.amount,
                status: 'paid',
                transactionId: response.razorpay_payment_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                paymentDate: new Date().toISOString(),
                paidDate: new Date().toISOString()
              };

              console.log('💰 Payment successful!', response.razorpay_payment_id);

              // 1. Update invoice status immediately for instant feedback
              setInvoices(prev => prev.map(inv => 
                inv.id === invoiceId 
                  ? { ...inv, status: 'paid', paidDate: new Date().toISOString() }
                  : inv
              ));

              // 2. Add to payment history immediately
              const newPayment = {
                id: response.razorpay_payment_id,
                invoiceNumber: invoice.invoiceNumber,
                vendorName: invoice.vendorName,
                amount: invoice.amount,
                paymentDate: new Date().toISOString(),
                status: 'completed',
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                issueDate: invoice.issueDate
              };
              
              setPaymentHistory(prev => [newPayment, ...prev]);

              // 3. Show success message immediately
              toast.success(`Payment successful! Invoice #${invoice.invoiceNumber} paid successfully`);

              // 4. Emit event to notify dashboard and other components
              const paymentEvent = new CustomEvent('paymentSuccess', {
                detail: {
                  invoiceId: invoiceId,
                  invoiceNumber: invoice.invoiceNumber,
                  vendorName: invoice.vendorName,
                  amount: invoice.amount,
                  status: 'paid',
                  paymentId: response.razorpay_payment_id,
                  timestamp: new Date().toISOString()
                }
              });
              window.accountantPaymentEvents.dispatchEvent(paymentEvent);

              // 5. Generate invoice PDF
              try {
                await generatePaymentInvoice(paymentData, invoice);
                console.log('📄 Invoice PDF generated successfully');
              } catch (error) {
                console.error('❌ Error generating invoice PDF:', error);
                toast.warning('Payment successful! Invoice generation failed.');
              }

              // 5. Save payment transaction to database in background
              try {
                const saveResp = await fetch(`${API}/accountant/verify-payment`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                  },
                  body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    invoiceId: invoiceId
                  })
                });

                if (saveResp.ok) {
                  const result = await saveResp.json();
                  if (result.success) {
                    console.log('✅ Payment saved to database successfully:', result.data);
                    // Refresh payment history to get complete data
                    fetchPaymentHistory();
                    // Refresh invoices to get updated status from database
                    fetchInvoices();
                    toast.success(`Payment processed! Invoice #${invoice.invoiceNumber} marked as paid`);
                  } else {
                    console.warn('⚠️ Payment saved but database response issue:', result.message);
                    toast.warning(`Payment processed but database sync issue: ${result.message}`);
                  }
                } else {
                  const errorData = await saveResp.json().catch(() => ({}));
                  const errorMsg = errorData.message || `Server error: ${saveResp.status}`;
                  console.warn('⚠️ Database sync issue:', errorMsg);
                  toast.warning(`Payment successful! Database sync pending: ${errorMsg}`);
                }
              } catch (dbError) {
                console.error('❌ Database save error:', dbError);
                toast.warning('Payment successful! Database sync pending.');
              }

              // 6. Close modal and reset state
              setShowPaymentModal(false);
              setSelectedInvoice(null);
              setProcessingPayment(null);

            } catch (error) {
              console.error('❌ Error processing payment success:', error);
              // Still show success since Razorpay payment went through
              toast.success(`Payment successful! (${response.razorpay_payment_id})`);
              setProcessingPayment(null);
              setShowPaymentModal(false);
              setSelectedInvoice(null);
            }

            setProcessingPayment(null);
          },
          modal: {
            ondismiss: function() {
              setProcessingPayment(null);
            },
            escape: false,
            backdropclose: false
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      };

      script.onerror = () => {
        setProcessingPayment(null);
        toast.error('Failed to load payment gateway');
      };

    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment failed');
      setProcessingPayment(null);
    }
  };

  const generatePaymentInvoice = async (paymentData, invoice) => {
    try {
      // Create a simple invoice PDF using Blob
      const invoiceContent = `
PAYMENT INVOICE
================

Invoice Number: ${invoice.invoiceNumber}
Vendor Name: ${invoice.vendorName}
Payment ID: ${paymentData.transactionId}
Payment Date: ${new Date(paymentData.paymentDate).toLocaleDateString()}
Payment Amount: ₹${invoice.amount.toLocaleString('en-IN')}
Status: PAID

Invoice Details:
- Invoice Number: ${invoice.invoiceNumber}
- Vendor: ${invoice.vendorName}
- Amount: ₹${invoice.amount.toLocaleString('en-IN')}
- Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}
- Payment Date: ${new Date(paymentData.paymentDate).toLocaleDateString()}
- Razorpay Payment ID: ${paymentData.razorpay_payment_id}
- Razorpay Order ID: ${paymentData.razorpay_order_id}

Description: ${invoice.description || 'Vendor payment'}

==========================
Generated on: ${new Date().toLocaleString()}
Payment Status: Successfully Completed
      `.trim();

      // Create blob from text
      const blob = new Blob([invoiceContent], { type: 'text/plain' });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_invoice_${invoice.invoiceNumber}_${paymentData.transactionId}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('📄 Payment invoice generated:', `payment_invoice_${invoice.invoiceNumber}_${paymentData.transactionId}.txt`);
      
      // Also try to generate PDF if pdfkit is available
      try {
        await generatePdfInvoice(paymentData, invoice);
      } catch (pdfError) {
        console.log('PDF generation not available, using text format');
      }
      
    } catch (error) {
      console.error('Error generating payment invoice:', error);
      throw error;
    }
  };

  const generatePdfInvoice = async (paymentData, invoice) => {
    // This would use PDFKit if available, for now we'll use the text version
    console.log('PDF generation would go here, using text format instead');
  };

  const handleDownloadInvoice = async (paymentId) => {
    try {
      const res = await fetch(`${API}/accountant/download-invoice/${paymentId}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payment_invoice_${paymentId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Invoice downloaded successfully!');
      } else {
        throw new Error('Failed to download invoice');
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error('Failed to download invoice');
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || invoice.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={15} className="text-emerald-700" />;
      case 'pending':
        return <Clock size={15} className="text-amber-700" />;
      case 'overdue':
        return <AlertCircle size={15} className="text-rose-700" />;
      default:
        return <Clock size={15} className="text-slate-700" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'pending':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'overdue':
        return 'bg-rose-50 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  if (loading) {
    return (
      <AccountantLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-[#002366]"></div>
        </div>
      </AccountantLayout>
    );
  }

  return (
    <AccountantLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ebdcaa] pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight">Vendor Invoices & Payment Ledger</h1>
            <p className="text-slate-600 text-sm mt-1">Manage and process corporate vendor payments & audit history</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPaymentHistory(true)}
              className="bg-[#002366] hover:bg-[#001845] text-white px-4 py-2.5 rounded-none font-semibold text-sm transition-all shadow-xs flex items-center gap-2"
            >
              <FileText size={16} className="text-[#B99652]" />
              Payment History
            </button>
            <button
              onClick={fetchInvoices}
              className="bg-[#B99652] hover:bg-[#a38243] text-white px-4 py-2.5 rounded-none font-semibold text-sm transition-all shadow-xs flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-[#002366] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">Total Invoices</span>
              <FileText size={20} className="text-[#002366]" />
            </div>
            <div className="text-2xl font-bold text-[#002366]">{invoices.length}</div>
            <p className="text-xs text-slate-500 mt-1">All processed & pending</p>
          </div>
          
          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-amber-600 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">Pending</span>
              <Clock size={20} className="text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700">{invoices.filter(inv => inv.status === 'pending').length}</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting settlement</p>
          </div>
          
          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-emerald-600 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">Paid Invoices</span>
              <CheckCircle size={20} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700">{invoices.filter(inv => inv.status === 'paid').length}</div>
            <p className="text-xs text-slate-500 mt-1">Cleared transactions</p>
          </div>
          
          <div className="bg-white rounded-none border border-[#ebdcaa] border-t-4 border-t-[#B99652] p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-500">Pending Amount</span>
              <DollarSign size={20} className="text-[#B99652]" />
            </div>
            <div className="text-2xl font-bold text-[#002366]">
              ₹{invoices
                .filter(inv => inv.status === 'pending')
                .reduce((sum, inv) => sum + (inv.amount || 0), 0)
                .toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-slate-500 mt-1">Total outstanding liability</p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 border border-[#ebdcaa] rounded-none shadow-xs">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search invoices by number, vendor or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#fffdf0] border border-[#ebdcaa] rounded-none text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#002366]"
            />
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-[#fffdf0] border border-[#ebdcaa] rounded-none text-slate-800 text-sm focus:outline-none focus:border-[#002366]"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        {/* Invoices Table */}
        <div className="bg-white rounded-none border border-[#ebdcaa] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#fbf6e6] border-b border-[#ebdcaa] text-xs font-bold uppercase tracking-wider text-[#002366]">
                  <th className="px-6 py-4">Invoice</th>
                  <th className="px-6 py-4">Vendor</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Due Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                      <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-medium text-slate-600">No invoices found matching criteria</p>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-[#fffdf0] transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-[#002366]">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-slate-500">Issued: {new Date(invoice.issueDate).toLocaleDateString('en-IN')}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <User size={15} className="text-[#B99652]" />
                          <span className="font-medium text-slate-800">{invoice.vendorName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-[#002366]">₹{invoice.amount?.toLocaleString('en-IN')}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Calendar size={15} className="text-slate-400" />
                          <span>{new Date(invoice.dueDate).toLocaleDateString('en-IN')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-semibold uppercase tracking-wider border ${getStatusColor(invoice.status)}`}>
                          {getStatusIcon(invoice.status)}
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowPaymentModal(true);
                            }}
                            className="p-2 bg-slate-100 hover:bg-[#002366] hover:text-white text-slate-700 rounded-none transition"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          
                          {invoice.status === 'pending' && (
                            <button
                              onClick={() => handlePayment(invoice.id)}
                              disabled={processingPayment === invoice.id}
                              className="px-3 py-1.5 bg-[#002366] hover:bg-[#001845] text-white text-xs font-semibold rounded-none transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                              title="Process Payment"
                            >
                              {processingPayment === invoice.id ? (
                                <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-none"></div>
                              ) : (
                                <>
                                  <CreditCard size={14} className="text-[#B99652]" />
                                  <span>Pay Now</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Modal */}
        {showPaymentModal && selectedInvoice && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-none border border-[#ebdcaa] max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-[#002366] px-6 py-4 flex items-center justify-between border-b border-[#B99652]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-[#B99652]" />
                  Invoice Details
                </h3>
                <button 
                  onClick={() => setShowPaymentModal(false)}
                  className="text-slate-300 hover:text-white font-bold text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-3 bg-[#fffdf0] p-4 border border-[#ebdcaa] rounded-none text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Invoice Number:</span>
                    <span className="text-[#002366] font-bold">{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Vendor Name:</span>
                    <span className="text-slate-800 font-semibold">{selectedInvoice.vendorName}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#ebdcaa] pt-2">
                    <span className="text-slate-500 font-medium">Invoice Amount:</span>
                    <span className="text-[#002366] font-bold text-base">₹{selectedInvoice.amount?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Due Date:</span>
                    <span className="text-slate-800">{new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-[#ebdcaa] pt-2">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none text-xs font-bold uppercase tracking-wider border ${getStatusColor(selectedInvoice.status)}`}>
                      {getStatusIcon(selectedInvoice.status)}
                      {selectedInvoice.status}
                    </span>
                  </div>
                </div>
                
                {selectedInvoice.description && (
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-none text-xs">
                    <p className="text-slate-500 font-bold uppercase tracking-wider mb-1">Description:</p>
                    <p className="text-slate-700">{selectedInvoice.description}</p>
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm rounded-none transition"
                  >
                    Close
                  </button>
                  {selectedInvoice.status === 'pending' && (
                    <button
                      onClick={() => handlePayment(selectedInvoice.id)}
                      disabled={processingPayment === selectedInvoice.id}
                      className="flex-1 px-4 py-2.5 bg-[#002366] hover:bg-[#001845] text-white font-semibold text-sm rounded-none transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs"
                    >
                      {processingPayment === selectedInvoice.id ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-none"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard size={16} className="text-[#B99652]" />
                          <span>Process Payment</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment History Modal */}
        {showPaymentHistory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-none border border-[#ebdcaa] max-w-4xl w-full shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-[#002366] px-6 py-4 flex items-center justify-between border-b border-[#B99652]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-[#B99652]" />
                  Vendor Payment Audit History
                </h3>
                <button
                  onClick={() => setShowPaymentHistory(false)}
                  className="text-slate-300 hover:text-white font-bold text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {paymentHistory.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-none">
                    <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-600 font-medium">No recorded payment history found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentHistory.map((payment) => (
                      <div key={payment.id} className="bg-[#fffdf0] rounded-none p-4 border border-[#ebdcaa] hover:border-[#002366] transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#002366] text-base">{payment.invoiceNumber}</span>
                              <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 font-bold uppercase rounded-none border border-emerald-300">
                                {payment.status}
                              </span>
                            </div>
                            <p className="text-slate-700 text-sm font-semibold mt-0.5">{payment.vendorName}</p>
                            <p className="text-slate-500 text-xs mt-1">
                              Paid Date: {new Date(payment.paymentDate).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                          <div className="text-left sm:text-right flex sm:flex-col items-center sm:items-end justify-between gap-2">
                            <div>
                              <p className="text-[#002366] font-bold text-lg">₹{payment.amount?.toLocaleString('en-IN')}</p>
                              {payment.razorpayPaymentId && (
                                <p className="text-slate-400 text-xs font-mono">Ref: {payment.razorpayPaymentId}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDownloadInvoice(payment.id)}
                              className="bg-[#002366] hover:bg-[#001845] text-white px-3 py-1.5 rounded-none text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
                            >
                              <Download size={14} className="text-[#B99652]" />
                              <span>Download Receipt</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AccountantLayout>
  );
};

export default VendorInvoiceManagement;
