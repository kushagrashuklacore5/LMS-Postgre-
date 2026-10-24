const db = require('../config/database-switch');

const planInheritance = require('../controllers/plan-inheritance-controller');



// Define quotas for different subscription tiers

const QUOTAS = {

  free: {

    classrooms: Infinity,

    teachers: Infinity,

    mentors: Infinity,

    students: Infinity,

    announcements: Infinity,

    exportData: true,        // Enabled for free tier

    calendarAccess: true     // Enabled for free tier

  },

  standard: {

    classrooms: Infinity,

    teachers: Infinity,

    mentors: Infinity,

    students: Infinity,

    announcements: Infinity,

    exportData: true,        // Enabled for standard plan

    calendarAccess: true,   // Calendar unlocked in Standard

    schools: Infinity,       // Unlimited schools for standard plan

    courses: Infinity        // Unlimited courses for standard plan

  },

  professional: {

    classrooms: Infinity,

    teachers: Infinity,

    mentors: Infinity,

    students: Infinity,

    announcements: Infinity,

    exportData: true,

    calendarAccess: true,

    schools: Infinity,

    courses: Infinity

  }

};



// Additional feature flags and per-entity limits can be defined here

QUOTAS.free.liveClass = true;        // Enabled for free plan

QUOTAS.free.assessments = true;      // Enabled for free plan

QUOTAS.free.weeksPerCourse = Infinity;        // Unlimited for free plan

QUOTAS.free.materialsPerCourse = Infinity;    // Unlimited for free plan

QUOTAS.free.schools = Infinity;        // Unlimited schools for free plan

QUOTAS.free.courses = Infinity;        // Unlimited courses for free plan



QUOTAS.standard.liveClass = true;         // Enabled for standard plan

QUOTAS.standard.assessments = true;       // Enabled for standard plan

QUOTAS.standard.weeksPerCourse = Infinity;        // Unlimited for standard plan

QUOTAS.standard.materialsPerCourse = Infinity;    // Unlimited for standard plan

QUOTAS.standard.schools = Infinity;       // Unlimited schools for standard plan

QUOTAS.standard.courses = Infinity;       // Unlimited courses for standard plan



QUOTAS.professional.liveClass = true;

QUOTAS.professional.assessments = true;

QUOTAS.professional.weeksPerCourse = Infinity;

QUOTAS.professional.materialsPerCourse = Infinity;

QUOTAS.professional.schools = Infinity;  // Unlimited schools for professional

QUOTAS.professional.courses = Infinity;  // Unlimited courses for professional



/**

 * Get current quota for a user based on their subscription using plan inheritance

 */

const getQuotaForUser = async (userId, req) => {

  try {

    // Use the plan inheritance system to get the effective user plan

    const userPlan = await planInheritance.getEffectiveUserPlan(userId, req);

    const planType = userPlan.planType || 'free';

    return QUOTAS[planType] || QUOTAS.free;

  } catch (error) {

    console.error('Error fetching user plan:', error);

    return QUOTAS.free; // Default to free tier on error

  }

};



/**

 * Count existing items for a university

 */

const countItems = (tableName, universityId, req) => {

  return new Promise((resolve, reject) => {

    // Get database from request context
    const db = req.tenant?.database || require('../config/database-switch');
    
    const query = `SELECT COUNT(*) as count FROM ${tableName} WHERE university_id = ?`;

    db.get(query, [universityId], (err, row) => {

      if (err) reject(err);

      else resolve(row?.count || 0);

    });

  });

};



/**

 * Count teachers and mentors separately

 */

const countTeachers = (universityId, role, req) => {

  return new Promise((resolve, reject) => {

    // Get database from request context
    const db = req.tenant?.database || require('../config/database-switch');
    
    const query = `SELECT COUNT(*) as count FROM users WHERE university_id = ? AND role = ?`;

    db.get(query, [universityId, role], (err, row) => {

      if (err) reject(err);

      else resolve(row?.count || 0);

    });

  });

};



/**

 * Check classroom creation quota

 */

