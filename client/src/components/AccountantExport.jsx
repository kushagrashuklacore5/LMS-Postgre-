import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { Download, Database, FileSpreadsheet, RefreshCw, Eye, AlertCircle, CheckCircle, DollarSign, Receipt, Package, TrendingUp } from 'lucide-react';
import { downloadWithSession } from '../config/download';

const AccountantExport = () => {
  const { token, API } = useAuth();
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableData, setTableData] = useState([]);
  const [tableStructure, setTableStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [exportStatus, setExportStatus] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (token && API) {
      fetchTables();
      fetchStats();
    }
  }, [token, API]);

  const fetchTables = async () => {
    try {
      const response = await fetch(`${API}/accountant-export/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setTables(data.tables || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
      setExportStatus({ type: 'error', message: 'Failed to fetch finance tables' });
      // Set default tables on error
      setTables(['payments', 'feeStructures', 'expenses', 'inventory', 'orders']);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API}/accountant-export/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Set default stats on error
      setStats({
        totalTables: 5,
        tables: {
          payments: 0,
          expenses: 0,
          inventory: 0,
          orders: 0,
          feeStructures: 0
        },
        financeSummary: {
          totalPayments: 0,
          totalExpenses: 0,
          totalFees: 0,
          totalOrders: 0,
          inventoryValue: 0,
          netBalance: 0
        },
        exportDate: new Date().toISOString()
      });
    }
  };

  const fetchTableStructure = async (tableName) => {
    try {
      const response = await fetch(`${API}/accountant-export/table/${tableName}/structure`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setTableStructure(data.columns || []);
    } catch (error) {
      console.error('Error fetching table structure:', error);
    }
  };

  const fetchTableData = async (tableName) => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/accountant-export/table/${tableName}/data?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setTableData(data.data || []);
    } catch (error) {
      console.error('Error fetching table data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = (tableName) => {
    setSelectedTable(tableName);
    fetchTableStructure(tableName);
    fetchTableData(tableName);
  };

  const downloadTableExcel = (tableName) => {
    setExportStatus({ type: 'info', message: `Downloading ${tableName} data...` });
    downloadWithSession(`${API}/accountant-export/table/${tableName}/excel`).catch((err) => alert(err.message));
    setTimeout(() => {
      setExportStatus({ type: 'success', message: `${tableName} export completed!` });
    }, 2000);
  };

  const downloadFullDatabase = () => {
    setExportStatus({ type: 'info', message: 'Downloading finance database...' });
    downloadWithSession(`${API}/accountant-export/database/excel`).catch((err) => alert(err.message));
    setTimeout(() => {
      setExportStatus({ type: 'success', message: 'Finance database export completed!' });
    }, 3000);
  };

  const refreshData = () => {
    fetchTables();
    fetchStats();
    if (selectedTable) {
      fetchTableStructure(selectedTable);
      fetchTableData(selectedTable);
    }
    setExportStatus({ type: 'success', message: 'Finance data refreshed successfully!' });
    setTimeout(() => setExportStatus(null), 2000);
  };

  const formatNumber = (num) => {
    return num ? num.toLocaleString() : '0';
  };

  const formatCurrency = (num) => {
    return num ? `₹${num.toLocaleString('en-IN')}` : '₹0';
  };

  const getTableIcon = (tableName) => {
    switch (tableName) {
      case 'payments': return <DollarSign size={16} />;
      case 'expenses': return <Receipt size={16} />;
      case 'inventory': return <Package size={16} />;
      case 'feeStructures': return <TrendingUp size={16} />;
      default: return <FileSpreadsheet size={16} />;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Initial Loading State */}
      {initialLoading && (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin h-10 w-10 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading Finance Export...</p>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      {!initialLoading && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Finance Export</h1>
              <p className="text-gray-600 mt-1">Export finance and inventory data to Excel format</p>
            </div>
            <button
              onClick={refreshData}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>

      {/* Status Messages */}
      {exportStatus && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          exportStatus.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
          exportStatus.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
          'bg-blue-50 text-blue-700 border-blue-200'
        } border`}>
          {exportStatus.type === 'error' && <AlertCircle size={20} />}
          {exportStatus.type === 'success' && <CheckCircle size={20} />}
          {exportStatus.type === 'info' && <RefreshCw size={20} className="animate-spin" />}
          <span className="font-medium">{exportStatus.message}</span>
        </div>
      )}

      {/* Simple Content */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Finance Export</h2>
        <p className="text-gray-600 mb-4">Export finance and inventory data to Excel format</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => downloadWithSession(`${API}/accountant-export/database/excel`).catch((err) => alert(err.message))}
            className="flex items-center justify-center gap-3 p-6 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Database size={24} />
            <div className="text-left">
              <div className="font-semibold text-lg">Export Finance Database</div>
              <div className="text-sm opacity-90">All finance tables in one Excel file</div>
            </div>
          </button>
          
          <div className="p-6 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center text-gray-600">
              <FileSpreadsheet size={24} className="mx-auto mb-2" />
              <div className="font-semibold">Individual Tables</div>
              <div className="text-sm">Select specific tables below</div>
            </div>
          </div>
        </div>
        
        {/* Tables List */}
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Available Finance Tables</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tables.map((table) => (
              <button
                key={table}
                onClick={() => downloadWithSession(`${API}/accountant-export/table/${table}/excel`).catch((err) => alert(err.message))}
                className="p-3 rounded-lg border-2 border-gray-200 hover:border-green-500 text-gray-700 hover:text-green-700 flex items-center gap-2"
              >
                {getTableIcon(table)}
                {table}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountantExport;
