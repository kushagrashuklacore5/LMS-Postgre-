
// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}


/**
 * Get superadmin's current subscription from the database
 * Falls back to Free tier if not found
 */
const getSuperadminSubscription = (req, superadminId) => {
  return new Promise((resolve) => {
    getDatabaseFromRequest(req).get(
      'SELECT * FROM subscriptions WHERE superadminId = ?',
      [superadminId],
      (err, row) => {
        if (err) {
          console.warn('Subscription lookup failed:', err.message);
          // Default to Free
          resolve({ planType: 'free', planName: 'Free', status: 'active', isFreeTrial: true });
          return;
        }

        if (row) {
          // Check if subscription is expired
          const now = new Date();
          const expiryDate = new Date(row.expiryDate);
          const status = expiryDate < now ? 'expired' : row.status;
          
          resolve({
            planType: row.planType,
            planName: row.planName,
            status: status,
            expiryDate: row.expiryDate,
            isFreeTrial: Boolean(row.isFreeTrial)
          });
        } else {
          // Default to Free
          resolve({ planType: 'free', planName: 'Free', status: 'active', isFreeTrial: true });
        }
      }
    );
  });
};

/**
 * Check if superadmin has reached university quota for their plan
 */
const checkUniversityQuota = (subscriptionPlan, universityCount) => {
  const limits = {
    free: 1,
    standard: 2,
    professional: Infinity
  };
  
  const limit = limits[subscriptionPlan] || 1;
  return universityCount >= limit;
};

/**
 * Check if university has reached user quota for its plan
 */
const checkUserQuotaPerUniversity = (subscriptionPlan, userCount) => {
  const limits = {
    free: 3,
    standard: 60,  // 5 admins + 5 mentors + 50 students = 60 total
    professional: Infinity
  };
  
  const limit = limits[subscriptionPlan] || 3;
  return userCount >= limit;
};

/**
 * Count users in a university by role
 */
const countUsersByRoleInUniversity = (req, universityId, role) => {
  return new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).get(
      `SELECT COUNT(*) as count FROM users WHERE university_id = ? AND role = ?`,
      [universityId, role],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.count : 0);
      }
    );
  });
};

/**
 * Count total users in a university
 */
const countTotalUsersInUniversity = (req, universityId) => {
  return new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).get(
      `SELECT COUNT(*) as count FROM users WHERE university_id = ?`,
      [universityId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.count : 0);
      }
    );
  });
};

/**
 * Count universities for a superadmin (based on their admin users)
 */
const countUniversitiesForSuperadmin = (req) => {
  return new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).get(
      `SELECT COUNT(*) as count FROM universities`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.count : 0);
      }
    );
  });
};

/**
 * Check admin quotas (for Free tier)
 * Returns { allowed: boolean, message: string }
 */
const checkAdminMentorQuota = (universityId, subscriptionPlan, currentMentorCount) => {
  const limits = {
    free: 5,
    standard: 25,    // 25 teachers/mentors max for Standard plan
    professional: Infinity
  };
  
  const limit = limits[subscriptionPlan] || 5;
  if (currentMentorCount >= limit) {
    return {
      allowed: false,
      message: `Mentor limit reached (${limit} mentors max for ${subscriptionPlan} plan)`
    };
  }
  return { allowed: true };
};

const checkAdminStudentQuota = (universityId, subscriptionPlan, currentStudentCount) => {
  const limits = {
    free: 10,
    standard: 100,   // 100 students max for Standard plan
    professional: Infinity
  };
  
  const limit = limits[subscriptionPlan] || 10;
  if (currentStudentCount >= limit) {
    return {
      allowed: false,
      message: `Student limit reached (${limit} students max for ${subscriptionPlan} plan)`
    };
  }
  return { allowed: true };
};

const checkAdminClassQuota = (universityId, subscriptionPlan, currentClassCount) => {
  const limits = {
    free: 2,
    standard: 10,   // 10 classes max for Standard plan
    professional: Infinity
  };
  
  const limit = limits[subscriptionPlan] || 2;
  if (currentClassCount >= limit) {
    return {
      allowed: false,
      message: `Class limit reached (${limit} classes max for ${subscriptionPlan} plan)`
    };
  }
  return { allowed: true };
};

/**
 * Check mentor course quota (2 courses per class max for Free, 5 courses per class for Standard)
 */
const checkMentorCourseQuotaPerClass = (subscriptionPlan, currentCourseCountInClass) => {
  const limits = {
    free: 2,
    standard: 5,    // 5 courses max per class for Standard plan
    professional: Infinity
  };
  
  const limit = limits[subscriptionPlan] || 2;
  if (currentCourseCountInClass >= limit) {
    return {
      allowed: false,
      message: `Course limit reached (${limit} courses max per class for ${subscriptionPlan} plan)`
    };
  }
  return { allowed: true };
};

/**
 * Check per-role user quota for a university
 * Free: 1 per role, Standard: 5 per role (admin/mentor), Professional: Unlimited
 */
const checkRoleQuotaInUniversity = (subscriptionPlan, role, countForRole) => {
  // Plan-based limits for each role per university
  const planLimits = {
    free: {
      admin: 1,
      accountant: 1,
      storekeeper: 1,
      mentor: 5,      // Free allows 5 mentors
      student: 10     // Free allows 10 students
    },
    standard: {
      admin: 5,       // 5 admins max for Standard
      accountant: 5,
      storekeeper: 5,
      mentor: 25,      // 25 teachers/mentors max for Standard
      student: 100     // 100 students max for Standard
    },
    professional: {
      admin: Infinity,
      accountant: Infinity,
      storekeeper: Infinity,
      mentor: Infinity,
      student: Infinity
    }
  };

  const limits = planLimits[subscriptionPlan] || planLimits.free;
  const limit = limits[role] || Infinity;

  // If limit is Infinity, always allow
  if (limit === Infinity) {
    return { allowed: true };
  }

  if (countForRole >= limit) {
    return {
      allowed: false,
      message: `${subscriptionPlan} plan ${role} limit reached (${limit} ${role}s max per university)`
    };
  }

  return { allowed: true };
};

module.exports = {
  getSuperadminSubscription,
  checkUniversityQuota,
  checkUserQuotaPerUniversity,
  countUsersByRoleInUniversity,
  countTotalUsersInUniversity,
  countUniversitiesForSuperadmin,
  checkAdminMentorQuota,
  checkAdminStudentQuota,
  checkAdminClassQuota,
  checkMentorCourseQuotaPerClass,
  checkRoleQuotaInUniversity,
};
