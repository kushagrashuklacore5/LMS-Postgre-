// Universal Database Persistence System
// This system automatically saves all data to the database and loads it on page refresh

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';

const API_BASE_URL = API_BASE;

// Universal persistence hook for any data type
export function useUniversalPersistence(entityType, initialData = []) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load data from database on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to load from database
      const response = await axios.get(`${API_BASE_URL}/${entityType}`);
      
      if (response.data.success) {
        const dbData = response.data.data || response.data[entityType] || response.data.transactions || [];
        setData(dbData);
        console.log(`✅ Loaded ${dbData.length} ${entityType} from database`);
      } else {
        console.warn(`⚠️ No ${entityType} found in database, using initial data`);
        setData(initialData);
      }
    } catch (err) {
      console.error(`❌ Error loading ${entityType}:`, err);
      setError(`Failed to load ${entityType}`);
      // Use initial data as fallback
      setData(initialData);
    } finally {
      setLoading(false);
    }
  }, [entityType, initialData]);

  // Save data to database
  const saveData = useCallback(async (newData) => {
    try {
      setError(null);
      
      // Save to database
      const response = await axios.post(`${API_BASE_URL}/${entityType}`, newData);
      
      if (response.data.success) {
        console.log(`✅ Saved ${entityType} to database`);
        // Reload data to get the latest from database
        await loadData();
        return response.data;
      } else {
        throw new Error(response.data.message || `Failed to save ${entityType}`);
      }
    } catch (err) {
      console.error(`❌ Error saving ${entityType}:`, err);
      setError(`Failed to save ${entityType}`);
      throw err;
    }
  }, [entityType, loadData]);

  // Update data in database
  const updateData = useCallback(async (id, updatedData) => {
    try {
      setError(null);
      
      const response = await axios.put(`${API_BASE_URL}/${entityType}/${id}`, updatedData);
      
      if (response.data.success) {
        console.log(`✅ Updated ${entityType} in database`);
        await loadData();
        return response.data;
      } else {
        throw new Error(response.data.message || `Failed to update ${entityType}`);
      }
    } catch (err) {
      console.error(`❌ Error updating ${entityType}:`, err);
      setError(`Failed to update ${entityType}`);
      throw err;
    }
  }, [entityType, loadData]);

  // Delete data from database
  const deleteData = useCallback(async (id) => {
    try {
      setError(null);
      
      const response = await axios.delete(`${API_BASE_URL}/${entityType}/${id}`);
      
      if (response.data.success) {
        console.log(`✅ Deleted ${entityType} from database`);
        await loadData();
        return response.data;
      } else {
        throw new Error(response.data.message || `Failed to delete ${entityType}`);
      }
    } catch (err) {
      console.error(`❌ Error deleting ${entityType}:`, err);
      setError(`Failed to delete ${entityType}`);
      throw err;
    }
  }, [entityType, loadData]);

  // Add item to local state and database
  const addItem = useCallback(async (item) => {
    // Add to local state immediately for UI responsiveness
    const newItem = { ...item, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setData(prev => [newItem, ...prev]);
    
    // Save to database
    try {
      await saveData(newItem);
    } catch (err) {
      // Rollback local state if database save fails
      setData(prev => prev.filter(i => i.id !== newItem.id));
      throw err;
    }
  }, [saveData]);

  // Update item in local state and database
  const updateItem = useCallback(async (id, updates) => {
    // Update local state immediately
    setData(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    ));
    
    // Update in database
    try {
      await updateData(id, updates);
    } catch (err) {
      // Rollback local state if database update fails
      await loadData();
      throw err;
    }
  }, [updateData, loadData]);

  // Remove item from local state and database
  const removeItem = useCallback(async (id) => {
    // Remove from local state immediately
    const originalData = [...data];
    setData(prev => prev.filter(item => item.id !== id));
    
    // Delete from database
    try {
      await deleteData(id);
    } catch (err) {
      // Rollback local state if database delete fails
      setData(originalData);
      throw err;
    }
  }, [data, deleteData]);

  return {
    data,
    loading,
    error,
    loadData,
    saveData,
    updateData,
    deleteData,
    addItem,
    updateItem,
    removeItem,
    refreshData: loadData
  };
}

// Specific hooks for common entities
export function usePersistentUsers() {
  return useUniversalPersistence('users');
}

export function usePersistentClassrooms() {
  return useUniversalPersistence('classrooms');
}

export function usePersistentCourses() {
  return useUniversalPersistence('courses');
}

export function usePersistentMaterials() {
  return useUniversalPersistence('materials');
}

export function usePersistentAssignments() {
  return useUniversalPersistence('assignments');
}

export function usePersistentAttendance() {
  return useUniversalPersistence('attendance');
}

export function usePersistentAnnouncements() {
  return useUniversalPersistence('announcements');
}

export function usePersistentCalendarEvents() {
  return useUniversalPersistence('calendar');
}

export function usePersistentResults() {
  return useUniversalPersistence('results');
}

export function usePersistentRequirements() {
  return useUniversalPersistence('requirements');
}

export function usePersistentExpenses() {
  return useUniversalPersistence('expenses');
}

export function usePersistentInventory() {
  return useUniversalPersistence('inventory');
}

// Auto-save hook for forms
export function useAutoSave(data, entityType, delay = 1000) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    if (!data || !entityType) return;

    const timeoutId = setTimeout(async () => {
      try {
        setSaving(true);
        await axios.post(`${API_BASE_URL}/${entityType}`, data);
        setLastSaved(new Date());
        console.log(`✅ Auto-saved ${entityType}`);
      } catch (err) {
        console.error(`❌ Auto-save failed for ${entityType}:`, err);
      } finally {
        setSaving(false);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [data, entityType, delay]);

  return { saving, lastSaved };
}

// Real-time sync hook
export function useRealTimeSync(entityType) {
  const [updates, setUpdates] = useState([]);
  const { data, refreshData } = useUniversalPersistence(entityType);

  useEffect(() => {
    // Listen for real-time updates
    const handleUpdate = (event) => {
      if (event.detail?.type === entityType) {
        setUpdates(prev => [event.detail, ...prev.slice(0, 9)]); // Keep last 10 updates
        refreshData();
      }
    };

    window.addEventListener('data-updated', handleUpdate);
    return () => window.removeEventListener('data-updated', handleUpdate);
  }, [entityType, refreshData]);

  return { data, updates, refreshData };
}
