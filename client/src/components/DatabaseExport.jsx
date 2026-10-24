import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { Download, Database, FileSpreadsheet, RefreshCw, Eye, AlertCircle, CheckCircle, CheckCircle2, Circle, Users, GraduationCap, X, CheckSquare, Square } from 'lucide-react';

const INDIVIDUAL_CATEGORIES = [
  {
    id: 'users',
    name: 'Users & Accounts',
    description: 'Students, Mentors, Admins, Roles, Subscriptions, Profiles & Credentials.',
    badge: '10 Tables',
    icon: Users
  },
  {
    id: 'academics',
    name: 'Academics & Classrooms',
    description: 'Classrooms, Courses, Modules, Attendance, Timetable, Student Progress & Results.',
    badge: '12 Tables',
    icon: GraduationCap
  },
  {
    id: 'finance',
    name: 'Finance & Payments',
    description: 'Fee structures, Invoices, Payment transactions, Installments & Expenses.',
    badge: '7 Tables',
    icon: FileSpreadsheet
  },
  {
    id: 'assessments',
    name: 'AI Assessments & LMS Exams',
    description: 'AI assessment agent, Quizzes, Submissions, Question banks, Attempts & Reports.',
    badge: '15 Tables',
    icon: CheckCircle
  },
  {
    id: 'operations',
    name: 'Campus & Operations',
    description: 'Announcements, Calendar events, Live classes, Inventory & Vendor records.',
    badge: '11 Tables',
    icon: RefreshCw
  }
];

const ALL_CATEGORY_IDS = INDIVIDUAL_CATEGORIES.map(c => c.id);

