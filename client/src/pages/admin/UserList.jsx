import { useState, useEffect } from 'react';
import { useAuth } from '../../auth/auth';
import AdminLayout from '../../components/AdminLayout';
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';
import ChangeStudentClassModal from '../../components/admin/ChangeStudentClassModal';
import {
  Search,
  Filter,
  RefreshCw,
  User,
  Users,
  UserCheck,
  MoreVertical,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const UserList = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const [userList, setUserList] = useState([]);
  const [classChangeStudent, setClassChangeStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    if (token) {
      console.log('🔄 Token available, fetching users...');
      getUsers();
    } else {
      console.warn('⚠️ No token available yet');
    }
  }, [token]);

  // Log state changes
  useEffect(() => {
    console.log('📊 UserList state updated:', {
      count: userList.length,
      users: userList,
      loading
    });
  }, [userList, loading]);

  const getUsers = async () => {
    if (!token) {
      console.warn('⚠️ getUsers: No token available');
      return;
    }

    try {
      setLoading(true);
      console.log('📡 Fetching users from:', `${API}/admin/users`);
      console.log('🔐 Token:', token.substring(0, 20) + '...');
      
      const response = await fetch(`${API}/admin/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📨 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error response:', errorText, 'Status:', response.status);
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('📦 Raw API response:', data);
      console.log('📦 Response type:', typeof data);
      console.log('📦 Is array?:', Array.isArray(data));
      console.log('📦 Response keys:', data ? Object.keys(data) : 'null');
      
      // Handle both array and object with 'value' property
      let users = [];
      
      // Try multiple extraction strategies
      if (Array.isArray(data)) {
        console.log('✅ Strategy 1: Response is array');
        users = data;
      } else if (data && data.value && Array.isArray(data.value)) {
        console.log('✅ Strategy 2: Has data.value property');
        users = data.value;
      } else if (data && typeof data === 'object') {
        // Check for 'value' property at any level
        const keys = Object.keys(data);
        console.log('📋 Object keys:', keys);
        
        // Last resort: extract any arrays from the object
        for (const key of keys) {
          if (Array.isArray(data[key])) {
            console.log('✅ Strategy 3: Found array in key:', key);
            users = data[key];
            break;
          }
        }
        
        // If still empty, try filtering for objects with 'id'
        if (users.length === 0) {
          const filtered = Object.values(data).filter(item => typeof item === 'object' && item !== null && item.id);
          if (filtered.length > 0) {
            console.log('✅ Strategy 4: Extracted objects with id property');
            users = filtered;
          }
        }
      }
      
      console.log('👥 Extracted users array:', users);
      console.log('👥 Users count:', users.length);
      
      if (users.length > 0) {
        console.log('✅ First user:', users[0]);
        console.log('✅ Setting userList with', users.length, 'users');
      } else {
        console.warn('⚠️ No users extracted from API response');
        console.warn('⚠️ Full data object:', JSON.stringify(data, null, 2));
      }
      
      setUserList(users);
      console.log('✅ setUserList called with:', users.length, 'users');

    } catch (error) {
      console.error('❌ Error loading users:', error);
      setUserList([]);
      toast.error(t('failed_to_load_users') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const removeUser = async (userId, userName) => {
    if (!confirm(t('confirm_delete_user', { name: userName }))) {
      return;
    }

    try {
      const response = await fetch(`${API}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('delete_failed'));
      }

      setUserList(userList.filter(user => user.id !== userId));
      toast.success(t('user_deleted_successfully'));

    } catch (error) {
      toast.error(t('could_not_delete_user'));
      console.error(error);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter users
  const filteredUsers = userList.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase()) ||
                         user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = role === 'all' || user.role === role;
    return matchesSearch && matchesRole;
  });

  // Sort users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aVal = a[sortField] || '';
    const bVal = b[sortField] || '';
    
    if (sortOrder === 'asc') {
      return aVal.toString().localeCompare(bVal.toString());
    } else {
      return bVal.toString().localeCompare(aVal.toString());
    }
  });

  // Pagination
  const totalPages = Math.ceil(sortedUsers.length / perPage);
  const startIndex = (page - 1) * perPage;
  const usersToShow = sortedUsers.slice(startIndex, startIndex + perPage);

  const roleStats = {
    student: userList.filter(u => u.role === 'student').length,
    mentor: userList.filter(u => u.role === 'mentor').length,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-4 md:p-6 bg-[#fffdf4] min-h-[80vh]">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-none h-12 w-12 border-4 border-[#B99652] border-t-transparent mx-auto"></div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('loading_users')}</p>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
            <div>
              <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('user_management')}</h1>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">{t('manage_all_user_accounts')}</p>
            </div>
            <button
              onClick={getUsers}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors self-start sm:self-auto shadow-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {t('refresh') || 'Refresh'}
            </button>
          </div>

          {/* Stats Grid */}
          <div data-tour="user-list-stats" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">{t('students')}</p>
                  <p className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-1">{roleStats.student}</p>
                </div>
                <div className="p-3 rounded-none bg-[#B99652]/10 text-[#B99652] border border-[#ebdcaa]">
                  <User size={22} />
                </div>
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">{t('mentors')}</p>
                  <p className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-1">{roleStats.mentor}</p>
                </div>
                <div className="p-3 rounded-none bg-[#B99652]/10 text-[#B99652] border border-[#ebdcaa]">
                  <UserCheck size={22} />
                </div>
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] border-l-4 border-l-[#B99652] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">{t('admins')}</p>
                  <p className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mt-1">{roleStats.admin}</p>
                </div>
                <div className="p-3 rounded-none bg-[#B99652]/10 text-[#B99652] border border-[#ebdcaa]">
                  <Users size={22} />
                </div>
              </div>
            </div>
          </div>

          {/* Filters Card */}
          <div data-tour="user-list-filters" className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-5 shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-2">{t('search')}</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={16} />
                  <input
                    type="text"
                    placeholder={t('search_name_or_email')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b] placeholder-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-2">{t('role')}</label>
                <div className="relative">
                  <Filter className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={16} />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b] appearance-none"
                  >
                    <option value="all">{t('all_roles')}</option>
                    <option value="student">{t('student')}</option>
                    <option value="mentor">{t('mentor')}</option>
                    <option value="admin">{t('admin')}</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearch('');
                    setRole('all');
                    setPage(1);
                  }}
                  className="w-full px-4 py-2.5 border border-[#ebdcaa] bg-white text-[#1e1b4b] hover:bg-[#ebdcaa]/30 rounded-none uppercase tracking-wider text-xs font-semibold transition-colors"
                >
                  {t('clear_filters')}
                </button>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-none border border-[#ebdcaa] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#fffdf4] border-b border-[#ebdcaa]">
                  <tr>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center space-x-1 text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] hover:text-[#B99652]"
                      >
                        <span>{t('name')}</span>
                        {sortField === 'name' && (
                          sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('email')}
                        className="flex items-center space-x-1 text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] hover:text-[#B99652]"
                      >
                        <span>{t('email_address')}</span>
                        {sortField === 'email' && (
                          sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('role')}
                        className="flex items-center space-x-1 text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] hover:text-[#B99652]"
                      >
                        <span>{t('role')}</span>
                        {sortField === 'role' && (
                          sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </button>
                    </th>
                    <th className="text-left p-4 text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                      {t('actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/40">
                  {usersToShow.map((user, index) => (
                    <tr key={user.id} data-tour={index === 0 ? 'user-list-first-record' : undefined} className="hover:bg-[#fffdf4] transition-colors">
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-none bg-[#B99652]/10 border border-[#ebdcaa] flex items-center justify-center">
                            <span className="font-bold text-xs text-[#B99652]">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-[#1e1b4b]">{user.name}</p>
                            <p className="text-xs text-slate-500">
                              {t('id_colon')} {user.id ? user.id.toString().substring(0, 8) : t('n_a')}
                              {user.role === 'student' && user.studentId && (
                                <span className="ml-2">• {t('roll_no_colon')} {user.studentId}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-slate-700">{user.email}</p>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-none text-[11px] uppercase tracking-wider font-semibold border ${
                          user.role === 'admin' 
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : user.role === 'mentor'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4">
                        {user.role === 'student' && (
                          <button
                            onClick={() => setClassChangeStudent(user)}
                            className="mr-2 px-3 py-1 bg-[#fffdf4] text-[#1e1b4b] border border-[#ebdcaa] hover:bg-[#f7efd2] rounded-none text-xs font-semibold uppercase tracking-wider transition-colors"
                          >
                            {t('change_class')}
                          </button>
                        )}
                        <button
                          onClick={() => removeUser(user.id, user.name)}
                          className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors"
                        >
                          {t('delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Empty State */}
            {usersToShow.length === 0 && (
              <div className="text-center py-12 bg-white">
                <User className="mx-auto text-[#ebdcaa]" size={48} />
                <p className="mt-4 text-base font-semibold text-[#1e1b4b]">{t('no_users_found')}</p>
                <p className="text-xs text-slate-500 mt-1">{t('try_different_search_or_filters')}</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-[#ebdcaa] bg-[#fffdf4] p-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                    {t('showing_count', { from: startIndex + 1, to: Math.min(startIndex + perPage, sortedUsers.length), total: sortedUsers.length })}
                  </p>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="px-3 py-1.5 border border-[#ebdcaa] bg-white rounded-none text-xs font-semibold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                    >
                      {t('previous')}
                    </button>
                    {[1, 2, 3].map(num => (
                      <button
                        key={num}
                        onClick={() => setPage(num)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                          page === num
                            ? 'bg-[#B99652] text-white border border-[#B99652]'
                            : 'border border-[#ebdcaa] bg-white text-[#1e1b4b] hover:bg-slate-50'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 border border-[#ebdcaa] bg-white rounded-none text-xs font-semibold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                    >
                      {t('next')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ChangeStudentClassModal
        open={!!classChangeStudent}
        student={classChangeStudent}
        onClose={() => setClassChangeStudent(null)}
      />
    </AdminLayout>
  );
};

export default UserList;
