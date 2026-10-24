import React, { useState, useMemo } from 'react';
import { FileText, Download, TrendingUp, Package, Users2, AlertCircle } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';

export default function Reports() {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState<'inventory'>('inventory');

  const mockData = useMemo(() => {
    switch (reportType) {
      case 'inventory':
        return [
          { name: 'Chalk', quantity: 100, value: 200, category: 'Consumable' },
          { name: 'Whiteboard', quantity: 5, value: 12500, category: 'Non-Consumable' },
          { name: 'Notebooks', quantity: 50, value: 12500, category: 'Consumable' },
          { name: 'Desks', quantity: 20, value: 100000, category: 'Non-Consumable' },
        ];
      default:
        return [];
    }
  }, [reportType]);

  const stats = useMemo(() => {
    switch (reportType) {
      case 'inventory':
        const inventoryData = mockData as Array<{name: string, quantity: number, value: number, category: string}>;
        return {
          total: inventoryData.reduce((sum, item) => sum + item.quantity, 0),
          value: inventoryData.reduce((sum, item) => sum + item.value, 0),
          lowStock: inventoryData.filter(item => item.quantity < 10).length,
        };
      default:
        return { total: 0, value: 0, lowStock: 0 };
    }
  }, [mockData, reportType]);

  const downloadReport = () => {
    const csvContent = generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const generateCSV = () => {
    if (reportType === 'inventory') {
      const inventoryData = mockData as Array<{name: string, quantity: number, value: number, category: string}>;
      const headers = 'Item Name,Quantity,Value,Category\n';
      const rows = inventoryData.map(item => 
        `${item.name},${item.quantity},${item.value},${item.category}`
      ).join('\n');
      return headers + rows;
    }
    return '';
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-2">Generate and download various reports</p>
        </div>

        {/* Report Type Selector */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <button
            onClick={() => setReportType('inventory')}
            className={`px-6 py-3 rounded-lg font-medium transition ${
              reportType === 'inventory' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <Package size={18} className="inline mr-2" />
            Inventory Report
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Items</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              </div>
              <Package className="text-blue-500" size={32} />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Value</p>
                <p className="text-2xl font-bold text-slate-900">₹{stats.value.toLocaleString()}</p>
              </div>
              <TrendingUp className="text-green-500" size={32} />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Low Stock Items</p>
                <p className="text-2xl font-bold text-slate-900">{stats.lowStock}</p>
              </div>
              <AlertCircle className="text-orange-500" size={32} />
            </div>
          </div>
        </div>

        {/* Report Table */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900">Inventory Items</h2>
            <button
              onClick={downloadReport}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
            >
              <Download size={18} />
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  {reportType === 'inventory' && (
                    <>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Item Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Quantity</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Value</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {reportType === 'inventory' && (
                  (mockData as Array<{name: string, quantity: number, value: number, category: string}>).map((item, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">{item.name}</td>
                      <td className="py-3 px-4">{item.quantity}</td>
                      <td className="py-3 px-4">₹{item.value.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                          {item.category}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