exports.checkClassroomQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const universityId = req.user?.universityId;

    const quota = await getQuotaForUser(userId, req);

    // Defensive logging to help debug unexpected blocks

    const count = await countItems('classrooms', universityId, req).catch(err => {

      console.error('Error counting classrooms:', err);

      return 0;

    });



    const limit = (quota && typeof quota.classrooms !== 'undefined') ? quota.classrooms : Infinity;

    const numericCount = Number(count) || 0;



    console.log(`📚 Classroom Quota Check - User ${userId}: ${numericCount}/${limit}`);



    // Allow if limit is Infinity

    if (limit !== Infinity && numericCount >= limit) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: 'Your account is in free tier. Please contact your administrator to use the full feature.',

        details: `Classroom limit reached: ${numericCount}/${limit}`

      });

    }



    next();

  } catch (error) {

    console.error('Quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check teacher/admin creation quota

 */

exports.checkTeacherQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const universityId = req.user?.universityId;

    const quota = await getQuotaForUser(userId, req);

    

    // Count both teachers and admins for the admin quota limit

    const teacherCount = await countTeachers(universityId, 'teacher', req);

    const adminCount = await countTeachers(universityId, 'admin', req);

    const totalAdmins = teacherCount + adminCount;



    console.log(`👨‍💼 Admin Quota Check - User ${userId}: ${totalAdmins}/${quota.teachers} (teachers: ${teacherCount}, admins: ${adminCount})`);



    if (totalAdmins >= quota.teachers) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: `Your ${quota.teachers === 5 ? 'Free' : 'Standard'} plan allows only ${quota.teachers} admins. Please upgrade to create more.`,

        details: `Admin limit reached: ${totalAdmins}/${quota.teachers}`

      });

    }

    

    next();

  } catch (error) {

    console.error('Quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check mentor creation quota

 */

exports.checkMentorQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const universityId = req.user?.universityId;

    const quota = await getQuotaForUser(userId, req);

    const count = await countTeachers(universityId, 'mentor', req);



    if (count >= quota.mentors) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: 'Your account is in free tier. Please contact your administrator to use the full feature.',

        details: `Mentor limit reached: ${count}/${quota.mentors}`

      });

    }

    

    next();

  } catch (error) {

    console.error('Quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check student creation quota

 */

exports.checkStudentQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const universityId = req.user?.universityId;

    const quota = await getQuotaForUser(userId, req);

    // Count only users with role 'student' for accurate quota enforcement

    const count = await countTeachers(universityId, 'student');



    console.log(`🔢 Student Quota Check - User ${userId} - students: ${count}/${quota.students}`);



    if (count >= quota.students) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: 'Your account is in free tier. Please contact your administrator to use the full feature.',

        details: `Student limit reached: ${count}/${quota.students}`

      });

    }

    

    next();

  } catch (error) {

    console.error('Quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check announcement creation quota

 */

exports.checkAnnouncementQuota = async (req, res, next) => {
  // DISABLED: Allow all users to create announcements without quota restrictions
  next();
};



/**

 * Check export data access

 */

exports.checkExportAccess = async (req, res, next) => {

  try {

    // Require authentication

    if (!req.user?.userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required to access export feature.'

      });

    }



    const userId = req.user.userId;

    const quota = await getQuotaForUser(userId, req);



    console.log(`📊 Export Access Check - User ${userId}, Plan: ${quota ? 'checking...' : 'unknown'}`);



    if (!quota.exportData) {

      console.log(`🚫 Export blocked for user ${userId} on free tier`);

      return res.status(402).json({

        success: false,

        featureRestricted: true,

        message: 'Your account is in free tier. Please contact your administrator to use the full feature.',

        details: 'Data export is not available on the free tier.',

        currentPlan: Object.keys(QUOTAS).find(plan => QUOTAS[plan] === quota) || 'free'

      });

    }

    

    console.log(`✅ Export allowed for user ${userId}`);

    next();

  } catch (error) {

    console.error('Export access check error:', error);

    return res.status(500).json({

      success: false,

      message: 'Error checking export access'

    });

  }

};



/**

 * Check calendar page access

 */

exports.checkCalendarAccess = async (req, res, next) => {

  try {

    // Require authentication

    if (!req.user?.userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required to access calendar feature.'

      });

    }



    const userId = req.user.userId;

    console.log(`📅 [DEBUG] Calendar Access Check - User ${userId}, Role: ${req.user.role}`);

    

    const quota = await getQuotaForUser(userId, req);

    

    console.log(`� [DEBUG] Quota result for user ${userId}:`, {

      calendarAccess: quota?.calendarAccess,

      planType: Object.keys(QUOTAS).find(plan => QUOTAS[plan] === quota) || 'unknown'

    });



    if (!quota.calendarAccess) {

      console.log(`🚫 [DEBUG] Calendar blocked for user ${userId} - quota:`, quota);

      return res.status(402).json({

        success: false,

        featureRestricted: true,

        message: `Your SuperAdmin is on the ${Object.keys(QUOTAS).find(plan => QUOTAS[plan] === quota)?.charAt(0).toUpperCase() + Object.keys(QUOTAS).find(plan => QUOTAS[plan] === quota)?.slice(1) || 'Free'} plan — upgrade to access the calendar.`,

        details: 'Calendar feature is not available on your current plan.',

        currentPlan: Object.keys(QUOTAS).find(plan => QUOTAS[plan] === quota) || 'free'

      });

    }

    

    console.log(`✅ [DEBUG] Calendar allowed for user ${userId}`);

    next();

  } catch (error) {

    console.error('❌ [DEBUG] Calendar access check error:', error);

    return res.status(500).json({

      success: false,

      message: 'Error checking calendar access'

    });

  }

};



