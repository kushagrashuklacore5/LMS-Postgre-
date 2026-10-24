const { withWriteTransaction, withReadConnection, isBusyError, isConstraintError } = require('./paymentDb');
const {
  MAX_PAYMENT_PAISE,
  parseRupeesToPaise,
  storedRupeesToPaise,
  paiseToRupees,
  splitTotalAcrossStages
} = require('./money');

/**
 * Core Installment Service for Core5 LMS
 * Server-authoritative schedule snapshotting, stage balances in integer paise,
 * strict partial/overpayment validation and idempotent offline collection.
 * All database work runs synchronously on a dedicated connection (see paymentDb.js);
 * `conn` / `db` below are that connection's get/all/run query interface.
 */

class PaymentError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'PaymentError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const PAYMENT_METHODS = ['Cash', 'Cheque', 'Bank Transfer', 'Demand Draft', 'UPI'];
const SUCCESS_STATUSES_SQL = `('success', 'paid')`;
const FULL_PLAN_ID = 'full';

// Paise value of a payments row; rows written before the paise column fall back to the rupee REAL.
const ROW_PAISE_SQL = `COALESCE(amountPaise, CAST(ROUND(amount * 100) AS INTEGER))`;

function parsePositiveInt(value) {
  return /^[1-9]\d{0,14}$/.test(String(value ?? '').trim()) ? Number(value) : null;
}

/** Trims the key and enforces one canonical form for both lookup and storage. */
function normalizeIdempotencyKey(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(key) ? key : null;
}

function isActivePlan(plan) {
  return plan && plan.isActive !== false && plan.status !== 'inactive';
}

function parseSnapshot(schedule) {
  let stages = [];
  try {
    stages = JSON.parse(schedule.scheduleSnapshot) || [];
  } catch (e) {
    stages = [];
  }
  return stages.map(s => ({
    ...s,
    expectedAmountPaise: Number.isInteger(s.expectedAmountPaise)
      ? s.expectedAmountPaise
      : storedRupeesToPaise(s.expectedAmount)
  }));
}

/** A usable university id is a positive integer; anything else is "no tenant" (null). */
function toTenantId(value) {
  return /^[1-9]\d{0,14}$/.test(String(value ?? '').trim()) ? Number(value) : null;
}

async function getValidStudent(conn, studentId) {
  const user = await conn.get(`SELECT id, name, email, role, university_id FROM users WHERE id = ?`, [studentId]);
  if (!user) {
    throw new PaymentError(404, 'STUDENT_NOT_FOUND', `Student with ID ${studentId} not found.`);
  }
  if (user.role !== 'student') {
    throw new PaymentError(422, 'NOT_A_STUDENT', `User ${studentId} is not a student.`);
  }
  return user;
}

async function getClassroomAssignment(conn, studentId) {
  return await conn.get(`SELECT c.id as classroomId, c.name as className, c.grade
     FROM student_classroom_assignment sca
     JOIN classrooms c ON sca.classroomId = c.id
     WHERE sca.studentId = ? LIMIT 1`,
    [studentId]
  );
}

// Primary (grades 1-4) / Secondary fee structure for the student's classroom,
// chosen only among the student's own university's structures. A student with
// no university, or a university with no structure, resolves to none.
async function resolveApplicableFeeStructure(conn, classroomAssignment, student) {
  const universityId = toTenantId(student?.university_id);
  if (universityId === null) return null;

  const gradeNum = parseInt(classroomAssignment?.grade || '1', 10);
  const isPrimary = !isNaN(gradeNum) && gradeNum >= 1 && gradeNum <= 4;
  const targetCategory = isPrimary ? 'Primary' : 'Secondary';

  const feeStructure = await conn.get(`SELECT * FROM feeStructures WHERE university_id = ? AND LOWER(category) = LOWER(?) ORDER BY id DESC LIMIT 1`,
    [universityId, targetCategory]
  );
  return feeStructure || await conn.get(`SELECT * FROM feeStructures WHERE university_id = ? ORDER BY id ASC LIMIT 1`, [universityId]) || null;
}

/** An explicitly requested fee structure must exist AND belong to the student's university. */
async function getRequestedFeeStructure(conn, feeStructureId, student) {
  const universityId = toTenantId(student?.university_id);
  const feeStructure = universityId === null
    ? null
    : await conn.get(`SELECT * FROM feeStructures WHERE id = ? AND university_id = ?`, [feeStructureId, universityId]);
  if (!feeStructure) {
    throw new PaymentError(404, 'FEE_STRUCTURE_NOT_FOUND', `Fee structure with ID ${feeStructureId} not found.`);
  }
  return feeStructure;
}

/** All of a student's active schedules must be exactly zero or one. */
async function getActiveSchedule(conn, studentId) {
  const rows = await conn.all(`SELECT * FROM student_fee_schedules WHERE studentId = ? AND status = 'active' ORDER BY id ASC`,
    [studentId]
  );
  if (rows.length > 1) {
    throw new PaymentError(409, 'MULTIPLE_ACTIVE_SCHEDULES', 'Student has more than one active fee schedule; manual reconciliation is required.');
  }
  return rows[0] || null;
}