const DatabaseExport = () => {
  const { token, API } = useAuth();
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableData, setTableData] = useState([]);
  const [tableStructure, setTableStructure] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [exportStatus, setExportStatus] = useState(null);
  const [exportLang, setExportLang] = useState('en');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState(ALL_CATEGORY_IDS);

  useEffect(() => {
    fetchTables();
    fetchStats();
  }, []);

  const fetchTables = async () => {
    try {
      if (!token) {
        console.warn('No token available for database export');
        return;
      }
      
      const response = await fetch(`${API}/database-export/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setTables(data.tables || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
      // Don't show toast error for database export to prevent spam
      setExportStatus({ type: 'error', message: 'Failed to fetch tables' });
    }
  };

  const fetchStats = async () => {
    try {
      if (!token) {
        console.warn('No token available for database stats');
        return;
      }
      
      const response = await fetch(`${API}/database-export/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Don't show toast error for database export to prevent spam
    }
  };

  const fetchTableStructure = async (tableName) => {
    try {
      const response = await fetch(`${API}/database-export/table/${tableName}/structure`, {
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
      const response = await fetch(`${API}/database-export/table/${tableName}/data?limit=100`, {
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

  const toggleAllMode = () => {
    const isCurrentlyAll = exportScope === 'all' || selectedCategories.length === ALL_CATEGORY_IDS.length;
    if (isCurrentlyAll) {
      setExportScope('custom');
      setSelectedCategories([]);
    } else {
      setExportScope('all');
      setSelectedCategories([...ALL_CATEGORY_IDS]);
    }
  };

  const toggleCategory = (catId) => {
    if (exportScope === 'all') {
      // Switched from Full to Custom: deselect only the clicked category
      setExportScope('custom');
      setSelectedCategories(ALL_CATEGORY_IDS.filter(id => id !== catId));
    } else {
      if (selectedCategories.includes(catId)) {
        const next = selectedCategories.filter(id => id !== catId);
        setSelectedCategories(next);
      } else {
        const next = [...selectedCategories, catId];
        setSelectedCategories(next);
        if (next.length === ALL_CATEGORY_IDS.length) {
          setExportScope('all');
        }
      }
    }
  };

  const selectAllCategories = () => {
    setExportScope('all');
    setSelectedCategories([...ALL_CATEGORY_IDS]);
  };

  const deselectAllCategories = () => {
    setExportScope('custom');
    setSelectedCategories([]);
  };

  const downloadTableExcel = async (tableName) => {
    try {
      setExportStatus({ type: 'info', message: `Generating Excel workbook for ${tableName}...` });
      const response = await fetch(`${API}/database-export/table/${tableName}/excel?lang=${exportLang}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Download failed: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportStatus({ type: 'success', message: `${tableName} export completed!` });
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setExportStatus({ type: 'error', message: err.message || `Failed to download ${tableName}` });
    }
  };

  const downloadFullDatabase = async () => {
    try {
      const isAll = exportScope === 'all' || selectedCategories.length === ALL_CATEGORY_IDS.length;

      if (!isAll && selectedCategories.length === 0) {
        setExportStatus({ type: 'error', message: 'Please select at least one category to export.' });
        return;
      }
      const categoriesParam = isAll ? 'all' : selectedCategories.join(',');
      const label = isAll ? 'full_database' : selectedCategories.join('_');

      setExportStatus({ type: 'info', message: 'Generating Multi-Sheet Excel workbook...' });
      const response = await fetch(`${API}/database-export/database/excel?categories=${encodeURIComponent(categoriesParam)}&lang=${exportLang}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Download failed: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `core5_${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportStatus({ type: 'success', message: 'Multi-Sheet Excel workbook downloaded successfully!' });
      setShowExportModal(false);
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setExportStatus({ type: 'error', message: err.message || 'Failed to download database' });
    }
  };

  const refreshData = () => {
    fetchTables();
    fetchStats();
    if (selectedTable) {
      fetchTableStructure(selectedTable);
      fetchTableData(selectedTable);
    }
    setExportStatus({ type: 'success', message: 'Data refreshed successfully!' });
    setTimeout(() => setExportStatus(null), 2000);
  };

  const formatNumber = (num) => {
    return num ? num.toLocaleString() : '0';
  };

  const isAllSelected = exportScope === 'all' || selectedCategories.length === ALL_CATEGORY_IDS.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Database Export</h1>
          <p className="text-gray-600 mt-1">Export SQLite database data to Excel format</p>
        </div>
        <button
          onClick={refreshData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
            <FileSpreadsheet className="inline-block w-4 h-4 mr-2" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalTables}</div>
                  <div className="text-sm text-blue-800">Total Tables</div>
                </div>
                {Object.entries(stats.tables).slice(0, 3).map(([table, count]) => (
                  <div key={table} className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-lg font-semibold text-gray-800">{formatNumber(count)}</div>
                    <div className="text-sm text-gray-600">{table}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Last export: {stats.exportDate ? new Date(stats.exportDate).toLocaleString() : 'Never'}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Export Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm">Language:</label>
                  <select
                    value={exportLang}
                    onChange={(e) => setExportLang(e.target.value)}
                    className="px-2 py-1 rounded border"
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center justify-center gap-3 p-6 bg-[#002366] text-white rounded-lg hover:bg-[#001740] transition-all shadow-md cursor-pointer"
                >
                  <Database size={24} className="text-[#B99652]" />
                  <div className="text-left">
                    <div className="font-semibold text-lg">Export Database (.xlsx)</div>
                    <div className="text-sm opacity-90">Choose categories & download structured Excel workbook</div>
                  </div>
                </button>
              <div className="p-6 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-center text-gray-600">
                  <FileSpreadsheet size={24} className="mx-auto mb-2 text-[#B99652]" />
                  <div className="font-semibold">Export Individual Tables</div>
                  <div className="text-sm">Go to Tables tab</div>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">How to Export Data</h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800">
              <li>Click <strong>"Export Database (.xlsx)"</strong> to choose categories (Users, Academics, Finance, Exams) and download a multi-tab Excel workbook.</li>
              <li>Each selected table gets its own dedicated, styled Excel tab with frozen headers and auto-fitted columns.</li>
              <li>Or go to "Tables" tab to export individual tables.</li>
              <li>Excel files are native <strong>.xlsx</strong> files with proper formatting.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Category Export Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#002366] text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg text-[#B99652]">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Export Database to Excel (.xlsx)</h2>
                  <p className="text-xs text-white/70">Choose which categories to include in your Excel workbook</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 max-h-[70vh]">
              {/* Master Option: Full Database */}
              <div
                onClick={toggleAllMode}
                className={`flex items-start gap-3.5 p-4 rounded-lg border cursor-pointer transition-all ${
                  isAllSelected
                    ? 'border-[#002366] bg-blue-50/60 shadow-sm'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="pt-0.5 text-[#002366]">
                  {isAllSelected ? (
                    <CheckCircle2 size={20} className="text-[#002366]" />
                  ) : (
                    <Circle size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="p-2 bg-[#002366]/10 rounded-lg text-[#002366] shrink-0">
                  <Database size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-gray-900">Full Database Backup (All 56 Tables)</h4>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#002366] text-white shrink-0">
                      All 56 Tables
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Complete unified multi-sheet Excel backup with Overview KPI dashboard tab and individual sheets for every table in the LMS.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 pb-1 border-b">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Or Choose Specific Categories
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    className="text-[#002366] font-semibold hover:underline"
                    onClick={selectAllCategories}
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAllCategories}
                    className="text-gray-500 hover:text-gray-900"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Categories List */}
              <div className="space-y-2.5">
                {INDIVIDUAL_CATEGORIES.map((cat) => {
                  const checked = isAllSelected ? true : selectedCategories.includes(cat.id);
                  const IconComponent = cat.icon;

                  return (
                    <div
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex items-start gap-3.5 p-3.5 rounded-lg border cursor-pointer transition-all ${
                        checked
                          ? 'border-[#002366] bg-blue-50/50 shadow-sm'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="pt-0.5 text-[#002366]">
                        {checked ? (
                          <CheckSquare size={18} className="text-[#002366]" />
                        ) : (
                          <Square size={18} className="text-gray-400" />
                        )}
                      </div>
                      <div className="p-2 bg-gray-100 rounded-lg text-[#002366] shrink-0">
                        <IconComponent size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{cat.name}</h4>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0">
                            {cat.badge}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{cat.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Language Selection inside Modal */}
              <div className="pt-3 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">Workbook Language:</span>
                  <select
                    value={exportLang}
                    onChange={(e) => setExportLang(e.target.value)}
                    className="px-2.5 py-1 text-xs border rounded bg-white text-gray-800 outline-none"
                  >
                    <option value="en">English (Default)</option>
                    <option value="ar">Arabic (العربية)</option>
                  </select>
                </div>
                <div className="text-xs text-gray-500">
                  Format: <span className="font-semibold text-[#002366]">Microsoft Excel (.xlsx)</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between">
              <div className="text-xs text-gray-600">
                {isAllSelected
                  ? 'All 56 tables selected (Full Database)'
                  : selectedCategories.length === 0
                  ? 'No category selected (Please choose at least one)'
                  : `${selectedCategories.length} categories selected`}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!isAllSelected && selectedCategories.length === 0}
                  onClick={downloadFullDatabase}
                  className={`px-5 py-2 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition-all ${
                    !isAllSelected && selectedCategories.length === 0
                      ? 'bg-gray-400 cursor-not-allowed opacity-60'
                      : 'bg-[#002366] hover:bg-[#001740] cursor-pointer'
                  }`}
                >
                  <Download size={15} className="text-[#B99652]" />
                  Download Excel Workbook (.xlsx)
                </button>
              </div>
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
                  <FileSpreadsheet className="inline-block w-4 h-4 mr-2" />
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
                      onClick={() => downloadTableExcel(selectedTable)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <Download size={16} />
                      Export to Excel
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
                            {tableData.slice(0, 10).map((row, index) => (
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

export default DatabaseExport;
