import { useState, useEffect } from 'react';
import { databaseService } from '../services/databaseService';

// Generic persistence hook for any entity
export function usePersistentData<T>(
  entityName: string,
  loadFunction: () => Promise<any>,
  saveFunction: (data: T) => Promise<any>,
  updateFunction?: (id: string, data: T) => Promise<any>,
  deleteFunction?: (id: string) => Promise<any>
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await loadFunction();
      if (response.success) {
        setData(response.data || response[entityName] || []);
      } else {
        setError(response.message || `Failed to load ${entityName}`);
      }
    } catch (err) {
      setError(`Error loading ${entityName}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveData = async (newData: T) => {
    try {
      setError(null);
      const response = await saveFunction(newData);
      if (response.success) {
        await loadData(); // Reload data after save
        return response;
      } else {
        setError(response.message || `Failed to save ${entityName}`);
        throw new Error(response.message);
      }
    } catch (err) {
      setError(`Error saving ${entityName}: ${err.message}`);
      throw err;
    }
  };

  const updateData = async (id: string, updatedData: T) => {
    if (!updateFunction) {
      throw new Error('Update function not provided');
    }
    try {
      setError(null);
      const response = await updateFunction(id, updatedData);
      if (response.success) {
        await loadData(); // Reload data after update
        return response;
      } else {
        setError(response.message || `Failed to update ${entityName}`);
        throw new Error(response.message);
      }
    } catch (err) {
      setError(`Error updating ${entityName}: ${err.message}`);
      throw err;
    }
  };

  const deleteData = async (id: string) => {
    if (!deleteFunction) {
      throw new Error('Delete function not provided');
    }
    try {
      setError(null);
      const response = await deleteFunction(id);
      if (response.success) {
        await loadData(); // Reload data after delete
        return response;
      } else {
        setError(response.message || `Failed to delete ${entityName}`);
        throw new Error(response.message);
      }
    } catch (err) {
      setError(`Error deleting ${entityName}: ${err.message}`);
      throw err;
    }
  };

  const refreshData = () => {
    loadData();
  };

  return {
    data,
    loading,
    error,
    loadData,
    saveData,
    updateData,
    deleteData,
    refreshData
  };
}

// Specific hooks for common entities
export function usePersistentTransactions() {
  return usePersistentData(
    'transactions',
    databaseService.loadTransactions,
    databaseService.saveTransaction
  );
}

export function usePersistentClassrooms() {
  return usePersistentData(
    'classrooms',
    databaseService.loadClassrooms,
    databaseService.saveClassroom,
    databaseService.updateClassroom,
    databaseService.deleteClassroom
  );
}

export function usePersistentCourses() {
  return usePersistentData(
    'courses',
    databaseService.loadCourses,
    databaseService.saveCourse,
    databaseService.updateCourse,
    databaseService.deleteCourse
  );
}

export function usePersistentMaterials() {
  return usePersistentData(
    'materials',
    databaseService.loadMaterials,
    databaseService.saveMaterial,
    databaseService.updateMaterial,
    databaseService.deleteMaterial
  );
}

export function usePersistentUsers() {
  return usePersistentData(
    'users',
    databaseService.loadUsers,
    databaseService.saveUser,
    databaseService.updateUser
  );
}

export function usePersistentAssignments() {
  return usePersistentData(
    'assignments',
    databaseService.loadAssignments,
    databaseService.saveAssignment
  );
}

export function usePersistentAttendance() {
  return usePersistentData(
    'attendance',
    databaseService.loadAttendance,
    databaseService.saveAttendance
  );
}

export function usePersistentAnnouncements() {
  return usePersistentData(
    'announcements',
    databaseService.loadAnnouncements,
    databaseService.saveAnnouncement
  );
}

export function usePersistentCalendarEvents() {
  return usePersistentData(
    'events',
    databaseService.loadCalendarEvents,
    databaseService.saveCalendarEvent
  );
}

export function usePersistentResults() {
  return usePersistentData(
    'results',
    databaseService.loadResults,
    databaseService.saveResult
  );
}

export function usePersistentFeeStructures() {
  return usePersistentData(
    'feeStructures',
    databaseService.loadFeeStructures,
    databaseService.saveFeeStructure
  );
}

export function usePersistentRequirements() {
  return usePersistentData(
    'requirements',
    databaseService.loadRequirements,
    databaseService.saveRequirement
  );
}

export function usePersistentExpenses() {
  return usePersistentData(
    'expenses',
    databaseService.loadExpenses,
    databaseService.saveExpense
  );
}

export function usePersistentInventory() {
  return usePersistentData(
    'inventory',
    databaseService.loadInventory,
    databaseService.saveInventoryItem
  );
}
