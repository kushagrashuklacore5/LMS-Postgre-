import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Package, AlertCircle, Edit2, Trash2, Search, ShoppingCart, X } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';
import { useAuth } from '../auth/auth';

type Item = {
  id: number;
  name: string;
  category: 'Consumable' | 'Non-Consumable';
  stock: number;
  unitPrice: number;
  vendorName?: string;
  purchaseDate?: string;
  description?: string;
  minStock: number;
};

type OrderItem = {
  itemId: number;
  itemName: string;
  unitPrice: number;
  orderQuantity: number;
  vendorName: string;
  totalPrice: number;
};

export default function InventoryManagement() {
  const { t } = useTranslation();
  const { token, API } = useAuth();
  console.log('InventoryManagement: Component rendering, token:', !!token, 'API:', API);
  
  const [tab, setTab] = useState<'Consumable'|'Non-Consumable'>('Consumable');
  const [items, setItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [form, setForm] = useState({ 
    name: '', 
    category: 'Consumable', 
    stock: 0, 
    unitPrice: 0, 
    vendorName: '',
    purchaseDate: '', 
    description: '',
    minStock: 10
  });
  const [loading, setLoading] = useState(false);

  // Load inventory from database on mount
  useEffect(() => {
    console.log('InventoryManagement component mounted');
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      console.log('loadInventory: Starting to load inventory...');
      console.log('API URL:', `${API}/storekeeper/inventory`);
      console.log('Token:', token ? 'Bearer ' + token.substring(0, 20) + '...' : 'No token');
      
      setLoading(true);
      const res = await fetch(`${API}/storekeeper/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('loadInventory: Response status:', res.status);
      console.log('loadInventory: Response headers:', res.headers);
      
      if (res.ok) {
        const data = await res.json();
        console.log('loadInventory: Success response:', data);
        if (data.success) {
          console.log('loadInventory: Setting items:', data.data);
          setItems(data.data || []);
        } else {
          console.error('loadInventory: API error:', data.message);
        }
      } else {
        console.error('loadInventory: HTTP error:', res.status, res.statusText);
      }
    } catch (error) {
      console.error('loadInventory: Network error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveItem = async (itemData: Partial<Item>) => {
    try {
      // Validate form data
      if (!itemData.name || !itemData.name.trim()) {
        alert('Item name is required');
        return;
      }
      
      if (!itemData.category || (itemData.category !== 'Consumable' && itemData.category !== 'Non-Consumable')) {
        alert('Category is required');
        return;
      }
      
      if (itemData.stock === undefined || itemData.stock < 0) {
        alert('Valid quantity is required');
        return;
      }
      
      if (!itemData.unitPrice || itemData.unitPrice < 0) {
        alert('Valid unit price is required');
        return;
      }
      
      if (!itemData.minStock || itemData.minStock < 0) {
        alert('Valid minimum stock level is required');
        return;
      }

      setLoading(true);
      const url = editingItem 
        ? `${API}/storekeeper/inventory/${editingItem.id}`
        : `${API}/storekeeper/inventory`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      console.log('Saving item:', { url, method, itemData });
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(itemData),
      });

      console.log('Response status:', res.status);
      const responseText = await res.text();
      console.log('Response text:', responseText);

      if (res.ok) {
        const data = JSON.parse(responseText);
        console.log('Success response:', data);
        if (data.success) {
          await loadInventory(); // Reload inventory
          setShowAddForm(false);
          setEditingItem(null);
          setForm({ 
            name: '', 
            category: form.category as 'Consumable' | 'Non-Consumable', 
            stock: 0, 
            unitPrice: 0, 
            vendorName: '',
            purchaseDate: '', 
            description: '',
            minStock: 10
          });
          alert('Item saved successfully!');
        } else {
          console.error('API error:', data.message);
          alert(data.message || 'Failed to save item');
        }
      } else {
        console.error('HTTP error:', res.status, responseText);
        alert(`Failed to save item: ${res.status} - ${responseText}`);
      }
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Error saving item');
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (itemId: number, itemName: string) => {
    if (!confirm(`Are you sure you want to delete ${itemName}?`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API}/storekeeper/inventory/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await loadInventory(); // Reload inventory
          alert(data.message);
        } else {
          alert(data.message || 'Failed to delete item');
        }
      } else {
        alert('Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Error deleting item');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(i => 
      i.category === tab && 
      i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, tab, searchTerm]);

  const stats = useMemo(() => ({
    total: filteredItems.length,
    lowStock: filteredItems.filter(i => i.stock <= i.minStock).length,
    totalValue: filteredItems.reduce((s, i) => s + (i.stock * i.unitPrice), 0),
  }), [filteredItems]);

  const handlePlaceOrder = (item: Item) => {
    setSelectedItem(item);
    setOrderQuantity(1);
    setShowOrderForm(true);
  };

  const submitOrder = () => {
    if (!selectedItem) return;

    // Create order object
    const order: OrderItem = {
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      unitPrice: selectedItem.unitPrice,
      orderQuantity: orderQuantity,
      vendorName: selectedItem.vendorName || 'Unknown Vendor',
      totalPrice: selectedItem.unitPrice * orderQuantity
    };

    // Save order to localStorage (keeping this for now)
    try {
      const existingOrders = localStorage.getItem('inventoryOrders');
      const orders = existingOrders ? JSON.parse(existingOrders) : [];
      orders.push({
        ...order,
        id: Date.now().toString(),
        orderDate: new Date().toISOString(),
        status: 'pending'
      });
      localStorage.setItem('inventoryOrders', JSON.stringify(orders));
    } catch (error) {
      console.error('Error saving order:', error);
    }

    // Update inventory quantity
    setItems(prevItems => 
      prevItems.map(item => 
        item.id === selectedItem.id 
          ? { ...item, stock: item.stock + orderQuantity }
          : item
      )
    );

    alert(`Order placed successfully!\nItem: ${selectedItem.name}\nQuantity: ${orderQuantity}\nTotal Price: ₹${order.totalPrice}\nVendor: ${order.vendorName}`);
    
    setShowOrderForm(false);
    setSelectedItem(null);
    setOrderQuantity(1);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-900">Inventory Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus size={16} />
            Add Item
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Package className="text-blue-600" size={24} />
            <div>
              <p className="text-sm text-blue-600 font-medium">{t('total_items')}</p>
              <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600" size={24} />
            <div>
              <p className="text-sm text-red-600 font-medium">{t('low_stock')}</p>
              <p className="text-2xl font-bold text-red-900">{stats.lowStock}</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Package className="text-green-600" size={24} />
            <div>
              <p className="text-sm text-green-600 font-medium">{t('total_value')}</p>
              <p className="text-2xl font-bold text-green-900">₹{stats.totalValue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t('search_items')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('Consumable')}
            className={`px-4 py-2 rounded-md transition ${
              tab === 'Consumable' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('consumable')}
          </button>
          <button
            onClick={() => setTab('Non-Consumable')}
            className={`px-4 py-2 rounded-md transition ${
              tab === 'Non-Consumable' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('non_consumable')}
          </button>
        </div>
      </div>

      {/* Inventory List */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('item_name')}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('quantity')}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('unit_price')}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('total_value')}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('vendor')}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('stock_status')}</th>
              <th className="text-left py-3 px-4 font-medium text-gray-700">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.description}</p>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    item.stock <= item.minStock 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {item.stock}
                  </span>
                </td>
                <td className="py-3 px-4">₹{item.unitPrice}</td>
                <td className="py-3 px-4 font-medium">₹{(item.stock * item.unitPrice).toLocaleString()}</td>
                <td className="py-3 px-4">
                  <span className="text-sm text-gray-600">{item.vendorName || 'N/A'}</span>
                </td>
                <td className="py-3 px-4">
                  {item.stock <= item.minStock ? (
                    <span className="flex items-center gap-1 text-red-600 text-sm">
                      <AlertCircle size={14} />
                      {t('low_stock')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-green-600 text-sm">
                      <Package size={14} />
                      {t('in_stock')}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePlaceOrder(item)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition flex items-center gap-1"
                    >
                      <ShoppingCart size={14} />
                      Order
                    </button>
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setForm({
                          name: item.name,
                          category: item.category,
                          stock: item.stock,
                          unitPrice: item.unitPrice,
                          vendorName: item.vendorName || '',
                          purchaseDate: item.purchaseDate || '',
                          description: item.description || '',
                          minStock: item.minStock
                        });
                        setShowAddForm(true);
                      }}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id, item.name)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Order Form Modal */}
      {showOrderForm && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{t('place_order')}</h3>
              <button
                onClick={() => {
                  setShowOrderForm(false);
                  setSelectedItem(null);
                  setOrderQuantity(1);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('item_name')}</label>
                <div className="p-2 bg-gray-50 rounded border">
                  <p className="font-medium">{selectedItem.name}</p>
                  <p className="text-sm text-gray-500">{t('current_stock')}: {selectedItem.stock} {t('units')}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('vendor')}</label>
                <div className="p-2 bg-gray-50 rounded border">
                  <p className="font-medium">{selectedItem.vendorName || 'Unknown Vendor'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('units_to_order')}</label>
                <input
                  type="number"
                  min="1"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('unit_price')}</label>
                  <div className="p-2 bg-gray-50 rounded border">
                    ₹{selectedItem.unitPrice}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Price</label>
                  <div className="p-2 bg-green-50 rounded border font-medium text-green-700">
                    ₹{(selectedItem.unitPrice * orderQuantity).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={submitOrder}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
                >
                  Place Order
                </button>
                <button
                  onClick={() => {
                    setShowOrderForm(false);
                    setSelectedItem(null);
                    setOrderQuantity(1);
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h3>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setEditingItem(null);
                  setForm({ 
                    name: '', 
                    category: form.category as 'Consumable' | 'Non-Consumable', 
                    stock: 0, 
                    unitPrice: 0, 
                    vendorName: '',
                    purchaseDate: '', 
                    description: '',
                    minStock: 10
                  });
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({...form, category: e.target.value as 'Consumable' | 'Non-Consumable'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Consumable">Consumable</option>
                  <option value="Non-Consumable">Non-Consumable</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm({...form, stock: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setForm({...form, unitPrice: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={form.vendorName}
                  onChange={(e) => setForm({...form, vendorName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock Level</label>
                <input
                  type="number"
                  min="0"
                  value={form.minStock}
                  onChange={(e) => setForm({...form, minStock: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    if (editingItem) {
                      saveItem({
                        name: form.name,
                        category: form.category as 'Consumable' | 'Non-Consumable',
                        stock: form.stock,
                        unitPrice: form.unitPrice,
                        vendorName: form.vendorName,
                        description: form.description,
                        minStock: form.minStock
                      });
                    } else {
                      saveItem({
                        name: form.name,
                        category: form.category as 'Consumable' | 'Non-Consumable',
                        stock: form.stock,
                        unitPrice: form.unitPrice,
                        vendorName: form.vendorName,
                        description: form.description,
                        minStock: form.minStock
                      });
                    }
                  }}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {editingItem ? 'Update Item' : 'Add Item'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingItem(null);
                    setForm({ 
                      name: '', 
                      category: form.category as 'Consumable' | 'Non-Consumable', 
                      stock: 0, 
                      unitPrice: 0, 
                      vendorName: '',
                      purchaseDate: '', 
                      description: '',
                      minStock: 10
                    });
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