/** Successful payments that are not tied to a schedule stage (historical rows). */
async function getUnallocatedSuccessfulPayments(conn, studentId) {
  return await conn.all(`SELECT id, amount, ${ROW_PAISE_SQL} AS paise, type, status, transactionId, createdAt
     FROM payments
     WHERE studentId = ? AND status IN ${SUCCESS_STATUSES_SQL}
       AND (scheduleId IS NULL OR installmentStage IS NULL)
     ORDER BY id ASC`,
    [studentId]
  );
}

/**
 * Builds the immutable stage snapshot for a plan. Stage amounts are integer
 * paise that sum to the total fee exactly (remainder goes to the last stage).
 */
function buildScheduleSnapshot(feeStructure, planId) {
  const totalFeePaise = storedRupeesToPaise(feeStructure.totalFee);
  if (totalFeePaise <= 0) {
    throw new PaymentError(409, 'FEE_STRUCTURE_INVALID', 'The fee structure has no total fee configured.');
  }
  const defaultDueDate = feeStructure.dueDate || new Date().toISOString().split('T')[0];

  let planName = 'Full Payment (100%)';
  let rawStages = [{ number: 1, label: 'Full Fee Clearance (100%)', percentage: 100 }];

  if (planId !== FULL_PLAN_ID) {
    let adminPlans = [];
    try {
      const parsed = typeof feeStructure.installmentOptions === 'string'
        ? JSON.parse(feeStructure.installmentOptions)
        : feeStructure.installmentOptions;
      if (Array.isArray(parsed)) adminPlans = parsed;
    } catch (e) {
      adminPlans = [];
    }

    const matchedPlan = adminPlans.find(p => String(p.id) === String(planId) && isActivePlan(p));
    if (!matchedPlan || !Array.isArray(matchedPlan.installments) || matchedPlan.installments.length === 0) {
      throw new PaymentError(400, 'PLAN_NOT_AVAILABLE', `Requested installment plan '${planId}' is not an active plan for this fee structure.`);
    }
    planName = matchedPlan.name || `Installment Plan (${matchedPlan.installments.length} Stages)`;
    rawStages = matchedPlan.installments;
  }

  let amounts;
  try {
    amounts = splitTotalAcrossStages(totalFeePaise, rawStages.map(s => s.percentage));
  } catch (e) {
    throw new PaymentError(409, 'PLAN_MISCONFIGURED', e.message);
  }

  const stages = rawStages.map((stage, idx) => ({
    stageNumber: Number(stage.number || idx + 1),
    label: stage.label || `Stage ${stage.number || idx + 1}`,
    percentage: stage.percentage !== undefined && stage.percentage !== null && stage.percentage !== ''
      ? Number(stage.percentage)
      : null,
    expectedAmountPaise: amounts[idx],
    expectedAmount: paiseToRupees(amounts[idx]),
    dueDate: stage.dueDate || defaultDueDate
  }));

  if (new Set(stages.map(s => s.stageNumber)).size !== stages.length) {
    throw new PaymentError(409, 'PLAN_MISCONFIGURED', 'Installment plan has duplicate stage numbers.');
  }

  return { planName, totalFeePaise, stages };
}

function buildStageSummaries(stages, schedulePayments, todayStr) {
  return stages.map(stg => {
    const stagePayments = schedulePayments.filter(p => Number(p.installmentStage) === Number(stg.stageNumber));
    const paidPaise = stagePayments.reduce((sum, p) => sum + p.paise, 0);
    const remainingPaise = Math.max(0, stg.expectedAmountPaise - paidPaise);

    let status = 'Pending';
    if (paidPaise >= stg.expectedAmountPaise) {
      status = 'Paid';
    } else if (paidPaise > 0) {
      status = 'Partially Paid';
    } else if (stg.dueDate && stg.dueDate < todayStr) {
      status = 'Overdue';
    }

    return {
      stageNumber: stg.stageNumber,
      label: stg.label || `Stage ${stg.stageNumber}`,
      percentage: stg.percentage,
      expectedAmount: paiseToRupees(stg.expectedAmountPaise),
      expectedAmountPaise: stg.expectedAmountPaise,
      paidAmount: paiseToRupees(paidPaise),
      paidAmountPaise: paidPaise,
      remainingAmount: paiseToRupees(remainingPaise),
      remainingAmountPaise: remainingPaise,
      dueDate: stg.dueDate,
      status,
      payments: stagePayments
    };
  });
}

/**
 * Read-only installment status for a student. Never creates a schedule:
 * viewing the fee page must not lock a plan.
 */
async function calculateStudentInstallmentSummary(database, studentId) {
  return withReadConnection(database, async (db) => await buildStudentInstallmentSummary(db, studentId));
}

