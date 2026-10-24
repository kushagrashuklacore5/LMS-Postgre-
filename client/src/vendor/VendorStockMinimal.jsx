// Minimal vendor stock component - no JSX syntax to avoid Babel parser issues
import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';

const VendorStockMinimal = () => {
  const { API, token } = useAuth();
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('VendorStockMinimal component mounted');
    fetchStockItems();
  }, []);

  const fetchStockItems = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/vendor/stock`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStockItems(data.data || []);
          console.log('Stock items loaded:', data.data?.length || 0);
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return React.createElement('div', { className: 'flex items-center justify-center h-64' }, 
      React.createElement('div', { className: 'animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500' })
    );
  }

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'text-2xl font-bold text-gray-900' }, 'Stock Management'),
        React.createElement('p', { className: 'text-gray-600' }, 'Manage your material inventory and stock levels')
      ),
      React.createElement('button', {
        onClick: () => {
          console.log('Add Item button clicked');
          alert('Vendor Stock Working - No Babel Parser Issues!');
        },
        className: 'flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700'
      },
      React.createElement('span', null, 'Add Item')
      )
    ),
    React.createElement('div', { className: 'text-center' }, `Stock Items: ${stockItems.length}`)
  );
};

export default VendorStockMinimal;
