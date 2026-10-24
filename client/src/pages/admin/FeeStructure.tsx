import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  GraduationCap, 
  Calendar, 
  Save, 
  Edit, 
  Plus,
  X,
  Car,
  Monitor,
  BookOpen,
  Trophy,
  FileText,
  Coffee,
  Sparkles,
  Layers,
  CheckSquare,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Percent,
  Clock
} from 'lucide-react';
import { useAuth } from "../../auth/auth";
import { useTranslation } from "react-i18next";
import AdminLayout from "../../components/AdminLayout";
import { toast } from 'react-toastify';

export interface InstallmentItem {
  number: number;
  label: string;
  percentage: number;
  dueDate: string;
}

export interface InstallmentPlan {
  id: string;
  name: string;
  installmentsCount: number;
  splitType: 'equal' | 'custom';
  isActive: boolean;
  installments: InstallmentItem[];
}

const defaultStarterPlans: InstallmentPlan[] = [
  {
    id: 'plan_full',
    name: '1-Time Full Clearance (100%)',
    installmentsCount: 1,
    splitType: 'equal',
    isActive: true,
    installments: [
      { number: 1, label: 'Full Payment', percentage: 100, dueDate: '2026-01-31' }
    ]
  },
  {
    id: 'plan_semesters',
    name: '2 Semester Terms (50% + 50%)',
    installmentsCount: 2,
    splitType: 'equal',
    isActive: true,
    installments: [
      { number: 1, label: 'Term 1 Installment', percentage: 50, dueDate: '2026-01-31' },
      { number: 2, label: 'Term 2 Installment', percentage: 50, dueDate: '2026-06-30' }
    ]
  },
  {
    id: 'plan_quarterly',
    name: '4 Quarterly Installments (25% x 4)',
    installmentsCount: 4,
    splitType: 'equal',
    isActive: true,
    installments: [
      { number: 1, label: 'Quarter 1', percentage: 25, dueDate: '2026-01-31' },
      { number: 2, label: 'Quarter 2', percentage: 25, dueDate: '2026-04-30' },
      { number: 3, label: 'Quarter 3', percentage: 25, dueDate: '2026-07-31' },
      { number: 4, label: 'Quarter 4', percentage: 25, dueDate: '2026-10-31' }
    ]
  }
];