/**

 * Check live class creation access

 */

exports.checkLiveClassAccess = async (req, res, next) => {

  try {

    if (!req.user?.userId) {

      return res.status(401).json({ success: false, message: 'Authentication required to access live-class feature.' });

    }



    const userId = req.user.userId;

    const quota = await getQuotaForUser(userId, req);



    if (!quota.liveClass) {

      return res.status(402).json({

        success: false,

        featureRestricted: true,

        message: 'Live class feature is not available on your current plan.'

      });

    }



    next();

  } catch (error) {

    console.error('Live class access check error:', error);

    return res.status(500).json({ success: false, message: 'Error checking live class access' });

  }

};



/**

 * Check assessment creation access

 */

exports.checkAssessmentAccess = async (req, res, next) => {

  try {

    if (!req.user?.userId) {

      return res.status(401).json({ success: false, message: 'Authentication required to access assessment feature.' });

    }



    const userId = req.user.userId;

    const quota = await getQuotaForUser(userId, req);



    if (!quota.assessments) {

      return res.status(402).json({

        success: false,

        featureRestricted: true,

        message: 'Assessment feature is not available on your current plan.'

      });

    }



    next();

  } catch (error) {

    console.error('Assessment access check error:', error);

    return res.status(500).json({ success: false, message: 'Error checking assessment access' });

  }

};



/**

 * Check weeks per course quota

 */

exports.checkWeeksQuota = async (req, res, next) => {

  try {

    if (!req.user?.userId) {

      return res.status(401).json({ success: false, message: 'Authentication required to create weeks.' });

    }



    const courseId = req.body.courseId || req.query.courseId;

    if (!courseId) return res.status(400).json({ success: false, message: 'courseId required' });



    const userId = req.user.userId;

    const quota = await getQuotaForUser(userId, req);

    const maxWeeks = quota.weeksPerCourse || Infinity;



    if (maxWeeks === Infinity) return next();



    const count = await new Promise((resolve, reject) => {

      db.get('SELECT COUNT(*) as count FROM weeks WHERE courseId = ?', [courseId], (err, row) => {

        if (err) return resolve(0);

        resolve(row?.count || 0);

      });

    });



    if (count >= maxWeeks) {

      return res.status(402).json({ success: false, quotaExceeded: true, message: `Week limit reached: ${count}/${maxWeeks}` });

    }



    next();

  } catch (error) {

    console.error('Weeks quota check error:', error);

    next();

  }

};



/**

 * Check materials per course quota

 */

exports.checkMaterialsQuota = async (req, res, next) => {

  try {

    if (!req.user?.userId) {

      return res.status(401).json({ success: false, message: 'Authentication required to upload materials.' });

    }



    const courseId = req.body.courseId || req.query.courseId;

    if (!courseId) return res.status(400).json({ success: false, message: 'courseId required' });



    const userId = req.user.userId;

    const quota = await getQuotaForUser(userId, req);

    const maxMaterials = quota.materialsPerCourse || Infinity;



    if (maxMaterials === Infinity) return next();



    const count = await new Promise((resolve, reject) => {

      db.get('SELECT COUNT(*) as count FROM course_materials WHERE courseId = ?', [courseId], (err, row) => {

        if (err) return resolve(0);

        resolve(row?.count || 0);

      });

    });



    if (count >= maxMaterials) {

      return res.status(402).json({ success: false, quotaExceeded: true, message: `Material upload limit reached: ${count}/${maxMaterials}` });

    }



    next();

  } catch (error) {

    console.error('Materials quota check error:', error);

    next();

  }

};



/**

 * Get current quota usage for a university

 */

