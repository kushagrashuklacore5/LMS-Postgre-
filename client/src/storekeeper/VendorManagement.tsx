import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Users2, Edit2, Trash2, Search, Phone, Mail, MapPin, FileText, AlertCircle, CheckCircle, Clock, XCircle, Eye, X, RefreshCw } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';
import { useAuth } from '../auth/auth';
import { toast } from 'react-toastify';

type Vendor = {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  category: string;
  rating: number;
  totalOrders: number;
  totalValue: number;
  createdAt: string;
  university_id: number;
};

type InvoiceItem = {
  item_name?: string;
  name?: string;
  category?: string;
  quantity: number;
  unit_price?: number;
  price?: number;
  total?: number;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  vendorId: number;
  vendorName: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  description: string;
  items: InvoiceItem[];
  university_id: number;
  createdAt: string;
  updatedAt: string;
  tax?: number;
  gst?: number;
  tax_rate?: number;
  gst_rate?: number;
};

export default function VendorManagement() {
  const { t } = useTranslation();
  const { token, API } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    address: '', 
    category: '', 
  });

  // Load vendors and invoices from database on mount
  useEffect(() => {
    loadVendors();
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setInvoicesLoading(true);
      const res = await fetch(`${API}/storekeeper/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          console.log('📄 Loaded invoices:', data.data);
          setInvoices(data.data || []);
        }
      } else {
        console.error('Failed to load invoices');
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const loadVendors = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/storekeeper/vendors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendors(data.data || []);
        }
      } else {
        console.error('Failed to load vendors');
      }
    } catch (error) {
      console.error('Error loading vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveVendor = async (vendorData: Partial<Vendor>) => {
    try {
      // Validate form data - only name is required
      if (!vendorData.name || !vendorData.name.trim()) {
        toast.error('Vendor name is required');
        return;
      }

      console.log('Saving vendor:', { vendorData, editingVendor });
      setLoading(true);
      const url = editingVendor 
        ? `${API}/storekeeper/vendors/${editingVendor.id}`
        : `${API}/storekeeper/vendors`;
      
      const method = editingVendor ? 'PUT' : 'POST';
      
      console.log('API call:', { url, method, token: !!token });
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(vendorData),
      });

      const responseText = await res.text();
      console.log('Response:', res.status, responseText);

      if (res.ok) {
        const data = JSON.parse(responseText);
        
        if (data.success) {
          await loadVendors(); // Reload vendors
          
          // Show password returned from server for new vendor
          if (!editingVendor) {
            const generatedPassword = data.data?.generatedPassword || 'N/A';
            console.log('🔐 Password from server:', generatedPassword);
            
            toast.success(
              `Vendor added successfully! 🎉\nEmail: ${data.data.email || vendorData.email}\nPassword: ${generatedPassword}`,
              { autoClose: 8000 }
            );
          } else {
            // For editing vendors, just show success message
            toast.success(data.message || 'Vendor updated successfully');
          }
          
          setShowAddForm(false);
          setEditingVendor(null);
          setForm({ 
            name: '', 
            email: '', 
            phone: '', 
            address: '', 
            category: '', 
          });
        } else {
          toast.error(data.message || 'Failed to save vendor');
        }
      } else {
        // Handle error responses
        let errorMessage = `Failed to save vendor: ${res.status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // If not JSON, use default message
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Error saving vendor:', error);
      toast.error('Error saving vendor');
    } finally {
      setLoading(false);
    }
  };

  const deleteVendor = async (vendorId: number, vendorName: string) => {
    if (!confirm(`Are you sure you want to delete ${vendorName}?`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API}/storekeeper/vendors/${vendorId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await loadVendors(); // Reload vendors
          toast.success(data.message || 'Vendor deleted successfully');
        } else {
          toast.error(data.message || 'Failed to delete vendor');
        }
      } else {
        toast.error('Failed to delete vendor');
      }
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Error deleting vendor');
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoice = (invoice: Invoice) => {
    try {
      console.log('🔍 Viewing invoice:', invoice);
      console.log('📦 Invoice items:', invoice.items);
      setSelectedInvoice(invoice);
      setShowInvoiceModal(true);
    } catch (error) {
      console.error('Error opening invoice:', error);
      toast.error('Failed to open invoice details');
    }
  };

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => 
      vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [vendors, searchTerm]);

  const stats = useMemo(() => ({
    total: filteredVendors.length,
    avgRating: filteredVendors.reduce((sum, v) => sum + (v.rating || 0), 0) / filteredVendors.length || 0,
    totalInvoices: invoices.length,
    pendingInvoices: invoices.filter(inv => inv.status === 'pending').length,
    paidInvoices: invoices.filter(inv => inv.status === 'paid').length,
    overdueInvoices: invoices.filter(inv => inv.status === 'overdue').length,
    totalInvoiceAmount: invoices.reduce((sum, inv) => sum + inv.amount, 0),
  }), [filteredVendors, invoices]);

  function editVendor(vendor: Vendor) {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone,
      address: vendor.address,
      category: vendor.category,
    });
    setShowAddForm(true);
  }

  function resetForm() {
    setForm({ 
      name: '', 
      email: '', 
      phone: '', 
      address: '', 
      category: '', 
    });
    setEditingVendor(null);
    setShowAddForm(false);
  }

  const getInvoiceStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'pending':
        return <Clock className="text-yellow-500" size={16} />;
      case 'overdue':
        return <AlertCircle className="text-red-500" size={16} />;
      case 'cancelled':
        return <XCircle className="text-gray-500" size={16} />;
      default:
        return <FileText className="text-gray-400" size={16} />;
    }
  };

  const getInvoiceStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'overdue':
        return 'text-red-600 bg-red-50';
      case 'cancelled':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < Math.floor(rating) ? 'text-yellow-400' : 'text-gray-300'}>
        ★
      </span>
    ));
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Vendor Management</h1>
          <p className="text-gray-600 mt-2">Manage suppliers and vendor relationships</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Vendors</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              </div>
              <Users2 className="text-blue-500" size={32} />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Vendors</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              </div>
              <Users2 className="text-green-500" size={32} />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avg Rating</p>
                <p className="text-2xl font-bold text-slate-900">{stats.avgRating.toFixed(1)}</p>
              </div>
              <div className="text-yellow-500">{'★'.repeat(Math.floor(stats.avgRating))}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Search and Add */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search vendors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                >
                  <Plus size={18} /> Add Vendor
                </button>
              </div>
            </div>

            {/* Vendors List */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="space-y-4">
                {filteredVendors.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users2 size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No vendors found</p>
                  </div>
                ) : (
                  filteredVendors.map(vendor => (
                    <div key={vendor.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-slate-900 text-lg">{vendor.name}</h3>
                          </div>
                          <p className="text-gray-600 mb-3">{vendor.category}</p>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Phone size={16} />
                              <span>{vendor.phone}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Mail size={16} />
                              <span>{vendor.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <MapPin size={16} />
                              <span>{vendor.address}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-sm text-gray-600">Rating:</span>
                            <div className="flex">
                              {renderStars(vendor.rating)}
                            </div>
                            <span className="text-sm text-gray-600">({vendor.rating})</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => editVendor(vendor)}
                            className="text-blue-600 hover:text-blue-800 p-2 rounded"
                            title="Edit vendor"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteVendor(vendor.id, vendor.name)}
                            className="text-red-600 hover:text-red-800 p-2 rounded"
                            title="Delete vendor"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Raised Invoice Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText size={20} className="text-purple-500" />
                  Raised Invoices
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadInvoices}
                    className="text-sm text-blue-600 hover:text-blue-700 p-1 rounded"
                    title="Refresh invoices"
                  >
                    <RefreshCw size={16} />
                  </button>
                  {invoices.length > 2 && (
                    <button
                      onClick={() => setShowAllInvoices(!showAllInvoices)}
                      className="text-sm text-purple-600 hover:text-purple-700 px-2 py-1 rounded border border-purple-200"
                      title={showAllInvoices ? "Show less" : "View all invoices"}
                    >
                      {showAllInvoices ? "Show Less" : "View All"}
                    </button>
                  )}
                  <span className="text-sm text-gray-500">{stats.totalInvoices} total</span>
                </div>
              </div>
              
              {invoicesLoading ? (
                <div className="text-center py-4 text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2"></div>
                  <p>Loading invoices...</p>
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No invoices found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`${showAllInvoices ? 'max-h-96 overflow-y-auto' : ''}`}>
                    {(showAllInvoices ? invoices : invoices.slice(0, 2)).map(invoice => (
                      <div key={invoice.id} className="border border-gray-200 rounded-lg p-3 hover:shadow-sm transition cursor-pointer" onClick={() => handleViewInvoice(invoice)}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{invoice.invoiceNumber || 'N/A'}</p>
                            <p className="text-xs text-gray-600">{invoice.vendorName || 'N/A'}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {getInvoiceStatusIcon(invoice.status)}
                            <span className={`text-xs px-2 py-1 rounded-full ${getInvoiceStatusColor(invoice.status)}`}>
                              {invoice.status}
                            </span>
                            <Eye size={14} className="text-blue-500 cursor-pointer" />
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs text-gray-600">
                          <span>₹{(invoice.amount || 0).toLocaleString('en-IN')}</span>
                          <span>{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        
                        {invoice.description && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{invoice.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Show indicator when there are more invoices hidden */}
                  {!showAllInvoices && invoices.length > 2 && (
                    <div className="text-center py-2">
                      <p className="text-xs text-gray-500">
                        Showing 2 of {invoices.length} invoices. Click "View All" to see more.
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Invoice Summary */}
              {invoices.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Pending</p>
                      <p className="font-semibold text-yellow-600">{stats.pendingInvoices}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Paid</p>
                      <p className="font-semibold text-green-600">{stats.paidInvoices}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Overdue</p>
                      <p className="font-semibold text-red-600">{stats.overdueInvoices}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total</p>
                      <p className="font-semibold text-slate-900">₹{stats.totalInvoiceAmount.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Add/Edit Vendor Form */}
            {showAddForm && (
              <div className="bg-white rounded-xl shadow-sm p-6 sticky top-8">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  {editingVendor ? <Edit2 size={20} /> : <Plus size={20} />}
                  {editingVendor ? 'Edit Vendor' : 'Add Vendor'}
                </h3>
                <div className="space-y-4">
                  <input 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
                    placeholder="Vendor Name *" 
                    value={form.name} 
                    onChange={e=>setForm(f=>({...f,name:e.target.value}))} 
                    required
                  />
                  <input 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
                    placeholder="Category" 
                    value={form.category} 
                    onChange={e=>setForm(f=>({...f,category:e.target.value}))} 
                  />
                  <input 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
                    placeholder="Email (optional)" 
                    type="email"
                    value={form.email} 
                    onChange={e=>setForm(f=>({...f,email:e.target.value}))} 
                  />
                  <input 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
                    placeholder="Phone (optional)" 
                    value={form.phone} 
                    onChange={e=>setForm(f=>({...f,phone:e.target.value}))} 
                  />
                  <textarea 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
                    placeholder="Address (optional)" 
                    value={form.address} 
                    onChange={e=>setForm(f=>({...f,address:e.target.value}))} 
                    rows={3}
                  />
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => saveVendor({
                        name: form.name,
                        email: form.email,
                        phone: form.phone,
                        address: form.address,
                        category: form.category
                      })}
                      disabled={loading}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {editingVendor ? 'Update Vendor' : 'Add Vendor'}
                    </button>
                    <button
                      onClick={resetForm}
                      className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Modal */}
      {showInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <FileText className="text-blue-600" size={24} />
                <h3 className="text-xl font-bold text-gray-900">Invoice Details</h3>
              </div>
              <button
                onClick={() => {
                  setShowInvoiceModal(false);
                  setSelectedInvoice(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Invoice Header */}
            <div className="border-2 border-gray-800 p-6 mb-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">TAX INVOICE</h1>
                <p className="text-gray-600">Invoice #: {selectedInvoice.invoiceNumber || 'N/A'}</p>
                <p className="text-gray-600">Date: {selectedInvoice.issueDate ? new Date(selectedInvoice.issueDate).toLocaleDateString() : 'N/A'}</p>
                <p className="text-gray-600">Due Date: {selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate).toLocaleDateString() : 'N/A'}</p>
              </div>
              
              {/* Invoice Details */}
              <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Bill To:</h3>
                  <p className="text-gray-700">Storekeeper</p>
                  <p className="text-gray-700">University: {selectedInvoice.university_id || 'N/A'}</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Vendor:</h3>
                  <p className="text-gray-700">{selectedInvoice.vendorName || 'N/A'}</p>
                  <p className="text-gray-700">Invoice ID: {selectedInvoice.id || 'N/A'}</p>
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
                  {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                    selectedInvoice.items.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2">
                          <div>
                            <p className="font-medium text-gray-900">{item.item_name || item.name || 'N/A'}</p>
                            {item.category && <p className="text-xs text-gray-500">{item.category}</p>}
                          </div>
                        </td>
                        <td className="text-center py-2">
                          {item.quantity || 0}
                        </td>
                        <td className="text-right py-2">
                          ₹{(item.unit_price || item.price || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="text-right py-2 font-semibold text-gray-900">
                          ₹{((item.quantity || 0) * (item.unit_price || item.price || 0)).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-gray-500">
                        No items found for this invoice
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Calculate totals */}
              {(() => {
                const itemsTotal = selectedInvoice.items?.reduce((sum, item) => 
                  sum + ((item.quantity || 0) * (item.unit_price || item.price || 0)), 0
                ) || 0;
                const taxAmount = selectedInvoice.tax || 0;
                const gstAmount = selectedInvoice.gst || 0;
                const taxRate = selectedInvoice.tax_rate || 5;
                const gstRate = selectedInvoice.gst_rate || 18;
                const hasTax = taxAmount > 0;
                const hasGst = gstAmount > 0;
                
                return (
                  <>
                    <tfoot className="border-t-2 border-gray-800">
                      <tr>
                        <td colSpan={3} className="text-right py-2 font-semibold">Subtotal:</td>
                        <td className="text-right py-2">
                          ₹{itemsTotal.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      {hasTax && (
                        <tr>
                          <td colSpan={3} className="text-right py-2 text-gray-600">
                            Tax ({taxRate}%):
                          </td>
                          <td className="text-right py-2 text-gray-600">
                            ₹{taxAmount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      )}
                      {hasGst && (
                        <tr>
                          <td colSpan={3} className="text-right py-2 text-gray-600">
                            GST ({gstRate}%):
                          </td>
                          <td className="text-right py-2 text-gray-600">
                            ₹{gstAmount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-gray-800">
                        <td colSpan={3} className="text-right py-2 font-bold text-lg">Total:</td>
                        <td className="text-right py-2 font-bold text-lg text-gray-900">
                          ₹{(selectedInvoice.amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tfoot>
                  </>
                );
              })()}
              </table>
              
              {/* Description */}
              {selectedInvoice.description && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Notes:</h3>
                  <p className="text-gray-700">{selectedInvoice.description}</p>
                </div>
              )}
              
              {/* Status */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className={`text-sm px-2 py-1 rounded-full ${getInvoiceStatusColor(selectedInvoice.status || 'pending')}`}>
                    {selectedInvoice.status || 'pending'}
                  </span>
                </div>
                
                {selectedInvoice.paidDate && (
                  <div className="text-sm text-gray-600">
                    Paid on: {new Date(selectedInvoice.paidDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowInvoiceModal(false);
                  setSelectedInvoice(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
