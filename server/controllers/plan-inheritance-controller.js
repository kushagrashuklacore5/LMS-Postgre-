const db = require('../config/database-switch');

/**
 * Plan Inheritance System
 * Ensures all users under a SuperAdmin inherit the same subscription plan
 */

// Get effective plan for a user (inherits from their SuperAdmin)
exports.getEffectiveUserPlan = async (userId) => {
  return new Promise((resolve, reject) => {
    console.log(`🔍 [DEBUG] Getting effective plan for user: ${userId}`);
    
    // First, get the user's university and their SuperAdmin
    db.get(`
      SELECT u.university_id, uni.adminId as superadmin_id, u.name as userName, u.role as userRole
      FROM users u
      LEFT JOIN universities uni ON u.university_id = uni.id
      WHERE u.id = ?
    `, [userId], (err, result) => {
      if (err) {
        console.error(`❌ [DEBUG] Error fetching user ${userId}:`, err);
        reject(err);
        return;
      }
      
      console.log(`📊 [DEBUG] User ${userId} data:`, {
        userName: result?.userName,
        userRole: result?.userRole,
        university_id: result?.university_id,
        superadmin_id: result?.superadmin_id
      });
      
      if (!result || !result.superadmin_id) {
        console.log(`⚠️ [DEBUG] User ${userId} not under any SuperAdmin, defaulting to free`);
        // User not under any SuperAdmin, default to free
        resolve({
          planType: 'free',
          planName: 'Free',
          status: 'active',
          canAccessCalendar: false,
          canExportData: false,
          features: getPlanFeatures('free')
        });
        return;
      }
      
      // Convert integer adminId to superadminId format used in subscriptions
      const superadminId = `superadmin-${result.superadmin_id}`;
      console.log(`🔄 [DEBUG] Converted adminId ${result.superadmin_id} to superadminId: ${superadminId}`);
      
      // Get SuperAdmin's subscription using the correct superadminId format
      db.get(`
        SELECT planType, planName, status, expiryDate, isFreeTrial
        FROM subscriptions
        WHERE superadminId = ?
        ORDER BY createdAt DESC
        LIMIT 1
      `, [superadminId], (err, subscription) => {
        if (err) {
          console.error(`❌ [DEBUG] Error fetching subscription for ${superadminId}:`, err);
          reject(err);
          return;
        }
        
        console.log(`📋 [DEBUG] Subscription data for ${superadminId}:`, subscription);
        
        if (!subscription) {
          console.log(`⚠️ [DEBUG] No subscription found for ${superadminId}, defaulting to free`);
          // No subscription found, default to free
          resolve({
            planType: 'free',
            planName: 'Free',
            status: 'active',
            canAccessCalendar: false,
            canExportData: false,
            features: getPlanFeatures('free')
          });
          return;
        }
        
        // Check if subscription is expired
        const now = new Date();
        const expiryDate = new Date(subscription.expiryDate);
        const isExpired = now > expiryDate;
        
        const effectivePlan = isExpired ? 'free' : subscription.planType;
        const planName = isExpired ? 'Free' : subscription.planName;
        const status = isExpired ? 'expired' : subscription.status;
        
        console.log(`✅ [DEBUG] Final plan decision for user ${userId}:`, {
          effectivePlan,
          planName,
          status,
          isExpired,
          canAccessCalendar: effectivePlan === 'standard' || effectivePlan === 'professional'
        });
        
        resolve({
          planType: effectivePlan,
          planName: planName,
          status: status,
          expiryDate: subscription.expiryDate,
          isExpired: isExpired,
          canAccessCalendar: effectivePlan === 'standard' || effectivePlan === 'professional',
          canExportData: effectivePlan === 'professional', // ONLY Professional gets export
          features: getPlanFeatures(effectivePlan)
        });
      });
    });
  });
};

// Propagate plan changes from SuperAdmin to all users under their universities
exports.propagatePlanToUsers = async (superadminId, planType, planName, expiryDate) => {
  return new Promise((resolve, reject) => {
    const startTime = new Date();
    console.log(`🔄 Starting plan propagation for SuperAdmin ${superadminId}...`);
    
    // Extract numeric adminId from superadminId format (e.g., 'superadmin-1' -> 1)
    const adminId = superadminId.includes('-') ? superadminId.split('-')[1] : superadminId;
    
    // Update all universities under this SuperAdmin
    db.run(`
      UPDATE universities 
      SET subscriptionPlan = ?, updatedAt = ?
      WHERE adminId = ?
    `, [planType, new Date().toISOString(), adminId], function(err) {
      if (err) {
        console.error(`❌ Error updating universities for SuperAdmin ${superadminId}:`, err);
        reject(err);
        return;
      }
      
      const universitiesUpdated = this.changes;
      
      // Update all users under those universities
      db.run(`
        UPDATE users 
        SET subscriptionPlan = ?, updatedAt = ?
        WHERE university_id IN (
          SELECT id FROM universities WHERE adminId = ?
        )
      `, [planType, new Date().toISOString(), adminId], function(err) {
        if (err) {
          console.error(`❌ Error updating users for SuperAdmin ${superadminId}:`, err);
          reject(err);
          return;
        }
        
        const usersUpdated = this.changes;
        const duration = new Date() - startTime;
        
        console.log(`✅ Plan propagation completed in ${duration}ms:`);
        console.log(`   🏢 Universities updated: ${universitiesUpdated}`);
        console.log(`   👥 Users updated: ${usersUpdated}`);
        console.log(`   📋 Plan: ${planName} (${planType})`);
        console.log(`   📅 Expiry: ${new Date(expiryDate).toLocaleDateString()}`);
        console.log(`   👤 SuperAdmin: ${superadminId}`);
        
        // Emit real-time update to connected clients
        if (global.emitPlanChange) {
          global.emitPlanChange({
            superadminId,
            planType,
            planName,
            expiryDate,
            universitiesUpdated,
            usersUpdated,
            timestamp: new Date().toISOString()
          });
        }
        
        resolve({
          universitiesUpdated,
          usersUpdated,
          planType,
          planName,
          expiryDate,
          duration
        });
      });
    });
  });
};

