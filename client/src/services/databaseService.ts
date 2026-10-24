// Database persistence service for all LMS entities
import axios from 'axios';
import { API_BASE } from '../config/api';

const API_BASE_URL = API_BASE;

class DatabasePersistenceService {
  // Transactions
  async saveTransaction(transaction) {
    try {
      const response = await axios.post(`${API_BASE_URL}/transactions`, {
        studentId: transaction.studentId,
        amount: transaction.amount,
        type: transaction.paymentOption,
        status: transaction.status.toLowerCase(),
        transactionId: transaction.id,
        description: `Payment for ${transaction.studentName} - ${transaction.paymentOption}`,
        studentName: transaction.studentName,
        classroom: transaction.classroom,
        grade: transaction.grade,
        feeCategory: transaction.feeCategory
      });
      return response.data;
    } catch (error) {
      console.error('Error saving transaction:', error);
      throw error;
    }
  }

  async loadTransactions() {
    try {
      const response = await axios.get(`${API_BASE_URL}/transactions`);
      return response.data;
    } catch (error) {
      console.error('Error loading transactions:', error);
      throw error;
    }
  }

  // Classrooms
  async saveClassroom(classroom) {
    try {
      const response = await axios.post(`${API_BASE_URL}/classrooms`, classroom);
      return response.data;
    } catch (error) {
      console.error('Error saving classroom:', error);
      throw error;
    }
  }

  async loadClassrooms() {
    try {
      const response = await axios.get(`${API_BASE_URL}/classrooms`);
      return response.data;
    } catch (error) {
      console.error('Error loading classrooms:', error);
      throw error;
    }
  }

  async updateClassroom(id, classroom) {
    try {
      const response = await axios.put(`${API_BASE_URL}/classrooms/${id}`, classroom);
      return response.data;
    } catch (error) {
      console.error('Error updating classroom:', error);
      throw error;
    }
  }

