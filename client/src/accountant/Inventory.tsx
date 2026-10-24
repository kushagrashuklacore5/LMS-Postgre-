import React, { useState, useMemo } from 'react';
import { Package, AlertCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/TranslationContext';

type Item = {
  id: string;
  name: string;
  category: 'Consumable' | 'Non-Consumable';
  quantity: number;
  unitPrice: number;
  vendorId?: string;
  purchaseDate?: string;
  description?: string;
};

const initial: Item[] = [
  { id: 'I1', name: 'Chalk', category: 'Consumable', quantity: 100, unitPrice: 2 },
  { id: 'I2', name: 'Whiteboard', category: 'Non-Consumable', quantity: 5, unitPrice: 2500 },
  { id: 'I3', name: 'Notebooks (Pack)', category: 'Consumable', quantity: 3, unitPrice: 250 },
  { id: 'I4', name: 'Desks', category: 'Non-Consumable', quantity: 20, unitPrice: 5000 },
];

export default function Inventory() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'Consumable'|'Non-Consumable'>('Consumable');
  const [items] = useState<Item[]>(initial);

  const filteredItems = useMemo(() => items.filter(i => i.category === tab), [items]);

  const stats = useMemo(() => ({
    total: filteredItems.length,
    lowStock: filteredItems.filter(i => i.quantity < 5).length,
    totalValue: filteredItems.reduce((s, i) => s + (i.quantity * i.unitPrice), 0),
  }), [filteredItems]);

  const goToStorekeeper = () => {
    navigate('/storekeeper');
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">{t('inventory_management')}</h1>
          <p className="text-gray-600 mt-2">{t('track_manage_school_inventory')}</p>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setTab('Consumable')} 
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              tab === 'Consumable' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg' 
                : 'bg-white text-slate-900 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {t('consumable')}
          </button>
          <button 
            onClick={() => setTab('Non-Consumable')} 
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              tab === 'Non-Consumable' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg' 
                : 'bg-white text-slate-900 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {t('non_consumable')}
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-blue-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('total_items')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total}</p>
              </div>
              <span className="text-3xl">📦</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-yellow-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('low_stock')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.lowStock}</p>
              </div>
              <span className="text-3xl">⚠</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-l-4 border-l-green-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{t('total_value')}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">₹{stats.totalValue.toLocaleString('en-IN')}</p>
              </div>
              <span className="text-3xl">💰</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Items List */}
          <div className="col-span-2">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-slate-900">{t('items_list')}</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredItems.map(i => (
                  <div key={i.id} className="p-6 hover:bg-slate-50 transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900">{i.name}</h3>
                        {i.description && <p className="text-gray-600 text-sm mt-1">{i.description}</p>}
                        <div className="flex gap-6 mt-3 text-sm text-gray-600">
                          <span>Quantity: <span className="font-semibold text-slate-900">{i.quantity}</span></span>
                          <span>Unit Price: <span className="font-semibold text-slate-900">₹{i.unitPrice.toLocaleString('en-IN')}</span></span>
                          <span>Total Value: <span className="font-semibold text-slate-900">₹{(i.quantity * i.unitPrice).toLocaleString('en-IN')}</span></span>
                        </div>
                      </div>
                      <div className="text-right">
                        {i.quantity < 5 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold">
                            <AlertCircle size={14} /> {t('low_stock')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
                            ✓ {t('in_stock')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Storekeeper Portal Link */}
          <div className="col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Package size={20} /> {t('storekeeper_portal')}
              </h3>
              <div className="space-y-4">
                <p className="text-gray-600 text-sm">
                  {t('storekeeper_portal_desc')}
                </p>
                <button 
                  onClick={goToStorekeeper} 
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-3 rounded-lg hover:shadow-lg transition font-semibold flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} />
                  {t('go_to_storekeeper_portal')}
                </button>
                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-800 mb-2">{t('quick_stats')}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('total_items')}:</span>
                      <span className="font-medium">{stats.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('low_stock')}:</span>
                      <span className="font-medium text-orange-600">{stats.lowStock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('total_value')}:</span>
                      <span className="font-medium">₹{stats.totalValue.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
