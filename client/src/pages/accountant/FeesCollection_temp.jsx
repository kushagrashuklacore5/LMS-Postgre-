import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from "../../auth/auth";
import AccountantLayout from "../../components/AccountantLayout";
import { useTranslation } from "../../context/TranslationContext";
import { BarChart3, DollarSign, Users, TrendingUp, Calendar, RefreshCw, FileText, Download, CheckCircle2, AlertCircle, Clock, ShieldAlert } from "lucide-react";

import OfflineFeeModal from '../../components/OfflineFeeModal';

const FeesCollection = () => {
  const { t } = useTranslation();
  const { token, API } = useAuth();
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [feesData, setFeesData] = useState({
    totalFeesCollected: 0,
    totalStudents: 0,
    averageFeesPerStudent: 0,
    recentPayments: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);

  const downloadInvoice = async (payment) => {
    try {
      console.log('🧾 Invoice download started for:', payment);
      setDownloadingInvoice(payment.transactionId || payment.id);
      
      const invoiceHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Fee Receipt - ${payment.studentName || 'Student'}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f5f5f5;
        }
        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 0px;
            border: 2px solid #B99652;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #002366;
            padding-bottom: 20px;
        }
        .header h1 {
            color: #002366;
            margin: 0;
            font-size: 28px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .invoice-info div {
            flex: 1;
        }
        .invoice-info h3 {
            margin: 0 0 10px 0;
            color: #002366;
        }
        .student-details {
            background: #f8f9fa;
            padding: 20px;
            border: 1px solid #ebdcaa;
            margin-bottom: 20px;
        }
        .payment-details {
            background: #e9ecef;
            padding: 20px;
            border: 1px solid #ebdcaa;
        }
        .amount {
            font-size: 24px;
            font-weight: bold;
            color: #10b981;
            text-align: center;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
        }
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120px;
            color: rgba(0, 35, 102, 0.08);
            font-weight: bold;
            z-index: -1;
        }
    </style>
</head>
<body>
    <div class="watermark">PAID</div>
    <div class="invoice-container">
        <div class="header">
            <h1>Core5 Academy — Fee Receipt</h1>
            <p>Official Tax Payment Invoice</p>
        </div>
        
        <div class="invoice-info">
            <div>
                <h3>Receipt Details</h3>
                <p><strong>Receipt No:</strong> ${payment.transactionId || payment.id || 'INV-' + Date.now()}</p>
                <p><strong>Date:</strong> ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                <p><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">Completed</span></p>
            </div>
            <div style="text-align: right;">
                <h3>Payment Method</h3>
                <p><strong>Method:</strong> ${payment.paymentMethod || 'Online'}</p>
                <p><strong>Transaction ID:</strong> ${payment.transactionId || payment.id || 'INV-' + Date.now()}</p>
            </div>
        </div>
        
        <div class="student-details">
            <h3>Student Information</h3>
            <p><strong>Name:</strong> ${payment.studentName || 'Student'}</p>
            <p><strong>Payment Date:</strong> ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="payment-details">
            <h3>Payment Breakdown</h3>
            <p><strong>Description:</strong> Academic Tuition & Institutional Fee</p>
            <p><strong>Mode:</strong> ${payment.paymentMethod || 'Online'}</p>
        </div>
        
        <div class="amount">
            Total Amount Paid: ₹${Number(payment.amount || 0).toLocaleString('en-IN')}
        </div>
        
        <div class="footer">
            <p>This is a computer-generated tax receipt and does not require a physical signature.</p>
            <p>Core5 Technologies Private Limited — Finance Department</p>
            <p>Thank you for your payment!</p>
        </div>
    </div>
</body>
</html>`;

      const link = document.createElement('a');
      link.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(invoiceHTML);
      link.download = `Invoice_${payment.studentName || 'Student'}_${payment.transactionId || payment.id || Date.now()}.html`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('❌ Download invoice error:', error);
      alert('Error downloading invoice: ' + error.message);
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const fetchFeesData = async () => {
    try {
      setLoading(true);
      
      const feesRes = await fetch(`${API}/accountant/fees-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (feesRes.ok) {
        const feesDataResponse = await feesRes.json();
        if (feesDataResponse.success) {
          setFeesData({
            totalFeesCollected: feesDataResponse.data?.totalFeesCollected || 0,
            totalStudents: feesDataResponse.data?.totalStudents || 0,
            averageFeesPerStudent: feesDataResponse.data?.averageFeesPerStudent || 0,
            recentPayments: feesDataResponse.data?.recentPayments || []
          });
        } else {
          setError('Failed to fetch fees data');
        }
      } else {
        setFeesData({
          totalFeesCollected: 0,
          totalStudents: 0,
          averageFeesPerStudent: 0,
          recentPayments: []
        });
      }

    } catch (error) {
      console.error('Error fetching fees data:', error);
      setFeesData({
        totalFeesCollected: 0,
        totalStudents: 0,
        averageFeesPerStudent: 0,
        recentPayments: []
      });
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeesData();
  }, []);

  if (loading) {
    return (
      <AccountantLayout>
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
          <div className="p-12 text-center text-[#002366]">
            <div className="w-8 h-8 border-3 border-[#B99652] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading fee collection stats...
          </div>
        </div>
      </AccountantLayout>
    );
  }

  const recentPaymentsList = feesData.recentPayments || [];

  return (
    <AccountantLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#ebdcaa]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#002366] tracking-tight">
              {t('fees_collection_ledger', 'Fee Collection & Financial Ledger')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {t('fees_collection_subtitle', 'Monitor student tuition collections, record offline payments, and issue tax invoice receipts.')}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsOfflineModalOpen(true)}
              className="bg-[#B99652] hover:bg-[#a58342] text-white px-5 py-2.5 rounded-none font-bold text-xs uppercase tracking-wider shadow-xs transition-all cursor-pointer border border-[#B99652]"
            >
              {t('collect_offline_fee', 'Collect Offline Fee')}
            </button>
            <button
              onClick={fetchFeesData}
              className="bg-white hover:bg-[#fffdf4] text-[#002366] p-2.5 rounded-none border border-[#ebdcaa] shadow-xs transition-all cursor-pointer"
              title={t('refresh', 'Refresh Data')}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Informational Legacy Reconciliation Alert */}
        <div className="p-4 rounded-none bg-blue-50/80 border border-blue-200 flex items-start gap-3 shadow-xs">
          <div className="p-2 bg-[#002366] text-[#B99652] shrink-0 mt-0.5">
            <ShieldAlert size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-[#002366]">{t('legacy_reconciliation_active', 'Legacy Payment Reconciliation Active')}</h4>
            <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
              Historical payments recorded prior to schedule tracking require academic-session confirmation before allocation. 
              Review unallocated payments on the <Link to="/accountant/legacy-reconciliation" className="font-semibold underline text-[#002366] hover:text-[#B99652]">Legacy Reconciliation</Link> console.
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-emerald-600 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('total_fees_collected', 'Total Fees Collected')}</span>
              <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-none border border-emerald-500/20">
                <DollarSign size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-emerald-600">₹{Number(feesData.totalFeesCollected || 0).toLocaleString('en-IN')}</h3>
            <p className="text-xs text-slate-500">{t('lifetime_fee_revenue', 'Lifetime fee revenue')}</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#002366] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('total_students', 'Total Students')}</span>
              <div className="p-2 bg-[#002366]/10 text-[#002366] rounded-none border border-[#002366]/20">
                <Users size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{feesData.totalStudents || 0}</h3>
            <p className="text-xs text-slate-500">{t('enrolled_accounts', 'Enrolled accounts')}</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-[#B99652] shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('average_fee_per_student', 'Average Fee / Student')}</span>
              <div className="p-2 bg-[#B99652]/15 text-[#8c6d31] rounded-none border border-[#B99652]/30">
                <TrendingUp size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-[#8c6d31]">₹{Number(feesData.averageFeesPerStudent || 0).toLocaleString('en-IN')}</h3>
            <p className="text-xs text-[#8c6d31] font-medium">{t('average_collection', 'Average collection')}</p>
          </div>

          <div className="bg-white p-5 rounded-none border border-[#ebdcaa] border-t-2 border-t-indigo-600 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('recent_transactions', 'Recent Transactions')}</span>
              <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-none border border-indigo-500/20">
                <FileText size={20} />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{recentPaymentsList.length}</h3>
            <p className="text-xs text-slate-500">{t('recorded_payments', 'Recorded payments')}</p>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-none border border-[#ebdcaa] shadow-xs overflow-hidden">
          <div className="bg-[#fbf6e6] p-4 border-b border-[#ebdcaa] flex justify-between items-center">
            <h3 className="text-base font-bold text-[#002366]">{t('recent_fee_payments_receipts', 'Recent Fee Payments & Tax Receipts')}</h3>
            <span className="text-xs font-semibold text-[#8c6d31] uppercase tracking-wider">
              {recentPaymentsList.length} Total Receipts
            </span>
          </div>

          {recentPaymentsList.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <BarChart3 size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-base font-semibold">{t('no_fee_payments_yet', 'No fee payments recorded yet')}</p>
              <p className="text-xs text-slate-400 mt-1">Use the "Collect Offline Fee" button above to register student payments.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#fbf6e6]/60 text-[#002366] text-xs uppercase tracking-wider font-bold border-b border-[#ebdcaa]">
                    <th className="px-6 py-4">{t('student_name', 'Student Name')}</th>
                    <th className="px-6 py-4">{t('payment_type', 'Payment Type')}</th>
                    <th className="px-6 py-4">{t('amount_paid', 'Amount Paid')}</th>
                    <th className="px-6 py-4">{t('payment_method', 'Payment Method')}</th>
                    <th className="px-6 py-4">{t('date', 'Date')}</th>
                    <th className="px-6 py-4">{t('status', 'Status')}</th>
                    <th className="px-6 py-4 text-right">{t('tax_invoice', 'Tax Invoice')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebdcaa]/60 text-sm">
                  {recentPaymentsList.map((payment, index) => (
                    <tr key={payment.id || index} className="hover:bg-[#fffdf4] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-none bg-[#002366] text-white font-bold flex items-center justify-center text-xs border border-[#001845]">
                            {payment.studentName?.charAt(0)?.toUpperCase() || 'S'}
                          </div>
                          <span className="font-bold text-[#002366]">{payment.studentName || 'Student'}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-bold uppercase tracking-wider border ${
                          payment.type === 'OFFLINE' 
                            ? 'bg-[#B99652]/15 text-[#8c6d31] border-[#B99652]/40' 
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}>
                          {payment.type || 'ONLINE'}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-bold text-emerald-700">
                        ₹{Number(payment.amount || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="px-6 py-4 text-slate-700 font-medium uppercase text-xs">
                        {payment.paymentMethod || payment.paymentMode || 'Online'}
                      </td>

                      <td className="px-6 py-4 text-slate-500 text-xs font-medium">
                        {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : payment.date ? new Date(payment.date).toLocaleDateString() : 'Recent'}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-300">
                          <CheckCircle2 size={12} /> Completed
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => downloadInvoice(payment)}
                          disabled={downloadingInvoice === (payment.transactionId || payment.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#002366] hover:bg-[#001845] text-white font-bold text-xs uppercase tracking-wider rounded-none shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 border border-[#002366]"
                        >
                          <Download size={14} />
                          <span>{downloadingInvoice === (payment.transactionId || payment.id) ? 'Downloading...' : 'Invoice PDF'}</span>
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

      <OfflineFeeModal
        isOpen={isOfflineModalOpen}
        onClose={() => setIsOfflineModalOpen(false)}
        onSuccess={fetchFeesData}
      />
    </AccountantLayout>
  );
};

export default FeesCollection;
