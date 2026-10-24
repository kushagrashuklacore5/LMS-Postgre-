import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { CheckCircle, XCircle, Clock, Package, RefreshCw } from 'lucide-react';

type RequestStatus = {
  id: number;
  title: string;
  status: 'pending' | 'accepted' | 'rejected';
  vendor_name: string;
  created_at: string;
  items_count: number;
};

export default function RequestStatus() {
  const { API, token } = useAuth();
  const [requests, setRequests] = useState<RequestStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    fetchRequestStatus();
    // Poll every 30 seconds for real-time updates
    const interval = setInterval(fetchRequestStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRequestStatus = async () => {
    try {
      if (!token) return;
      
      const res = await fetch(`${API}/storekeeper/stock-requests/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRequests(data.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching request status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return CheckCircle;
      case 'rejected': return XCircle;
      case 'pending': return Clock;
      default: return Package;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'text-emerald-300 bg-emerald-950/60 border border-emerald-500/40';
      case 'rejected': return 'text-rose-300 bg-rose-950/60 border border-rose-500/40';
      case 'pending': return 'text-[#fde68a] bg-[#B99652]/20 border border-[#B99652]/40';
      default: return 'text-gray-300 bg-white/10 border border-white/20';
    }
  };

  if (!showStatus) {
    return (
      <button
        onClick={() => setShowStatus(true)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-none bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-xs font-semibold uppercase tracking-wider"
      >
        <Package size={18} className="text-[#B99652]" />
        <span>Request Status</span>
        {requests.length > 0 && (
          <span className="ml-auto bg-[#B99652] text-white text-[10px] font-bold px-2 py-0.5 rounded-none">
            {requests.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-2 border-t border-white/10 pt-2">
      <div className="flex items-center justify-between px-4 py-2 text-white/70">
        <span className="text-xs font-bold uppercase tracking-wider text-[#B99652]">Request Status</span>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchRequestStatus}
            className="p-1 hover:bg-white/10 rounded-none text-white/80"
            title="Refresh"
          >
            <RefreshCw size={13} className="text-[#B99652]" />
          </button>
          <button
            onClick={() => setShowStatus(false)}
            className="p-1 hover:bg-white/10 rounded-none text-white/80 text-sm font-bold"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="px-2 pb-2 space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="text-center py-4 text-white/50">
            <div className="animate-spin rounded-none h-4 w-4 border-2 border-[#B99652] border-t-transparent mx-auto mb-2"></div>
            <span className="text-[11px]">Loading...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-4 text-white/50">
            <Package size={16} className="mx-auto mb-2 opacity-50 text-[#B99652]" />
            <span className="text-[11px]">No pending requests</span>
          </div>
        ) : (
          requests.map((request) => {
            const StatusIcon = getStatusIcon(request.status);
            return (
              <div
                key={request.id}
                className="bg-white/5 hover:bg-white/10 rounded-none border border-white/10 p-2.5 text-white/80 transition-all text-xs"
              >
                <div className="flex items-start gap-2">
                  <StatusIcon size={14} className="mt-0.5 shrink-0 text-[#B99652]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-bold truncate text-white">{request.title}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-none uppercase tracking-wider ${getStatusColor(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 truncate mt-0.5">{request.vendor_name}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {request.items_count} item{request.items_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