async function buildStudentInstallmentSummary(db, studentId) {
  const id = parsePositiveInt(studentId);
  if (id === null) {
    throw new PaymentError(400, 'INVALID_STUDENT_ID', 'A valid student ID is required.');
  }
  const student = await getValidStudent(db, id);
  const classroomAssignment = await getClassroomAssignment(db, id);
  const activeSchedule = await getActiveSchedule(db, id);

  const feeStructure = activeSchedule
    ? await db.get(`SELECT * FROM feeStructures WHERE id = ?`, [activeSchedule.feeStructureId])
    : await resolveApplicableFeeStructure(db, classroomAssignment, student);

  const allPayments = await db.all(`SELECT id, studentId, amount, ${ROW_PAISE_SQL} AS paise, type, status, transactionId, razorpay_payment_id,
            description, createdAt, scheduleId, feeStructureId, planId, installmentStage,
            receiptNo, paymentMethod, referenceNo
     FROM payments
     WHERE studentId = ?
     ORDER BY createdAt ASC, id ASC`,
    [id]
  );

  const successfulPayments = allPayments.filter(p => p.status === 'success' || p.status === 'paid');
  const lifetimePaidPaise = successfulPayments.reduce((sum, p) => sum + p.paise, 0);

  // A payment is "allocated" only if it actually points at a schedule stage.
  // (The allocationStatus column defaulted to 'allocated' on historical rows, so it is not trusted.)
  const isAllocated = p => p.scheduleId !== null && p.installmentStage !== null;
  const unallocatedPayments = allPayments.filter(p => !isAllocated(p));
  const unallocatedPaidPaise = unallocatedPayments
    .filter(p => p.status === 'success' || p.status === 'paid')
    .reduce((sum, p) => sum + p.paise, 0);

  let stageSummaries = [];
  if (activeSchedule) {
    const schedulePayments = successfulPayments.filter(p => Number(p.scheduleId) === Number(activeSchedule.id) && isAllocated(p));
    stageSummaries = buildStageSummaries(parseSnapshot(activeSchedule), schedulePayments, new Date().toISOString().split('T')[0]);
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      className: classroomAssignment?.className || 'Classroom',
      grade: classroomAssignment?.grade || '1'
    },
    feeStructure: feeStructure ? {
      id: feeStructure.id,
      category: feeStructure.category,
      totalFee: Number(feeStructure.totalFee || 0),
      totalFeePaise: storedRupeesToPaise(feeStructure.totalFee),
      dueDate: feeStructure.dueDate
    } : null,
    activeSchedule: activeSchedule ? {
      id: activeSchedule.id,
      feeStructureId: activeSchedule.feeStructureId,
      planId: activeSchedule.planId,
      planName: activeSchedule.planName,
      totalFee: activeSchedule.totalFee,
      totalFeePaise: Number.isInteger(activeSchedule.totalFeePaise)
        ? activeSchedule.totalFeePaise
        : storedRupeesToPaise(activeSchedule.totalFee),
      assignedAt: activeSchedule.assignedAt
    } : null,
    stages: stageSummaries,
    lifetimePaid: paiseToRupees(lifetimePaidPaise),
    lifetimePaidPaise,
    unallocatedPayments,
    unallocatedPaid: paiseToRupees(unallocatedPaidPaise),
    unallocatedPaidPaise,
    // Until a reconciliation rule exists, students with successful unallocated
    // (historical) payments cannot be charged again through installments.
    collectionBlocked: unallocatedPaidPaise > 0,
    collectionBlockedReason: unallocatedPaidPaise > 0 ? 'LEGACY_RECONCILIATION_REQUIRED' : null,
    totalPaymentsCount: allPayments.length
  };
}

