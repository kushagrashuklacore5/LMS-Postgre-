import React, { useState, useEffect, useCallback } from 'react';
import StudentLayout from "../../components/StudentLayout";
import { 
  CreditCard, 
  Receipt, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  Building2, 
  Calendar,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  ChevronRight,
  FileCheck2,
  Lock,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from "../../auth/auth";
import { generateInvoicePdf } from "../../accountant/invoice";
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';

const PayFees = () => {
  const { user, token, API } = useAuth();
  const { t } = useTranslation();

  const [installmentSummary, setInstallmentSummary] = useState(null);
  const [feeStructure, setFeeStructure] = useState(null);
  const [classroom, setClassroom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [selectedStageNum, setSelectedStageNum] = useState(1);
  const [paymentOptionLabel, setPaymentOptionLabel] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [dbPayments, setDbPayments] = useState([]);
  const [pendingVerification, setPendingVerification] = useState(null);

  // Fallback fee structure if not loaded yet
  const defaultFeeStructure = {
    id: 1,
    category: 'Standard Curriculum',
    description: 'Annual Academic & Laboratory Tuition',
    tuitionFee: 5000,
    transportFee: 1000,
    computerLabFee: 800,
    libraryFee: 500,
    sportsFee: 300,
    examinationFee: 450,
    miscellaneousFee: 0,
    totalFee: 8050,
    dueDate: '2026-11-30',
    installmentOptions: [
      {
        id: 'full',
        name: '1-Time Full Clearance (100%)',
        installmentsCount: 1,
        splitType: 'equal',
        isActive: true,
        installments: [{ number: 1, label: 'Full Payment', percentage: 100, dueDate: '2026-11-30' }]
      }
    ]
  };

  const fetchPaymentsHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/accountant/student-payments-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setDbPayments(json.data);
        }
      }
    } catch (err) {
      console.warn('Could not fetch student payment history:', err);
    }
  }, [API, token]);

  const fetchInstallmentStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/accountant/student-installment-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setInstallmentSummary(json.data);
          if (json.data.feeStructure) {
            setFeeStructure(json.data.feeStructure);
          }
          if (json.data.activeSchedule) {
            setSelectedPlanId(json.data.activeSchedule.planId);
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch student installment status:', err);
    }
  }, [API, token]);

  const initializeStudentFees = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch live installment summary & payment history
      await Promise.all([
        fetchInstallmentStatus(),
        fetchPaymentsHistory()
      ]);

      // 2. Fetch student's assigned classroom
      try {
        const classroomResp = await fetch(`${API}/classrooms/student-classrooms`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (classroomResp.ok) {
          const classroomData = await classroomResp.json();
          const myClass = Array.isArray(classroomData) && classroomData.length > 0 ? classroomData[0] : null;
          setClassroom(myClass);
        }
      } catch (err) {
        console.warn('Could not fetch student classroom:', err);
      }

      // 3. Fetch fee structures for plan options
      try {
        const resp = await fetch(`${API}/classrooms/fee-structures`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.ok) {
          const structures = await resp.json();
          if (Array.isArray(structures) && structures.length > 0) {
            setFeeStructure(prev => prev || structures[0]);
          }
        }
      } catch (err) {
        console.warn('Could not fetch fee structures:', err);
      }

    } catch (error) {
      console.error('Error initializing student fees:', error);
    } finally {
      setLoading(false);
    }
  }, [API, token, fetchInstallmentStatus, fetchPaymentsHistory]);

  useEffect(() => {
    if (token) {
      initializeStudentFees();
    }
  }, [token, initializeStudentFees]);

  const currentStructure = feeStructure || installmentSummary?.feeStructure || defaultFeeStructure;
  const totalFee = installmentSummary?.activeSchedule?.totalFee || currentStructure.totalFee || 8050;
  const lifetimePaid = installmentSummary?.lifetimePaid ?? dbPayments.filter(p => p.status === 'success' || p.status === 'paid').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingTotal = Math.max(0, totalFee - lifetimePaid);
  const isFullyPaid = remainingTotal === 0 && lifetimePaid > 0;
  const isCollectionBlocked = installmentSummary?.collectionBlocked || false;

  // Parse active plans configured by Admin
  const getActiveInstallmentPlans = () => {
    if (installmentSummary?.activeSchedule) {
      return [{
        id: installmentSummary.activeSchedule.planId,
        name: installmentSummary.activeSchedule.planName,
        isLocked: true,
        installments: installmentSummary.stages.map(s => ({
          number: s.stageNumber,
          label: s.label,
          percentage: s.percentage,
          expectedAmount: s.expectedAmount,
          paidAmount: s.paidAmount,
          remainingAmount: s.remainingAmount,
          status: s.status,
          dueDate: s.dueDate
        }))
      }];
    }

    const rawOptions = currentStructure?.installmentOptions;
    if (!rawOptions) return defaultFeeStructure.installmentOptions;
    try {
      const parsed = typeof rawOptions === 'string' ? JSON.parse(rawOptions) : rawOptions;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const activeOnly = parsed.filter(p => p.isActive !== false);
        return activeOnly.length > 0 ? activeOnly : parsed;
      }
    } catch (e) {
      console.warn('Error parsing active installment plans:', e);
    }
    return defaultFeeStructure.installmentOptions;
  };

  const activePlans = getActiveInstallmentPlans();
  const currentSelectedPlan = activePlans.find(p => p.id === selectedPlanId) || activePlans[0] || null;

  // Open Payment modal for specific stage
  const openPlanPayment = (plan, stageNumber = 1) => {
    if (isCollectionBlocked) {
      toast.error(t('dashboard:pf_blocked_toast'));
      return;
    }

    setSelectedPlanId(plan.id);
    setSelectedStageNum(stageNumber);

    let stageAmount = totalFee;
    let stageLabel = t('dashboard:pf_full_payment');

    if (installmentSummary?.stages && installmentSummary.stages.length > 0) {
      const match = installmentSummary.stages.find(s => s.stageNumber === stageNumber);
      if (match) {
        stageAmount = match.remainingAmount;
        stageLabel = match.label || t('dashboard:pf_stage', { n: match.stageNumber });
      }
    } else if (plan.installments && plan.installments.length > 0) {
      const inst = plan.installments.find(i => (i.number || 1) === stageNumber) || plan.installments[0];
      const pct = Number(inst.percentage) || 100;
      stageAmount = Math.round((totalFee * pct) / 100);
      stageLabel = inst.label === 'Full Payment' ? t('dashboard:pf_full_payment') : (inst.label || t('dashboard:pf_stage', { n: inst.number || 1 }));
    }

    setPaymentOptionLabel(`${plan.name} (${stageLabel})`);
    setPaymentAmount(stageAmount.toString());
    setPaymentError('');
    setShowPaymentModal(true);
  };

  // Execute secure server-side order creation & Razorpay Checkout
  const handleProcessPayment = async () => {
    if (paymentLoading) return; // Prevent duplicate submissions

    if (isCollectionBlocked) {
      setPaymentError(t('dashboard:pf_blocked_pending'));
      return;
    }

    const numAmount = Number(paymentAmount);
    if (!numAmount || numAmount <= 0) {
      setPaymentError(t('dashboard:pf_invalid_amount'));
      return;
    }

    setPaymentLoading(true);
    setPaymentError('');

    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    try {
      // 1. Ensure Razorpay SDK script is loaded
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Razorpay payment SDK'));
          document.body.appendChild(script);
        });
      }

      // 2. Server-side Order Creation via POST /api/payments/create-order
      const orderPayload = {
        feeStructureId: currentStructure.id,
        planId: selectedPlanId || 'full',
        installmentStage: selectedStageNum,
        amount: numAmount
      };

      const orderRes = await fetch(`${API}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(orderPayload)
      });

      const orderData = await orderRes.json();

      if (!orderRes.ok || !orderData.success) {
        const errorMsg = orderData.message || 'Failed to create payment order.';
        setPaymentError(errorMsg);
        toast.error(errorMsg);
        setPaymentLoading(false);
        return;
      }

      // 3. Open Razorpay Checkout using server-returned orderId and public keyId
      const options = {
        key: orderData.keyId,
        amount: Math.round(Number(orderData.amount) * 100), // in paise
        currency: orderData.currency || 'INR',
        name: 'Core5 Academy of Excellence',
        description: `Fee Payment - Stage ${orderData.stageNumber} (${orderData.planName})`,
        order_id: orderData.orderId,
        image: '/core5-final-rbg.png',
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || ''
        },
        theme: {
          color: '#002366'
        },
        modal: {
          ondismiss: function () {
            setPaymentLoading(false);
            toast.info(t('dashboard:pf_checkout_dismissed'));
          }
        },
        handler: async function (response) {
          // 4. Submit to server-side verification: POST /api/payments/verify-payment
          setPaymentLoading(true);
          try {
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            };

            const verifyRes = await fetch(`${API}/payments/verify-payment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(verifyPayload)
            });

            const verifyData = await verifyRes.json();

            if (verifyRes.ok && verifyData.success) {
              toast.success(t('dashboard:pf_verified_receipt', { receipt: verifyData.receiptNo }));
              setShowPaymentModal(false);
              setPendingVerification(null);
              // Refresh state from server
              await initializeStudentFees();
            } else {
              const msg = verifyData.message || t('dashboard:pf_verification_failed');
              setPaymentError(msg);
              toast.error(msg);
              if (verifyRes.status === 409) {
                setPendingVerification({
                  orderId: response.razorpay_order_id,
                  paymentId: response.razorpay_payment_id,
                  signature: response.razorpay_signature,
                  message: msg
                });
              }
            }
          } catch (verifyErr) {
            console.error('Payment verification network error:', verifyErr);
            const msg = t('dashboard:pf_verification_timeout');
            setPaymentError(msg);
            toast.warning(msg);
            setPendingVerification({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              message: msg
            });
          } finally {
            setPaymentLoading(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setPaymentLoading(false);
        const failMsg = resp.error?.description || t('dashboard:pf_gateway_failed');
        setPaymentError(failMsg);
        toast.error(failMsg);
      });
      rzp.open();

    } catch (err) {
      console.error('Payment processing error:', err);
      setPaymentError(err.message || t('dashboard:pf_initiate_failed'));
      toast.error(err.message || t('dashboard:pf_initiate_failed'));
      setPaymentLoading(false);
    }
  };

  // Safe retry for pending verification
  const handleRetryVerification = async () => {
    if (!pendingVerification || paymentLoading) return;
    setPaymentLoading(true);

    try {
      const verifyRes = await fetch(`${API}/payments/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          razorpay_order_id: pendingVerification.orderId,
          razorpay_payment_id: pendingVerification.paymentId,
          razorpay_signature: pendingVerification.signature
        })
      });

      const verifyData = await verifyRes.json();

      if (verifyRes.ok && verifyData.success) {
        toast.success(t('dashboard:pf_verified_receipt', { receipt: verifyData.receiptNo }));
        setPendingVerification(null);
        setShowPaymentModal(false);
        await initializeStudentFees();
      } else {
        toast.error(verifyData.message || t('dashboard:pf_retry_failed'));
      }
    } catch (err) {
      toast.error(t('dashboard:pf_retry_network'));
    } finally {
      setPaymentLoading(false);
    }
  };

  // Download official branded PDF invoice
  const handleDownloadInvoice = (txn) => {
    try {
      const breakdownItems = [
        { label: 'Tuition & Academic Instruction Fee', amount: currentStructure.tuitionFee || 5000 },
        { label: 'Computer Lab & Tech Infrastructure', amount: currentStructure.computerLabFee || 800 },
        { label: 'Digital Library & Research Resources', amount: currentStructure.libraryFee || 500 },
        { label: 'Examination & Assessment Fee', amount: currentStructure.examinationFee || 450 },
        { label: 'Sports, Facilities & Extracurriculars', amount: currentStructure.sportsFee || 300 },
        { label: 'Transport / Transit Allowance', amount: currentStructure.transportFee || 1000 }
      ].filter(item => item.amount > 0);

      const studentCollege = (
        user?.university_name ||
        user?.university ||
        classroom?.university ||
        'Core5 Academy of Excellence'
      ).trim();

      const studentIdFormatted = user?.studentId || (user?.id ? `STU-${String(user.id).padStart(4, '0')}` : 'STU-1001');
      const studentClassFormatted = classroom?.name 
        ? `${classroom.name}${classroom.grade ? ` (Grade ${classroom.grade})` : ''}` 
        : 'Academic Session 2026';

      const doc = generateInvoicePdf({
        schoolName: studentCollege,
        instituteAddress: 'Main University Campus, Academic Block',
        instituteContact: 'Authorized Online Portal • Email: finance@core5academy.edu',
        student: {
          id: studentIdFormatted,
          name: user?.name || 'Enrolled Student',
          className: studentClassFormatted,
          collegeName: studentCollege,
          email: user?.email || ''
        },
        feeBreakdown: breakdownItems,
        transactionId: txn.receiptNo || txn.transactionId || txn.id || `TXN_${Date.now()}`,
        paymentDate: txn.paymentDate || new Date().toLocaleDateString('en-GB'),
        transactionAmount: Number(txn.amount) || totalFee,
        paymentOption: txn.description || txn.type || 'Fee Installment',
        paymentMode: txn.type || 'Razorpay Online'
      });
      
      const safeCollegeSlug = studentCollege.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 15);
      const safeNameSlug = (user?.name || 'Student').replace(/\s+/g, '_');
      const safeTxnSlug = (txn.receiptNo || txn.transactionId || txn.id || 'Receipt').slice(-8);
      const fileName = `Fee-Receipt-${safeCollegeSlug}-${safeNameSlug}-${safeTxnSlug}.pdf`;
      
      doc.save(fileName);
      toast.success(t('dashboard:pf_invoice_downloaded'));
    } catch (err) {
      console.error('Invoice generation error:', err);
      toast.error(t('dashboard:pf_invoice_failed'));
    }
  };

  return (
    <StudentLayout>
      <div className="h-full overflow-y-auto bg-[#f8fafc] p-4 sm:p-6 lg:p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Legacy Reconciliation Alert if blocked */}
          {isCollectionBlocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-900">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="space-y-1 text-xs">
                <p className="font-bold text-sm text-amber-950">{t('dashboard:pf_blocked_title')}</p>
                <p>
                  {t('dashboard:pf_blocked_body', { amount: `₹${(installmentSummary?.unallocatedPaid || 0).toLocaleString('en-IN')}` })}
                </p>
              </div>
            </div>
          )}

          {/* Pending Verification Notice */}
          {pendingVerification && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3.5 text-blue-900">
              <div className="flex items-start gap-3 text-xs">
                <Clock className="text-blue-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="font-bold text-sm text-blue-950">{t('dashboard:pf_verification_pending')}</p>
                  <p className="text-blue-800 mt-0.5">{pendingVerification.message}</p>
                  <p className="text-slate-500 font-mono text-[11px] mt-1">{t('dashboard:pf_payment_id', { id: pendingVerification.paymentId })}</p>
                </div>
              </div>
              <button
                onClick={handleRetryVerification}
                disabled={paymentLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {paymentLoading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {t('dashboard:pf_retry_verification')}
              </button>
            </div>
          )}

          {/* ================= 3 KEY METRIC CARDS ================= */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* Total Annual Fee */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('total_curriculum_fee')}</span>
                <div className="w-10 h-10 bg-blue-50 text-[#2563eb] rounded-xl flex items-center justify-center">
                  <Building2 size={18} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">
                  ₹{totalFee.toLocaleString('en-IN')}
                </span>
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {t('dashboard:pf_program')} <span className="font-semibold text-slate-700">{classroom?.name || t('dashboard:pf_default_class')}</span>
                </p>
              </div>
            </div>

            {/* Paid Amount */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">{t('paid_to_date')}</span>
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-bold text-emerald-600">
                  ₹{lifetimePaid.toLocaleString('en-IN')}
                </span>
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isFullyPaid ? 'bg-emerald-500' : lifetimePaid > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} />
                  <span className="font-semibold text-slate-700">
                    {isFullyPaid ? t('dashboard:pf_fully_cleared') : lifetimePaid > 0 ? t('dashboard:pf_partially_paid') : t('dashboard:pf_no_payments')}
                  </span>
                </p>
              </div>
            </div>

            {/* Remaining Balance */}
            <div className={`border rounded-2xl p-6 shadow-xs relative overflow-hidden ${
              remainingTotal > 0 ? 'bg-white border-slate-200/80' : 'bg-emerald-50/50 border-emerald-100'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${remainingTotal > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {t('outstanding_balance')}
                </span>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  remainingTotal > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {remainingTotal > 0 ? <Clock size={18} /> : <ShieldCheck size={18} />}
                </div>
              </div>
              <div className="mt-4">
                <span className={`text-3xl font-bold ${
                  remainingTotal > 0 ? 'text-slate-900' : 'text-emerald-700'
                }`}>
                  ₹{remainingTotal.toLocaleString('en-IN')}
                </span>
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  {t('dashboard:pf_due_date')} <span className="font-semibold text-slate-700">{currentStructure.dueDate || '30 Nov 2026'}</span>
                </p>
              </div>
            </div>

          </div>

          {/* ================= TWO COLUMN SECTION: FEE BREAKDOWN & PAYMENT OPTIONS ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* LEFT: Itemized Fee Breakdown Table (7 Cols) */}
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563eb] flex items-center justify-center">
                    <Receipt size={17} />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">
                    {t('dashboard:pf_breakdown_title')}
                  </h2>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
                  {t('dashboard:pf_itemized_charges')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-3 font-bold">{t('dashboard:pf_fee_component')}</th>
                      <th className="py-3 font-bold">{t('dashboard:pf_frequency')}</th>
                      <th className="py-3 font-bold text-right">{t('dashboard:pf_amount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-600">
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 font-medium text-slate-800">{t('dashboard:pf_item_tuition')}</td>
                      <td className="py-3.5 text-slate-500">{t('dashboard:pf_annual')}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">₹{(currentStructure.tuitionFee || 5000).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 font-medium text-slate-800">{t('dashboard:pf_item_lab')}</td>
                      <td className="py-3.5 text-slate-500">{t('dashboard:pf_annual')}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">₹{(currentStructure.computerLabFee || 800).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 font-medium text-slate-800">{t('dashboard:pf_item_library')}</td>
                      <td className="py-3.5 text-slate-500">{t('dashboard:pf_annual')}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">₹{(currentStructure.libraryFee || 500).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 font-medium text-slate-800">{t('dashboard:pf_item_exam')}</td>
                      <td className="py-3.5 text-slate-500">{t('dashboard:pf_per_term')}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">₹{(currentStructure.examinationFee || 450).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 font-medium text-slate-800">{t('dashboard:pf_item_sports')}</td>
                      <td className="py-3.5 text-slate-500">{t('dashboard:pf_annual')}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">₹{(currentStructure.sportsFee || 300).toLocaleString('en-IN')}</td>
                    </tr>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 font-medium text-slate-800">{t('dashboard:pf_item_transport')}</td>
                      <td className="py-3.5 text-slate-500">{t('dashboard:pf_optional')}</td>
                      <td className="py-3.5 text-right font-bold text-slate-900">₹{(currentStructure.transportFee || 1000).toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-100 bg-slate-50/80 font-bold text-sm text-slate-900">
                      <td className="py-3.5 px-3 rounded-l-xl">{t('dashboard:pf_total_package')}</td>
                      <td className="py-3.5 text-slate-500 text-xs font-normal">{t('dashboard:pf_all_inclusive')}</td>
                      <td className="py-3.5 px-3 text-right text-[#2563eb] text-base rounded-r-xl font-extrabold">
                        ₹{totalFee.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* RIGHT: Active Installment Plans & Stage Breakdown (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-gradient-to-br from-[#0f172a] to-[#1e293b] text-white rounded-2xl p-6 sm:p-7 shadow-xs relative overflow-hidden">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <Sparkles size={15} />
                  <span className="text-xs font-bold uppercase tracking-wider">{t('dashboard:pf_installment_schedule')}</span>
                </div>

                <h3 className="text-xl font-bold tracking-tight">
                  {installmentSummary?.activeSchedule ? t('dashboard:pf_active_plan') : t('dashboard:pf_choose_plan')}
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {installmentSummary?.activeSchedule
                    ? t('dashboard:pf_schedule_active', { plan: installmentSummary.activeSchedule.planName })
                    : t('dashboard:pf_select_plan_hint')}
                </p>

                {/* Plan & Stage cards */}
                <div className="space-y-3 pt-2 max-h-96 overflow-y-auto pr-1">
                  {activePlans.map((plan, pIdx) => (
                    <div 
                      key={plan.id || pIdx}
                      className="p-3.5 rounded-xl border border-white/10 bg-white/5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold flex items-center justify-center">
                            {pIdx + 1}
                          </span>
                          <span className="text-xs font-bold text-white">
                            {plan.name}
                          </span>
                        </div>
                        {installmentSummary?.activeSchedule && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                            {t('common:active')}
                          </span>
                        )}
                      </div>

                      {/* Stage cards with remaining balance and Pay buttons */}
                      <div className="space-y-2 pt-1">
                        {plan.installments.map((inst, i) => {
                          const stageNum = inst.number || i + 1;
                          const stageRemaining = inst.remainingAmount !== undefined ? inst.remainingAmount : Math.round((totalFee * (Number(inst.percentage) || 100)) / 100);
                          const isCleared = stageRemaining === 0;

                          return (
                            <div
                              key={i}
                              className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-slate-200 block text-[11px]">{inst.label === 'Full Payment' ? t('dashboard:pf_full_payment') : (inst.label || t('dashboard:pf_stage', { n: stageNum }))}</span>
                                <span className="text-[10px] text-slate-400">
                                  {t('dashboard:pf_expected')} ₹{(inst.expectedAmount || stageRemaining).toLocaleString('en-IN')} {inst.percentage ? `(${inst.percentage}%)` : ''}
                                </span>
                              </div>

                              <div className="text-right flex items-center gap-2">
                                <div>
                                  <span className={`block font-bold text-xs ${isCleared ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {isCleared ? t('dashboard:pf_cleared') : `₹${stageRemaining.toLocaleString('en-IN')}`}
                                  </span>
                                  {inst.dueDate && <span className="block text-[9px] text-slate-400">{inst.dueDate}</span>}
                                </div>

                                {!isCleared && !isCollectionBlocked && (
                                  <button
                                    onClick={() => openPlanPayment(plan, stageNum)}
                                    className="px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-[11px] rounded-lg shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    {t('dashboard:pf_pay')} <ChevronRight size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 mt-6 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  {t('dashboard:pf_encrypted')}
                </span>
                <span>{t('dashboard:pf_gst')}</span>
              </div>
            </div>

          </div>

          {/* ================= PAYMENT HISTORY & TAX INVOICE DOWNLOADS ================= */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileCheck2 size={17} />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {t('dashboard:pf_history_title')}
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {t('dashboard:pf_verified_records', { n: dbPayments.length })}
              </span>
            </div>

            {dbPayments.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <Receipt size={32} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-700">{t('dashboard:pf_no_records')}</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {t('dashboard:pf_no_records_body')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-3 font-bold">{t('dashboard:pf_date_time')}</th>
                      <th className="py-3 font-bold">{t('dashboard:pf_txn_receipt')}</th>
                      <th className="py-3 font-bold">{t('dashboard:pf_payment_mode')}</th>
                      <th className="py-3 font-bold">{t('dashboard:pf_amount_paid')}</th>
                      <th className="py-3 font-bold">{t('common:status')}</th>
                      <th className="py-3 font-bold text-right">{t('dashboard:pf_receipt')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-600">
                    {dbPayments.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 font-medium text-slate-900">
                          {tx.paymentDate || t('common:today')}
                          <span className="block text-[10px] text-slate-400">{tx.paymentTime || ''}</span>
                        </td>
                        <td className="py-3.5 font-mono text-[11px] text-slate-800 font-semibold">
                          {tx.transactionId || tx.id}
                        </td>
                        <td className="py-3.5 capitalize text-slate-600">
                          <span className="inline-flex items-center gap-1 font-medium">
                            {tx.type || t('dashboard:pf_online_razorpay')}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-slate-900">
                          ₹{Number(tx.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full">
                            <CheckCircle2 size={12} />
                            {t('dashboard:pf_verified')}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            onClick={() => handleDownloadInvoice(tx)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg shadow-2xs transition-all hover:border-slate-300 cursor-pointer"
                          >
                            <Download size={13} className="text-[#2563eb]" />
                            {t('dashboard:pf_pdf_receipt')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ================= PAYMENT MODAL ================= */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div>
                <span className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">{t('dashboard:pf_checkout')}</span>
                <h3 className="text-lg font-bold text-slate-900">
                  {t('dashboard:pf_gateway_title')}
                </h3>
              </div>
              <button 
                onClick={() => setShowPaymentModal(false)}
                disabled={paymentLoading}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Locked Amount Calculation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">{t('dashboard:pf_stage_balance')}</label>
                <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                  <Lock size={11} /> {t('dashboard:pf_server_amount')}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  value={paymentAmount}
                  readOnly
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-sm font-bold text-slate-900 outline-none cursor-not-allowed select-none"
                />
              </div>
              {paymentError && (
                <p className="text-xs text-rose-600 font-medium">{paymentError}</p>
              )}
            </div>

            {/* Student & Stage metadata */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>{t('dashboard:pf_student_name')}</span>
                <span className="font-semibold text-slate-800">{user?.name || t('dashboard:pf_enrolled_student')}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('dashboard:pf_program_class')}</span>
                <span className="font-semibold text-slate-800">{classroom?.name || t('dashboard:pf_default_class')}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('dashboard:pf_payment_stage')}</span>
                <span className="font-semibold text-[#2563eb]">{paymentOptionLabel}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={paymentLoading}
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                {t('common:cancel')}
              </button>
              <button
                type="button"
                disabled={paymentLoading}
                onClick={handleProcessPayment}
                className="flex-1 py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {paymentLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                {paymentLoading ? t('dashboard:pf_connecting') : `${t('dashboard:pf_pay')} ₹${Number(paymentAmount || 0).toLocaleString('en-IN')}`}
              </button>
            </div>

          </div>
        </div>
      )}

    </StudentLayout>
  );
};

export default PayFees;