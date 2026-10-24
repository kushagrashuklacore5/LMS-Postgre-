import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/auth';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Users, Clock, Copy, RefreshCw, Eye, EyeOff, CheckCircle, XCircle, AlertCircle, Trash } from 'lucide-react';

const InternalAdminPortal = () => {
  const { user, token, API: contextAPI } = useAuth();
  const navigate = useNavigate();
  const API = contextAPI || '/api';

  // Access control - only portal@core5.co.in can access
  useEffect(() => {
    if (!user || user.email !== 'portal@core5.co.in') {
      toast.error('Unauthorized access');
      navigate('/login');
      return;
    }
    
    console.log('✅ Portal access granted for:', user.email, '(role:', user.role, ')');
  }, [user, navigate]);

  const [activeTab, setActiveTab] = useState('create');
  const [superadmins, setSuperadmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});
  const [copiedCredentials, setCopiedCredentials] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Form state for creating superadmin
  const [formData, setFormData] = useState({
    email: '',
    subscriptionDuration: '',
    durationType: 'days'
  });

  // Fetch superadmins on component mount
  useEffect(() => {
    fetchSuperadmins();
  }, []);

  // Update current time every second for real-time countdown
  useEffect(() => {
    const timer = setInterval(() => {
      const newTime = new Date();
      console.log('⏰ Updating time:', newTime.toLocaleTimeString());
      setCurrentTime(newTime);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Force re-render when currentTime changes
  useEffect(() => {
    console.log('⏰ Time state changed:', currentTime.toLocaleTimeString());
  }, [currentTime]);

  // Force re-render when superadmins data changes
  useEffect(() => {
    console.log('👥 Superadmins data updated:', superadmins.length);
  }, [superadmins]);

  const fetchSuperadmins = async () => {
    try {
      setLoading(true);
      
      console.log('=== Starting fetchSuperadmins ===');
      console.log('API URL:', API);
      console.log('Token available:', !!token);
      console.log('User:', user);
      
      // First test if API is accessible
      console.log('Testing API connection...');
      try {
        const testResponse = await axios.get(`${API}/superadmin/internal/test`);
        console.log('API test successful:', testResponse.data);
      } catch (testError) {
        console.error('API test failed:', testError);
        console.error('Test error details:', {
          message: testError.message,
          code: testError.code,
          response: testError.response?.data,
          status: testError.response?.status
        });
        toast.error(`API connection failed: ${testError.message}`);
        setLoading(false);
        return;
      }
      
      // Now fetch superadmins
      console.log('Fetching superadmins...');
      const response = await axios.get(`${API}/superadmin/internal/superadmins`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('API Response:', response.data);
      
      if (response.data.success && response.data.data) {
        console.log('Superadmins received:', response.data.data.length);
        
        // Add simple timer calculation without extra API calls
        const superadminsWithTimers = response.data.data.map(superadmin => ({
          ...superadmin,
          exactTimer: superadmin.expires_at ? calculateTimeRemaining(superadmin.expires_at) : null
        }));
        
        console.log('Superadmins with timers:', superadminsWithTimers);
        setSuperadmins(superadminsWithTimers);
        setLoading(false);
        toast.success(`Loaded ${superadminsWithTimers.length} superadmins`);
      } else {
        console.error('Invalid response format:', response.data);
        setSuperadmins([]);
        setLoading(false);
        toast.error('Invalid response format from server');
      }
    } catch (error) {
      console.error('=== Fetch Error Details ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      toast.error(`Failed to fetch superadmins: ${errorMessage}`);
      setSuperadmins([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuperadmin = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.subscriptionDuration) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(
        `${API}/superadmin/internal/create-superadmin`,
        {
          email: formData.email,
          subscriptionDuration: parseInt(formData.subscriptionDuration),
          durationType: formData.durationType
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Superadmin created successfully!');
      setFormData({ email: '', subscriptionDuration: '', durationType: 'days' });
      fetchSuperadmins();
      
      // Show generated password
      console.log('Create superadmin response:', response.data);
      const newSuperadmin = response.data.data || response.data;
      console.log('New superadmin data:', newSuperadmin);
      
      if (newSuperadmin && newSuperadmin.generatedPassword) {
        setTimeout(() => {
          toast.success(`Password: ${newSuperadmin.generatedPassword}`, {
            autoClose: 10000
          });
        }, 1000);
      } else {
        console.error('Generated password not found in response');
        console.error('Response structure:', response);
        toast.error('Generated password not available in response');
      }
      
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create superadmin');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = (superadmin) => {
    const credentials = `Email: ${superadmin.email}\nPassword: ${superadmin.plainPassword || 'Password hidden'}`;
    navigator.clipboard.writeText(credentials);
    setCopiedCredentials({ ...copiedCredentials, [superadmin.id]: true });
    toast.success('Credentials copied to clipboard');
    setTimeout(() => {
      setCopiedCredentials({ ...copiedCredentials, [superadmin.id]: false });
    }, 2000);
  };

  const handleResetPassword = async (superadminId) => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${API}/superadmin/internal/reset-password`,
        { superadminId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`New password: ${response.data.newPassword}`, {
        autoClose: 10000
      });
      fetchSuperadmins();
    } catch (error) {
      toast.error('Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSuperadmin = async (superadminId, email) => {
    if (!window.confirm(`Are you sure you want to delete superadmin ${email}? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${API}/superadmin/internal/delete-superadmin`, {
        superadminId: superadminId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        toast.success('Superadmin deleted successfully!');
        fetchSuperadmins();
      } else {
        toast.error(response.data.message || 'Failed to delete superadmin');
      }
    } catch (error) {
      toast.error('Failed to delete superadmin');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableUser = async (superadminId) => {
    if (!window.confirm('Are you sure you want to disable this user?')) return;
    
    try {
      setLoading(true);
      await axios.post(
        `${API}/superadmin/internal/disable-user`,
        { superadminId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('User disabled successfully');
      fetchSuperadmins();
    } catch (error) {
      toast.error('Failed to disable user');
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (superadminId) => {
    setShowPasswords({
      ...showPasswords,
      [superadminId]: !showPasswords[superadminId]
    });
  };

  const calculateTimeRemaining = (expiresAt, serverTime = null) => {
    if (!expiresAt) return { expired: false, text: 'No expiry set' };
    
    // Use server time if available, otherwise use current time
    const now = serverTime ? new Date(serverTime) : currentTime;
    const expiry = new Date(expiresAt);
    const diff = expiry - now;
    
    console.log('⏰ Timer calculation:', {
      now: now.toISOString(),
      expiry: expiry.toISOString(),
      diff: diff
    });
    
    if (diff <= 0) return { expired: true, text: 'Expired' };
    
    // Calculate days, hours, minutes, seconds
    const totalSeconds = Math.floor(Math.abs(diff) / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;
    
    const result = {
      expired: diff <= 0,
      text: `${days}d ${hours}h ${minutes}m ${seconds}s left`,
      days,
      hours,
      minutes,
      seconds,
      totalSeconds
    };
    
    console.log('⏰ Timer result:', result);
    return result;
  };

  const getStatusColor = (expiresAt) => {
    const timeRemaining = calculateTimeRemaining(expiresAt);
    if (timeRemaining.expired) return 'text-red-600 bg-red-50';
    if (timeRemaining.days < 3) return 'text-orange-600 bg-orange-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusIcon = (expiresAt) => {
    const timeRemaining = calculateTimeRemaining(expiresAt);
    if (timeRemaining.expired) return <XCircle className="w-4 h-4" />;
    if (timeRemaining.days < 3) return <AlertCircle className="w-4 h-4" />;
    return <CheckCircle className="w-4 h-4" />;
  };

  if (!user || user.email !== 'portal@core5.co.in') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Unauthorized Access</h1>
          <p className="text-gray-600">You don't have permission to access this portal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      {/* Header */}
      <div className="bg-white shadow-sm border-b w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Internal Admin Portal</h1>
              <p className="text-sm text-gray-500">Manage Superadmin Accounts</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Logged in as: {user.email}</span>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  navigate('/login');
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="w-full px-4 sm:px-6 lg:px-8 mt-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('create')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'create'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Create Superadmin
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'manage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Manage Superadmins
            </button>
          </nav>
        </div>

        {/* Create Superadmin Tab */}
        {activeTab === 'create' && (
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg w-full">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Create New Superadmin Account
                </h3>
                <form onSubmit={handleCreateSuperadmin} className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="superadmin@example.com"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="subscriptionDuration" className="block text-sm font-medium text-gray-700">
                          Duration
                        </label>
                        <input
                          type="number"
                          id="subscriptionDuration"
                          value={formData.subscriptionDuration}
                          onChange={(e) => setFormData({ ...formData, subscriptionDuration: e.target.value })}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          placeholder="30"
                          min="1"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="durationType" className="block text-sm font-medium text-gray-700">
                          Type
                        </label>
                        <select
                          id="durationType"
                          value={formData.durationType}
                          onChange={(e) => setFormData({ ...formData, durationType: e.target.value })}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="days">Days</option>
                          <option value="months">Months</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {loading ? 'Creating...' : 'Create Superadmin'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Manage Superadmins Tab */}
        {activeTab === 'manage' && (
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg w-full">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Superadmin Accounts
                  </h3>
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-gray-500">
                      Last updated: {currentTime.toLocaleTimeString()}
                    </span>
                    <button
                      onClick={fetchSuperadmins}
                      disabled={loading}
                      className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto w-full">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Expiry Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Remaining Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {superadmins.map((superadmin) => {
                        // Use exact timer from superadmin frontend if available, otherwise fallback
                        const timeRemaining = superadmin.exactTimer || calculateTimeRemaining(superadmin.expires_at, superadmin.serverTime);
                        return (
                          <tr key={superadmin.id} className={timeRemaining.expired ? 'bg-red-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {superadmin.email}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {superadmin.created_at ? new Date(superadmin.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {superadmin.expires_at ? new Date(superadmin.expires_at).toLocaleDateString() : 'Not set'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {superadmin.expires_at ? (
                                <div className="flex items-center">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {timeRemaining.text}
                                </div>
                              ) : (
                                <span className="text-gray-400">Not set</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {superadmin.expires_at ? (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(superadmin.expires_at)}`}>
                                  {getStatusIcon(superadmin.expires_at)}
                                  <span className="ml-1">
                                    {timeRemaining.expired ? 'Expired' : 'Active'}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-50">
                                  <AlertCircle className="w-4 h-4" />
                                  <span className="ml-1">No expiry</span>
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleCopyCredentials(superadmin)}
                                  className="text-blue-600 hover:text-blue-900"
                                  title="Copy Credentials"
                                >
                                  {copiedCredentials[superadmin.id] ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteSuperadmin(superadmin.id, superadmin.email)}
                                  className="text-red-600 hover:text-red-900"
                                  title="Delete Superadmin"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {superadmins.length === 0 && (
                    <div className="text-center py-8 w-full">
                      <Users className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No superadmins</h3>
                      <p className="mt-1 text-sm text-gray-500">Get started by creating a new superadmin account.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InternalAdminPortal;