/** Validates and canonicalizes an offline collection request without touching the database. */
function validateOfflinePayload(payload) {
  const invalid = (message) => new PaymentError(400, 'INVALID_REQUEST', message);
  const p = payload && typeof payload === 'object' ? payload : {};

  const studentId = parsePositiveInt(p.studentId);
  if (studentId === null) throw invalid('A valid student ID is required.');

  const amountPaise = parseRupeesToPaise(p.amount);
  if (amountPaise === null) {
    throw invalid('Amount must be a positive rupee value with at most two decimal places.');
  }
  if (amountPaise > MAX_PAYMENT_PAISE) throw invalid('Amount exceeds the maximum allowed for a single payment.');

  const stage = parsePositiveInt(p.installmentStage);
  if (stage === null) throw invalid('A valid installment stage is required.');

  if (!PAYMENT_METHODS.includes(p.paymentMethod)) {
    throw invalid(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`);
  }

  const idempotencyKey = normalizeIdempotencyKey(p.idempotencyKey);
  if (idempotencyKey === null) {
    throw invalid('An idempotency key (1-128 letters, digits, ".", "_", ":" or "-") is required.');
  }

  let planId = null;
  if (p.planId !== undefined && p.planId !== null && p.planId !== '') {
    planId = String(p.planId).trim();
    if (planId === '' || planId.length > 100) throw invalid('Invalid plan ID.');
  }

  let feeStructureId = null;
  if (p.feeStructureId !== undefined && p.feeStructureId !== null && p.feeStructureId !== '') {
    feeStructureId = parsePositiveInt(p.feeStructureId);
    if (feeStructureId === null) throw invalid('Invalid fee structure ID.');
  }

  let paymentDate = new Date().toISOString();
  if (p.paymentDate !== undefined && p.paymentDate !== null && p.paymentDate !== '') {
    const parsed = typeof p.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.paymentDate)
      ? new Date(p.paymentDate)
      : null;
    if (!parsed || isNaN(parsed.getTime())) throw invalid('Invalid payment date.');
    if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw invalid('Payment date cannot be in the future.');
    paymentDate = p.paymentDate;
  }

  const optionalText = (value, max, label) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > max) throw invalid(`Invalid ${label}.`);
    return value.trim() || null;
  };

  return {
    studentId,
    amountPaise,
    stage,
    paymentMethod: p.paymentMethod,
    idempotencyKey,
    planId,
    feeStructureId,
    paymentDate,
    referenceNo: optionalText(p.referenceNo, 64, 'reference number'),
    remarks: optionalText(p.remarks, 500, 'remarks')
  };
}

/**
 * Decides what a reused idempotency key means: the original receipt for an
 * identical request, or a 409 when any material field differs.
 */
function resolveExistingIdempotentPayment(existing, req) {
  const sameRequest =
    Number(existing.studentId) === req.studentId &&
    Number(existing.paise) === req.amountPaise &&
    Number(existing.installmentStage) === req.stage &&
    existing.paymentMethod === req.paymentMethod &&
    (req.feeStructureId === null || Number(existing.feeStructureId) === req.feeStructureId) &&
    (req.planId === null || String(existing.planId) === req.planId);

  if (!sameRequest) {
    throw new PaymentError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'Idempotency key conflict: this key was already used with different payment details.');
  }
  return {
    success: true,
    isDuplicate: true,
    message: 'Payment already recorded with this idempotency key. Returned existing receipt.',
    payment: existing
  };
}

async function findPaymentByIdempotencyKey(conn, key) {
  return await conn.get(`SELECT *, ${ROW_PAISE_SQL} AS paise FROM payments WHERE idempotencyKey = ?`, [key]);
}

/**
 * Records an offline installment collection. Idempotency lookup, student and
 * schedule validation, balance check and insert all happen in ONE immediate
 * transaction on a dedicated connection.
 */
async function recordOfflineInstallmentPayment(db, payload, actor = {}) {
  // The collecting staff member's university is mandatory: there is no default tenant
  const actorUniversityId = toTenantId(actor.universityId);
  if (actorUniversityId === null) {
    throw new PaymentError(403, 'TENANT_REQUIRED', 'Access denied: Tenant association missing or invalid');
  }
  const req = validateOfflinePayload(payload);

  try {
    return await withWriteTransaction(db, async (conn) => {
      // 0. A known student of another university is refused before anything else is revealed
      //    (an unknown id still falls through to the usual not-found handling in step 2)
      const target = await conn.get(`SELECT university_id FROM users WHERE id = ?`, [req.studentId]);
      if (target && toTenantId(target.university_id) !== actorUniversityId) {
        throw new PaymentError(403, 'CROSS_TENANT_FORBIDDEN', 'Access denied: This student does not belong to your university.');
      }

      // 1. Idempotent replay (inside the write lock, so concurrent retries serialize here)
      const existing = await findPaymentByIdempotencyKey(conn, req.idempotencyKey);
      if (existing) return resolveExistingIdempotentPayment(existing, req);

      // 2. Student must exist and be a student
      const student = await getValidStudent(conn, req.studentId);

      // 3. Historical payments that were never allocated block further collection
      const unallocated = await getUnallocatedSuccessfulPayments(conn, req.studentId);
      if (unallocated.length > 0) {
        const total = paiseToRupees(unallocated.reduce((sum, p) => sum + p.paise, 0));
        throw new PaymentError(
          409,
          'LEGACY_RECONCILIATION_REQUIRED',
          `This student has ${unallocated.length} earlier payment(s) totalling ₹${total} that are not allocated to any installment. Collection is blocked until they are reconciled.`
        );
      }

      // 4. Locked schedule, or create it now as part of this explicit payment
      let schedule = await getActiveSchedule(conn, req.studentId);
      let stages;
      if (schedule) {
        if (req.planId !== null && req.planId !== String(schedule.planId)) {
          throw new PaymentError(409, 'PLAN_LOCKED', `Student is already locked to plan '${schedule.planName}'; the plan cannot be changed.`);
        }
        if (req.feeStructureId !== null && req.feeStructureId !== Number(schedule.feeStructureId)) {
          throw new PaymentError(409, 'PLAN_LOCKED', 'Student already has an active schedule under a different fee structure.');
        }
        stages = parseSnapshot(schedule);
      } else {
        if (req.planId === null) {
          throw new PaymentError(400, 'INVALID_REQUEST', 'A payment plan must be selected for the first payment.');
        }
        let feeStructure;
        if (req.feeStructureId !== null) {
          feeStructure = await getRequestedFeeStructure(conn, req.feeStructureId, student);
        } else {
          feeStructure = await resolveApplicableFeeStructure(conn, await getClassroomAssignment(conn, req.studentId), student);
          if (!feeStructure) {
            throw new PaymentError(409, 'FEE_STRUCTURE_NOT_FOUND', 'Could not determine applicable fee structure for student.');
          }
        }

        const snapshot = buildScheduleSnapshot(feeStructure, req.planId);
        // Validate the stage before persisting anything for this plan
        if (!snapshot.stages.some(s => s.stageNumber === req.stage)) {
          throw new PaymentError(400, 'STAGE_NOT_FOUND', `Stage ${req.stage} does not exist in plan '${snapshot.planName}'.`);
        }

        const snapshotJson = JSON.stringify(snapshot.stages);
        const inserted = await conn.run(`INSERT INTO student_fee_schedules (studentId, feeStructureId, planId, planName, totalFee, totalFeePaise, scheduleSnapshot, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
          [req.studentId, feeStructure.id, req.planId, snapshot.planName, paiseToRupees(snapshot.totalFeePaise), snapshot.totalFeePaise, snapshotJson]
        );
        schedule = { id: inserted.lastID, feeStructureId: feeStructure.id, planId: req.planId, planName: snapshot.planName };
        stages = snapshot.stages;
      }

      const targetStage = stages.find(s => Number(s.stageNumber) === req.stage);
      if (!targetStage) {
        throw new PaymentError(400, 'STAGE_NOT_FOUND', `Stage ${req.stage} does not exist in the student's active schedule.`);
      }

      // 5. Balance check in paise
      const paidRow = await conn.get(`SELECT COALESCE(SUM(${ROW_PAISE_SQL}), 0) AS paid FROM payments
         WHERE scheduleId = ? AND installmentStage = ? AND status IN ${SUCCESS_STATUSES_SQL}`,
        [schedule.id, req.stage]
      );
      const currentlyPaidPaise = Number(paidRow.paid);
      const remainingPaise = Math.max(0, targetStage.expectedAmountPaise - currentlyPaidPaise);

      if (remainingPaise <= 0) {
        throw new PaymentError(409, 'STAGE_ALREADY_PAID', `Installment Stage ${req.stage} is already fully cleared.`);
      }
      if (req.amountPaise > remainingPaise) {
        throw new PaymentError(400, 'OVERPAYMENT', `Payment of ₹${paiseToRupees(req.amountPaise)} exceeds the remaining balance of ₹${paiseToRupees(remainingPaise)} for Stage ${req.stage}.`);
      }

      // 6. Insert, then stamp the receipt number derived from the row's own primary key
      const insertResult = await conn.run(`INSERT INTO payments (
          studentId, amount, amountPaise, type, paymentMethod, status, referenceNo, description, createdAt,
          scheduleId, feeStructureId, planId, installmentStage, allocationStatus, idempotencyKey, recordedBy
        ) VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, ?, ?, 'allocated', ?, ?)`,
        [
          req.studentId,
          paiseToRupees(req.amountPaise),
          req.amountPaise,
          `Offline (${req.paymentMethod})`,
          req.paymentMethod,
          req.referenceNo,
          req.remarks || `Offline fee collection for ${schedule.planName} - Stage ${req.stage}`,
          req.paymentDate,
          schedule.id,
          schedule.feeStructureId,
          schedule.planId,
          req.stage,
          req.idempotencyKey,
          parsePositiveInt(actor.userId)
        ]
      );

      const receiptNo = `RCPT-${String(insertResult.lastID).padStart(8, '0')}`;
      await conn.run(`UPDATE payments SET receiptNo = ?, transactionId = ? WHERE id = ?`, [receiptNo, receiptNo, insertResult.lastID]);
      const insertedPayment = await conn.get(`SELECT * FROM payments WHERE id = ?`, [insertResult.lastID]);

      return {
        success: true,
        isDuplicate: false,
        message: `Offline installment of ₹${paiseToRupees(req.amountPaise).toLocaleString('en-IN')} recorded successfully for Stage ${req.stage}.`,
        payment: insertedPayment,
        stageUpdated: {
          stageNumber: req.stage,
          paidNow: paiseToRupees(req.amountPaise),
          totalStagePaid: paiseToRupees(currentlyPaidPaise + req.amountPaise),
          remainingBalance: paiseToRupees(remainingPaise - req.amountPaise),
          remainingBalancePaise: remainingPaise - req.amountPaise
        }
      };
    });
  } catch (err) {
    if (err instanceof PaymentError) throw err;

    if (isBusyError(err)) {
      throw new PaymentError(503, 'PAYMENT_SYSTEM_BUSY', 'The payment system is busy. Please retry in a moment.');
    }
    if (isConstraintError(err)) {
      // Lost a uniqueness race: answer from what actually got committed.
      const existing = await withReadConnection(db, async (conn) => await findPaymentByIdempotencyKey(conn, req.idempotencyKey)).catch(() => null);
      if (existing) return resolveExistingIdempotentPayment(existing, req);
      if (/student_fee_schedules/.test(err.message)) {
        throw new PaymentError(409, 'PLAN_LOCKED', 'Student already has an active fee schedule.');
      }
    }
    console.error('Offline installment payment failed:', err);
    throw new PaymentError(500, 'PAYMENT_FAILED', 'Could not record the payment. No amount was recorded.');
  }
}