// Check and handle expired subscriptions (automated expiration)
exports.checkExpiredSubscriptions = async () => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    
    // Find all expired subscriptions (both active subscriptions past expiry AND expired status)
    db.all(`
      SELECT DISTINCT superadminId, planType, planName, status
      FROM subscriptions
      WHERE expiryDate < ? OR status = 'expired'
    `, [now], (err, expiredSubscriptions) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (expiredSubscriptions.length === 0) {
        console.log('ℹ️  No expired subscriptions found');
        resolve({ expiredCount: 0, updatedCount: 0 });
        return;
      }
      
      console.log(`⚠️  Found ${expiredSubscriptions.length} expired subscriptions`);
      
      let totalUpdated = 0;
      
      // Mark subscriptions as expired
      db.run(`
        UPDATE subscriptions 
        SET status = 'expired', updatedAt = ?
        WHERE expiryDate < ? AND status = 'active'
      `, [new Date().toISOString(), now], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        const expiredCount = this.changes;
        
        // For each expired SuperAdmin, downgrade all users to free
        expiredSubscriptions.forEach(sub => {
          // Extract numeric adminId from superadminId format (e.g., 'superadmin-1' -> 1)
          const adminId = sub.superadminId.includes('-') ? sub.superadminId.split('-')[1] : sub.superadminId;
          
          db.run(`
            UPDATE universities 
            SET subscriptionPlan = 'free', updatedAt = ?
            WHERE adminId = ?
          `, [new Date().toISOString(), adminId], function(err) {
            if (err) {
              console.error(`Error updating universities for ${sub.superadminId}:`, err);
              return;
            }
            
            const uniUpdated = this.changes;
            
            db.run(`
              UPDATE users 
              SET subscriptionPlan = 'free', updatedAt = ?
              WHERE university_id IN (
                SELECT id FROM universities WHERE adminId = ?
              )
            `, [new Date().toISOString(), adminId], function(err) {
              if (err) {
                console.error(`Error updating users for ${sub.superadminId}:`, err);
                return;
              }
              
              const usersUpdated = this.changes;
              totalUpdated += usersUpdated;
              
              console.log(`✅ Downgraded ${sub.superadminId}:`);
              console.log(`   🏢 Universities: ${uniUpdated}`);
              console.log(`   👥 Users: ${usersUpdated}`);
              console.log(`   📋 Plan: Free (expired from ${sub.planName})`);
            });
          });
        });
        
        resolve({
          expiredCount,
          updatedCount: totalUpdated
        });
      });
    });
  });
};

// Get plan features based on plan type
function getPlanFeatures(planType) {
  const features = {
    free: {
      calendar: false,
      exportData: false,
      classrooms: { max: 2 },
      students: { max: 10 },
      teachers: { max: 5 },
      mentors: { max: 5 },
      announcements: { max: 2 },
      schools: { max: 1 },
      courses: { max: 2 },
      liveClass: false,
      assessments: false,
      weeksPerCourse: 2,
      materialsPerCourse: 2,
      mentorCoursesPerClass: 2
    },
    standard: {
      calendar: true,            // ONLY calendar unlocked in Standard
      exportData: false,          // Restricted - only Professional gets this
      classrooms: { max: 10 },
      students: { max: 200 },
      teachers: { max: 5 },        // Admins limit
      mentors: { max: 10 },
      announcements: { max: 20 },
      schools: { max: 2 },
      courses: { max: 8 },
      liveClass: false,            // Restricted - only Professional gets this
      assessments: false,          // Restricted - only Professional gets this
      weeksPerCourse: 2,           // Limited - only Professional gets unlimited
      materialsPerCourse: 2,       // Limited - only Professional gets unlimited
      mentorCoursesPerClass: 2
    },
    professional: {
      calendar: true,
      exportData: true,
      classrooms: { max: Infinity },
      students: { max: Infinity },
      teachers: { max: Infinity },
      mentors: { max: Infinity },
      announcements: { max: Infinity },
      schools: { max: Infinity },
      courses: { max: Infinity },
      liveClass: true,
      assessments: true,
      weeksPerCourse: Infinity,
      materialsPerCourse: Infinity,
      mentorCoursesPerClass: Infinity
    }
  };
  
  return features[planType] || features.free;
}

// Middleware to check user's effective plan before processing requests
exports.checkUserPlanAccess = async (req, res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    const userPlan = await exports.getEffectiveUserPlan(req.user.userId);
    req.userPlan = userPlan;
    
    next();
  } catch (error) {
    console.error('Error checking user plan:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error checking subscription status' 
    });
  }
};
