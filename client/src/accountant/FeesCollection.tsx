import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { generateInvoicePdf } from "./invoice";
import PaymentModal from "./PaymentModal";
import { useTranslation } from "../context/TranslationContext";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Download, CreditCard, RefreshCw, ShieldAlert } from 'lucide-react';
import { useTransactionStore } from "../store/transactionStore";
import { useAuth } from "../auth/auth";

type PaymentStatus = "Paid" | "Partial" | "Pending";

interface StudentRecord {
  id: string;
  className: string;
  name: string;
  email?: string;
  phone?: string;
  grade?: string;
  studentGrade?: string;
  paymentStatus: PaymentStatus;
  feeStructure?: any;
  feeBreakdown: { label: string; amount: number }[];
  totalFee: number;
  paidAmount: number;
  remainingBalance: number;
  transactions: { id: string; amount: number; date: string }[];
}

export default function FeesCollection({ category }: { category?: "Primary" | "Secondary" }) {
  const { t } = useTranslation();
  const { token, API } = useAuth();
  const [payFor, setPayFor] = useState<StudentRecord | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"Primary"|"Secondary">(category || "Primary");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  
  const [liveStudents, setLiveStudents] = useState<StudentRecord[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { getPaymentStats, transactions } = useTransactionStore();

  const loadAccountantData = async () => {
    try {
      setLoading(true);
      const authToken = token || localStorage.getItem('token');
      const authHeader = { headers: { Authorization: `Bearer ${authToken}` } };

      // 1. Fetch Fee Structures
      let fetchedStructures: any[] = [];
      try {
        const structRes = await fetch(`${API}/classrooms/fee-structures`, authHeader);
        if (structRes.ok) {
          fetchedStructures = await structRes.json();
          setFeeStructures(fetchedStructures);
        }
      } catch (err) {
        console.warn("Error loading fee structures in FeesCollection:", err);
      }

      // 2. Fetch Live Students
      const studentsRes = await fetch(`${API}/accountant/students`, authHeader);
      if (studentsRes.ok) {
        const studentData = await studentsRes.json();
        const rawList = studentData.students || [];

        // Primary vs Secondary Fee structures
        const primaryStructure = fetchedStructures.find(s => s.category === 'Primary') || { totalFee: 8050 };
        const secondaryStructure = fetchedStructures.find(s => s.category === 'Secondary') || { totalFee: 12100 };

        const formattedList: StudentRecord[] = rawList.map((s: any) => {
          const gradeNum = parseInt(s.studentGrade || s.grade || '1', 10);
          const isPrimary = !isNaN(gradeNum) && gradeNum >= 1 && gradeNum <= 4;
          const assignedStructure = isPrimary ? primaryStructure : secondaryStructure;
          const totalFee = Number(assignedStructure.totalFee || (isPrimary ? 8050 : 12100));

          // Calculate fee breakdown items
          const feeBreakdown = [
            { label: "Tuition Fee", amount: Number(assignedStructure.tuitionFee || Math.round(totalFee * 0.6)) },
            { label: "Transport Fee", amount: Number(assignedStructure.transportFee || Math.round(totalFee * 0.12)) },
            { label: "Computer Lab Fee", amount: Number(assignedStructure.computerLabFee || Math.round(totalFee * 0.1)) },
            { label: "Library Fee", amount: Number(assignedStructure.libraryFee || Math.round(totalFee * 0.06)) },
            { label: "Sports Fee", amount: Number(assignedStructure.sportsFee || Math.round(totalFee * 0.04)) },
            { label: "Examination Fee", amount: Number(assignedStructure.examinationFee || Math.round(totalFee * 0.08)) }
          ].filter(item => item.amount > 0);

          return {
            id: String(s.id),
            name: s.name || `Student #${s.id}`,
            className: s.className || (isPrimary ? `Grade ${gradeNum || 1} - Primary` : `Grade ${gradeNum || 10} - Secondary`),
            email: s.email,
            phone: s.phone,
            grade: String(gradeNum || (isPrimary ? '1' : '10')),
            studentGrade: String(gradeNum || (isPrimary ? '1' : '10')),
            paymentStatus: "Pending" as PaymentStatus,
            feeStructure: assignedStructure,
            feeBreakdown,
            totalFee,
            paidAmount: 0,
            remainingBalance: totalFee,
            transactions: []
          };
        });

        setLiveStudents(formattedList);
      }
    } catch (err) {
      console.error("Failed to load accountant data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountantData();
  }, [category]);

  // Dynamic filter for active category (Primary: 1-4, Secondary: 5-12)
  const students = useMemo(() => {
    const filtered = liveStudents.filter((s) => {
      const cls = parseInt(s.studentGrade || s.grade || s.className || '1', 10);
      return activeCategory === "Primary" ? (!isNaN(cls) && cls >= 1 && cls <= 4) : (!isNaN(cls) && cls >= 5 && cls <= 12) || isNaN(cls);
    });

    const searched = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.id.toLowerCase().includes(query.toLowerCase()) ||
        (s.email && s.email.toLowerCase().includes(query.toLowerCase()))
    );

    if (!sortKey) return searched;
    const sorted = [...searched].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [liveStudents, activeCategory, query, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function downloadInvoice(s: StudentRecord) {
    const doc = generateInvoicePdf({
      schoolName: "Core5 Academic Institution",
      student: { id: s.id, name: s.name, className: s.className, email: s.email },
      feeBreakdown: s.feeBreakdown,
      transactionId: s.transactions?.[0]?.id || `TXN-${s.id}`,
      paymentDate: s.transactions?.[0]?.date || new Date().toISOString().slice(0, 10),
      transactionAmount: s.totalFee,
      paymentOption: "Official Clearance"
    });
    doc.save(`Invoice-${s.name.replace(/\s+/g, '_')}-${s.id}.pdf`);
  }

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">{t('fees_collection')}</h1>
          <p className="text-slate-600">{t('manage_student_fee_payments')}</p>
        </div>
        <button
          onClick={loadAccountantData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-xs text-sm font-semibold transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw size={16} className={loading ? "animate-spin text-blue-600" : "text-slate-500"} />
          Refresh Data
        </button>
      </div>

      {/* Informational Legacy Reconciliation Alert */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 flex items-start gap-3 shadow-xs">
        <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5">
          <ShieldAlert size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-blue-950">Legacy Payment Reconciliation Active</h4>
          <p className="text-xs text-blue-800/90 mt-0.5 leading-relaxed">
            Historical payments recorded before schedule tracking require academic-session confirmation before allocation. 
            View unlinked payments on the <Link to="/accountant/legacy-reconciliation" className="font-semibold underline hover:text-blue-950">Legacy Reconciliation</Link> console.
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveCategory('Primary')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeCategory === 'Primary'
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-400'
          }`}
        >
          {t('primary')} (Grades 1–4)
        </button>
        <button
          onClick={() => setActiveCategory('Secondary')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
            activeCategory === 'Secondary'
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-400'
          }`}
        >
          {t('secondary')} (Grades 5–12)
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <input
          className="w-full md:w-80 px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition bg-white"
          placeholder="🔍 Search student name or ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Summary Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">{t('total_students')}</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{students.length}</p>
            </div>
            <div className="text-blue-100 text-4xl">👥</div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">{t('paid')}</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{students.filter(s => s.paymentStatus === 'Paid').length}</p>
            </div>
            <div className="text-green-100 text-4xl">✓</div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-yellow-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">{t('partial_payment')}</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{students.filter(s => s.paymentStatus === 'Partial').length}</p>
            </div>
            <div className="text-yellow-100 text-4xl">⚠</div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">{t('pending')}</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{students.filter(s => s.paymentStatus === 'Pending').length}</p>
            </div>
            <div className="text-red-100 text-4xl">✕</div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading real student records from database...
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No enrolled students found for {activeCategory} structure.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-700">
                <th className="p-3.5 font-semibold cursor-pointer hover:bg-slate-200" onClick={() => toggleSort("id")}>Student ID</th>
                <th className="p-3.5 font-semibold cursor-pointer hover:bg-slate-200" onClick={() => toggleSort("name")}>Student Name</th>
                <th className="p-3.5 font-semibold cursor-pointer hover:bg-slate-200" onClick={() => toggleSort("className")}>Classroom / Grade</th>
                <th className="p-3.5 font-semibold">Total Fee</th>
                <th className="p-3.5 font-semibold">{t('status')}</th>
                <th className="p-3.5 font-semibold text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-mono text-xs font-bold text-slate-600">STU-{String(s.id).padStart(4, '0')}</td>
                  <td className="p-3.5 font-medium text-slate-900">
                    <div>{s.name}</div>
                    {s.email && <div className="text-xs text-slate-500">{s.email}</div>}
                  </td>
                  <td className="p-3.5 text-slate-700">{s.className}</td>
                  <td className="p-3.5 font-bold text-slate-900">₹{s.totalFee.toLocaleString('en-IN')}</td>
                  <td className="p-3.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        s.paymentStatus === "Paid"
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : s.paymentStatus === "Partial"
                          ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {s.paymentStatus}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => downloadInvoice(s)}
                        className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition font-medium text-xs cursor-pointer"
                        title="Download Invoice"
                      >
                        <Download size={14} /> {t('invoice')}
                      </button>
                      <button
                        onClick={() => setPayFor(s)}
                        className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-3 py-1.5 rounded-lg transition font-medium text-xs cursor-pointer shadow-xs"
                        title="Collect Fee / Installment"
                      >
                        <CreditCard size={14} /> Collect Fee
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payFor && (
        <PaymentModal 
          student={{ id: payFor.id, name: payFor.name }} 
          feeStructure={payFor.feeStructure}
          totalFees={payFor.totalFee}
          classroom={{ id: parseInt(payFor.id, 10), name: payFor.className, grade: payFor.studentGrade || '1', section: 'A' }}
          onClose={() => setPayFor(null)} 
        />
      )}
    </div>
  );
}
