import React, { useEffect } from 'react';
import { BarChart3, Lock, X } from 'lucide-react';

// Shown when a plan limit or a plan feature stops an action. Presentation only: the limits themselves
// are decided and enforced elsewhere (server quota middleware / the caller).
const QuotaLimitModal = ({ isOpen, onClose, quotaDetails }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const {
    type = 'quota', // 'quota' or 'feature'
    resourceType = 'items',
    currentUsage = 0,
    limit = 0,
    message = 'Your account is in free tier. Please contact your administrator to use the full feature.'
  } = quotaDetails || {};

  const isQuota = type === 'quota';
  const used = Number(currentUsage) || 0;
  const max = Number(limit) || 0;
  const percent = max > 0 ? Math.min((used / max) * 100, 100) : 100;
  const label = String(resourceType).replace(/_/g, ' ');

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#1e1b4b]/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quota-modal-title"
        className="w-full max-w-md bg-[#fffdf4] border border-[#ebdcaa] rounded-none shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[#ebdcaa] bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa] flex items-center justify-center text-[#B99652] rounded-none shrink-0">
              {isQuota ? <BarChart3 size={20} /> : <Lock size={20} />}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#B99652]">{isQuota ? 'Plan limit' : 'Plan feature'}</p>
              <h2 id="quota-modal-title" className="text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b] leading-tight">
                {isQuota ? 'Quota limit reached' : 'Feature not available'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-[#1e1b4b] hover:bg-[#ebdcaa]/30 rounded-none transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">{message}</p>

          {isQuota && (
            <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current usage</p>
                <p className="text-sm font-semibold text-[#1e1b4b]">
                  <span className="text-lg font-['DM_Serif_Display',serif]">{used}</span>
                  <span className="text-slate-400"> / {max}</span>
                </p>
              </div>
              <div className="h-2 w-full bg-[#ebdcaa]/40 rounded-none overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-label={`${label} used`}>
                <div className="h-full bg-[#B99652]" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-2 capitalize">{label} {used >= max ? 'limit reached' : 'available'}</p>
            </div>
          )}

          <div className="bg-[#002366]/[0.04] border border-[#002366]/15 rounded-none p-4">
            <h3 className="text-sm font-bold text-[#1e1b4b] mb-1">Upgrade your plan</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              A higher plan raises this limit. Please ask your school administrator about the available plans.
            </p>
          </div>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[#ebdcaa] bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuotaLimitModal;