  async deleteClassroom(id) {
    try {
      const response = await axios.delete(`${API_BASE_URL}/classrooms/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting classroom:', error);
      throw error;
    }
  }

  // Courses
  async saveCourse(course) {
    try {
      const response = await axios.post(`${API_BASE_URL}/courses`, course);
      return response.data;
    } catch (error) {
      console.error('Error saving course:', error);
      throw error;
    }
  }

  async loadCourses() {
    try {
      const response = await axios.get(`${API_BASE_URL}/courses`);
      return response.data;
    } catch (error) {
      console.error('Error loading courses:', error);
      throw error;
    }
  }

  async updateCourse(id, course) {
    try {
      const response = await axios.put(`${API_BASE_URL}/courses/${id}`, course);
      return response.data;
    } catch (error) {
      console.error('Error updating course:', error);
      throw error;
    }
  }

  async deleteCourse(id) {
    try {
      const response = await axios.delete(`${API_BASE_URL}/courses/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting course:', error);
      throw error;
    }
  }

  // Materials
  async saveMaterial(material) {
    try {
      const response = await axios.post(`${API_BASE_URL}/materials`, material);
      return response.data;
    } catch (error) {
      console.error('Error saving material:', error);
      throw error;
    }
  }

  async loadMaterials() {
    try {
      const response = await axios.get(`${API_BASE_URL}/materials`);
      return response.data;
    } catch (error) {
      console.error('Error loading materials:', error);
      throw error;
    }
  }

  async updateMaterial(id, material) {
    try {
      const response = await axios.put(`${API_BASE_URL}/materials/${id}`, material);
      return response.data;
    } catch (error) {
      console.error('Error updating material:', error);
      throw error;
    }
  }

  async deleteMaterial(id) {
    try {
      const response = await axios.delete(`${API_BASE_URL}/materials/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting material:', error);
      throw error;
    }
  }

  // Users
  async saveUser(user) {
    try {
      const response = await axios.post(`${API_BASE_URL}/users`, user);
      return response.data;
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  async loadUsers() {
    try {
      const response = await axios.get(`${API_BASE_URL}/users`);
      return response.data;
    } catch (error) {
      console.error('Error loading users:', error);
      throw error;
    }
  }

  async updateUser(id, user) {
    try {
      const response = await axios.put(`${API_BASE_URL}/users/${id}`, user);
      return response.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Assignments
  async saveAssignment(assignment) {
    try {
      const response = await axios.post(`${API_BASE_URL}/assignments`, assignment);
      return response.data;
    } catch (error) {
      console.error('Error saving assignment:', error);
      throw error;
    }
  }

  async loadAssignments() {
    try {
      const response = await axios.get(`${API_BASE_URL}/assignments`);
      return response.data;
    } catch (error) {
      console.error('Error loading assignments:', error);
      throw error;
    }
  }

  // Attendance
  async saveAttendance(attendance) {
    try {
      const response = await axios.post(`${API_BASE_URL}/attendance`, attendance);
      return response.data;
    } catch (error) {
      console.error('Error saving attendance:', error);
      throw error;
    }
  }

  async loadAttendance() {
    try {
      const response = await axios.get(`${API_BASE_URL}/attendance`);
      return response.data;
    } catch (error) {
      console.error('Error loading attendance:', error);
      throw error;
    }
  }

  // Announcements
  async saveAnnouncement(announcement) {
    try {
      const response = await axios.post(`${API_BASE_URL}/announcements`, announcement);
      return response.data;
    } catch (error) {
      console.error('Error saving announcement:', error);
      throw error;
    }
  }

  async loadAnnouncements() {
    try {
      const response = await axios.get(`${API_BASE_URL}/announcements`);
      return response.data;
    } catch (error) {
      console.error('Error loading announcements:', error);
      throw error;
    }
  }

  // Calendar Events
  async saveCalendarEvent(event) {
    try {
      const response = await axios.post(`${API_BASE_URL}/calendar`, event);
      return response.data;
    } catch (error) {
      console.error('Error saving calendar event:', error);
      throw error;
    }
  }

  async loadCalendarEvents() {
    try {
      const response = await axios.get(`${API_BASE_URL}/calendar`);
      return response.data;
    } catch (error) {
      console.error('Error loading calendar events:', error);
      throw error;
    }
  }

  // Results
  async saveResult(result) {
    try {
      const response = await axios.post(`${API_BASE_URL}/results`, result);
      return response.data;
    } catch (error) {
      console.error('Error saving result:', error);
      throw error;
    }
  }

  async loadResults() {
    try {
      const response = await axios.get(`${API_BASE_URL}/results`);
      return response.data;
    } catch (error) {
      console.error('Error loading results:', error);
      throw error;
    }
  }

  // Fee Structures
  async saveFeeStructure(feeStructure) {
    try {
      const response = await axios.post(`${API_BASE_URL}/feeStructures`, feeStructure);
      return response.data;
    } catch (error) {
      console.error('Error saving fee structure:', error);
      throw error;
    }
  }

  async loadFeeStructures() {
    try {
      const response = await axios.get(`${API_BASE_URL}/feeStructures`);
      return response.data;
    } catch (error) {
      console.error('Error loading fee structures:', error);
      throw error;
    }
  }

  // Requirements
  async saveRequirement(requirement) {
    try {
      const response = await axios.post(`${API_BASE_URL}/requirements`, requirement);
      return response.data;
    } catch (error) {
      console.error('Error saving requirement:', error);
      throw error;
    }
  }

  async loadRequirements() {
    try {
      const response = await axios.get(`${API_BASE_URL}/requirements`);
      return response.data;
    } catch (error) {
      console.error('Error loading requirements:', error);
      throw error;
    }
  }

  // Expenses
  async saveExpense(expense) {
    try {
      const response = await axios.post(`${API_BASE_URL}/expenses`, expense);
      return response.data;
    } catch (error) {
      console.error('Error saving expense:', error);
      throw error;
    }
  }

  async loadExpenses() {
    try {
      const response = await axios.get(`${API_BASE_URL}/expenses`);
      return response.data;
    } catch (error) {
      console.error('Error loading expenses:', error);
      throw error;
    }
  }

  // Inventory
  async saveInventoryItem(item) {
    try {
      const response = await axios.post(`${API_BASE_URL}/inventory`, item);
      return response.data;
    } catch (error) {
      console.error('Error saving inventory item:', error);
      throw error;
    }
  }

  async loadInventory() {
    try {
      const response = await axios.get(`${API_BASE_URL}/inventory`);
      return response.data;
    } catch (error) {
      console.error('Error loading inventory:', error);
      throw error;
    }
  }
}

export const databaseService = new DatabasePersistenceService();
