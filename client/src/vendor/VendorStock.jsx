import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { Plus, Package, AlertTriangle, X } from 'lucide-react';

const VendorStock = () => {
  const { API, token, user } = useAuth();
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'General',
    quantity: 0,
    unitPrice: 0,
    minStock: 10,
    description: ''
  });

  useEffect(() => {
    const fetchStock = async () => {
      try {
        console.log('🔍 Fetching vendor stock...');
        console.log('🔍 API URL:', `${API}/vendor/stock`);
        console.log('🔍 Token available:', !!token);
        console.log('🔍 User from auth:', user);
        
        if (!token) {
          console.log('❌ No token available');
          setStockItems([]);
          return;
        }
        
        console.log('🔍 Making API call...');
        const res = await fetch(`${API}/vendor/stock`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
        
        console.log('🔍 Response status:', res.status);
        console.log('🔍 Response ok:', res.ok);
        
        if (res.ok) {
          const data = await res.json();
          console.log('🔍 Stock API response:', data);
          console.log('🔍 Stock data length:', data.data?.length || 0);
          console.log('🔍 Stock items:', data.data);
          
          if (data.success && data.data) {
            setStockItems(data.data);
            console.log('✅ Stock items set:', data.data.length);
          } else {
            console.log('❌ No stock data in response');
            setStockItems([]);
          }
        } else {
          console.error('❌ Failed to fetch stock:', res.status, res.statusText);
          setStockItems([]);
        }
      } catch (error) {
        console.error('❌ Error fetching stock:', error);
        setStockItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, [API, token, user]);

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.category || newItem.quantity < 0 || newItem.unitPrice < 0) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const res = await fetch(`${API}/vendor/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newItem.name,
          category: newItem.category,
          quantity: newItem.quantity,
          unitPrice: newItem.unitPrice,
          minStock: newItem.minStock,
          description: newItem.description
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStockItems([...stockItems, data.data]);
          setNewItem({
            name: '',
            category: 'General',
            quantity: 0,
            unitPrice: 0,
            minStock: 10,
            description: ''
          });
          setShowAddModal(false);
        }
      }
    } catch (error) {
      console.error('Add item error:', error);
      alert('Failed to add item');
    }
  };

  const getStockStatus = (quantity, minStock) => {
    if (quantity === 0) return { status: 'out', color: 'red', text: 'Out of Stock' };
    if (quantity <= minStock) return { status: 'critical', color: 'orange', text: 'Critical' };
    return { status: 'in', color: 'green', text: 'In Stock' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Management</h1>
          <p className="text-gray-600">Manage your material inventory and stock levels</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Stock Cards Grid */}
      <div className="responsive-grid">
        {stockItems.map((item) => {
          const stockStatus = getStockStatus(item.quantity, item.min_stock || 10);
          
          return (
            <div key={item.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              {/* Status Badge */}
              <div className={`px-3 py-2 text-center text-white text-sm font-medium ${
                stockStatus.color === 'green' ? 'bg-green-500' :
                stockStatus.color === 'orange' ? 'bg-orange-500' : 'bg-red-500'
              }`}>
                {stockStatus.text}
              </div>
              
              {/* Card Content */}
              <div className="responsive-card-content">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Package className="w-5 h-5 text-gray-400" />
                    <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                  </div>
                  {stockStatus.status === 'critical' && (
                    <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Available Quantity</span>
                    <span className={`font-bold text-lg ${
                      stockStatus.color === 'green' ? 'text-green-600' :
                      stockStatus.color === 'orange' ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {item.quantity}
                    </span>
                  </div>
                  
                  {item.min_stock && (
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Min Threshold</span>
                      <span>{item.min_stock}</span>
                    </div>
                  )}
                  
                  {item.category && (
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Category</span>
                      <span>{item.category}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Empty State */}
        {stockItems.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Stock Items</h3>
            <p className="text-gray-500 mb-4">Add your first stock item to get started</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Item</span>
            </button>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add Stock Item</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter item name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="General">General</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Books">Books</option>
                  <option value="Furniture">Furniture</option>
                  <option value="Stationery">Stationery</option>
                  <option value="Lab Equipment">Lab Equipment</option>
                  <option value="Sports">Sports</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter quantity"
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Price ($) *
                  </label>
                  <input
                    type="number"
                    value={newItem.unitPrice}
                    onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Enter unit price"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Stock Level (Optional)
                </label>
                <input
                  type="number"
                  value={newItem.minStock}
                  onChange={(e) => setNewItem({ ...newItem, minStock: parseInt(e.target.value) || 10 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Minimum stock level"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Stock will be marked as critical when quantity reaches this level
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter item description"
                  rows="3"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorStock;
