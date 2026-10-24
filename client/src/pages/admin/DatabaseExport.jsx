import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../auth/auth';
import { useTranslation } from '../../context/TranslationContext';
import { Download, Database, FileSpreadsheet, RefreshCw, Eye, AlertCircle, CheckCircle, CheckCircle2, Circle, Users, GraduationCap, X, CheckSquare, Square, Layers, Sparkles } from 'lucide-react';
import QuotaLimitModal from '../../components/QuotaLimitModal';
import { downloadWithSession } from '../../config/download';

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
  const { t } = useTranslation();
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
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState(ALL_CATEGORY_IDS);
  const navigate = useNavigate();

  useEffect(() => {
    // DISABLED: Allow all users to access database export without restrictions
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
      setExportStatus({ type: 'success', message: `Downloaded ${tableName} Excel workbook successfully!` });
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setExportStatus({ type: 'error', message: err.message || `Failed to download ${tableName}` });
    }
  };

  const downloadFullDatabase = async () => {
    try {
      let categoriesParam = 'all';
      let label = 'full_database';

      if (exportScope === 'custom') {
        if (selectedCategories.length === 0) {
          setExportStatus({ type: 'error', message: 'Please select at least one category to export.' });
          return;
        }
        categoriesParam = selectedCategories.join(',');
        label = selectedCategories.join('_');
      }

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
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#ebdcaa] pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('database_export_title', 'Database Export')}</h1>
            <p className="text-gray-600 text-sm mt-1">{t('database_export_subtitle', 'Export SQLite database data to structured Excel format')}</p>
          </div>
          <button
            onClick={refreshData}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none font-medium text-sm transition-all shadow-sm"
          >
            <RefreshCw size={16} />
            {t('refresh', 'Refresh')}
          </button>
        </div>

        {/* Status Messages */}
        {exportStatus && (
          <div className={`p-4 rounded-none flex items-center gap-3 border ${
            exportStatus.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
            exportStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            'bg-[#fffdf4] text-[#1e1b4b] border-[#ebdcaa]'
          }`}>
            {exportStatus.type === 'error' && <AlertCircle size={20} />}
            {exportStatus.type === 'success' && <CheckCircle size={20} />}
            {exportStatus.type === 'info' && <RefreshCw size={20} className="animate-spin text-[#B99652]" />}
            <span className="font-medium text-sm">{exportStatus.message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-[#ebdcaa]">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2.5 px-2 border-b-2 font-semibold text-sm transition-all flex items-center ${
                activeTab === 'overview'
                  ? 'border-[#B99652] text-[#B99652]'
                  : 'border-transparent text-gray-500 hover:text-[#1e1b4b] hover:border-gray-300'
              }`}
            >
              <Database className="w-4 h-4 mr-2" />
              {t('overview', 'Overview')}
            </button>
            <button
              onClick={() => setActiveTab('tables')}
              className={`py-2.5 px-2 border-b-2 font-semibold text-sm transition-all flex items-center ${
                activeTab === 'tables'
                  ? 'border-[#B99652] text-[#B99652]'
                  : 'border-transparent text-gray-500 hover:text-[#1e1b4b] hover:border-gray-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {t('tab_tables', 'Tables')}
            </button>
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Database Stats */}
            {stats && (
              <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
                <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa]">{t('database_statistics', 'Database Statistics')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-none border border-[#ebdcaa]">
                    <div className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#B99652]">{stats.totalTables}</div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#1e1b4b] mt-1">{t('total_tables', 'Total Tables')}</div>
                  </div>
                  {Object.entries(stats.tables).slice(0, 3).map(([table, count]) => (
                    <div key={table} className="bg-white p-4 rounded-none border border-[#ebdcaa]">
                      <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{formatNumber(count)}</div>
                      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{table}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  Last export: {stats.exportDate ? new Date(stats.exportDate).toLocaleString() : 'Never'}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa]">Export Options</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 bg-white p-4 rounded-none border border-[#ebdcaa]">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#1e1b4b]">Language:</label>
                  <select
                    value={exportLang}
                    onChange={(e) => setExportLang(e.target.value)}
                    className="px-3 py-1.5 rounded-none border border-[#ebdcaa] bg-[#fffdf4] text-sm text-[#1e1b4b] focus:border-[#B99652] outline-none"
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center justify-center gap-3 p-6 bg-[#002366] text-white rounded-none hover:bg-[#001740] transition-all shadow-md group cursor-pointer border border-[#B99652]/40"
                >
                  <Database size={24} className="text-[#B99652] group-hover:scale-110 transition-transform" />
                  <div className="text-left">
                    <div className="font-bold text-base font-['DM_Serif_Display',serif]">Export Database (.xlsx)</div>
                    <div className="text-xs text-gray-200">Choose categories & download structured multi-tab Excel workbook</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-[#fffdf4] rounded-none p-6 border border-[#ebdcaa]">
              <h3 className="text-base font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-3">How to Export Data</h3>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700">
                <li>Click <strong>"Export Database (.xlsx)"</strong> to choose categories (Users, Academics, Finance, Exams) and download a clean multi-tab Excel workbook.</li>
                <li>Each selected table gets its own dedicated, beautifully styled Excel tab with frozen headers and auto-adjusted columns.</li>
                <li>Or go to the <strong>"Tables"</strong> tab to select and download specific individual tables.</li>
                <li>Downloaded Excel files are native <strong>.xlsx</strong> workbooks compatible with Microsoft Excel, Google Sheets, and Apple Numbers.</li>
              </ol>
            </div>
          </div>
        )}

        <QuotaLimitModal isOpen={showQuotaModal} onClose={() => { setShowQuotaModal(false); navigate('/admin/dashboard'); }} quotaDetails={quotaDetails} />

        {/* Category Export Selection Modal */}
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#FFFDF8] border-2 border-[#ebdcaa] shadow-[0_20px_60px_rgba(0,35,102,0.25)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-[#002366] text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#B99652]/20 rounded border border-[#B99652]/40 text-[#B99652]">
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold font-['DM_Serif_Display',serif]">Export Database to Excel (.xlsx)</h2>
                    <p className="text-xs text-gray-300">Choose which categories to include in your Excel workbook</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 max-h-[70vh]">
                {/* Master Option: Full Database */}
                <div
                  onClick={toggleAllMode}
                  className={`flex items-start gap-3.5 p-4 border cursor-pointer transition-all ${
                    isAllSelected
                      ? 'border-[#B99652] bg-[#fbf6e8] shadow-sm'
                      : 'border-[#ebdcaa]/70 bg-white hover:bg-[#ebdcaa]/10'
                  }`}
                >
                  <div className="pt-0.5 text-[#B99652]">
                    {isAllSelected ? (
                      <CheckCircle2 size={20} className="text-[#B99652]" />
                    ) : (
                      <Circle size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div className="p-2 bg-[#002366]/10 rounded text-[#002366] shrink-0">
                    <Database size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-[#1e1b4b]">Full Database Backup (All 56 Tables)</h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#002366] text-white shrink-0">
                        All 56 Tables
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Complete unified multi-sheet Excel backup with Overview KPI dashboard tab and individual sheets for every table in the LMS.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 pb-1 border-b border-[#ebdcaa]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
                    Or Choose Specific Categories
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={selectAllCategories}
                      className="text-[#B99652] font-semibold hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={deselectAllCategories}
                      className="text-gray-500 hover:text-[#1e1b4b]"
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
                        className={`flex items-start gap-3.5 p-3.5 border cursor-pointer transition-all ${
                          checked
                            ? 'border-[#B99652] bg-[#fbf6e8] shadow-sm'
                            : 'border-[#ebdcaa]/60 bg-white hover:bg-[#ebdcaa]/10'
                        }`}
                      >
                        <div className="pt-0.5 text-[#B99652]">
                          {checked ? (
                            <CheckSquare size={18} className="text-[#B99652]" />
                          ) : (
                            <Square size={18} className="text-gray-400" />
                          )}
                        </div>
                        <div className="p-2 bg-[#002366]/5 rounded text-[#002366] shrink-0">
                          <IconComponent size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-bold text-[#1e1b4b]">{cat.name}</h4>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#002366]/10 text-[#002366] shrink-0">
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
                <div className="pt-3 border-t border-[#ebdcaa] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#1e1b4b]">Workbook Language:</span>
                    <select
                      value={exportLang}
                      onChange={(e) => setExportLang(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-[#ebdcaa] bg-white text-[#1e1b4b] focus:border-[#B99652] outline-none"
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
              <div className="px-6 py-4 bg-[#f8f9fc] border-t border-[#ebdcaa] flex items-center justify-between">
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
                    className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!isAllSelected && selectedCategories.length === 0}
                    onClick={downloadFullDatabase}
                    className={`px-5 py-2 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all ${
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
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa]">Select Table</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {tables.map((table) => (
                  <button
                    key={table}
                    onClick={() => handleTableSelect(table)}
                    className={`p-3 rounded-none border transition-all text-xs font-semibold uppercase tracking-wider text-left flex items-center gap-2 ${
                      selectedTable === table
                        ? 'border-[#B99652] bg-[#B99652]/15 text-[#1e1b4b]'
                        : 'border-[#ebdcaa] bg-white hover:bg-[#ebdcaa]/15 text-gray-700'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#B99652] shrink-0" />
                    <span className="truncate">{table}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Table Details */}
            {selectedTable && (
              <>
                {/* Table Actions */}
                <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[#ebdcaa]">
                    <h2 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">Table: {selectedTable}</h2>
                    <button
                      onClick={() => downloadTableExcel(selectedTable)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-sm font-semibold transition-all shadow-sm"
                    >
                      <Download size={16} />
                      Export to Excel
                    </button>
                  </div>

                  {/* Table Structure */}
                  {tableStructure.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-[#1e1b4b] mb-3">Table Structure</h3>
                      <div className="overflow-x-auto border border-[#ebdcaa]">
                        <table className="min-w-full divide-y divide-[#ebdcaa]">
                          <thead className="bg-[#ebdcaa]/30">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">
                                Column Name
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">
                                Nullable
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider">
                                Default
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-[#ebdcaa]/50">
                            {tableStructure.map((column) => (
                              <tr key={column.cid} className="hover:bg-[#ebdcaa]/10">
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-[#1e1b4b]">
                                  {column.name}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                                  {column.type}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                                  {column.notnull ? 'No' : 'Yes'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
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
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#1e1b4b] mb-3">Data Preview (First 10 records)</h3>
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="animate-spin mr-2 text-[#B99652]" />
                        <span className="text-sm font-medium text-[#1e1b4b]">Loading preview...</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-[#ebdcaa]">
                        {tableData.length > 0 ? (
                          <table className="min-w-full divide-y divide-[#ebdcaa]">
                            <thead className="bg-[#ebdcaa]/30">
                              <tr>
                                {Object.keys(tableData[0]).map((key) => (
                                  <th
                                    key={key}
                                    className="px-4 py-3 text-left text-xs font-bold text-[#1e1b4b] uppercase tracking-wider whitespace-nowrap"
                                  >
                                    {key}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-[#ebdcaa]/50">
                              {tableData.slice(0, 10).map((row, index) => (
                                <tr key={index} className="hover:bg-[#ebdcaa]/10">
                                  {Object.values(row).map((value, cellIndex) => (
                                    <td
                                      key={cellIndex}
                                      className="px-4 py-3 whitespace-nowrap text-xs text-gray-700"
                                    >
                                      {value === null ? (
                                        <span className="text-gray-400 italic font-mono">NULL</span>
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
                          <div className="text-center py-8 text-gray-500 text-xs bg-white">
                            No records found in this table
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
    </AdminLayout>
  );
};

export default DatabaseExport;
