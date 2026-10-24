import { API_BASE as LMS_API } from '../config/api';
// Password Reset Service
const API_BASE = `${LMS_API}/password-reset`;

class PasswordResetService {
  // Send OTP to email
  async sendOTP(email) {
    try {
      const response = await fetch(`${API_BASE}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send OTP');
      }

      return data;
    } catch (error) {
      console.error('Send OTP error:', error);
      throw error;
    }
  }

  // Verify OTP
  async verifyOTP(email, otp) {
    try {
      const response = await fetch(`${API_BASE}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to verify OTP');
      }

      return data;
    } catch (error) {
      console.error('Verify OTP error:', error);
      throw error;
    }
  }

  // Reset password
  async resetPassword(email, newPassword, confirmPassword) {
    try {
      const response = await fetch(`${API_BASE}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, newPassword, confirmPassword })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset password');
      }

      return data;
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  }

  // Check cooldown status
  async checkCooldown(email) {
    try {
      const response = await fetch(`${API_BASE}/check-cooldown?email=${encodeURIComponent(email)}`);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to check cooldown');
      }

      return data;
    } catch (error) {
      console.error('Check cooldown error:', error);
      throw error;
    }
  }
}

export default new PasswordResetService();
