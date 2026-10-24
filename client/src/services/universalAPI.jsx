// Comprehensive API Service for All LMS Entities
// This service handles all CRUD operations for every entity in the LMS

import axios from 'axios';
import { API_BASE } from '../config/api';

const API_BASE_URL = API_BASE;

class UniversalAPIService {
  constructor() {
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    axios.interceptors.request.use(
      (config) => {
        console.log(`🌐 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    axios.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ Response Error:', error);
        return Promise.reject(error);
      }
    );
  }

  // Generic CRUD operations
  async getAll(entityType) {
    try {
      const response = await axios.get(`${API_BASE_URL}/${entityType}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${entityType}:`, error);
      throw error;
    }
  }

  async getById(entityType, id) {
    try {
      const response = await axios.get(`${API_BASE_URL}/${entityType}/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${entityType} by ID:`, error);
      throw error;
    }
  }

  async create(entityType, data) {
    try {
      const response = await axios.post(`${API_BASE_URL}/${entityType}`, data);
      
      // Emit real-time event
      this.emitRealTimeUpdate(entityType, 'create', response.data);
      
      return response.data;
    } catch (error) {
      console.error(`Error creating ${entityType}:`, error);
      throw error;
    }
  }

  async update(entityType, id, data) {
    try {
      const response = await axios.put(`${API_BASE_URL}/${entityType}/${id}`, data);
      
      // Emit real-time event
      this.emitRealTimeUpdate(entityType, 'update', response.data);
      
      return response.data;
    } catch (error) {
      console.error(`Error updating ${entityType}:`, error);
      throw error;
    }
  }

  async delete(entityType, id) {
    try {
      const response = await axios.delete(`${API_BASE_URL}/${entityType}/${id}`);
      
      // Emit real-time event
      this.emitRealTimeUpdate(entityType, 'delete', { id });
      
      return response.data;
    } catch (error) {
      console.error(`Error deleting ${entityType}:`, error);
      throw error;
    }
  }

  // Real-time event emission
  emitRealTimeUpdate(entityType, action, data) {
    const event = new CustomEvent('data-updated', {
      detail: {
        type: entityType,
        action,
        data,
        timestamp: new Date().toISOString()
      }
    });
    
    window.dispatchEvent(event);
    console.log(`📡 Real-time update: ${action} ${entityType}`);
  }

  // Specific entity methods
  // Users
  async getUsers() {
    return this.getAll('users');
  }

  async createUser(userData) {
    return this.create('users', userData);
  }

  async updateUser(id, userData) {
    return this.update('users', id, userData);
  }

  async deleteUser(id) {
    return this.delete('users', id);
  }

  // Classrooms
  async getClassrooms() {
    return this.getAll('classrooms');
  }

  async createClassroom(classroomData) {
    return this.create('classrooms', classroomData);
  }

  async updateClassroom(id, classroomData) {
    return this.update('classrooms', id, classroomData);
  }

  async deleteClassroom(id) {
    return this.delete('classrooms', id);
  }

  // Courses
  async getCourses() {
    return this.getAll('courses');
  }

  async createCourse(courseData) {
    return this.create('courses', courseData);
  }

  async updateCourse(id, courseData) {
    return this.update('courses', id, courseData);
  }

  async deleteCourse(id) {
    return this.delete('courses', id);
  }

  // Materials
  async getMaterials() {
    return this.getAll('materials');
  }

  async createMaterial(materialData) {
    return this.create('materials', materialData);
  }

  async updateMaterial(id, materialData) {
    return this.update('materials', id, materialData);
  }

  async deleteMaterial(id) {
    return this.delete('materials', id);
  }

  // Assignments
  async getAssignments() {
    return this.getAll('assignments');
  }

  async createAssignment(assignmentData) {
    return this.create('assignments', assignmentData);
  }

  async updateAssignment(id, assignmentData) {
    return this.update('assignments', id, assignmentData);
  }

  async deleteAssignment(id) {
    return this.delete('assignments', id);
  }

  // Attendance
  async getAttendance() {
    return this.getAll('attendance');
  }

  async createAttendance(attendanceData) {
    return this.create('attendance', attendanceData);
  }

  async updateAttendance(id, attendanceData) {
    return this.update('attendance', id, attendanceData);
  }

  // Announcements
  async getAnnouncements() {
    return this.getAll('announcements');
  }

  async createAnnouncement(announcementData) {
    return this.create('announcements', announcementData);
  }

  async updateAnnouncement(id, announcementData) {
    return this.update('announcements', id, announcementData);
  }

  async deleteAnnouncement(id) {
    return this.delete('announcements', id);
  }

  // Calendar Events
  async getCalendarEvents() {
    return this.getAll('calendar');
  }

  async createCalendarEvent(eventData) {
    return this.create('calendar', eventData);
  }

  async updateCalendarEvent(id, eventData) {
    return this.update('calendar', id, eventData);
  }

  async deleteCalendarEvent(id) {
    return this.delete('calendar', id);
  }

  // Results
  async getResults() {
    return this.getAll('results');
  }

  async createResult(resultData) {
    return this.create('results', resultData);
  }

  async updateResult(id, resultData) {
    return this.update('results', id, resultData);
  }

  async deleteResult(id) {
    return this.delete('results', id);
  }

  // Requirements
  async getRequirements() {
    return this.getAll('requirements');
  }

  async createRequirement(requirementData) {
    return this.create('requirements', requirementData);
  }

  async updateRequirement(id, requirementData) {
    return this.update('requirements', id, requirementData);
  }

  async deleteRequirement(id) {
    return this.delete('requirements', id);
  }

  // Expenses
  async getExpenses() {
    return this.getAll('expenses');
  }

  async createExpense(expenseData) {
    return this.create('expenses', expenseData);
  }

  async updateExpense(id, expenseData) {
    return this.update('expenses', id, expenseData);
  }

  async deleteExpense(id) {
    return this.delete('expenses', id);
  }

  // Inventory
  async getInventory() {
    return this.getAll('inventory');
  }

  async createInventoryItem(itemData) {
    return this.create('inventory', itemData);
  }

  async updateInventoryItem(id, itemData) {
    return this.update('inventory', id, itemData);
  }

  async deleteInventoryItem(id) {
    return this.delete('inventory', id);
  }

  // Transactions (already implemented but included for completeness)
  async getTransactions() {
    return this.getAll('transactions');
  }

  async createTransaction(transactionData) {
    return this.create('transactions', transactionData);
  }

  // Bulk operations
  async bulkCreate(entityType, dataArray) {
    const results = [];
    for (const data of dataArray) {
      try {
        const result = await this.create(entityType, data);
        results.push(result);
      } catch (error) {
        console.error(`Error creating ${entityType}:`, error);
        results.push({ error: error.message, data });
      }
    }
    return results;
  }

  async bulkUpdate(entityType, updatesArray) {
    const results = [];
    for (const { id, data } of updatesArray) {
      try {
        const result = await this.update(entityType, id, data);
        results.push(result);
      } catch (error) {
        console.error(`Error updating ${entityType}:`, error);
        results.push({ error: error.message, id });
      }
    }
    return results;
  }

  async bulkDelete(entityType, idsArray) {
    const results = [];
    for (const id of idsArray) {
      try {
        const result = await this.delete(entityType, id);
        results.push(result);
      } catch (error) {
        console.error(`Error deleting ${entityType}:`, error);
        results.push({ error: error.message, id });
      }
    }
    return results;
  }

  // Search and filter
  async search(entityType, query) {
    try {
      const response = await axios.get(`${API_BASE_URL}/${entityType}/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error(`Error searching ${entityType}:`, error);
      throw error;
    }
  }

  async filter(entityType, filters) {
    try {
      const params = new URLSearchParams(filters);
      const response = await axios.get(`${API_BASE_URL}/${entityType}/filter?${params}`);
      return response.data;
    } catch (error) {
      console.error(`Error filtering ${entityType}:`, error);
      throw error;
    }
  }

  // Statistics and analytics
  async getStats(entityType) {
    try {
      const response = await axios.get(`${API_BASE_URL}/${entityType}/stats`);
      return response.data;
    } catch (error) {
      console.error(`Error getting stats for ${entityType}:`, error);
      throw error;
    }
  }

  // Export data
  async export(entityType, format = 'json') {
    try {
      const response = await axios.get(`${API_BASE_URL}/${entityType}/export?format=${format}`, {
        responseType: format === 'csv' ? 'blob' : 'json'
      });
      return response.data;
    } catch (error) {
      console.error(`Error exporting ${entityType}:`, error);
      throw error;
    }
  }

  // Import data
  async import(entityType, data, format = 'json') {
    try {
      const response = await axios.post(`${API_BASE_URL}/${entityType}/import?format=${format}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error importing ${entityType}:`, error);
      throw error;
    }
  }
}

// Create singleton instance
export const universalAPI = new UniversalAPIService();

// Export individual methods for convenience
export const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAttendance,
  createAttendance,
  updateAttendance,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getResults,
  createResult,
  updateResult,
  deleteResult,
  getRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getTransactions,
  createTransaction,
  bulkCreate,
  bulkUpdate,
  bulkDelete,
  search,
  filter,
  getStats,
  export: exportData,
  import: importData
} = universalAPI;
