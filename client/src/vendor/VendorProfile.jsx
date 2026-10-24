import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  Edit2,
  Save,
  X,
  Camera,
  Star,
  TrendingUp,
  Package,
  DollarSign
} from 'lucide-react';

const VendorProfile = () => {
  const { API, token } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    category: '',
    description: ''
  });
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
    averageRating: 0
  });

  useEffect(() => {
    fetchVendorProfile();
    fetchVendorStats();
  }, []);

  const fetchVendorProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/vendor/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendor(data.data);
          setFormData({
            name: data.data.name || '',
            email: data.data.email || '',
            phone: data.data.phone || '',
            address: data.data.address || '',
            category: data.data.category || '',
            description: data.data.description || ''
          });
        }
      }
    } catch (error) {
      console.error('Error fetching vendor profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendorStats = async () => {
    try {
      const res = await fetch(`${API}/vendor/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching vendor stats:', error);
    }
  };

  const handleSave = async () => {
    if (formData.phone && formData.phone.length !== 10) {
      alert("Phone number must be exactly 10 digits.");
      return;
    }

    try {
      const res = await fetch(`${API}/vendor/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendor(data.data);
          setEditing(false);
        }
      }
    } catch (error) {
      console.error('Error updating vendor profile:', error);
    }
  };

  const handleCancel = () => {
    if (vendor) {
      setFormData({
        name: vendor.name || '',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.address || '',
        category: vendor.category || '',
        description: vendor.description || ''
      });
    }
    setEditing(false);
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={i} size={16} className="text-yellow-400 fill-current" />);
    }
    
    if (hasHalfStar) {
      stars.push(<Star key="half" size={16} className="text-yellow-400 fill-current opacity-50" />);
    }
    
    const remainingStars = 5 - Math.ceil(rating);
    for (let i = 0; i < remainingStars; i++) {
      stars.push(<Star key={`empty-${i}`} size={16} className="text-gray-300" />);
    }
    
    return stars;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-600">Manage your vendor information</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit2 size={20} />
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            {/* Profile Picture */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                  {vendor?.name?.charAt(0)?.toUpperCase() || 'V'}
                </div>
                {editing && (
                  <button className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700">
                    <Camera size={16} />
                  </button>
                )}
              </div>
              
              <div className="mt-4 text-center">
                <h2 className="text-xl font-bold text-gray-900">{vendor?.name || 'Vendor Name'}</h2>
                <p className="text-gray-600">{vendor?.category || 'Category'}</p>
                
                {/* Rating */}
                <div className="flex items-center justify-center mt-2 space-x-1">
                  {renderStars(stats.averageRating || 0)}
                  <span className="text-sm text-gray-600 ml-1">
                    ({stats.averageRating?.toFixed(1) || '0.0'})
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Package size={20} className="text-blue-600" />
                  <span className="text-sm text-gray-600">Total Orders</span>
                </div>
                <span className="font-semibold text-gray-900">{stats.totalOrders}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <TrendingUp size={20} className="text-green-600" />
                  <span className="text-sm text-gray-600">Completed</span>
                </div>
                <span className="font-semibold text-gray-900">{stats.completedOrders}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <DollarSign size={20} className="text-purple-600" />
                  <span className="text-sm text-gray-600">Revenue</span>
                </div>
                <span className="font-semibold text-gray-900">
                  ₹{stats.totalRevenue?.toLocaleString('en-IN') || '0'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Business Information</h3>
              {editing && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Save size={16} />
                    <span>Save</span>
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center space-x-1 px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Business Name</label>
                    {editing ? (
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Building size={16} className="text-gray-400" />
                        <span className="text-gray-900">{vendor?.name || 'Not set'}</span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Email Address</label>
                    {editing ? (
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Mail size={16} className="text-gray-400" />
                        <span className="text-gray-900">{vendor?.email || 'Not set'}</span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Phone Number</label>
                    {editing ? (
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="10-digit mobile number"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Phone size={16} className="text-gray-400" />
                        <span className="text-gray-900">{vendor?.phone || 'Not set'}</span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Category</label>
                    {editing ? (
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Category</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Furniture">Furniture</option>
                        <option value="Stationery">Stationery</option>
                        <option value="Books">Books</option>
                        <option value="Lab Equipment">Lab Equipment</option>
                        <option value="Sports">Sports</option>
                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Package size={16} className="text-gray-400" />
                        <span className="text-gray-900">{vendor?.category || 'Not set'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Address</h4>
                {editing ? (
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your business address..."
                  />
                ) : (
                  <div className="flex items-start space-x-2">
                    <MapPin size={16} className="text-gray-400 mt-1" />
                    <span className="text-gray-900">{vendor?.address || 'No address provided'}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Business Description</h4>
                {editing ? (
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe your business, products, and services..."
                  />
                ) : (
                  <p className="text-gray-900">{vendor?.description || 'No description provided'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VendorProfile;
