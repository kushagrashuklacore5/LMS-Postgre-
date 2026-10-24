import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, DollarSign, User, CreditCard, Calendar, FileText, CheckCircle, Search, Download, Clock } from 'lucide-react';
import { generateInvoicePdf } from '../accountant/invoice';
import { API_ORIGIN } from '../config/api';
import { useTranslation } from '../context/TranslationContext';

// One key per collection attempt, so a retried submit can never record the payment twice
const newIdempotencyKey = () =>
  `offline-${window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export default function OfflineFeeModal({ isOpen, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [students, setStudents] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  
  const [paymentPlanType, setPaymentPlanType] = useState('full');
  const [selectedStageIdx, setSelectedStageIdx] = useState(0);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordedTx, setRecordedTx] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const API_URL = API_ORIGIN;

  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
      setReferenceNo(`OFFLINE-${Math.floor(100000 + Math.random() * 900000)}`);
      setRecordedTx(null);
      setIdempotencyKey(newIdempotencyKey());
      setSelectedStudentId('');
      setAmount('');
      setPaymentPlanType('full');
      setSelectedStageIdx(0);
    }
  }, [isOpen]);

  const fetchInitialData = async () => {
    try {
      setLoadingStudents(true);
      const token = localStorage.getItem('token');
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

      // 1. Fetch live students
      try {
        const studentRes = await axios.get(`${API_URL}/api/accountant/students`, authHeaders);
        if (studentRes.data?.success) {
          setStudents(studentRes.data.students || []);
        }
      } catch (e) {
        console.warn('Error loading accountant students:', e);
      }

      // 2. Fetch fee structures
      try {
        const structRes = await axios.get(`${API_URL}/api/classrooms/fee-structures`, authHeaders);
        if (Array.isArray(structRes.data)) {
          setFeeStructures(structRes.data);
        }
      } catch (e) {
        console.warn('Error loading fee structures:', e);
      }
    } catch (err) {
      console.error('Failed to fetch initial offline data:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email?.toLowerCase().includes(studentSearch.toLowerCase()) ||
    String(s.id).includes(studentSearch)
  );

  const selectedStudent = students.find(s => String(s.id) === String(selectedStudentId));

  // Determine applicable fee structure for selected student
  const applicableStructure = useMemo(() => {
    if (!selectedStudent) return null;
    const gradeNum = parseInt(selectedStudent.studentGrade || selectedStudent.grade || '1', 10);
    const isPrimary = !isNaN(gradeNum) && gradeNum >= 1 && gradeNum <= 4;
    const targetCategory = isPrimary ? 'Primary' : 'Secondary';
    return feeStructures.find(s => s.category?.toLowerCase() === targetCategory.toLowerCase()) || feeStructures[0] || { totalFee: isPrimary ? 8050 : 12100, category: targetCategory };
  }, [selectedStudent, feeStructures]);

  // Extract active dynamic plans from Admin fee structure
  const activePlans = useMemo(() => {
    if (!applicableStructure?.installmentOptions) return [];
    try {
      const raw = typeof applicableStructure.installmentOptions === 'string'
        ? JSON.parse(applicableStructure.installmentOptions)
        : applicableStructure.installmentOptions;
      if (Array.isArray(raw)) {
        return raw.filter(p => p.status === 'active' || p.isActive === true);
      }
    } catch (err) {
      console.warn('Error parsing installment options:', err);
    }
    return [];
  }, [applicableStructure]);

  // Auto calculate amount when student or plan changes
  useEffect(() => {
    if (!applicableStructure) return;
    const total = Number(applicableStructure.totalFee || 8050);

    if (paymentPlanType === 'full') {
      setAmount(String(total));
      setRemarks(`Full fee clearance for ${applicableStructure.category || 'Academic'} Session.`);
    } else {
      const plan = activePlans.find(p => p.id === paymentPlanType);
      if (plan && plan.installments && plan.installments[selectedStageIdx]) {
        const stage = plan.installments[selectedStageIdx];
        const stageAmount = Math.round(total * (stage.percentage || 100)) / 100; // exact to the paisa, matching the server schedule
        setAmount(String(stageAmount));
        setRemarks(`Offline Fee Collection: ${plan.name} - Stage ${stage.number || selectedStageIdx + 1} (${stage.percentage}%, Due: ${stage.dueDate || 'N/A'})`);
      }
    }
  }, [selectedStudentId, paymentPlanType, selectedStageIdx, applicableStructure, activePlans]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      toast.error('Please select a student');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('token');
      const selectedPlan = activePlans.find(p => p.id === paymentPlanType);
      const selectedStage = selectedPlan?.installments?.[selectedStageIdx];
      const payload = {
        studentId: selectedStudentId,
        feeStructureId: applicableStructure?.id,
        planId: paymentPlanType,
        installmentStage: paymentPlanType === 'full' ? 1 : (selectedStage?.number || selectedStageIdx + 1),
        amount: Number(amount),
        paymentMethod,
        referenceNo,
        remarks: remarks || `Offline fee collection via ${paymentMethod}`,
        paymentDate,
        idempotencyKey
      };

      const res = await axios.post(`${API_URL}/api/accountant/collect-offline-fee`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'Offline fee payment recorded!');
        const txData = res.data.payment || {
          transactionId: referenceNo,
          amount: Number(amount),
          createdAt: paymentDate,
          type: `Offline (${paymentMethod})`
        };
        setRecordedTx(txData);

        if (onSuccess) {
          onSuccess(txData);
        }
      } else {
        toast.error(res.data?.message || 'Failed to record fee');
      }
    } catch (err) {
      console.error('Error submitting offline payment:', err);
      toast.error(err.response?.data?.message || 'Error recording offline fee payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!selectedStudent || !recordedTx) return;
    try {
      const breakdownItems = [
        { label: `Offline Fee Collection (${paymentMethod})`, amount: Number(amount) }
      ];

      const doc = generateInvoicePdf({
        schoolName: "Core5 Academic Institution",
        student: { 
          id: String(selectedStudent.id), 
          name: selectedStudent.name, 
          className: selectedStudent.className || `Grade ${selectedStudent.grade || '1'}`,
          email: selectedStudent.email
        },
        feeBreakdown: breakdownItems,
        transactionId: recordedTx.transactionId || referenceNo,
        paymentDate: paymentDate,
        transactionAmount: Number(amount),
        paymentOption: paymentPlanType === 'full' ? 'Full Payment' : 'Installment Stage',
        paymentMode: `Offline (${paymentMethod})`
      });
      doc.save(`Fee-Receipt-${selectedStudent.name.replace(/\s+/g, '_')}-${recordedTx.transactionId || referenceNo}.pdf`);
      toast.success("Tax Invoice PDF downloaded!");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF invoice.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white border border-[#ebdcaa] rounded-none shadow-2xl w-full max-w-xl overflow-hidden transition-all max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#002366] text-white border-b border-[#B99652] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">{t('record_offline_fee_collection')}</h2>
            <p className="text-xs text-[#ebdcaa]">{t('record_offline_fee_desc')}</p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-300 hover:text-white font-bold text-xl transition-colors cursor-pointer"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {recordedTx ? (
            /* Success State */
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-none border border-emerald-300 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle size={36} />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold text-[#002366]">{t('transaction_recorded_successfully')}</h3>
                <p className="text-sm text-slate-600 mt-1">
                  {t('receipt_number_colon')} <span className="font-bold text-[#002366]">#{recordedTx.transactionId || referenceNo}</span>
                </p>
              </div>

              <div className="bg-[#fffdf0] p-4 rounded-none border border-[#ebdcaa] text-left space-y-2.5 text-sm">
                <div className="flex justify-between border-b border-[#ebdcaa]/60 pb-2">
                  <span className="text-slate-500 font-medium">{t('student_colon')}</span>
                  <span className="font-bold text-slate-800">{selectedStudent?.name} ({selectedStudent?.email})</span>
                </div>
                <div className="flex justify-between border-b border-[#ebdcaa]/60 pb-2">
                  <span className="text-slate-500 font-medium">{t('amount_collected_colon')}</span>
                  <span className="font-bold text-[#002366] text-base">₹{Number(amount).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-b border-[#ebdcaa]/60 pb-2">
                  <span className="text-slate-500 font-medium">{t('payment_method')}:</span>
                  <span className="font-semibold text-slate-800">{paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">{t('collection_date')}:</span>
                  <span className="font-medium text-slate-800">{paymentDate}</span>
                </div>
              </div>

              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={handleDownloadInvoice}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#002366] hover:bg-[#001845] text-white font-semibold rounded-none shadow-xs transition-all cursor-pointer border border-[#002366]"
                >
                  <Download size={18} className="text-[#B99652]" />
                  <span>{t('download_tax_invoice_pdf')}</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-none transition-all cursor-pointer"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          ) : (
            /* Entry Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Student Picker */}
              <div>
                <label className="block text-xs font-bold text-[#002366] uppercase tracking-wider mb-1.5">
                  {t('select_student', 'Select Student')} <span className="text-rose-600">*</span>
                </label>
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t('search_student_name_id', 'Type student name or email to filter...')}
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#002366]"
                  />
                </div>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-slate-800 text-sm focus:outline-none focus:border-[#002366] shadow-xs"
                >
                  <option value="">-- {t('select_student', 'Choose Student from List')} ({filteredStudents.length}) --</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.className || `Grade ${s.grade || '1'}`} • {s.email || `ID: ${s.id}`})
                    </option>
                  ))}
                </select>
              </div>

              {/* Applicable Fee & Installment Plan Selection */}
              {selectedStudent && applicableStructure && (
                <div className="bg-slate-50 border border-[#ebdcaa] p-4 rounded-none space-y-3">
                  <div className="flex items-center justify-between border-b border-[#ebdcaa]/60 pb-2">
                    <div>
                      <span className="text-[10px] font-bold text-[#002366] uppercase tracking-wider">{t('applicable_structure', 'Applicable Structure')}</span>
                      <p className="text-xs font-bold text-slate-800">{applicableStructure.category} {t('fee_structure_title', 'Fee Structure')}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('total_curriculum_fee', 'Total Official Fee')}</span>
                      <p className="text-sm font-extrabold text-[#002366]">₹{Number(applicableStructure.totalFee || 8050).toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#002366] uppercase tracking-wider mb-2">
                      {t('choose_payment_plan', 'Choose Payment Plan:')}
                    </label>
                    <div className="space-y-2">
                      {/* Full Single Payment Option */}
                      <label className={`flex items-center justify-between p-2.5 border text-xs cursor-pointer transition ${paymentPlanType === 'full' ? 'border-[#002366] bg-[#fffdf0] font-bold' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <input 
                            type="radio" 
                            name="planType" 
                            checked={paymentPlanType === 'full'} 
                            onChange={() => { setPaymentPlanType('full'); setSelectedStageIdx(0); }}
                          />
                          <span>{t('full_payment_single', '1-Time Full Payment (100%)')}</span>
                        </div>
                        <span className="font-bold text-[#002366]">₹{Number(applicableStructure.totalFee || 8050).toLocaleString('en-IN')}</span>
                      </label>

                      {/* Dynamic Admin Installment Plans */}
                      {activePlans.map((plan) => (
                        <div key={plan.id} className="space-y-1.5">
                          <label className={`flex items-center justify-between p-2.5 border text-xs cursor-pointer transition ${paymentPlanType === plan.id ? 'border-[#002366] bg-[#fffdf0] font-bold' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center gap-2">
                              <input 
                                type="radio" 
                                name="planType" 
                                checked={paymentPlanType === plan.id} 
                                onChange={() => { setPaymentPlanType(plan.id); setSelectedStageIdx(0); }}
                              />
                              <span>{plan.name} ({plan.installmentsCount} {t('installments_plural', 'Installments')})</span>
                            </div>
                            <span className="text-[10px] bg-blue-50 text-blue-800 px-2 py-0.5 border border-blue-200 font-bold">
                              {plan.splitType === 'equal' ? t('equal_split', 'Equal Split') : t('custom_split', 'Custom %')}
                            </span>
                          </label>

                          {paymentPlanType === plan.id && plan.installments && (
                            <div className="ml-5 p-2.5 bg-white border border-[#ebdcaa] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {plan.installments.map((stage, sIdx) => {
                                const stgAmt = Math.round(Number(applicableStructure.totalFee || 8050) * ((stage.percentage || 0) / 100));
                                const isSelected = selectedStageIdx === sIdx;
                                return (
                                  <button
                                    key={sIdx}
                                    type="button"
                                    onClick={() => setSelectedStageIdx(sIdx)}
                                    className={`p-2 text-left border text-xs cursor-pointer transition ${isSelected ? 'bg-[#002366] text-white border-[#002366]' : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="font-bold">{t('installment_single', 'Stage')} {stage.number || sIdx + 1} ({stage.percentage}%)</span>
                                      <span className={isSelected ? 'text-[#ebdcaa] font-bold' : 'text-[#002366] font-bold'}>₹{stgAmt.toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className={`text-[9px] mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                      {t('due_date', 'Due')}: {stage.dueDate || 'Standard'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Amount & Mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#002366] uppercase tracking-wider mb-1.5">
                    {t('amount_rupees', 'Amount Received (₹)')} <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 text-slate-600 font-bold">₹</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 15000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      className="w-full pl-8 pr-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-slate-800 text-sm font-bold focus:outline-none focus:border-[#002366]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#002366] uppercase tracking-wider mb-1.5">
                    {t('payment_method', 'Payment Mode')} <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-slate-800 text-sm focus:outline-none focus:border-[#002366]"
                  >
                    <option value="Cash">{t('cash', 'Cash Collection')} 💵</option>
                    <option value="Cheque">{t('cheque', 'Cheque Deposit')} 📝</option>
                    <option value="Bank Transfer">{t('bank_transfer_neft', 'Bank Transfer (NEFT/RTGS)')} 🏛️</option>
                    <option value="Demand Draft">{t('demand_draft', 'Demand Draft (DD)')} 📜</option>
                    <option value="UPI">{t('upi_qr', 'Counter UPI / QR Code')} 📱</option>
                  </select>
                </div>
              </div>

              {/* Reference & Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#002366] uppercase tracking-wider mb-1.5">
                    {t('reference_no', 'Receipt / Transaction No.')}
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="e.g. OFFLINE-104928"
                    className="w-full px-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-slate-800 text-sm focus:outline-none focus:border-[#002366]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#002366] uppercase tracking-wider mb-1.5">
                    {t('collection_date', 'Collection Date')}
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-slate-800 text-sm focus:outline-none focus:border-[#002366]"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-[#002366] uppercase tracking-wider mb-1.5">
                  {t('remarks_note', 'Notes / Plan Reference')}
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={t('remarks_placeholder', 'e.g. Stage 1 collected at main accounts counter.')}
                  className="w-full px-4 py-2 border border-[#ebdcaa] rounded-none bg-[#fffdf0] text-slate-800 text-sm focus:outline-none focus:border-[#002366]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#ebdcaa]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm font-semibold rounded-none transition-all cursor-pointer"
                >
                  {t('cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !amount || Number(amount) <= 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#002366] hover:bg-[#001845] text-white font-semibold text-sm rounded-none shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-none animate-spin" />
                      <span>{t('recording_payment', 'Recording Payment...')}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="text-[#B99652]" />
                      <span>{t('record_offline_payment', 'Submit & Generate Receipt')}</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
}
