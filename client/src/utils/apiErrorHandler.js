/**
 * API Error Handler Utility
 * Handles API responses and detects quota/feature restrictions
 * Shows appropriate modals based on response status
 */

export const handleApiError = (error, showQuotaModal) => {
  // DISABLED: Never show quota modals - all features are unlocked
  // Always return false to indicate error not handled by quota system
  return false; // Error not handled by quota system
};

/**
 * Extract resource type from error message
 * Examples: "Classroom", "Student", "Announcement", etc.
 */
const extractResourceType = (message) => {
  if (!message) return 'resource';

  const resourcePatterns = [
    { pattern: /classroom/i, type: 'Classroom' },
    { pattern: /student/i, type: 'Student' },
    { pattern: /teacher/i, type: 'Teacher' },
    { pattern: /mentor/i, type: 'Mentor' },
    { pattern: /announcement/i, type: 'Announcement' },
    { pattern: /export/i, type: 'Export' },
    { pattern: /calendar/i, type: 'Calendar' },
  ];

  for (const { pattern, type } of resourcePatterns) {
    if (pattern.test(message)) {
      return type;
    }
  }

  return 'resource';
};

/**
 * Wrap API call with quota error handling
 * Example usage:
 * const result = await withQuotaErrorHandling(
 *   api.post('/classrooms', data),
 *   showQuotaModal
 * );
 */
export const withQuotaErrorHandling = async (apiCall, showQuotaModal) => {
  try {
    return await apiCall;
  } catch (error) {
    // DISABLED: Never handle quota errors - all features are unlocked
    // Always throw the original error, never QUOTA_EXCEEDED
    throw error;
  }
};

export default {
  handleApiError,
  withQuotaErrorHandling,
  extractResourceType,
};