exports.getQuotaUsage = async (req, res) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const universityId = req.user?.universityId;

    const quota = await getQuotaForUser(userId, req);



    const classroomCount = await countItems('classrooms', universityId, req);

    const teacherCount = await countTeachers(universityId, 'teacher');

    const mentorCount = await countTeachers(universityId, 'mentor');

    const studentCount = await countItems('users', universityId, req) - 1;

    const announcementCount = await countItems('announcements', universityId, req);

    const schoolCount = await countItems('universities', 1, req); // Count total schools in system

    const courseCount = await countItems('courses', universityId, req);



    res.json({

      success: true,

      quota: {

        classrooms: { used: classroomCount, limit: quota.classrooms },

        teachers: { used: teacherCount, limit: quota.teachers },

        mentors: { used: mentorCount, limit: quota.mentors },

        students: { used: studentCount, limit: quota.students },

        announcements: { used: announcementCount, limit: quota.announcements },

        schools: { used: schoolCount, limit: quota.schools },

        courses: { used: courseCount, limit: quota.courses },

        exportData: quota.exportData,

        calendarAccess: quota.calendarAccess,

        liveClass: quota.liveClass,

        assessments: quota.assessments

      }

    });

  } catch (error) {

    console.error('Error getting quota usage:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to get quota usage'

    });

  }

};



/**

 * Check schools/institutes creation quota

 */

exports.checkSchoolsQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const quota = await getQuotaForUser(userId, req);

    const schoolCount = await countItems('universities', 1, req); // Count total schools in system



    console.log(`🏫 Schools Quota Check - User ${userId}: ${schoolCount}/${quota.schools}`);



    if (schoolCount >= quota.schools) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: `Your ${quota.schools === 1 ? 'Free' : quota.schools === 2 ? 'Standard' : 'Professional'} plan allows only ${quota.schools} schools. Please upgrade to create more.`,

        details: `Schools limit reached: ${schoolCount}/${quota.schools}`

      });

    }



    next();

  } catch (error) {

    console.error('Schools quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check courses creation quota

 */

exports.checkCoursesQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const universityId = req.user?.universityId;

    const quota = await getQuotaForUser(userId, req);

    const courseCount = await countItems('courses', universityId, req);



    console.log(`📚 Courses Quota Check - User ${userId}: ${courseCount}/${quota.courses}`);



    if (courseCount >= quota.courses) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: `Your ${quota.courses === 2 ? 'Free' : quota.courses === 8 ? 'Standard' : 'Professional'} plan allows only ${quota.courses} courses. Please upgrade to create more.`,

        details: `Courses limit reached: ${courseCount}/${quota.courses}`

      });

    }



    next();

  } catch (error) {

    console.error('Courses quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check live class access quota

 */

exports.checkLiveClassQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const quota = await getQuotaForUser(userId, req);



    console.log(`🎥 Live Class Access Check - User ${userId}: ${quota.liveClass ? 'Allowed' : 'Restricted'}`);



    if (!quota.liveClass) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: `Live classes are not available in your plan. Please upgrade to Professional plan to access live classes.`,

        details: 'Live classes require Professional plan'

      });

    }



    next();

  } catch (error) {

    console.error('Live class quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check assessments access quota

 */

exports.checkAssessmentsQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const quota = await getQuotaForUser(userId, req);



    console.log(`📝 Assessments Access Check - User ${userId}: ${quota.assessments ? 'Allowed' : 'Restricted'}`);



    if (!quota.assessments) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: `Assessments are not available in your plan. Please upgrade to Professional plan to access assessments.`,

        details: 'Assessments require Professional plan'

      });

    }



    next();

  } catch (error) {

    console.error('Assessments quota check error:', error);

    next(); // Continue even if check fails

  }

};



/**

 * Check export data access quota

 */

exports.checkExportDataQuota = async (req, res, next) => {

  try {

    const userId = req.user?.userId;

    if (!userId) {

      return res.status(401).json({

        success: false,

        message: 'Authentication required'

      });

    }



    const quota = await getQuotaForUser(userId, req);



    console.log(`📤 Export Data Access Check - User ${userId}: ${quota.exportData ? 'Allowed' : 'Restricted'}`);



    if (!quota.exportData) {

      return res.status(402).json({

        success: false,

        quotaExceeded: true,

        message: `Data export is not available in your plan. Please upgrade to Professional plan to export data.`,

        details: 'Data export requires Professional plan'

      });

    }



    next();

  } catch (error) {

    console.error('Export data quota check error:', error);

    next(); // Continue even if check fails

  }

};

