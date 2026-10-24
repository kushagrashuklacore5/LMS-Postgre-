import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { useTranslation } from '../context/TranslationContext';
import { Download, Database, FileSpreadsheet, RefreshCw, AlertCircle, CheckCircle, DollarSign, Receipt, Package, TrendingUp } from 'lucide-react';
import { downloadWithSession } from '../config/download';

const AccountantExport = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportStatus, setExportStatus] = useState(null);

  useEffect(() => {
    if (token && API) {
      fetchTables();
    }
  }, [token, API]);

  const fetchTables = async () => {
    try {
      const response = await fetch(`${API}/accountant-export/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setTables(data.tables || ['payments', 'feeStructures', 'expenses', 'inventory', 'orders']);
    } catch (error) {
      console.error('Error fetching tables:', error);
      setTables(['payments', 'feeStructures', 'expenses', 'inventory', 'orders']);
    } finally {
      setLoading(false);
    }
  };

  const downloadFullDatabase = () => {
    setExportStatus({ type: 'info', message: 'Downloading finance database...' });
    downloadWithSession(`${API}/accountant-export/database/excel`).catch((err) => alert(err.message));
    setTimeout(() => {
      setExportStatus({ type: 'success', message: 'Finance database export completed!' });
    }, 3000);
  };

  const downloadTable = (tableName) => {
    setExportStatus({ type: 'info', message: `Downloading ${tableName} data...` });
    downloadWithSession(`${API}/accountant-export/table/${tableName}/excel`).catch((err) => alert(err.message));
    setTimeout(() => {
      setExportStatus({ type: 'success', message: `${tableName} export completed!` });
    }, 2000);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loading_finance_export')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('database_export')}</h1>
          <p className="text-gray-600 mt-1">{t('export_payments_fees_expenses_inventory')}</p>
        </div>
        <button
          onClick={fetchTables}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <RefreshCw size={18} />
          {t('refresh')}
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

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">{t('accountant_export_features')}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={downloadFullDatabase}
            className="flex items-center justify-center gap-3 p-6 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Database size={24} />
            <div className="text-left">
              <div className="font-semibold text-lg">{t('download_full_database')}</div>
              <div className="text-sm opacity-90">{t('download_excel_files_for_analysis')}</div>
            </div>
          </button>
          
          <div className="p-6 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-center text-gray-600">
              <FileSpreadsheet size={24} className="mx-auto mb-2" />
              <div className="font-semibold">{t('database_export')}</div>
              <div className="text-sm">{t('sensitive_data_automatically_filtered')}</div>
            </div>
          </div>
        </div>
        
        {/* Tables List */}
        <div>
          <h3 className="text-lg font-medium mb-3">{t('download_full_database')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tables.map((table) => (
              <button
                key={table}
                onClick={() => downloadTable(table)}
                className="p-3 rounded-lg border-2 border-gray-200 hover:border-green-500 text-gray-700 hover:text-green-700 flex items-center gap-2 transition-colors"
              >
                {getTableIcon(table)}
                {table}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-green-50 rounded-lg p-6 border border-green-200">
        <h3 className="text-lg font-semibold text-green-900 mb-3">{t('accountant_export_features')}</h3>
        <ul className="list-disc list-inside space-y-2 text-green-800">
          <li>{t('access_only_finance_inventory')}</li>
          <li>{t('export_payments_fees_expenses_inventory')}</li>
          <li>{t('download_excel_files_for_analysis')}</li>
          <li>{t('sensitive_data_automatically_filtered')}</li>
        </ul>
      </div>
    </div>
  );
};

export default AccountantExport;
