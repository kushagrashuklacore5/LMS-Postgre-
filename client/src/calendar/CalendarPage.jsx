import { useEffect, useState, useCallback, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { io } from 'socket.io-client';

import CalendarHeader from "./CalendarHeader";
import CalendarSidebar from "./CalendarSidebar";
import EditEventModal from "./EditEventModal";
import QuotaLimitModal from "../components/QuotaLimitModal";
import { useNavigate } from 'react-router-dom';
import "./calendar.css";
import { API_ORIGIN } from '../config/api';
import { useTranslation } from "../context/TranslationContext";

const CalendarPage = ({ role }) => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [error, setError] = useState(null);
  const { t, currentLanguage, isRTL } = useTranslation();

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("unstop_token");

  // Socket connection for real-time plan changes
  const [socket, setSocket] = useState(null);

  const fetchEvents = useCallback(async () => {
    try {
      if (!token) {
        setError(t('dashboard:cal_login_first'));
        return;
      }

      const apiUrl = API_ORIGIN;
      // Ensure we don't double the /api prefix
      const baseUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;
      
      const res = await axios.get(`${baseUrl}/api/calendar`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const formatted = res.data.map((e) => ({
        id: e.id || e._id,
        title: e.title,
        start: new Date(e.startDate),
        end: new Date(e.endDate),
        extendedProps: {
          createdByUser: e.createdByUser,
          createdByRole: e.createdByRole,
          publishFor: e.publishFor,
        },
        backgroundColor:
          e.createdByRole === "admin" ? "#2563eb" : "#16a34a",
      }));

      setEvents(formatted);
      setError(null);
      console.log(`✅ Fetched ${formatted.length} calendar events`);
    } catch (err) {
      console.error("Fetch events error", err);
      setError(err.response?.data?.message || t('dashboard:cal_load_failed'));
    }
  }, [token]);

  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const navigate = useNavigate();

  const checkFeatureAccess = async () => {
    // DISABLED: Allow all users to access calendar without restrictions
    setIsCheckingAccess(false);
    return true;
  };

  useEffect(() => {
    // DISABLED: Simplified calendar access - no socket or periodic checks
    (async () => {
      console.log('🚀 Starting calendar page - direct access...');
      const ok = await checkFeatureAccess();
      if (ok) {
        console.log('✅ Access granted - fetching events...');
        await fetchEvents();
      }
    })();
  }, [fetchEvents]);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-[#fffdf4]"
      style={{
        backgroundColor: '#fffdf4',
        backgroundImage: `
          linear-gradient(to right, rgba(200, 165, 70, 0.045) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(200, 165, 70, 0.045) 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px'
      }}
    >
      <CalendarHeader role={role} />

      {error && (
        <div className="px-4 py-2 bg-red-100 border-b border-red-200 text-red-800 text-xs font-semibold">
          ⚠️ {error}
        </div>
      )}

      <QuotaLimitModal isOpen={showQuotaModal} onClose={() => { setShowQuotaModal(false); navigate(role === 'admin' ? '/admin/dashboard' : '/'); }} quotaDetails={quotaDetails} />

      <div className="flex-1 flex overflow-hidden">
        <CalendarSidebar role={role} onEventCreated={fetchEvents} />

        <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
          {isCheckingAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-[#ebdcaa]/60 shadow-sm text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#002366] mb-4"></div>
              <p className="text-base font-bold text-gray-800">{t('dashboard:cal_checking_access')}</p>
              <p className="text-xs text-gray-500 mt-1">{t('dashboard:cal_verifying_subscription')}</p>
            </div>
          ) : showQuotaModal ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 bg-white rounded-2xl border border-[#ebdcaa]/60 shadow-sm text-center">
              <p className="text-base font-bold text-gray-800">{t('dashboard:cal_restricted')}</p>
              <p className="text-xs text-gray-500 mt-1">{t('dashboard:cal_upgrade_plan')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-none shadow-sm border border-[#ebdcaa]/60 p-4 md:p-6 flex-1 flex flex-col overflow-hidden">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay",
                }}
                locale={currentLanguage}
                direction={isRTL ? "rtl" : "ltr"}
                buttonText={{
                  today: t('common:today'),
                  month: t('common:month'),
                  week: t('common:week'),
                  day: t('common:day'),
                }}
                events={events}
                eventClick={(info) => setSelectedEvent(info.event)}
                height="100%"
              />
            </div>
          )}
        </div>
      </div>

      {/* EDIT / DELETE MODAL */}
      {selectedEvent && (
        <EditEventModal
          event={selectedEvent}
          role={role}
          onClose={() => setSelectedEvent(null)}
          onRefresh={fetchEvents}
        />
      )}
    </div>
  );
};

export default CalendarPage;
