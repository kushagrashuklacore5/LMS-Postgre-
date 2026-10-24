import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { Download, Table, Database, FileText, Json, RefreshCw, Eye } from 'lucide-react';
import { downloadWithSession } from '../config/download';

const DataExport = () => {
  const { token, API } = useAuth();
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableData, setTableData] = useState([]);
  const [tableStructure, setTableStructure] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchTables();
    fetchStats();
  }, []);

  const fetchTables = async () => {
    try {
      const response = await fetch(`${API}/export/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setTables(data.tables || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API}/export/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchTableStructure = async (tableName) => {
    try {
      const response = await fetch(`${API}/export/table/${tableName}/structure`, {
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
      const response = await fetch(`${API}/export/table/${tableName}/data?limit=100`, {
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

  const downloadCSV = (tableName) => {
    downloadWithSession(`${API}/export/table/${tableName}/csv`).catch((err) => alert(err.message));
  };

  const downloadJSON = (tableName) => {
    downloadWithSession(`${API}/export/table/${tableName}/json`).catch((err) => alert(err.message));
  };

  const downloadFullDatabase = () => {
    downloadWithSession(`${API}/export/database/json`).catch((err) => alert(err.message));
  };

  const refreshData = () => {
    fetchTables();
    fetchStats();
    if (selectedTable) {
      fetchTableStructure(selectedTable);
      fetchTableData(selectedTable);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Export</h1>
          <p className="text-gray-600 mt-1">Extract and download data from SQLite database</p>
        </div>
        <button
          onClick={refreshData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Database className="inline-block w-4 h-4 mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'tables'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Table className="inline-block w-4 h-4 mr-2" />
            Tables
          </button>
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Database Stats */}
          {stats && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Database Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalTables}</div>
                  <div className="text-sm text-blue-800">Total Tables</div>
                </div>
                {Object.entries(stats.tables).map(([table, count]) => (
                  <div key={table} className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-lg font-semibold text-gray-800">{count.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">{table}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={downloadFullDatabase}
                className="flex items-center justify-center gap-3 p-4 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Database size={20} />
                <div className="text-left">
                  <div className="font-semibold">Export Full Database</div>
                  <div className="text-sm opacity-90">Download all tables as JSON</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tables Tab */}
      {activeTab === 'tables' && (
        <div className="space-y-6">
          {/* Table Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Select Table</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {tables.map((table) => (
                <button
                  key={table}
                  onClick={() => handleTableSelect(table)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedTable === table
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Table className="inline-block w-4 h-4 mr-2" />
                  {table}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Table Details */}
          {selectedTable && (
            <>
              {/* Table Actions */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Table: {selectedTable}</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadCSV(selectedTable)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <FileText size={16} />
                      CSV
                    </button>
                    <button
                      onClick={() => downloadJSON(selectedTable)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Json size={16} />
                      JSON
                    </button>
                  </div>
                </div>

                {/* Table Structure */}
                {tableStructure.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-3">Table Structure</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Column Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Nullable
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Default
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {tableStructure.map((column) => (
                            <tr key={column.cid}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {column.name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {column.type}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {column.notnull ? 'No' : 'Yes'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {column.dflt_value || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Table Data Preview */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Data Preview (First 100 records)</h3>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="animate-spin mr-2" />
                      Loading data...
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      {tableData.length > 0 ? (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              {Object.keys(tableData[0]).map((key) => (
                                <th
                                  key={key}
                                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {tableData.map((row, index) => (
                              <tr key={index}>
                                {Object.values(row).map((value, cellIndex) => (
                                  <td
                                    key={cellIndex}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                                  >
                                    {value === null ? (
                                      <span className="text-gray-400 italic">NULL</span>
                                    ) : (
                                      String(value)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          No data found in this table
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DataExport;
