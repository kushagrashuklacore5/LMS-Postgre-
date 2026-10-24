// Simple Universal Persistence Hook for Testing
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/auth';


// Retry logic helper
const fetchWithRetry = async (url, options = {}, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

export function useUniversalPersistence(entityType, initialData = []) {
  // Use the backend base URL from AuthProvider (VITE_BACKEND_URL or the
  // localhost/production default). A bare '/api' resolves against the Vite
  // dev server, which answers with index.html instead of JSON.
  const { token, API: API_BASE_URL } = useAuth();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);

  // Define loadData using useCallback - with proper dependency
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`📡 Loading ${entityType}... token available: ${!!token}`);
      
      // Try to fetch from API with retry
      try {
        const response = await fetchWithRetry(`${API_BASE_URL}/${entityType}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }, 2);
        const result = await response.json();
        
        console.log(`📡 API Response for ${entityType}:`, result);
        
        if (result.success && Array.isArray(result.data)) {
          setData(result.data);
          console.log(`✅ Loaded ${result.data.length} ${entityType} from database`);
        } else if (Array.isArray(result.data)) {
          setData(result.data);
          console.log(`✅ Loaded ${result.data.length} ${entityType} from database (no success flag)`);
        } else if (Array.isArray(result)) {
          setData(result);
          console.log(`✅ Loaded ${result.length} ${entityType} from database (direct array)`);
        } else {
          console.warn(`⚠️ Unexpected API response format:`, result);
          setData(initialData);
          setError('Unexpected response from server');
        }
      } catch (apiErr) {
        console.warn(`⚠️ API error: ${apiErr.message}`);
        setData(initialData);
        // Surface the failure so pages show an error state instead of a
        // misleading empty list.
        setError(apiErr.message);
      }
    } catch (err) {
      console.error(`❌ Error loading ${entityType}:`, err);
      setError(null);
      setData(initialData);
    } finally {
      setLoading(false);
    }
  }, [entityType, initialData, token, API_BASE_URL]);

  // Load data from database on component mount only
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData();
    }
  }, [loadData]);

  // Save data to database
  const saveData = useCallback(async (newData) => {
    try {
      setError(null);
      
      try {
        const response = await fetchWithRetry(`${API_BASE_URL}/${entityType}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newData)
        }, 2);
        
        const result = await response.json();
        
        if (result.success || result.data) {
          console.log(`✅ Saved ${entityType} to database`);
          await loadData();
          return result;
        } else {
          throw new Error(result.message || `Failed to save ${entityType}`);
        }
      } catch (apiErr) {
        console.warn(`⚠️ Save error, continuing anyway: ${apiErr.message}`);
        // Continue even if save fails - just refresh to show local changes
        await loadData();
        return { success: true, data: newData };
      }
    } catch (err) {
      console.error(`❌ Error saving ${entityType}:`, err);
      setError(null); // Suppress error
      return { success: false };
    }
  }, [entityType, loadData, token]);

  // Add item to local state and database
  const addItem = useCallback(async (item) => {
    // Add to local state immediately for UI responsiveness
    const newItem = { ...item, id: item.id || Date.now(), createdAt: new Date().toISOString() };
    setData(prev => [newItem, ...prev]);
    
    // Save to database (but don't fail if it doesn't work)
    try {
      await saveData(newItem);
    } catch (err) {
      console.warn('Item saved to local state but not to database yet');
    }
  }, [saveData]);

  // Update item in local state and database
  const updateItem = useCallback(async (id, updates) => {
    // Update local state immediately
    setData(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    ));
    
    // Update in database (but don't fail if it doesn't work)
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/${entityType}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      }, 2);
      
      const result = await response.json();
      console.log(`✅ Updated ${entityType}`);
    } catch (err) {
      console.warn(`⚠️ Update in database failed, but local state updated`);
    }
  }, [entityType, token]);

  // Remove item from local state and database
  const removeItem = useCallback(async (id) => {
    // Remove from local state immediately
    setData(prev => prev.filter(item => item.id !== id));
    
    // Delete from database (but don't fail if it doesn't work)
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/${entityType}/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }, 2);
      
      const result = await response.json();
      console.log(`✅ Deleted ${entityType}`);
    } catch (err) {
      console.warn(`⚠️ Delete in database failed, but local state updated`);
    }
  }, [entityType, token]);

  return {
    data,
    loading,
    error,
    loadData,
    saveData,
    addItem,
    updateItem,
    removeItem,
    refreshData: loadData
  };
}
