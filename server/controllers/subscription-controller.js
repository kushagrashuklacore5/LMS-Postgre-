const Razorpay = require('razorpay');
const crypto = require('crypto');
const planInheritance = require('./plan-inheritance-controller');




// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}


/**
 * REAL-TIME IMMEDIATE PLAN PROPAGATION
 * Updates all users under a SuperAdmin instantly without delay
 */
const triggerImmediatePropagation = async (req, superadminId, planType, planName, expiryDate) => {
  const startTime = Date.now();

  try {
    console.log(`🚀 [DEBUG] IMMEDIATE PROPAGATION TRIGGERED:`);
    console.log(`   SuperAdmin: ${superadminId}`);
    console.log(`   Plan: ${planName} (${planType})`);
    console.log(`   Expiry: ${expiryDate}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    // Extract numeric adminId from superadminId format (e.g., 'superadmin-1' -> 1)
    // Handle both string and number inputs
    const superadminIdStr = String(superadminId);
    const adminId = superadminIdStr.includes('-') ? superadminIdStr.split('-')[1] : superadminIdStr;
    console.log(`🔄 [DEBUG] Extracted adminId: ${adminId} from superadminId: ${superadminIdStr}`);

    // Step 1: Update universities belonging to this superadmin only
    const universityResult = await new Promise((resolve, reject) => {
      const db = req ? getDatabaseFromRequest(req) : require('../config/database-switch');
      db.run(`
        UPDATE universities
        SET subscriptionPlan = ?, updatedAt = ?
        WHERE adminId = ?
      `, [planType, new Date().toISOString(), adminId], function(err) {
        if (err) {
          console.error(`❌ [DEBUG] Error updating universities for SuperAdmin ${superadminId}:`, err);
          reject(err);
        } else {
          console.log(`✅ [DEBUG] Universities updated: ${this.changes} rows affected`);
          resolve({ changes: this.changes });
        }
      });
    });

    console.log(`🏢 [DEBUG] University update result:`, universityResult);

    // Step 2: Update ALL users in the superadmin's database
    const userResult = await new Promise((resolve, reject) => {
      const db = req ? getDatabaseFromRequest(req) : require('../config/database-switch');
      db.run(`
        UPDATE users
        SET subscriptionPlan = ?, updated_at = ?
      `, [planType, new Date().toISOString()], function(err) {
        if (err) {
          console.error(`❌ [DEBUG] Error updating users for SuperAdmin ${superadminId}:`, err);
          reject(err);
        } else {
          console.log(`✅ [DEBUG] All users updated: ${this.changes} rows affected`);
          resolve({ changes: this.changes });
        }
      });
    });

    console.log(`👥 [DEBUG] User update result:`, userResult);

    // Step 3: Emit real-time Socket.IO update
    const planChangeData = {
      superadminId,
      planType,
      planName,
      expiryDate,
      universitiesUpdated: universityResult.changes,
      usersUpdated: userResult.changes,
      timestamp: new Date().toISOString()
    };

    console.log(`📡 [DEBUG] Preparing Socket.IO emission:`, planChangeData);

    if (global.emitPlanChange) {
      console.log(`📡 [DEBUG] Calling global.emitPlanChange...`);
      global.emitPlanChange(planChangeData);
      console.log(`✅ [DEBUG] Socket.IO emission completed`);
    } else {
      console.log(`❌ [DEBUG] global.emitPlanChange is not defined!`);
    }

    const duration = Date.now() - startTime;
    console.log(`⏱️ [DEBUG] Total propagation time: ${duration}ms`);

    return {
      universitiesUpdated: universityResult.changes,
      usersUpdated: userResult.changes,
      planType,
      planName,
      expiryDate,
      duration
    };

  } catch (error) {
    console.error(`❌ [DEBUG] CRITICAL ERROR in triggerImmediatePropagation:`, error);
    throw error;
  }
};

/**
 * PLAN INHERITANCE SYSTEM
 * Uses enhanced real-time propagation
 */
const propagatePlanToUniversities = async (superadminId, planType) => {
  try {
    console.log(`🔄 Triggering IMMEDIATE plan propagation for SuperAdmin ${superadminId}...`);

    // Get subscription details for propagation
    const subscription = await new Promise((resolve, reject) => {
      getDatabaseFromRequest(req).get(
        'SELECT planName, expiryDate FROM subscriptions WHERE superadminId = ? ORDER BY createdAt DESC LIMIT 1',
        [superadminId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // Use immediate propagation system
    const result = await triggerImmediatePropagation(
      superadminId,
      planType,
      subscription?.planName || 'Free',
      subscription?.expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );

    console.log(`✅ Immediate propagation completed: ${result.usersUpdated} users updated`);
    return result;
  } catch (error) {
    console.error('Error in plan propagation:', error);
    throw error;
  }
};

/**
 * Find subscription by userId or superadminId from PostgreSQL
 */
const findSubscriptionById = (req, userId) => {
  return new Promise((resolve, reject) => {
    // Convert userId to superadminId format for SuperAdmin users
    // For regular users, use their userId directly
    // For SuperAdmin users, convert to superadmin-{userId} format
    let superadminId = userId;

    // Check if this is already a superadminId string (e.g., 'superadmin-33')
    const userIdStr = String(userId);
    if (userIdStr.startsWith('superadmin-')) {
      // Already in superadminId format, use as-is
      superadminId = userIdStr;
      console.log(`🔄 [DEBUG] Using existing superadminId: ${superadminId}`);
    } else if (userId && parseInt(userId) > 10) {
      // Convert numeric userId to superadminId format
      superadminId = `superadmin-${userId}`;
      console.log(`🔄 [DEBUG] Converting SuperAdmin userId ${userId} to superadminId ${superadminId}`);
    } else {
      // Regular user, use as-is
      console.log(`🔄 [DEBUG] Using regular userId: ${userId}`);
    }

    console.log(`🔍 [DEBUG] Looking for subscription with superadminId: ${superadminId}`);

    // Query by superadminId since that's the identifier column in the table
    const db = require('../config/database-switch');
    db.get(
      'SELECT * FROM subscriptions WHERE superadminId = ?',
      [superadminId],
      (err, row) => {
        if (err) {
          console.error('Error finding subscription:', err);
          reject(err);
        } else {
          // Convert PostgreSQL boolean to JavaScript boolean
          if (row) {
            row.isFreeTrial = Boolean(row.isFreeTrial);
          }
          console.log(`📋 [DEBUG] Found subscription:`, row ? {
            superadminId: row.superadminId,
            planType: row.planType,
            planName: row.planName,
            status: row.status
          } : 'None');
          resolve(row);
        }
      }
    );
  });
};

/**
 * Save subscription to PostgreSQL (INSERT or UPDATE)
 */
const saveSubscriptionObject = (subObj) => {
  return new Promise((resolve, reject) => {
    const db = require('../config/database-switch');

    // Check if subscription exists first
    db.get(
      'SELECT id FROM subscriptions WHERE superadminId = ?',
      [subObj.superadminId || subObj.userId],
      (err, existing) => {
        if (err) {
          console.error('Error checking existing subscription:', err);
          reject(err);
          return;
        }

        const query = existing ? `
          UPDATE subscriptions SET
            planType = ?, planName = ?, status = ?, startDate = ?, expiryDate = ?,
            durationDays = ?, paymentId = ?, amount = ?, currency = ?, paymentMethod = ?, isFreeTrial = ?, updatedAt = utc_now_text()
          WHERE superadminId = ?
        ` : `
          INSERT INTO subscriptions (
            superadminId, planType, planName, status, startDate, expiryDate,
            durationDays, paymentId, amount, currency, paymentMethod, isFreeTrial,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())
        `;

        const params = existing ? [
          subObj.planType || 'free',
          subObj.planName || 'Free',
          subObj.status || 'active',
          subObj.startDate ? new Date(subObj.startDate).toISOString() : new Date().toISOString(),
          subObj.expiryDate ? new Date(subObj.expiryDate).toISOString() : new Date().toISOString(),
          subObj.durationDays || 30,
          subObj.paymentId || null,
          subObj.amount || 0,
          subObj.currency || 'INR',
          subObj.paymentMethod || null,
          subObj.isFreeTrial ? true : false,
          subObj.superadminId || subObj.userId
        ] : [
          subObj.superadminId || subObj.userId,
          subObj.planType || 'free',
          subObj.planName || 'Free',
          subObj.status || 'active',
          subObj.startDate ? new Date(subObj.startDate).toISOString() : new Date().toISOString(),
          subObj.expiryDate ? new Date(subObj.expiryDate).toISOString() : new Date().toISOString(),
          subObj.durationDays || 30,
          subObj.paymentId || null,
          subObj.amount || 0,
          subObj.currency || 'INR',
          subObj.paymentMethod || null,
          subObj.isFreeTrial ? true : false
        ];

        console.log(`💾 [DEBUG] saveSubscriptionObject params:`, {
          superadminId: subObj.superadminId || subObj.userId,
          planType: subObj.planType || 'free',
          planName: subObj.planName || 'Free',
          isUpdate: !!existing
        });

        db.run(query, params, function(err) {
          if (err) {
            console.error('Error saving subscription:', err);
            reject(err);
          } else {
            // Return the saved object with database ID
            resolve({
              id: existing ? existing.id : this.lastID,
              ...subObj,
              isFreeTrial: Boolean(subObj.isFreeTrial)
            });
          }
        });
      }
    );
  });
};

// Razorpay client, created from environment variables only. There is no built-in
// key: without RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET paid plans cannot be bought.
let razorpayClient = null;
let gatewayStandIn = null;
// Tests replace the gateway with a stand-in; production code never calls this.
const setPaymentGatewayForTests = (client) => { gatewayStandIn = client; };
const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  if (gatewayStandIn) return gatewayStandIn;
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpayClient;
};

const paymentsNotConfigured = (res) =>
  res.status(503).json({ success: false, message: 'Online payments are not configured on this server.' });

// The price and period of each plan come from the server's own configuration
const { getPaidPlan, isKnownPaidPlan } = require('../config/subscriptionPlans');

// A plan the server cannot price is refused: 400 for an unknown plan, 503 when the
// operator has not configured its price.
const resolvePaidPlan = (requestedPlanId, res) => {
  const plan = getPaidPlan(requestedPlanId);
  if (plan) return plan;
  if (isKnownPaidPlan(requestedPlanId)) {
    res.status(503).json({ success: false, message: 'This plan is not available for purchase yet.' });
  } else {
    res.status(400).json({ success: false, message: 'Unknown plan' });
  }
  return null;
};

// Helper function to get features for a plan
const getFeaturesForPlan = (planType) => {
  const plans = {
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
      calendar: true,
      exportData: true,
      classrooms: { max: 10 },
      students: { max: 100 },
      teachers: { max: 20 },
      mentors: { max: 20 },
      announcements: { max: 10 },
      schools: { max: 5 },
      courses: { max: 20 },
      liveClass: true,
      assessments: true,
      weeksPerCourse: 12,
      materialsPerCourse: 10,
      mentorCoursesPerClass: 10
    },
    professional: {
      calendar: true,
      exportData: true,
      classrooms: { max: -1 }, // Unlimited
      students: { max: -1 },
      teachers: { max: -1 },
      mentors: { max: -1 },
      announcements: { max: -1 },
      schools: { max: -1 },
      courses: { max: -1 },
      liveClass: true,
      assessments: true,
      weeksPerCourse: -1,
      materialsPerCourse: -1,
      mentorCoursesPerClass: -1
    }
  };

  return plans[planType] || plans.free;
};

// Get current subscription
const getCurrentSubscription = async (req, res) => {
  try {
    // Handle both superadmin, portal_admin, and regular users
    let userId;
    if (req.user?.role === 'superadmin' || req.user?.role === 'portal_admin') {
      // For superadmin/portal_admin, check both formats to find existing subscription
      const superadminFormat = `superadmin-${req.user.userId}`;
      const directFormat = req.user.userId.toString();

      console.log(`? [DEBUG] ${req.user.role} ${req.user.userId} checking both formats: ${superadminFormat} and ${directFormat}`);

      // Try superadmin format first
      let subscription = await findSubscriptionById(req, superadminFormat);
      if (subscription) {
        userId = superadminFormat;
        console.log(`? [DEBUG] Found subscription with superadmin format: ${userId}`);
      } else {
        // Try direct format
        subscription = await findSubscriptionById(req, directFormat);
        if (subscription) {
          userId = directFormat;
          console.log(`? [DEBUG] Found subscription with direct format: ${userId}`);
        } else {
          // Use superadmin format for new subscriptions
          userId = superadminFormat;
          console.log(`? [DEBUG] No existing subscription found, using superadmin format: ${userId}`);
        }
      }
    } else if (req.user?.userId) {
      userId = req.user.userId; // Regular user uses their actual userId
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    console.log(`? [DEBUG] About to call findSubscriptionById with userId: ${userId}`);
    let subscription = await findSubscriptionById(req, userId);
    console.log(`? [DEBUG] findSubscriptionById returned:`, subscription ? {
      id: subscription.id,
      superadminId: subscription.superadminId,
      planType: subscription.planType,
      planName: subscription.planName,
      status: subscription.status
    } : null);

    // If no subscription exists, create a free trial
    if (!subscription) {
      console.log(`? [DEBUG] No subscription found for ${userId}, creating new one`);
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10); // 10 days free trial

      subscription = {
        superadminId: userId, // Use superadminId for consistency
        planType: 'free',
        planName: 'Free',
        status: 'active',
        startDate: new Date(),
        expiryDate,
        durationDays: 10,
        isFreeTrial: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log(`? [DEBUG] Creating new subscription with superadminId: ${userId}`);
      subscription = await saveSubscriptionObject(subscription);
    } else {
      console.log(`? [DEBUG] Found existing subscription:`, {
        id: subscription.id,
        superadminId: subscription.superadminId,
        planName: subscription.planName
      });
    }

    // Normalize expiry as Date
    const now = new Date();
    const expiry = new Date(subscription.expiryDate);
    if (expiry < now && subscription.status === 'active') {
      subscription.status = 'expired';
      subscription.updatedAt = new Date();
      await saveSubscriptionObject(subscription);
    }

    res.json({
      success: true,
      subscription: {
        planType: subscription.planType,
        planName: subscription.planName,
        status: subscription.status,
        expiryDate: subscription.expiryDate,
        startDate: subscription.startDate,
        durationDays: subscription.durationDays,
        isFreeTrial: subscription.isFreeTrial,
        remainingSeconds: Math.max(0, Math.floor((new Date(subscription.expiryDate) - now) / 1000))
      }
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription',
    });
  }
};

// Create subscription order
const createSubscriptionOrder = async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) return paymentsNotConfigured(res);

    // Any amount sent by the browser is ignored
    const plan = resolvePaidPlan(req.body?.planId, res);
    if (!plan) return;
    const planId = plan.id;
    const planName = plan.name;
    const amount = plan.amountPaise / 100;

    const options = {
      amount: plan.amountPaise,
      currency: 'INR',
      receipt: `sub_${Date.now()}`,
      payment_capture: 1,
      notes: { planId: plan.id } // ties the gateway order to the plan it was created for
    };

    let order;
    try {
      order = await razorpay.orders.create(options);
    } catch (rzpError) {
      console.error('Razorpay order creation failed:', rzpError.message);
      return res.status(502).json({ success: false, message: 'The payment gateway could not create the order. Please try again.' });
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        createdAt: order.created_at || Math.floor(Date.now() / 1000)
      },
      planData: {
        planId,
        planName,
        amount
      }
    });
  } catch (error) {
    console.error('Error creating subscription order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subscription order',
    });
  }
};

// Verify subscription payment and activate
const verifySubscriptionPayment = async (req, res) => {
  try {
    // Handle both superadmin, portal_admin, and regular users
    let userId;
    if (req.user?.role === 'superadmin' || req.user?.role === 'portal_admin') {
      userId = `superadmin-${req.user.userId}`; // Convert to superadminId format
      console.log(`? [DEBUG] ${req.user.role} ${req.user.userId} verifying payment`);
    } else if (req.user?.userId) {
      userId = req.user.userId; // Regular user uses their actual userId
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      orderId,
      paymentId,
      signature,
      planId: requestedPlanId
    } = req.body;

    if (!orderId || !paymentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment parameters'
      });
    }

    // A plan is activated only for a payment the gateway has signed and captured.
    if (!getRazorpay()) return paymentsNotConfigured(res);

    const plan = resolvePaidPlan(requestedPlanId, res);
    if (!plan) return;
    const planId = plan.id;
    const planName = plan.name;
    const amount = plan.amountPaise / 100;
    const durationDays = plan.periodDays;
    if (typeof signature !== 'string' || signature === '') {
      return res.status(400).json({ success: false, message: 'Missing payment signature' });
    }
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const signatureMatches =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    if (!signatureMatches) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // The gateway must confirm: this payment belongs to this order, the order was created
    // for this plan, and the plan's full price was captured.
    let gatewayPayment;
    let gatewayOrder;
    try {
      gatewayPayment = await getRazorpay().payments.fetch(paymentId);
      gatewayOrder = await getRazorpay().orders.fetch(orderId);
    } catch (fetchError) {
      console.error('Razorpay lookup failed:', fetchError.message);
      return res.status(502).json({ success: false, message: 'The payment could not be confirmed with the gateway.' });
    }
    const paidInFull =
      gatewayPayment.order_id === orderId &&
      gatewayPayment.status === 'captured' &&
      Number(gatewayPayment.amount) === plan.amountPaise &&
      Number(gatewayOrder.amount) === plan.amountPaise &&
      gatewayOrder.notes?.planId === plan.id;
    if (!paidInFull) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // One payment activates one period, once: a repeated request does not extend the plan
    const alreadyUsed = await new Promise((resolve, reject) => {
      getDatabaseFromRequest(req).get('SELECT id FROM subscriptions WHERE paymentId = ?', [paymentId], (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
    if (alreadyUsed) {
      return res.status(409).json({ success: false, message: 'This payment has already been used to activate a plan.' });
    }

    // Payment verified - Update or create subscription
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    let subscription = await findSubscriptionById(req, userId);

    if (subscription) {
      // Update existing subscription object
      subscription.planType = planId;
      subscription.planName = planName;
      subscription.status = 'active';
      subscription.startDate = new Date();
      subscription.expiryDate = expiryDate;
      subscription.durationDays = durationDays;
      subscription.paymentId = paymentId;
      subscription.amount = amount;
      subscription.isFreeTrial = false;
      subscription.updatedAt = new Date();
    } else {
      // Create new subscription object
      subscription = {
        userId, // Use userId for both regular users and superadmin
        superadminId: req.user?.role === 'superadmin' ? 'superadmin-1' : null, // Only set superadminId for actual superadmin
        planType: planId,
        planName: planName,
        status: 'active',
        startDate: new Date(),
        expiryDate,
        durationDays,
        paymentId,
        amount,
        currency: 'INR',
        paymentMethod: 'razorpay',
        isFreeTrial: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    subscription = await saveSubscriptionObject(subscription);

    // 🚀 IMMEDIATE PROPAGATION FOR ALL PLAN CHANGES
    // Use the new immediate propagation system for real-time updates
    console.log(`🔄 Triggering IMMEDIATE plan propagation for SuperAdmin ${userId}...`);
    await triggerImmediatePropagation(req, userId, planId, planName, expiryDate);

    res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      subscription: {
        planType: subscription.planType,
        planName: subscription.planName,
        status: subscription.status,
        expiryDate: subscription.expiryDate,
        remainingSeconds: Math.floor((new Date(subscription.expiryDate) - new Date()) / 1000)
      }
    });
  } catch (error) {
    console.error('Error verifying subscription payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify subscription payment',
    });
  }
};

// Test endpoint for demonstration - bypass payment verification
const testUpgradeSubscription = async (req, res) => {
  try {
    // Handle both superadmin, portal_admin, and regular users
    let userId;
    if (req.user?.role === 'superadmin' || req.user?.role === 'portal_admin') {
      // For superadmin/portal_admin, check both formats to find existing subscription
      const superadminFormat = `superadmin-${req.user.userId}`;
      const directFormat = req.user.userId.toString();

      console.log(`? [DEBUG] ${req.user.role} ${req.user.userId} testing upgrade, checking both formats: ${superadminFormat} and ${directFormat}`);

      // Try superadmin format first
      let subscription = await findSubscriptionById(req, superadminFormat);
      if (subscription) {
        userId = superadminFormat;
        console.log(`? [DEBUG] Found existing subscription with superadmin format: ${userId}`);
      } else {
        // Try direct format
        subscription = await findSubscriptionById(req, directFormat);
        if (subscription) {
          userId = directFormat;
          console.log(`? [DEBUG] Found existing subscription with direct format: ${userId}`);
        } else {
          // Use superadmin format for new subscriptions
          userId = superadminFormat;
          console.log(`? [DEBUG] No existing subscription found, using superadmin format: ${userId}`);
        }
      }
    } else if (req.user?.userId) {
      userId = req.user.userId; // Regular user uses their actual userId
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { planId, planName, durationDays = 30 } = req.body;

    // Create upgraded subscription
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    // Find subscription again with the correct userId
    let subscription = await findSubscriptionById(req, userId);

    if (subscription) {
      // Update existing subscription
      subscription.planType = planId;
      subscription.planName = planName;
      subscription.status = 'active';
      subscription.startDate = new Date();
      subscription.expiryDate = expiryDate;
      subscription.durationDays = durationDays;
      subscription.isFreeTrial = false;
      subscription.updatedAt = new Date();
    } else {
      // Create new subscription
      subscription = {
        superadminId: userId,
        planType: planId,
        planName: planName,
        status: 'active',
        startDate: new Date(),
        expiryDate,
        durationDays,
        isFreeTrial: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    console.log(`? [DEBUG] About to save subscription:`, {
      superadminId: subscription.superadminId,
      planType: subscription.planType,
      planName: subscription.planName,
      isUpdate: !!subscription.id
    });

    try {
      subscription = await saveSubscriptionObject(subscription);

      console.log(`? [DEBUG] Saved subscription result:`, {
        id: subscription.id,
        superadminId: subscription.superadminId,
        planName: subscription.planName,
        hasId: !!subscription.id
      });
    } catch (saveError) {
      console.error(`? [DEBUG] Error saving subscription:`, saveError);
      throw saveError;
    }

    // 🚀 IMMEDIATE PROPAGATION FOR ALL PLAN CHANGES
    // Use the new immediate propagation system for real-time updates
    console.log(`🔄 Triggering IMMEDIATE plan propagation for SuperAdmin ${userId}...`);
    await triggerImmediatePropagation(req, userId, planId, planName, expiryDate);

    res.json({
      success: true,
      message: 'Test subscription upgraded successfully',
      subscription: {
        planType: subscription.planType,
        planName: subscription.planName,
        status: subscription.status,
        expiryDate: subscription.expiryDate,
        startDate: subscription.startDate,
        durationDays: subscription.durationDays,
        isFreeTrial: subscription.isFreeTrial,
        remainingSeconds: Math.floor((subscription.expiryDate - new Date()) / 1000)
      }
    });
  } catch (error) {
    console.error('Error upgrading test subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade test subscription',
    });
  }
};

// Activate free trial
const activateFreeTrial = async (req, res) => {
  try {
    // Handle both superadmin and regular users
    let userId;
    if (req.user?.role === 'superadmin') {
      userId = `superadmin-${req.user.userId}`; // Convert to superadminId format
      console.log(`🔍 [DEBUG] SuperAdmin ${req.user.userId} activating free trial`);
    } else if (req.user?.userId) {
      userId = req.user.userId; // Regular user uses their actual userId
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Check if subscription already exists
    let subscription = await findSubscriptionById(req, userId);

    if (subscription && subscription.status === 'active' && subscription.isFreeTrial === false) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription'
      });
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 10); // 10 days free trial

    if (subscription) {
      subscription.planType = 'free';
      subscription.planName = 'Free';
      subscription.status = 'active';
      subscription.startDate = new Date();
      subscription.expiryDate = expiryDate;
      subscription.durationDays = 10;
      subscription.isFreeTrial = true;
      subscription.paymentId = null;
      subscription.amount = 0;
      subscription.updatedAt = new Date();
    } else {
      subscription = {
        userId,
        planType: 'free',
        planName: 'Free',
        status: 'active',
        startDate: new Date(),
        expiryDate,
        durationDays: 10,
        isFreeTrial: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    subscription = await saveSubscriptionObject(subscription);

    // 🚀 IMMEDIATE PROPAGATION FOR FREE TRIAL
    // Use the new immediate propagation system for real-time updates
    console.log(`🔄 Triggering IMMEDIATE plan propagation for SuperAdmin ${userId}...`);

    // Convert to superadminId format for propagation
    const superadminIdForPropagation = req.user?.role === 'superadmin' ? `superadmin-${userId}` : userId;
    await triggerImmediatePropagation(req, superadminIdForPropagation, 'free', 'Free', expiryDate);

    res.json({
      success: true,
      message: 'Free trial activated',
      subscription: {
        planType: subscription.planType,
        planName: subscription.planName,
        status: subscription.status,
        expiryDate: subscription.expiryDate,
        isFreeTrial: subscription.isFreeTrial,
        remainingSeconds: Math.floor((subscription.expiryDate - new Date()) / 1000)
      }
    });
  } catch (error) {
    console.error('Error activating free trial:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate free trial',
    });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    // Handle both superadmin and regular users
    let userId;
    if (req.user?.role === 'superadmin') {
      // Use the actual SuperAdmin ID from the authenticated user
      userId = req.user.userId; // Use the actual SuperAdmin user ID
      console.log(`🔄 [DEBUG] SuperAdmin ${req.user.userId} cancelling subscription`);
    } else if (req.user?.userId) {
      userId = req.user.userId; // Regular user uses their actual userId
    } else {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    let subscription = await findSubscriptionById(req, userId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Downgrade to free tier immediately
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 10); // give 10 days on free tier

    subscription.planType = 'free';
    subscription.planName = 'Free';
    subscription.status = 'active';
    subscription.startDate = new Date();
    subscription.expiryDate = expiryDate;
    subscription.durationDays = 10;
    subscription.isFreeTrial = false;
    subscription.paymentId = null;
    subscription.amount = 0;
    subscription.updatedAt = new Date();

    await saveSubscriptionObject(subscription);

    // 🚀 IMMEDIATE PROPAGATION FOR CANCELLATION
    // Use the new immediate propagation system for real-time updates
    console.log(`🔄 Triggering IMMEDIATE plan propagation for SuperAdmin ${userId}...`);

    // Convert to superadminId format for propagation
    const superadminIdForPropagation = req.user?.role === 'superadmin' ? `superadmin-${userId}` : userId;
    await triggerImmediatePropagation(req, superadminIdForPropagation, 'free', 'Free', expiryDate);

    res.json({
      success: true,
      message: 'Subscription cancelled',
      subscription: {
        planType: subscription.planType,
        planName: subscription.planName,
        status: subscription.status,
        expiryDate: subscription.expiryDate,
        durationDays: subscription.durationDays,
        isFreeTrial: subscription.isFreeTrial,
        remainingSeconds: Math.max(0, Math.floor((new Date(subscription.expiryDate) - new Date()) / 1000))
      }
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
    });
  }
};

/**
 * Check feature access for current user
 * Returns which features are available based on inherited subscription tier
 */
const checkFeatureAccess = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    console.log(`? [DEBUG] checkFeatureAccess called for user: ${req.user.userId}, role: ${req.user.role}`);

    // Handle both superadmin, portal_admin, and regular users for feature access
    if (req.user?.role === 'superadmin' || req.user?.role === 'portal_admin') {
      console.log(`? [DEBUG] Entering portal_admin/superadmin path for feature access`);

      // For superadmin/portal_admin, check both formats to find existing subscription
      const superadminFormat = `superadmin-${req.user.userId}`;
      const directFormat = req.user.userId.toString();

      console.log(`? [DEBUG] ${req.user.role} ${req.user.userId} checking feature access, checking both formats: ${superadminFormat} and ${directFormat}`);

      // Try superadmin format first
      let subscription = await findSubscriptionById(req, superadminFormat);
      if (subscription) {
        console.log(`? [DEBUG] Found subscription for feature access with superadmin format: ${superadminFormat}`);

        // Check feature access
        const features = getFeaturesForPlan(subscription.planType);
        const featureName = 'calendar'; // Replace with the actual feature name
        if (features[featureName] && features[featureName].max === -1) {
          // Unlimited access
          return res.json({
            success: true,
            hasAccess: true,
            planType: subscription.planType,
            planName: subscription.planName,
            message: `Unlimited ${featureName} access with ${subscription.planName} plan`
          });
        } else if (features[featureName]) {
          // Limited access
          return res.json({
            success: true,
            hasAccess: true,
            planType: subscription.planType,
            planName: subscription.planName,
            message: `${featureName} access available (${features[featureName].max} max) with ${subscription.planName} plan`
          });
        }
      } else {
        // Try direct format
        subscription = await findSubscriptionById(req, directFormat);
        if (subscription) {
          console.log(`? [DEBUG] Found subscription for feature access with direct format: ${directFormat}`);

          // Check feature access
          const features = getFeaturesForPlan(subscription.planType);
          const featureName = 'calendar'; // Replace with the actual feature name
          if (features[featureName] && features[featureName].max === -1) {
            // Unlimited access
            return res.json({
              success: true,
              hasAccess: true,
              planType: subscription.planType,
              planName: subscription.planName,
              message: `Unlimited ${featureName} access with ${subscription.planName} plan`
            });
          } else if (features[featureName]) {
            // Limited access
            return res.json({
              success: true,
              hasAccess: true,
              planType: subscription.planType,
              planName: subscription.planName,
              message: `${featureName} access available (${features[featureName].max} max) with ${subscription.planName} plan`
            });
          }
        }
      }
    }

    // For regular users, use inheritance system
    const userId = req.user.userId;
    const userPlan = await planInheritance.getEffectiveUserPlan(userId);

    console.log(`📊 [DEBUG] Final response for user ${req.user.userId}:`, {
      success: true,
      currentPlan: userPlan.planType,
      canAccessCalendar: userPlan.canAccessCalendar,
      isExpired: userPlan.isExpired,
      message: userPlan.planType === 'free' ? 'Limited features on free tier' : `Full features on ${userPlan.planType} tier`
    });

    res.status(200).json({
      success: true,
      currentPlan: userPlan.planType,
      features: userPlan.features,
      canAccessCalendar: userPlan.canAccessCalendar,
      canExportData: userPlan.canExportData,
      isExpired: userPlan.isExpired,
      expiryDate: userPlan.expiryDate,
      message: userPlan.planType === 'free' ? 'Limited features on free tier' : `Full features on ${userPlan.planType} tier`
    });
  } catch (error) {
    console.error('❌ [DEBUG] Error in checkFeatureAccess:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check feature access'
    });
  }
};

// Export the propagatePlanToUniversities function for testing
module.exports = {
  setPaymentGatewayForTests,
  getCurrentSubscription,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  activateFreeTrial,
  cancelSubscription,
  checkFeatureAccess,
  testUpgradeSubscription,
  findSubscriptionById,
  saveSubscriptionObject,
  getFeaturesForPlan,
  propagatePlanToUniversities,
  triggerImmediatePropagation
};