async function prepareOrderDetails(db, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const studentId = parsePositiveInt(p.studentId);
  if (studentId === null) {
    throw new PaymentError(400, 'INVALID_STUDENT_ID', 'A valid student ID is required.');
  }
  const stage = p.installmentStage !== undefined ? parsePositiveInt(p.installmentStage) : 1;
  if (stage === null) {
    throw new PaymentError(400, 'INVALID_STAGE', 'A valid positive installment stage number is required.');
  }
  const requestedPaise = p.amount !== undefined && p.amount !== null ? parseRupeesToPaise(p.amount) : null;
  if (p.amount !== undefined && p.amount !== null && requestedPaise === null) {
    throw new PaymentError(400, 'INVALID_AMOUNT', 'Requested amount must be a positive rupee value with at most 2 decimals.');
  }
  const planId = typeof p.planId === 'string' && p.planId.trim() !== '' ? p.planId.trim() : null;
  const feeStructureId = p.feeStructureId !== undefined ? parsePositiveInt(p.feeStructureId) : null;

  return withWriteTransaction(db, async (conn) => {
    const student = await getValidStudent(conn, studentId);

    const unallocated = await getUnallocatedSuccessfulPayments(conn, studentId);
    if (unallocated.length > 0) {
      const total = paiseToRupees(unallocated.reduce((sum, item) => sum + item.paise, 0));
      throw new PaymentError(
        409,
        'LEGACY_RECONCILIATION_REQUIRED',
        `This student has ${unallocated.length} earlier payment(s) totalling ₹${total} that are not allocated to any installment. Online order creation is blocked until they are reconciled.`
      );
    }

    let schedule = await getActiveSchedule(conn, studentId);
    let stages;
    if (schedule) {
      if (planId !== null && planId !== String(schedule.planId)) {
        throw new PaymentError(409, 'PLAN_LOCKED', `Student is already locked to plan '${schedule.planName}'; the plan cannot be changed.`);
      }
      if (feeStructureId !== null && feeStructureId !== Number(schedule.feeStructureId)) {
        throw new PaymentError(409, 'PLAN_LOCKED', 'Student already has an active schedule under a different fee structure.');
      }
      stages = parseSnapshot(schedule);
    } else {
      if (planId === null) {
        throw new PaymentError(400, 'INVALID_REQUEST', 'A payment plan must be selected for the first payment.');
      }
      let feeStructure;
      if (feeStructureId !== null) {
        feeStructure = await getRequestedFeeStructure(conn, feeStructureId, student);
      } else {
        feeStructure = await resolveApplicableFeeStructure(conn, await getClassroomAssignment(conn, studentId), student);
        if (!feeStructure) {
          throw new PaymentError(409, 'FEE_STRUCTURE_NOT_FOUND', 'Could not determine applicable fee structure for student.');
        }
      }

      const snapshot = buildScheduleSnapshot(feeStructure, planId);
      if (!snapshot.stages.some(s => s.stageNumber === stage)) {
        throw new PaymentError(400, 'STAGE_NOT_FOUND', `Stage ${stage} does not exist in plan '${snapshot.planName}'.`);
      }

      const snapshotJson = JSON.stringify(snapshot.stages);
      const inserted = await conn.run(
        `INSERT INTO student_fee_schedules (studentId, feeStructureId, planId, planName, totalFee, totalFeePaise, scheduleSnapshot, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [studentId, feeStructure.id, planId, snapshot.planName, paiseToRupees(snapshot.totalFeePaise), snapshot.totalFeePaise, snapshotJson]
      );
      schedule = { id: inserted.lastID, feeStructureId: feeStructure.id, planId: planId, planName: snapshot.planName };
      stages = snapshot.stages;
    }

    const targetStage = stages.find(s => Number(s.stageNumber) === stage);
    if (!targetStage) {
      throw new PaymentError(400, 'STAGE_NOT_FOUND', `Stage ${stage} does not exist in the student's active schedule.`);
    }

    const paidRow = await conn.get(
      `SELECT COALESCE(SUM(${ROW_PAISE_SQL}), 0) AS paid FROM payments
       WHERE scheduleId = ? AND installmentStage = ? AND status IN ${SUCCESS_STATUSES_SQL}`,
      [schedule.id, stage]
    );
    const currentlyPaidPaise = Number(paidRow.paid);
    const remainingPaise = Math.max(0, targetStage.expectedAmountPaise - currentlyPaidPaise);

    if (remainingPaise <= 0) {
      throw new PaymentError(409, 'STAGE_ALREADY_PAID', `Installment Stage ${stage} is already fully cleared.`);
    }

    let orderAmountPaise = remainingPaise;
    if (requestedPaise !== null) {
      if (requestedPaise > remainingPaise) {
        throw new PaymentError(
          400,
          'OVERPAYMENT',
          `Requested payment of ₹${paiseToRupees(requestedPaise)} exceeds the remaining balance of ₹${paiseToRupees(remainingPaise)} for Stage ${stage}.`
        );
      }
      orderAmountPaise = requestedPaise;
    }

    // Check for existing active created order within last 15 minutes
    const orderAmountRupees = paiseToRupees(orderAmountPaise);
    const recentActiveOrder = await conn.get(
      `SELECT * FROM payment_orders 
       WHERE studentId = ? AND scheduleId = ? AND installmentStage = ? AND amount = ? AND status = 'created'
         AND createdAt >= utc_now_text(interval '-15 minutes')
       ORDER BY id DESC LIMIT 1`,
      [studentId, schedule.id, stage, orderAmountRupees]
    );

    return {
      studentId,
      scheduleId: schedule.id,
      feeStructureId: schedule.feeStructureId,
      planId: schedule.planId,
      planName: schedule.planName,
      stageNumber: stage,
      orderAmountPaise,
      orderAmountRupees,
      recentActiveOrder
    };
  });
}

async function recordCreatedPaymentOrder(db, orderData) {
  return withWriteTransaction(db, async (conn) => {
    await conn.run(
      `INSERT INTO payment_orders (orderId, studentId, scheduleId, installmentStage, feeStructureId, amount, currency, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'created', utc_now_text())`,
      [
        orderData.orderId,
        orderData.studentId,
        orderData.scheduleId,
        orderData.installmentStage,
        orderData.feeStructureId,
        orderData.amount,
        orderData.currency || 'INR'
      ]
    );
  });
}

async function reconcileGatewayPayment(db, { orderId, paymentId, signature, gatewayPayment, authUser }) {
  if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
    throw new PaymentError(400, 'INVALID_ORDER_ID', 'A valid Razorpay order ID is required.');
  }
  if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
    throw new PaymentError(400, 'INVALID_PAYMENT_ID', 'A valid Razorpay payment ID is required.');
  }

  const cleanOrderId = orderId.trim();
  const cleanPaymentId = paymentId.trim();

  try {
    return await withWriteTransaction(db, async (conn) => {
      // 1. Check if this paymentId has already been reconciled (Idempotency replay)
      const existingPayment = await conn.get(
        `SELECT *, ${ROW_PAISE_SQL} AS paise FROM payments WHERE razorpay_payment_id = ?`,
        [cleanPaymentId]
      );

      if (existingPayment) {
        const sameOrder = existingPayment.razorpay_order_id === cleanOrderId;
        const sameStudent = Number(existingPayment.studentId) === Number(gatewayPayment?.notes?.studentId || existingPayment.studentId);
        if (!sameOrder || (authUser?.role === 'student' && Number(existingPayment.studentId) !== Number(authUser.userId))) {
          throw new PaymentError(409, 'PAYMENT_ID_CONFLICT', 'This payment ID is already associated with a different order or student.');
        }
        return {
          success: true,
          isDuplicate: true,
          message: 'Payment already reconciled. Returned existing receipt.',
          receiptNo: existingPayment.receiptNo,
          payment: existingPayment
        };
      }

      // 2. Fetch the persisted payment_orders record
      const order = await conn.get(`SELECT * FROM payment_orders WHERE orderId = ?`, [cleanOrderId]);
      if (!order) {
        throw new PaymentError(404, 'ORDER_NOT_FOUND', `Payment order ${cleanOrderId} not found.`);
      }

      // 3. Enforce student ownership and tenant scope
      const studentId = Number(order.studentId);
      if (authUser?.role === 'student' && studentId !== Number(authUser.userId)) {
        throw new PaymentError(403, 'FORBIDDEN', 'Access denied: You cannot verify payment orders for another student.');
      }

      await getValidStudent(conn, studentId);

      // 4. Verify gateway payment details against persisted order
      const orderAmountPaise = storedRupeesToPaise(order.amount);
      const gatewayAmountPaise = Number(gatewayPayment?.amount || 0);
      if (gatewayAmountPaise !== orderAmountPaise) {
        throw new PaymentError(400, 'AMOUNT_MISMATCH', `Gateway payment amount (₹${paiseToRupees(gatewayAmountPaise)}) does not match order amount (₹${order.amount}).`);
      }

      if (gatewayPayment?.order_id && gatewayPayment.order_id !== cleanOrderId) {
        throw new PaymentError(400, 'ORDER_MISMATCH', 'Gateway payment order_id does not match the requested order.');
      }

      const gatewayCurrency = (gatewayPayment?.currency || 'INR').toUpperCase();
      if (gatewayCurrency !== 'INR') {
        throw new PaymentError(400, 'CURRENCY_MISMATCH', `Unsupported currency: ${gatewayCurrency}`);
      }

      // 5. Check legacy unallocated payments block
      const unallocated = await getUnallocatedSuccessfulPayments(conn, studentId);
      if (unallocated.length > 0) {
        const total = paiseToRupees(unallocated.reduce((sum, item) => sum + item.paise, 0));
        throw new PaymentError(
          409,
          'LEGACY_RECONCILIATION_REQUIRED',
          `This student has ${unallocated.length} earlier payment(s) totalling ₹${total} that are not allocated to any installment. Reconciliation is blocked until resolved.`
        );
      }

      // 6. Fetch active schedule and target stage
      const schedule = await conn.get(`SELECT * FROM student_fee_schedules WHERE id = ? AND studentId = ?`, [order.scheduleId, studentId]);
      if (!schedule) {
        throw new PaymentError(404, 'SCHEDULE_NOT_FOUND', 'Active fee schedule associated with this order could not be found.');
      }

      const stages = parseSnapshot(schedule);
      const targetStage = stages.find(s => Number(s.stageNumber) === Number(order.installmentStage));
      if (!targetStage) {
        throw new PaymentError(400, 'STAGE_NOT_FOUND', `Installment Stage ${order.installmentStage} not found in schedule snapshot.`);
      }

      // 7. Re-verify remaining stage balance in integer paise immediately before write
      const paidRow = await conn.get(
        `SELECT COALESCE(SUM(${ROW_PAISE_SQL}), 0) AS paid FROM payments
         WHERE scheduleId = ? AND installmentStage = ? AND status IN ${SUCCESS_STATUSES_SQL}`,
        [schedule.id, order.installmentStage]
      );
      const currentlyPaidPaise = Number(paidRow.paid);
      const remainingPaise = Math.max(0, targetStage.expectedAmountPaise - currentlyPaidPaise);

      if (orderAmountPaise > remainingPaise) {
        throw new PaymentError(
          409,
          'OVERPAYMENT_CONFLICT',
          `Stage ${order.installmentStage} has a remaining balance of ₹${paiseToRupees(remainingPaise)}, which is less than the paid amount of ₹${paiseToRupees(orderAmountPaise)}. Payment is captured at gateway but cannot be credited to stage. Manual reconciliation required.`
        );
      }

      // 8. Insert into payments table
      const paymentMethod = gatewayPayment?.method ? String(gatewayPayment.method).toUpperCase() : 'ONLINE';
      const insertResult = await conn.run(
        `INSERT INTO payments (
          studentId, amount, amountPaise, type, paymentMethod, status, referenceNo, description, createdAt,
          scheduleId, feeStructureId, planId, installmentStage, allocationStatus,
          razorpay_payment_id, razorpay_order_id, razorpay_signature
        ) VALUES (?, ?, ?, ?, ?, 'success', ?, ?, utc_now_text(), ?, ?, ?, ?, 'allocated', ?, ?, ?)`,
        [
          studentId,
          paiseToRupees(orderAmountPaise),
          orderAmountPaise,
          'Online (Razorpay)',
          paymentMethod,
          cleanPaymentId,
          `Online fee payment for ${schedule.planName} - Stage ${order.installmentStage}`,
          schedule.id,
          order.feeStructureId,
          schedule.planId,
          order.installmentStage,
          cleanPaymentId,
          cleanOrderId,
          signature || null
        ]
      );

      const receiptNo = `RCPT-${String(insertResult.lastID).padStart(8, '0')}`;
      await conn.run(`UPDATE payments SET receiptNo = ?, transactionId = ? WHERE id = ?`, [receiptNo, receiptNo, insertResult.lastID]);

      // 9. Update payment_orders status to 'captured'
      await conn.run(`UPDATE payment_orders SET status = 'captured' WHERE orderId = ?`, [cleanOrderId]);

      const insertedPayment = await conn.get(`SELECT *, ${ROW_PAISE_SQL} AS paise FROM payments WHERE id = ?`, [insertResult.lastID]);

      return {
        success: true,
        isDuplicate: false,
        message: `Online payment of ₹${paiseToRupees(orderAmountPaise).toLocaleString('en-IN')} verified and credited successfully.`,
        receiptNo,
        payment: insertedPayment,
        stageUpdated: {
          stageNumber: order.installmentStage,
          paidNow: paiseToRupees(orderAmountPaise),
          totalStagePaid: paiseToRupees(currentlyPaidPaise + orderAmountPaise),
          remainingBalance: paiseToRupees(remainingPaise - orderAmountPaise),
          remainingBalancePaise: remainingPaise - orderAmountPaise
        }
      };
    });
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    if (isBusyError(err)) {
      throw new PaymentError(503, 'PAYMENT_SYSTEM_BUSY', 'The payment system is busy. Please retry in a moment.');
    }
    if (isConstraintError(err)) {
      // Check if duplicate race was committed
      const existing = await withReadConnection(db, async (conn) =>
        await conn.get(`SELECT *, ${ROW_PAISE_SQL} AS paise FROM payments WHERE razorpay_payment_id = ?`, [cleanPaymentId])
      ).catch(() => null);

      if (existing) {
        return {
          success: true,
          isDuplicate: true,
          message: 'Payment already reconciled. Returned existing receipt.',
          receiptNo: existing.receiptNo,
          payment: existing
        };
      }
    }
    console.error('Gateway reconciliation failed:', err);
    throw new PaymentError(500, 'RECONCILIATION_FAILED', 'Could not reconcile payment. Please retry.');
  }
}

module.exports = {
  PaymentError,
  PAYMENT_METHODS,
  normalizeIdempotencyKey,
  buildScheduleSnapshot,
  calculateStudentInstallmentSummary,
  recordOfflineInstallmentPayment,
  prepareOrderDetails,
  recordCreatedPaymentOrder,
  reconcileGatewayPayment
};
