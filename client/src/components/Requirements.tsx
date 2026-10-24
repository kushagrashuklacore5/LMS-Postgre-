import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, XCircle, AlertCircle, Minus } from 'lucide-react';
import { useAuth } from '../auth/auth';

interface RequirementItem {
  id: string | number;
  itemName: string;
  quantity: number;
  status: 'pending' | 'approved' | 'out_of_stock';
}

interface RequirementRequest {
  id: string | number;
  teacherId: number;
  teacherName: string;
  classroomName: string;
  priority: 'low' | 'medium' | 'high';
  requirements?: RequirementItem[];
  items?: RequirementItem[];
  requestedAt: string;
  status: 'pending' | 'partially_approved' | 'approved' | 'rejected';
}

const mockItems = [
  'Chalk', 'Whiteboard Marker', 'Duster', 'Diary', 'Attendance Log', 
  'White Papers', 'Notebooks', 'Pens', 'Pencils', 'Eraser'
];

export default function Requirements({ role }: { role: string }) {
  const { API, token, user } = useAuth();
  
  const [requirements, setRequirements] = useState<RequirementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedItemForOrder, setSelectedItemForOrder] = useState<any>(null);
  
  const [form, setForm] = useState({
    classroomName: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    selectedItems: [] as string[],
    quantities: {} as Record<string, number>
  });

  const [orderForm, setOrderForm] = useState({
    unitPrice: '',
    quantity: '',
    deliveryDate: '',
    vendorId: ''
  });

  // Load requirements from API
  useEffect(() => {
    const fetchRequirements = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const endpoint = role === 'storekeeper' || role === 'admin' 
          ? `${API}/requirements`
          : `${API}/requirements/my-requests`;
        
        console.log('Fetching requirements from:', endpoint);
        const response = await fetch(endpoint, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch requirements: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Fetched requirements:', data);
        setRequirements(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching requirements:', err);
        setError(err instanceof Error ? err.message : 'Failed to load requirements');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchRequirements();
      // Refresh every 5 seconds for real-time updates
      const interval = setInterval(fetchRequirements, 5000);
      return () => clearInterval(interval);
    }
  }, [token, API, role, user?.id]);

  // Filter requirements based on role
  // Note: API already filters for teacher role, so no need to filter again
  const filteredRequirements = role === 'storekeeper' || role === 'admin' || role === 'accountant'
    ? requirements
    : requirements;
    const firstApprovedId = (filteredRequirements || []).find((r: any) => r.status === 'approved')?.id;
    const firstPendingId = (filteredRequirements || []).find((r: any) => r.status === 'pending')?.id;

  const handleItemToggle = (item: string) => {
    setForm(prev => ({
      ...prev,
      selectedItems: prev.selectedItems.includes(item)
        ? prev.selectedItems.filter(i => i !== item)
        : [...prev.selectedItems, item],
      quantities: {
        ...prev.quantities,
        [item]: prev.quantities[item] || 1
      }
    }));
  };

  const handleQuantityChange = (item: string, quantity: number) => {
    setForm(prev => ({
      ...prev,
      quantities: {
        ...prev.quantities,
        [item]: Math.max(1, quantity)
      }
    }));
  };

  const submitRequest = async () => {
    if (!form.classroomName || form.selectedItems.length === 0) {
      alert('Please fill in classroom name and select at least one item');
      return;
    }

    setSubmitting(true);
    try {
      const items = form.selectedItems.map(item => ({
        itemName: item,
        quantity: form.quantities[item] || 1
      }));

      const payload = {
        classroomName: form.classroomName,
        priority: form.priority,
        items: items
      };

      console.log('Submitting requirement:', payload);

      const response = await fetch(`${API}/requirements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit requirement');
      }

      const result = await response.json();
      console.log('Requirement submitted:', result);
      // Observed by GuideBot (ActionGuard) only — fires strictly after the request succeeded.
      window.dispatchEvent(new CustomEvent('guidebot:action-success', { detail: { actionId: 'requirement-created' } }));

      // Reset form
      setShowRequestForm(false);
      setForm({
        classroomName: '',
        priority: 'medium',
        selectedItems: [],
        quantities: {}
      });

      // Refresh requirements
      const refreshResponse = await fetch(`${API}/requirements/my-requests`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setRequirements(Array.isArray(refreshedData) ? refreshedData : []);
      }

      alert('Requirement request submitted successfully!');
    } catch (error) {
      console.error('Error submitting requirement:', error);
      alert(`Error submitting requirement: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequirementAction = async (itemId: number | string, status: 'approved' | 'out_of_stock') => {
    try {
      console.log(`Updating requirement item ${itemId} to ${status}`);

      const response = await fetch(`${API}/requirements/${itemId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update requirement');
      }

      const result = await response.json();
      console.log('Requirement updated:', result);

      // Refresh requirements
      const endpoint = role === 'storekeeper' || role === 'admin' 
        ? `${API}/requirements`
        : `${API}/requirements/my-requests`;
      
      const refreshResponse = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setRequirements(Array.isArray(refreshedData) ? refreshedData : []);
      }

      alert(`Item marked as ${status} successfully!`);
    } catch (error) {
      console.error('Error updating requirement:', error);
      alert(`Error updating requirement: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleOrderItem = (item: any) => {
    setSelectedItemForOrder(item);
    setOrderForm({
      unitPrice: '',
      quantity: item.quantity?.toString() || '',
      deliveryDate: '',
      vendorId: ''
    });
    setShowOrderForm(true);
  };

  const submitOrder = async () => {
    if (!orderForm.unitPrice || !orderForm.quantity || !selectedItemForOrder) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        requirementItemId: selectedItemForOrder.id,
        itemName: selectedItemForOrder.itemName,
        quantity: parseInt(orderForm.quantity),
        unitPrice: parseFloat(orderForm.unitPrice),
        deliveryDate: orderForm.deliveryDate || null,
        vendorId: orderForm.vendorId || null
      };

      console.log('Submitting order:', payload);

      const response = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create order');
      }

      const result = await response.json();
      console.log('Order created:', result);

      // Reset form
      setShowOrderForm(false);
      setSelectedItemForOrder(null);
      setOrderForm({
        unitPrice: '',
        quantity: '',
        deliveryDate: '',
        vendorId: ''
      });

      alert('Order placed successfully!');
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Error creating order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-50 text-red-700 border border-red-200';
      case 'medium': return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'low': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      default: return 'bg-[#fffdf4] text-slate-700 border border-[#ebdcaa]';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'out_of_stock': return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
      default: return <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B99652]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-none p-4 max-w-7xl mx-auto my-6">
        <p className="text-red-700 text-sm font-medium">Error loading requirements: {error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-[#ebdcaa]/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">
            {role === 'storekeeper' ? 'Manage Requirements' : 'My Requirements'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            {role === 'storekeeper' ? 'Review teacher classroom supply requests' : 'Request supplies and materials for your classrooms'}
          </p>
        </div>
        {role !== 'storekeeper' && (
          <button
            onClick={() => setShowRequestForm(true)}
            data-tour="requirements-new-button"
            className="bg-[#B99652] text-white px-4 py-2.5 rounded-none hover:bg-[#a38241] flex items-center transition-all font-medium shadow-sm text-sm"
          >
            <Package className="w-4 h-4 mr-2" />
            New Requirement
          </button>
        )}
      </div>

      {/* Request Form Modal */}
      {showRequestForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div data-tour="requirements-create-form" className="bg-white border-2 border-[#B99652] rounded-none p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-2xl font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">Create Requirement Request</h2>
            <p className="text-xs text-slate-500 mb-5">Select items and quantities needed for your classroom session</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Classroom Name
                </label>
                <input
                  type="text"
                  value={form.classroomName}
                  onChange={(e) => setForm(prev => ({ ...prev, classroomName: e.target.value }))}
                  className="w-full border border-[#ebdcaa] bg-[#fffdf4] rounded-none px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#B99652]"
                  placeholder="e.g., Grade 10 - Section A"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value as any }))}
                  className="w-full border border-[#ebdcaa] bg-[#fffdf4] rounded-none px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#B99652]"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Select Items
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-[#ebdcaa] bg-[#fffdf4]/50 rounded-none p-3">
                  {mockItems.map(item => (
                    <label key={item} className="flex items-center space-x-2.5 p-1.5 hover:bg-white cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={form.selectedItems.includes(item)}
                        onChange={() => handleItemToggle(item)}
                        className="rounded-none accent-[#B99652] w-4 h-4"
                      />
                      <span className="text-xs font-medium text-slate-700">{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              {form.selectedItems.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Quantities
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {form.selectedItems.map(item => (
                      <div key={item} className="flex items-center justify-between p-2 bg-[#fffdf4] border border-[#ebdcaa]/60 rounded-none">
                        <span className="text-xs font-medium text-slate-700">{item}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] text-slate-400 uppercase">Qty</span>
                          <input
                            type="number"
                            min="1"
                            value={form.quantities[item] || 1}
                            onChange={(e) => handleQuantityChange(item, parseInt(e.target.value) || 1)}
                            className="w-20 border border-[#ebdcaa] bg-white rounded-none px-2 py-1 text-xs text-center font-medium focus:outline-none focus:border-[#B99652]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-[#ebdcaa]/60">
              <button
                onClick={() => setShowRequestForm(false)}
                disabled={submitting}
                className="px-4 py-2 border border-[#ebdcaa] rounded-none text-slate-700 hover:bg-[#fffdf4] disabled:opacity-50 transition-colors font-medium text-xs uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={submitRequest}
                disabled={submitting}
                className="px-5 py-2 bg-[#B99652] text-white rounded-none hover:bg-[#a38241] disabled:opacity-50 transition-all font-medium text-xs uppercase tracking-wider shadow-sm"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Form Modal */}
      {showOrderForm && selectedItemForOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-[#B99652] rounded-none p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-2xl font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">Place Order</h2>
            <p className="text-xs text-slate-500 mb-4">Create vendor purchase order for out-of-stock item</p>
            
            <div className="space-y-4">
              <div className="bg-[#fffdf4] p-3 rounded-none border border-[#ebdcaa]">
                <p className="text-xs font-bold uppercase tracking-wider text-[#B99652]">Item: {selectedItemForOrder.itemName}</p>
                <p className="text-xs text-slate-600 mt-0.5">Required Quantity: <span className="font-semibold text-slate-800">{selectedItemForOrder.quantity}</span></p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Order Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  value={orderForm.quantity}
                  onChange={(e) => setOrderForm(prev => ({ ...prev, quantity: e.target.value }))}
                  className="w-full border border-[#ebdcaa] bg-[#fffdf4] rounded-none px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#B99652]"
                  placeholder="Enter quantity to order"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Unit Price (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={orderForm.unitPrice}
                  onChange={(e) => setOrderForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                  className="w-full border border-[#ebdcaa] bg-[#fffdf4] rounded-none px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#B99652]"
                  placeholder="Enter unit price"
                />
              </div>

              {orderForm.quantity && orderForm.unitPrice && (
                <div className="bg-[#fffdf4] p-3 rounded-none border border-[#B99652]/40">
                  <p className="text-xs font-bold text-[#B99652] uppercase tracking-wider">
                    Total Amount: ₹{(parseFloat(orderForm.quantity) * parseFloat(orderForm.unitPrice)).toFixed(2)}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Delivery Date
                </label>
                <input
                  type="date"
                  value={orderForm.deliveryDate}
                  onChange={(e) => setOrderForm(prev => ({ ...prev, deliveryDate: e.target.value }))}
                  className="w-full border border-[#ebdcaa] bg-[#fffdf4] rounded-none px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#B99652]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Vendor ID (Optional)
                </label>
                <input
                  type="text"
                  value={orderForm.vendorId}
                  onChange={(e) => setOrderForm(prev => ({ ...prev, vendorId: e.target.value }))}
                  className="w-full border border-[#ebdcaa] bg-[#fffdf4] rounded-none px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#B99652]"
                  placeholder="Enter vendor ID if available"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-[#ebdcaa]/60">
              <button
                onClick={() => {
                  setShowOrderForm(false);
                  setSelectedItemForOrder(null);
                }}
                disabled={submitting}
                className="px-4 py-2 border border-[#ebdcaa] rounded-none text-slate-700 hover:bg-[#fffdf4] disabled:opacity-50 text-xs font-medium uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={submitOrder}
                disabled={submitting}
                className="px-5 py-2 bg-[#B99652] text-white rounded-none hover:bg-[#a38241] disabled:opacity-50 text-xs font-medium uppercase tracking-wider shadow-sm"
              >
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirements List */}
      <div className="space-y-4">
        {filteredRequirements?.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#ebdcaa] bg-[#fffdf4]/40 rounded-none">
            <Package className="w-12 h-12 text-[#B99652]/60 mx-auto mb-3" />
            <p className="font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">No requirements found</p>
            <p className="text-xs text-slate-500 mt-1">Submit your first requirement request using the button above.</p>
          </div>
        ) : (
          filteredRequirements?.map((req: any) => (
            <div
              key={req.id}
              data-tour={req.id === firstApprovedId ? 'requirement-approved-block' : req.id === firstPendingId ? 'requirement-pending-block' : undefined}
              className="bg-white border border-[#ebdcaa] rounded-none p-5 shadow-xs border-l-4 border-l-[#B99652] transition-all hover:shadow-sm"
            >
              <div className="flex flex-wrap justify-between items-start gap-2 mb-4 pb-3 border-b border-[#ebdcaa]/40">
                <div>
                  <h3 className="font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] tracking-tight">{req.classroomName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 font-medium">by <strong className="text-slate-700">{req.teacherName}</strong></span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-400">{new Date(req.requestedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2.5 py-1 rounded-none text-[11px] font-bold uppercase tracking-wider ${getPriorityColor(req.priority)}`}>
                    {req.priority}
                  </span>
                  <span className={`px-2.5 py-1 rounded-none text-[11px] font-bold uppercase tracking-wider ${
                    req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    req.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
                    req.status === 'partially_approved' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    'bg-[#fffdf4] text-slate-700 border border-[#ebdcaa]'
                  }`}>
                    {req.status?.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {(req.items || req.requirements || []).map((item: any, index: number) => (
                  <div key={item.id || index} className="flex items-center justify-between p-3 bg-[#fffdf4] border border-[#ebdcaa]/60 rounded-none transition-colors hover:bg-white">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(item.status)}
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{item.itemName}</span>
                        <span className="text-xs font-medium text-slate-500 ml-2 bg-white px-2 py-0.5 border border-[#ebdcaa]">Qty: {item.quantity}</span>
                      </div>
                    </div>
                    
                    {role === 'storekeeper' && item.status === 'pending' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRequirementAction(item.id, 'approved')}
                          className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold uppercase tracking-wider rounded-none hover:bg-emerald-700 transition-colors shadow-xs"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRequirementAction(item.id, 'out_of_stock')}
                          className="px-3 py-1 bg-red-600 text-white text-xs font-semibold uppercase tracking-wider rounded-none hover:bg-red-700 transition-colors shadow-xs"
                        >
                          Out of Stock
                        </button>
                      </div>
                    )}

                    {role === 'storekeeper' && item.status === 'out_of_stock' && (
                      <button
                        onClick={() => handleOrderItem(item)}
                        className="px-3 py-1 bg-[#B99652] text-white text-xs font-semibold uppercase tracking-wider rounded-none hover:bg-[#a38241] transition-all shadow-xs"
                      >
                        Place Order
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
