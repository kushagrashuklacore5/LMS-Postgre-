import React, { useState, useMemo } from 'react';
import { emitPayment } from './mockSocket';
import axios from 'axios';
import PaymentSuccess from '../components/PaymentSuccess';
import { useTranslation } from '../context/TranslationContext';
import { Calendar, CheckCircle, Clock, ShieldCheck, CreditCard, ChevronRight } from 'lucide-react';

// Razorpay test configuration
const RAZORPAY_KEY_ID = (import.meta.env.VITE_RAZORPAY_KEY_ID || '');

export interface InstallmentStage {
  number: number;
  label?: string;
  percentage: number;
  dueDate: string;
}

export interface DynamicInstallmentPlan {
  id: string;
  name: string;
  installmentsCount: number;
  splitType: 'equal' | 'custom';
  status?: string;
  isActive?: boolean;
  installments: InstallmentStage[];
}

export default function PaymentModal({ 
  student, 
  onClose,
  classroom,
  feeStructure,
  totalFees: propTotalFees
}: { 
  student: { id: string; name: string }; 
  onClose?: () => void;
  classroom?: { id: number; name: string; grade: string; section: string };
  feeStructure?: any;
  totalFees?: number;
}) {
  const { t } = useTranslation();
  
  // Calculate total fees from feeStructure or use provided total
  const calculateTotalFees = () => {
    if (propTotalFees && propTotalFees > 0) return propTotalFees;
    if (feeStructure?.totalFee) return Number(feeStructure.totalFee);
    if (feeStructure) {
      return (feeStructure.tuitionFee || 0) + 
             (feeStructure.transportFee || 0) + 
             (feeStructure.computerLabFee || 0) + 
             (feeStructure.libraryFee || 0) + 
             (feeStructure.sportsFee || 0) + 
             (feeStructure.examinationFee || 0) + 
             (feeStructure.miscellaneousFee || 0);
    }
    return 8050; // Default fallback
  };
  
  const totalFees = calculateTotalFees();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  // Extract active dynamic plans from Admin feeStructure
  const activePlans: DynamicInstallmentPlan[] = useMemo(() => {
    if (!feeStructure?.installmentOptions) return [];
    try {
      const raw = typeof feeStructure.installmentOptions === 'string'
        ? JSON.parse(feeStructure.installmentOptions)
        : feeStructure.installmentOptions;
      if (Array.isArray(raw)) {
        return raw.filter((p: any) => p.status === 'active' || p.isActive === true);
      }
    } catch (err) {
      console.warn('Could not parse installmentOptions in PaymentModal:', err);
    }
    return [];
  }, [feeStructure]);

  const [selectedPlanType, setSelectedPlanType] = useState<'full' | string>('full');
  const [selectedStageIdx, setSelectedStageIdx] = useState<number>(0);
  const [amount, setAmount] = useState<string>(String(totalFees));
  const [paymentOptionLabel, setPaymentOptionLabel] = useState<string>('Full Payment (100%)');

  // Handle choosing plan
  const handleSelectPlan = (planKey: string) => {
    setSelectedPlanType(planKey);
    setSelectedStageIdx(0);
    setError('');

    if (planKey === 'full') {
      setAmount(String(totalFees));
      setPaymentOptionLabel('Full Payment (100%)');
    } else {
      const foundPlan = activePlans.find(p => p.id === planKey);
      if (foundPlan && foundPlan.installments && foundPlan.installments.length > 0) {
        const stage = foundPlan.installments[0];
        const stageAmount = Math.round(totalFees * ((stage.percentage || 100) / 100));
        setAmount(String(stageAmount));
        setPaymentOptionLabel(`${foundPlan.name} - Stage 1 (${stage.percentage}%)`);
      }
    }
  };

  // Handle selecting installment stage within an active plan
  const handleSelectStage = (plan: DynamicInstallmentPlan, stageIndex: number) => {
    setSelectedStageIdx(stageIndex);
    const stage = plan.installments[stageIndex];
    if (stage) {
      const stageAmount = Math.round(totalFees * ((stage.percentage || 100) / 100));
      setAmount(String(stageAmount));
      setPaymentOptionLabel(`${plan.name} - Stage ${stage.number || stageIndex + 1} (${stage.percentage}%)`);
    }
  };

  const selectedCustomPlan = activePlans.find(p => p.id === selectedPlanType);

  async function proceed() {
    const numAmount = Number(amount);
    
    if (!amount || numAmount <= 0) {
      setError('Please select an active payment option');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      // Step 1: Create payment payload
      const tx = { 
        id: `TXN_${Date.now()}`, 
        studentId: student.id, 
        amount: numAmount, 
        type: 'Student Payment', 
        status: 'Success', 
        timestamp: new Date().toISOString(),
        paymentOption: paymentOptionLabel,
        studentName: student.name
      };
      
      emitPayment(tx as any);
      setShowSuccess(true);
      if (onClose) {
        setTimeout(() => onClose(), 2500);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Show success animation
  if (showSuccess) {
    return <PaymentSuccess />;
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-7 w-full max-w-lg mx-auto transform transition-all max-h-[90vh] overflow-y-auto border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Accountant Fee Collection</span>
            <h3 className="text-xl font-bold text-slate-900 mt-0.5">{t('pay_fees')}</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1.5 rounded-full hover:bg-slate-100 transition cursor-pointer"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Student & Fee Structure Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('student_name')}</p>
              <p className="font-bold text-slate-900 text-base">{student.name} <span className="text-xs text-slate-500 font-normal">(STU-{String(student.id).padStart(4, '0')})</span></p>
              <p className="text-xs text-slate-600 mt-0.5">{classroom?.name || 'Classroom'} • {feeStructure?.category || 'Standard'} Structure</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-semibold uppercase">{t('total_fees')}</p>
              <p className="text-lg font-extrabold text-blue-700">₹{totalFees.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* Dynamic Payment & Installment Plans (Configured by Admin) */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
            Select Payment / Installment Plan
          </label>
          <div className="space-y-2.5">
            
            {/* Full Payment Option */}
            <button
              type="button"
              onClick={() => handleSelectPlan('full')}
              disabled={loading}
              className={`w-full p-3.5 border rounded-xl text-left transition-all cursor-pointer ${
                selectedPlanType === 'full' 
                  ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600' 
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlanType === 'full' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                    {selectedPlanType === 'full' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{t('full_payment')}</p>
                    <p className="text-xs text-slate-500">100% full single settlement</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-blue-700 text-sm">₹{totalFees.toLocaleString('en-IN')}</p>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">1-Time</span>
                </div>
              </div>
            </button>

            {/* Dynamic Admin-Configured Plans */}
            {activePlans.length === 0 ? (
              <div className="p-3.5 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                No active custom installment plans created by Admin for this structure.
              </div>
            ) : (
              activePlans.map((plan) => (
                <div key={plan.id} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading}
                    className={`w-full p-3.5 border rounded-xl text-left transition-all cursor-pointer ${
                      selectedPlanType === plan.id 
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600' 
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedPlanType === plan.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                          {selectedPlanType === plan.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{plan.name}</p>
                          <p className="text-xs text-slate-500">{plan.installmentsCount} Installments • {plan.splitType === 'equal' ? 'Equal Split' : 'Custom Split'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          {plan.installmentsCount} Stages
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Stage Selector if this plan is selected */}
                  {selectedPlanType === plan.id && plan.installments && plan.installments.length > 0 && (
                    <div className="ml-6 p-3 bg-white border border-blue-200 rounded-xl space-y-2 animate-in fade-in duration-150 shadow-2xs">
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar size={13} className="text-blue-600" />
                        Select Installment Stage to Collect:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {plan.installments.map((inst, idx) => {
                          const instAmount = Math.round(totalFees * ((inst.percentage || 0) / 100));
                          const isStageSelected = selectedStageIdx === idx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSelectStage(plan, idx)}
                              className={`p-2.5 text-left rounded-lg border transition-all cursor-pointer ${
                                isStageSelected
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-xs">Stage {inst.number || idx + 1} ({inst.percentage}%)</span>
                                <span className={`text-xs font-extrabold ${isStageSelected ? 'text-white' : 'text-blue-700'}`}>
                                  ₹{instAmount.toLocaleString('en-IN')}
                                </span>
                              </div>
                              <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${isStageSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                                <Clock size={10} /> Due: {inst.dueDate || 'Standard Term'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Summary of Chosen Installment */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Selected Collection Stage</p>
            <p className="text-sm font-bold text-slate-900">{paymentOptionLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 font-medium">Amount to Collect</p>
            <p className="text-xl font-extrabold text-emerald-700">₹{Number(amount || 0).toLocaleString('en-IN')}</p>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg flex items-center gap-1.5 font-medium">
            ⚠️ {error}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button 
            type="button"
            onClick={onClose} 
            className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer text-sm"
            disabled={loading}
          >
            {t('cancel')}
          </button>
          <button 
            type="button"
            onClick={proceed} 
            disabled={loading || !amount || Number(amount) <= 0}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-xs text-sm"
          >
            <CreditCard size={16} />
            {loading ? t('processing') : `Collect ₹${Number(amount || 0).toLocaleString('en-IN')}`}
          </button>
        </div>

      </div>
    </div>
  );
}