const FeeStructure = () => {
  const { API, token } = useAuth();
  const { t } = useTranslation(['forms', 'common']);
  const [feeBreakdown, setFeeBreakdown] = useState({
    tuitionFee: 5000,
    transportFee: 1000,
    computerLabFee: 800,
    libraryFee: 500,
    sportsFee: 300,
    examinationFee: 700,
    miscellaneousFee: 200,
  });
  const [dueDate, setDueDate] = useState('2026-01-31');
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>(defaultStarterPlans);
  const [savedStructures, setSavedStructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingStructure, setEditingStructure] = useState<any>(null);

  // Installment Plan Modal State
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanIndex, setEditingPlanIndex] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState<InstallmentPlan>({
    id: '',
    name: '',
    installmentsCount: 3,
    splitType: 'equal',
    isActive: true,
    installments: []
  });

  const totalFee = Object.values(feeBreakdown).reduce((a, b) => a + b, 0);

  // Helper to parse installment options safely
  const parseInstallmentOptions = (options: any): InstallmentPlan[] => {
    if (!options) return defaultStarterPlans;
    try {
      const parsed = typeof options === 'string' ? JSON.parse(options) : options;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      // If legacy boolean flags
      if (typeof parsed === 'object') {
        const legacyPlans: InstallmentPlan[] = [];
        if (parsed.enableFullPayment ?? true) {
          legacyPlans.push(defaultStarterPlans[0]);
        }
        if (parsed.enableSemesterTerms ?? true) {
          legacyPlans.push(defaultStarterPlans[1]);
        }
        if (parsed.enableQuarterly ?? true) {
          legacyPlans.push(defaultStarterPlans[2]);
        }
        if (parsed.enableMonthlyEMI) {
          legacyPlans.push({
            id: 'plan_monthly',
            name: '10 Monthly EMI Installments',
            installmentsCount: 10,
            splitType: 'equal',
            isActive: true,
            installments: Array.from({ length: 10 }, (_, i) => ({
              number: i + 1,
              label: `Month ${i + 1}`,
              percentage: 10,
              dueDate: `2026-0${Math.min(i + 1, 12)}-15`
            }))
          });
        }
        return legacyPlans.length > 0 ? legacyPlans : defaultStarterPlans;
      }
    } catch (e) {
      console.warn('Error parsing installmentOptions:', e);
    }
    return defaultStarterPlans;
  };

  // Helper to generate equal split installments
  const generateInstallments = (count: number, splitType: 'equal' | 'custom', baseDate = dueDate): InstallmentItem[] => {
    const validCount = Math.max(1, Math.min(24, count || 1));
    const roundedPercent = Math.floor((100 / validCount) * 100) / 100;
    const lastPercent = Number((100 - (roundedPercent * (validCount - 1))).toFixed(2));

    return Array.from({ length: validCount }, (_, idx) => {
      const d = new Date(baseDate || '2026-01-31');
      if (!isNaN(d.getTime())) {
        d.setMonth(d.getMonth() + idx);
      }
      const dateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '2026-01-31';

      return {
        number: idx + 1,
        label: validCount === 1 ? 'Full Clearance' : `Installment ${idx + 1}`,
        percentage: splitType === 'equal' ? (idx === validCount - 1 ? lastPercent : roundedPercent) : (idx === 0 ? 100 : 0),
        dueDate: dateStr
      };
    });
  };

  // Class first: fees are charged to students of classes (the server refuses a save without one)
  const [classCount, setClassCount] = useState<number | null>(null);

  // Fetch existing fee structures on component mount
  useEffect(() => {
    fetchFeeStructures();
    fetch(`${API}/classrooms`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setClassCount((Array.isArray(data) ? data : data.data || data.classrooms || []).length); })
      .catch(() => {});
  }, []);

  const fetchFeeStructures = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/classrooms/fee-structures`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSavedStructures(data);
      }
    } catch (error) {
      console.error('Error fetching fee structures:', error);
      toast.error('Failed to fetch fee structures');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddPlan = () => {
    const initialInstallments = generateInstallments(3, 'equal', dueDate);
    setPlanForm({
      id: `plan_${Date.now()}`,
      name: '3-Term Flexible Plan',
      installmentsCount: 3,
      splitType: 'equal',
      isActive: true,
      installments: initialInstallments
    });
    setEditingPlanIndex(null);
    setShowPlanModal(true);
  };

  const handleOpenEditPlan = (plan: InstallmentPlan, index: number) => {
    setPlanForm({
      ...plan,
      installments: plan.installments.map(i => ({ ...i }))
    });
    setEditingPlanIndex(index);
    setShowPlanModal(true);
  };

  const handleInstallmentsCountChange = (count: number) => {
    const validCount = Math.max(1, Math.min(24, count || 1));
    const newInstallments = generateInstallments(validCount, planForm.splitType, dueDate);
    setPlanForm({
      ...planForm,
      installmentsCount: validCount,
      installments: newInstallments
    });
  };

  const handleSplitTypeChange = (type: 'equal' | 'custom') => {
    const newInstallments = generateInstallments(planForm.installmentsCount, type, dueDate);
    setPlanForm({
      ...planForm,
      splitType: type,
      installments: newInstallments
    });
  };

  const handleInstallmentPercentageChange = (index: number, val: number) => {
    const updated = [...planForm.installments];
    updated[index].percentage = Number(val) || 0;
    setPlanForm({
      ...planForm,
      installments: updated
    });
  };

  const handleInstallmentFieldChange = (index: number, field: 'label' | 'dueDate', val: string) => {
    const updated = [...planForm.installments];
    updated[index][field] = val;
    setPlanForm({
      ...planForm,
      installments: updated
    });
  };

  const totalPlanPercentage = planForm.installments.reduce((sum, i) => sum + (Number(i.percentage) || 0), 0);
  const isPercentageValid = Math.abs(totalPlanPercentage - 100) < 0.05;

  const handleSavePlan = () => {
    if (!planForm.name.trim()) {
      toast.error('Please enter a Plan Name');
      return;
    }
    if (!isPercentageValid) {
      toast.error(`Total percentage must equal exactly 100%. Current total is ${totalPlanPercentage.toFixed(1)}%`);
      return;
    }

    if (editingPlanIndex !== null) {
      const updated = [...installmentPlans];
      updated[editingPlanIndex] = planForm;
      setInstallmentPlans(updated);
      toast.success(`Updated "${planForm.name}" plan`);
    } else {
      setInstallmentPlans([...installmentPlans, planForm]);
      toast.success(`Added "${planForm.name}" plan`);
    }
    setShowPlanModal(false);
  };

  const handleTogglePlanActive = (index: number) => {
    const updated = [...installmentPlans];
    updated[index].isActive = !updated[index].isActive;
    setInstallmentPlans(updated);
    toast.info(`"${updated[index].name}" is now ${updated[index].isActive ? 'ACTIVE' : 'INACTIVE'}`);
  };

  const handleDeletePlan = (index: number) => {
    if (installmentPlans.length <= 1) {
      toast.warning('At least one payment plan should be configured.');
      return;
    }
    const planName = installmentPlans[index].name;
    const updated = installmentPlans.filter((_, i) => i !== index);
    setInstallmentPlans(updated);
    toast.info(`Deleted plan "${planName}"`);
  };

  const handleSave = async (category: 'Primary' | 'Secondary') => {
    try {
      setLoading(true);
      
      const structureData = {
        category,
        grade: category === 'Primary' ? '1-4' : '5-12',
        tuitionFee: feeBreakdown.tuitionFee,
        transportFee: feeBreakdown.transportFee,
        computerLabFee: feeBreakdown.computerLabFee,
        libraryFee: feeBreakdown.libraryFee,
        sportsFee: feeBreakdown.sportsFee,
        examinationFee: feeBreakdown.examinationFee,
        miscellaneousFee: feeBreakdown.miscellaneousFee,
        dueDate,
        totalFee: Object.values(feeBreakdown).reduce((a, b) => a + b, 0),
        installmentOptions: installmentPlans
      };

      const response = await fetch(`${API}/classrooms/fee-structures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(structureData)
      });

      if (response.ok) {
        toast.success(`${category} fee structure & installment plans saved successfully!`);
        await fetchFeeStructures();
        setFeeBreakdown({
          tuitionFee: 5000,
          transportFee: 1000,
          computerLabFee: 800,
          libraryFee: 500,
          sportsFee: 300,
          examinationFee: 700,
          miscellaneousFee: 200,
        });
        setDueDate('2026-01-31');
        setInstallmentPlans(defaultStarterPlans);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to save fee structure');
      }
    } catch (error) {
      console.error('Error saving fee structure:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save fee structure');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (structure: any) => {
    setEditingStructure(structure);
    setFeeBreakdown({
      tuitionFee: structure.tuitionFee,
      transportFee: structure.transportFee,
      computerLabFee: structure.computerLabFee,
      libraryFee: structure.libraryFee,
      sportsFee: structure.sportsFee,
      examinationFee: structure.examinationFee,
      miscellaneousFee: structure.miscellaneousFee,
    });
    setDueDate(structure.dueDate);
    const parsedPlans = parseInstallmentOptions(structure.installmentOptions);
    setInstallmentPlans(parsedPlans);
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);
      
      const updateData = {
        tuitionFee: feeBreakdown.tuitionFee,
        transportFee: feeBreakdown.transportFee,
        computerLabFee: feeBreakdown.computerLabFee,
        libraryFee: feeBreakdown.libraryFee,
        sportsFee: feeBreakdown.sportsFee,
        examinationFee: feeBreakdown.examinationFee,
        miscellaneousFee: feeBreakdown.miscellaneousFee,
        dueDate,
        totalFee: Object.values(feeBreakdown).reduce((a, b) => a + b, 0),
        installmentOptions: installmentPlans
      };

      const response = await fetch(`${API}/classrooms/fee-structures/${editingStructure.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        toast.success('Fee structure & dynamic installment plans updated successfully!');
        await fetchFeeStructures();
        setEditingStructure(null);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to update fee structure');
      }
    } catch (error) {
      console.error('Error updating fee structure:', error);
      toast.error('Failed to update fee structure');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingStructure(null);
    setFeeBreakdown({
      tuitionFee: 5000,
      transportFee: 1000,
      computerLabFee: 800,
      libraryFee: 500,
      sportsFee: 300,
      examinationFee: 700,
      miscellaneousFee: 200,
    });
    setDueDate('2026-01-31');
    setInstallmentPlans(defaultStarterPlans);
  };

  const feeFields = [
    { key: 'tuitionFee', label: 'Tuition Fee', icon: GraduationCap, color: 'text-blue-600' },
    { key: 'transportFee', label: 'Transport Fee', icon: Car, color: 'text-green-600' },
    { key: 'computerLabFee', label: 'Computer Lab Fee', icon: Monitor, color: 'text-purple-600' },
    { key: 'libraryFee', label: 'Library Fee', icon: BookOpen, color: 'text-orange-600' },
    { key: 'sportsFee', label: 'Sports Fee', icon: Trophy, color: 'text-red-600' },
    { key: 'examinationFee', label: 'Examination Fee', icon: FileText, color: 'text-indigo-600' },
    { key: 'miscellaneousFee', label: 'Miscellaneous Fee', icon: Coffee, color: 'text-gray-600' },
  ];

  const getAvailableCategory = () => {
    const primaryExists = savedStructures.some(s => s.category === 'Primary');
    const secondaryExists = savedStructures.some(s => s.category === 'Secondary');
    
    if (!primaryExists) return 'Primary';
    if (!secondaryExists) return 'Secondary';
    return null; // Both exist
  };

  const primaryExists = savedStructures.some(s => s.category === 'Primary');
  const secondaryExists = savedStructures.some(s => s.category === 'Secondary');
  const allStructuresCreated = primaryExists && secondaryExists;
  const nextCategory = getAvailableCategory();
  const showForm = !editingStructure && !allStructuresCreated && nextCategory;

  // Custom Plan Configurator UI
  const renderInstallmentConfigurator = () => (
    <div className="bg-white border border-[#ebdcaa] rounded-none p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ebdcaa] pb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b] flex items-center gap-2">
            <Sparkles size={16} className="text-[#B99652]" />
            {t('dynamic_installment_plans_title', 'Dynamic Student Installment & Payment Plans')}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t('dynamic_installment_plans_desc', 'Configure custom installment schedules (equal split or custom percentages). Active plans will be displayed on the Student Portal.')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAddPlan}
          className="bg-[#B99652] hover:bg-[#a38241] text-white font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded-none flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer"
        >
          <Plus size={15} /> {t('add_installment_plan', 'Add Installment Plan')}
        </button>
      </div>

      {/* Plans List */}
      <div className="space-y-3 pt-1">
        {installmentPlans.map((plan, idx) => (
          <div 
            key={plan.id || idx} 
            className={`p-4 border rounded-none text-xs transition-all ${
              plan.isActive ? 'border-[#B99652]/70 bg-[#fffdf4]' : 'border-slate-200 bg-slate-50/70 opacity-75'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[#1e1b4b]">{plan.name}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-none border ${
                    plan.isActive 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}>
                    {plan.isActive ? t('active_visible_to_students', 'Active (Visible to Students)') : t('inactive_hidden', 'Inactive (Hidden)')}
                  </span>
                  <span className="text-[10px] text-slate-500 bg-white border border-[#ebdcaa] px-2 py-0.5 font-semibold">
                    {plan.installmentsCount} {plan.installmentsCount === 1 ? t('installment_single', 'Installment') : t('installments_plural', 'Installments')} ({plan.splitType === 'equal' ? t('equal_split', 'Equal Split') : t('custom_split', 'Custom Split')})
                  </span>
                </div>

                {/* Pill summary of installments */}
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {plan.installments.map((inst, i) => {
                    const instAmount = Math.round((totalFee * Number(inst.percentage)) / 100);
                    return (
                      <span 
                        key={i} 
                        className="inline-flex items-center gap-1 bg-white border border-[#ebdcaa] px-2 py-1 text-[11px] text-slate-700 font-medium"
                      >
                        <span className="font-bold text-[#002366]">{inst.label || `Inst ${inst.number}`}:</span>
                        <span className="text-[#B99652] font-bold">{inst.percentage}%</span>
                        <span className="text-slate-500">(₹{instAmount.toLocaleString('en-IN')})</span>
                        {inst.dueDate && <span className="text-[10px] text-slate-400">• {inst.dueDate}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTogglePlanActive(idx)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none border transition-all cursor-pointer ${
                    plan.isActive 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' 
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                  title={plan.isActive ? 'Click to Disable' : 'Click to Enable'}
                >
                  {plan.isActive ? 'Disable' : 'Enable'}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEditPlan(plan, idx)}
                  className="p-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-[#ebdcaa] rounded-none transition-all cursor-pointer"
                  title="Edit Plan"
                >
                  <Edit size={14} className="text-[#B99652]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeletePlan(idx)}
                  className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-none transition-all cursor-pointer"
                  title="Delete Plan"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-[#ebdcaa]">
          <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] flex items-center">
            <DollarSign className="mr-2 text-[#B99652]" size={32} />
            {t('fee_structure_management')}
          </h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">{t('fee_structure_description')}</p>
        </div>

        {classCount === 0 && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 p-4 text-sm" role="alert">
            Create a class first (Classrooms). Fee structures apply to the students of your classes.
          </div>
        )}

        {/* Progress Indicator */}
        <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{t('setup_progress')}</h3>
            <span className="text-xs uppercase tracking-wider font-semibold text-[#B99652]">{savedStructures.length}/2 {t('structures_created')}</span>
          </div>
          <div className="w-full bg-[#ebdcaa]/40 rounded-none h-2">
            <div 
              className="bg-[#B99652] h-2 rounded-none transition-all duration-500" 
              style={{ width: `${(savedStructures.length / 2) * 100}%` }}
            ></div>
          </div>
          <div className="flex justify-between mt-2 text-xs font-semibold uppercase tracking-wider">
            <span className={savedStructures.some(s => s.category === 'Primary') ? 'text-emerald-700' : 'text-slate-400'}>
              {savedStructures.some(s => s.category === 'Primary') ? '✓' : '○'} {t('primary_structure')}
            </span>
            <span className={savedStructures.some(s => s.category === 'Secondary') ? 'text-emerald-700' : 'text-slate-400'}>
              {savedStructures.some(s => s.category === 'Secondary') ? '✓' : '○'} {t('secondary_structure')}
            </span>
          </div>
        </div>

        {/* Fee Structure Form - Show only if not all created */}
        {showForm && nextCategory === 'Primary' && (
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-[#ebdcaa]">
              <h2 className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                {t('create_primary_fee_structure')}
              </h2>
              <span className="text-xs uppercase tracking-wider font-semibold text-[#B99652] bg-white border border-[#ebdcaa] px-2.5 py-1">
                {t('grades_1_4')}
              </span>
            </div>

            {/* Fee Breakdown */}
            <div>
              <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2">
                <DollarSign className="text-[#B99652]" size={20} />
                {t('fee_breakdown')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feeFields.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="bg-white border border-[#ebdcaa] rounded-none p-4 shadow-xs">
                    <div className="flex items-center mb-2 text-slate-700">
                      <Icon className="mr-2 text-[#B99652]" size={18} />
                      <label className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{label}</label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                      <input
                        type="number"
                        value={feeBreakdown[key as keyof typeof feeBreakdown]}
                        onChange={(e) => setFeeBreakdown({...feeBreakdown, [key]: Number(e.target.value)})}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Installment Options Configurator */}
            {renderInstallmentConfigurator()}

            {/* Due Date */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-2 flex items-center">
                <Calendar className="mr-2 text-[#B99652]" size={16} />
                {t('due_date')}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full md:w-auto px-4 py-2 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b]"
              />
            </div>

            {/* Total Fee Display */}
            <div className="p-6 bg-[#1e1b4b] text-white border border-white/10 rounded-none shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-white/60">{t('total_fee_amount')}</div>
                  <div className="text-3xl font-bold font-['DM_Serif_Display',serif] text-white mt-1">₹{totalFee.toLocaleString()}</div>
                </div>
                <DollarSign size={40} className="text-[#B99652] opacity-80" />
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => handleSave('Primary')}
              disabled={loading}
              className="flex items-center px-6 py-3 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            >
              <Save className="mr-2" size={16} />
              {loading ? t('saving') : t('save_primary_structure')}
            </button>
          </div>
        )}

        {/* Secondary Form - Show only if primary exists and secondary doesn't */}
        {showForm && nextCategory === 'Secondary' && (
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-[#ebdcaa]">
              <h2 className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                {t('create_secondary_fee_structure')}
              </h2>
              <span className="text-xs uppercase tracking-wider font-semibold text-[#B99652] bg-white border border-[#ebdcaa] px-2.5 py-1">
                {t('grades_5_12')}
              </span>
            </div>

            {/* Fee Breakdown */}
            <div>
              <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2">
                <DollarSign className="text-[#B99652]" size={20} />
                Fee Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feeFields.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="bg-white border border-[#ebdcaa] rounded-none p-4 shadow-xs">
                    <div className="flex items-center mb-2 text-slate-700">
                      <Icon className="mr-2 text-[#B99652]" size={18} />
                      <label className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{label}</label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                      <input
                        type="number"
                        value={feeBreakdown[key as keyof typeof feeBreakdown]}
                        onChange={(e) => setFeeBreakdown({...feeBreakdown, [key]: Number(e.target.value)})}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Installment Options Configurator */}
            {renderInstallmentConfigurator()}

            {/* Due Date */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-2 flex items-center">
                <Calendar className="mr-2 text-[#B99652]" size={16} />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full md:w-auto px-4 py-2 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b]"
              />
            </div>

            {/* Total Fee Display */}
            <div className="p-6 bg-[#1e1b4b] text-white border border-white/10 rounded-none shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-white/60">{t('total_fee_amount')}</div>
                  <div className="text-3xl font-bold font-['DM_Serif_Display',serif] text-white mt-1">₹{totalFee.toLocaleString()}</div>
                </div>
                <DollarSign size={40} className="text-[#B99652] opacity-80" />
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => handleSave('Secondary')}
              disabled={loading}
              className="flex items-center px-6 py-3 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            >
              <Save className="mr-2" size={16} />
              {loading ? t('saving') : t('save_secondary_structure')}
            </button>
          </div>
        )}

        {/* Edit Form */}
        {editingStructure && (
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-[#ebdcaa]">
              <h2 className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                {t('edit_fee_structure')} {editingStructure.category}
              </h2>
              <button
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-[#1e1b4b] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Fee Breakdown */}
            <div>
              <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2">
                <DollarSign className="text-[#B99652]" size={20} />
                Fee Breakdown
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feeFields.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="bg-white border border-[#ebdcaa] rounded-none p-4 shadow-xs">
                    <div className="flex items-center mb-2 text-slate-700">
                      <Icon className="mr-2 text-[#B99652]" size={18} />
                      <label className="text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">{label}</label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                      <input
                        type="number"
                        value={feeBreakdown[key as keyof typeof feeBreakdown]}
                        onChange={(e) => setFeeBreakdown({...feeBreakdown, [key]: Number(e.target.value)})}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Installment Options Configurator */}
            {renderInstallmentConfigurator()}

            {/* Due Date */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b] mb-2 flex items-center">
                <Calendar className="mr-2 text-[#B99652]" size={16} />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full md:w-auto px-4 py-2 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] text-sm text-[#1e1b4b]"
              />
            </div>

            {/* Total Fee Display */}
            <div className="p-6 bg-[#1e1b4b] text-white border border-white/10 rounded-none shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-white/60">Total Fee Amount</div>
                  <div className="text-3xl font-bold font-['DM_Serif_Display',serif] text-white mt-1">₹{totalFee.toLocaleString()}</div>
                </div>
                <DollarSign size={40} className="text-[#B99652] opacity-80" />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleUpdate}
                disabled={loading}
                className="flex items-center px-6 py-3 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none uppercase tracking-wider text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
              >
                <Save className="mr-2" size={16} />
                {loading ? t('updating') : t('update_structure')}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center px-5 py-3 border border-[#ebdcaa] bg-white text-[#1e1b4b] rounded-none uppercase tracking-wider text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Saved Structures */}
        {savedStructures.length > 0 && (
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 sm:p-8 shadow-xs">
            <h3 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-6 flex items-center pb-3 border-b border-[#ebdcaa]">
              <Save className="mr-2 text-[#B99652]" size={20} />
              Created Fee Structures
            </h3>
            <div className="space-y-4">
              {savedStructures.map((structure, index) => (
                <div key={index} className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] text-lg">
                      {structure.category} Education
                    </div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5">Grades: {structure.grade} • Due Date: {structure.dueDate}</div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                    <div className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">₹{structure.totalFee.toLocaleString()}</div>
                    <button 
                      onClick={() => handleEdit(structure)}
                      className="text-[#B99652] hover:text-[#a38241] flex items-center px-3 py-1 border border-[#ebdcaa] bg-white hover:bg-slate-50 text-xs uppercase tracking-wider font-semibold rounded-none transition-colors"
                    >
                      <Edit size={14} className="mr-1" />
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Structures Created Message */}
        {savedStructures.length === 2 && !editingStructure && (
          <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none p-8 text-center shadow-xs">
            <div className="text-[#B99652] mb-3">
              <Save size={40} className="mx-auto" />
            </div>
            <h3 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-1">All Fee Structures Created</h3>
            <p className="text-xs text-slate-600">Both Primary (Grades 1-4) and Secondary (Grades 5-12) fee structures have been configured successfully.</p>
          </div>
        )}

        {/* ================= PLAN EDITOR MODAL ================= */}
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white border border-[#ebdcaa] rounded-none w-full max-w-2xl p-6 sm:p-7 shadow-2xl space-y-5 my-8 max-h-[90vh] flex flex-col">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#ebdcaa] pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={20} className="text-[#B99652]" />
                  <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                    {editingPlanIndex !== null ? 'Edit Installment Plan' : 'Create Custom Installment Plan'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                
                {/* Plan Name & Active Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-8">
                    <label className="block text-xs uppercase tracking-wider font-bold text-[#1e1b4b] mb-1.5">
                      Plan Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 6 Month Flexi Plan, 2 Semester Terms, Full Pay"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 border border-[#ebdcaa] rounded-none text-xs bg-[#fffdf4] text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                    />
                  </div>

                  <div className="sm:col-span-4 flex items-end">
                    <label className="flex items-center gap-2 p-2.5 border border-[#ebdcaa] bg-[#fffdf4] rounded-none w-full cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planForm.isActive}
                        onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
                        className="accent-[#B99652] w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#1e1b4b]">
                        Active (Visible)
                      </span>
                    </label>
                  </div>
                </div>

                {/* Installments Count & Split Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#fffdf4] p-4 border border-[#ebdcaa]">
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-bold text-[#1e1b4b] mb-1.5 flex items-center gap-1.5">
                      <Layers size={14} className="text-[#B99652]" />
                      Number of Installments
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={planForm.installmentsCount}
                      onChange={(e) => handleInstallmentsCountChange(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-[#ebdcaa] rounded-none text-xs bg-white text-[#1e1b4b] focus:outline-none focus:border-[#B99652]"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Choose between 1 to 24 split payments
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider font-bold text-[#1e1b4b] mb-1.5 flex items-center gap-1.5">
                      <Percent size={14} className="text-[#B99652]" />
                      Split Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSplitTypeChange('equal')}
                        className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-none border transition-all cursor-pointer text-center ${
                          planForm.splitType === 'equal'
                            ? 'bg-[#002366] text-white border-[#002366]'
                            : 'bg-white text-slate-700 border-[#ebdcaa] hover:bg-slate-50'
                        }`}
                      >
                        Equal Split
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSplitTypeChange('custom')}
                        className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-none border transition-all cursor-pointer text-center ${
                          planForm.splitType === 'custom'
                            ? 'bg-[#B99652] text-white border-[#B99652]'
                            : 'bg-white text-slate-700 border-[#ebdcaa] hover:bg-slate-50'
                        }`}
                      >
                        Custom %
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {planForm.splitType === 'equal' ? 'Auto-splits 100% equally' : 'Manually enter % per installment'}
                    </span>
                  </div>
                </div>

                {/* Percentage Validation Status Bar */}
                <div className={`p-3 rounded-none border flex items-center justify-between text-xs font-bold ${
                  isPercentageValid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {isPercentageValid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>Total Plan Percentage: {totalPlanPercentage.toFixed(1)}%</span>
                  </div>
                  <div>
                    {isPercentageValid ? (
                      <span className="text-emerald-700 text-[11px] uppercase tracking-wider">✓ Exactly 100% (Ready to Save)</span>
                    ) : (
                      <span className="text-rose-700 text-[11px] uppercase tracking-wider">
                        ⚠️ Must be 100% (Diff: {(100 - totalPlanPercentage).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Installment Breakdown Rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider font-bold text-[#1e1b4b]">
                      Installment Schedule & Due Dates Breakdown
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Estimated on Total Fee: <span className="font-bold text-[#1e1b4b]">₹{totalFee.toLocaleString('en-IN')}</span>
                    </span>
                  </div>

                  <div className="border border-[#ebdcaa] divide-y divide-[#ebdcaa]/60 max-h-60 overflow-y-auto">
                    {planForm.installments.map((inst, idx) => {
                      const amount = Math.round((totalFee * (Number(inst.percentage) || 0)) / 100);
                      return (
                        <div key={idx} className="p-3 bg-white hover:bg-[#fffdf4] transition-colors flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                          <div className="flex items-center gap-2 sm:w-1/3">
                            <span className="w-6 h-6 rounded-none bg-[#002366] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {inst.number}
                            </span>
                            <input
                              type="text"
                              value={inst.label}
                              onChange={(e) => handleInstallmentFieldChange(idx, 'label', e.target.value)}
                              className="w-full px-2 py-1 border border-[#ebdcaa] text-xs font-semibold text-[#1e1b4b] bg-white focus:outline-none focus:border-[#B99652]"
                              placeholder={`Installment ${inst.number}`}
                            />
                          </div>

                          {/* Percentage Input */}
                          <div className="flex items-center gap-2 sm:w-1/3">
                            <div className="relative w-24">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.1"
                                disabled={planForm.splitType === 'equal'}
                                value={inst.percentage}
                                onChange={(e) => handleInstallmentPercentageChange(idx, Number(e.target.value))}
                                className="w-full pl-2 pr-6 py-1 border border-[#ebdcaa] text-xs font-bold text-[#1e1b4b] bg-white disabled:bg-slate-100 focus:outline-none focus:border-[#B99652]"
                              />
                              <span className="absolute right-2 top-1 text-slate-400 text-xs font-bold">%</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-700 shrink-0">
                              ₹{amount.toLocaleString('en-IN')}
                            </span>
                          </div>

                          {/* Due Date Input */}
                          <div className="flex items-center gap-2 sm:w-1/3 justify-end">
                            <Calendar size={14} className="text-[#B99652] shrink-0" />
                            <input
                              type="date"
                              value={inst.dueDate || dueDate}
                              onChange={(e) => handleInstallmentFieldChange(idx, 'dueDate', e.target.value)}
                              className="px-2 py-1 border border-[#ebdcaa] text-xs text-[#1e1b4b] bg-white focus:outline-none focus:border-[#B99652]"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#ebdcaa] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 border border-[#ebdcaa] bg-white text-slate-700 text-xs font-bold uppercase tracking-wider rounded-none hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePlan}
                  disabled={!isPercentageValid || !planForm.name.trim()}
                  className="px-5 py-2 bg-[#B99652] hover:bg-[#a38241] text-white text-xs font-bold uppercase tracking-wider rounded-none disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  Save Installment Plan
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
};

export default FeeStructure;
