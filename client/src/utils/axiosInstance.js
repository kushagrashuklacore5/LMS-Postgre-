import axios from 'axios';
import { API_BASE } from '../config/api';

const API_URL = API_BASE;

// Create axios instance
const axiosInstance = axios.create({
  baseURL: API_URL,
});

// Add request interceptor to include language header
axiosInstance.interceptors.request.use((config) => {
  // Get user's current language from localStorage or default to 'en'
  const currentLanguage = localStorage.getItem('selectedLanguage') || 'en';
  
  // Add language header to all requests
  config.headers['x-language'] = currentLanguage;
  
  // Add authorization token if available
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  
  return config;
});

// Add response interceptor for refresh token handling
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and it's not the refresh token request itself
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/superadmin/refresh-token')) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh the token
        const refreshResponse = await axiosInstance.post('/superadmin/refresh-token', {}, {
          withCredentials: true // Important for httpOnly cookies
        });

        if (refreshResponse.data.success) {
          const newToken = refreshResponse.data.data.accessToken;
          
          // Update stored token
          localStorage.setItem('token', newToken);
          
          // Update authorization header for the original request
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          
          // Retry the original request with the new token
          return axiosInstance(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear auth state and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
