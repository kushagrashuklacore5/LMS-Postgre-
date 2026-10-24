import { useEffect, useState, useRef } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../auth/auth";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { notificationTarget } from "../utils/notificationRoutes";
import ChatbotButton from "./ChatbotButton";
import { useTranslation } from "react-i18next";

const AnnouncementBell = () => {
  const { token, API, user } = useAuth();
  const { t } = useTranslation(['forms', 'common']);

  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);

  const ref = useRef(null);
  const socketRef = useRef(null);

  /* ================= FETCH ANNOUNCEMENTS ================= */
  const fetchAnnouncements = async () => {
    try {
      console.log(`🔔 Bell fetching from: ${API}/announcements`);
      console.log(`🔔 User: ${user?.id} (${user?.role}), Token: ${token?.substring(0, 20)}...`);
      
      const res = await fetch(`${API}/announcements`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log(`🔔 Response status: ${res.status}`);
      
      if (!res.ok) {
        console.error(`🔔 Fetch failed: ${res.status} ${res.statusText}`);
        return;
      }

      const data = await res.json();
      console.log(`🔔 Fetched ${data?.length || 0} announcements:`, data);
      setAnnouncements(data || []);

      // 🔴 unread = user not in readBy array (string/number tolerant)
      const unreadExists = data?.some((a) => {
        let readBy = [];
        try { readBy = JSON.parse(a.readBy || '[]'); } catch (e) { readBy = a.readBy || []; }
        const readByStrings = (readBy || []).map(String);
        const isUnread = !readByStrings.includes(String(user?.id));
        console.log(`  - ${a.title}: readBy=${readByStrings}, userId=${user?.id}, unread=${isUnread}`);
        return isUnread;
      });

      console.log(`🔔 Has unread: ${unreadExists}`);
      setHasUnread(unreadExists);
    } catch (err) {
      console.error("🔴 Failed to load announcements:", err);
    }
  };

  /* ================= MARK ALL AS READ ================= */
  const markAllAsRead = async () => {
    try {
      if (!user?.id) {
        console.warn(`⚠️ No user ID, skipping mark as read`);
        return;
      }

      console.log(`🔔 Marking announcements as read for user ${user?.id} (${user?.role})`);
      
      const unread = announcements.filter((a) => {
        let readBy = [];
        try { readBy = JSON.parse(a.readBy || '[]'); } catch (e) { readBy = a.readBy || []; }
        const readByStrings = (readBy || []).map(String);
        return !readByStrings.includes(String(user?.id));
      });

      if (unread.length === 0) {
        console.log(`ℹ️ All announcements already read`);
        setHasUnread(false);
        return;
      }

      console.log(`🔔 Found ${unread.length} unread announcements to mark as read`);

      let successCount = 0;
      let failCount = 0;

      // Mark each as read - catch errors per-request to avoid blocking others
      for (const a of unread) {
        try {
          console.log(`  → Marking announcement ${a.id} ("${a.title}") as read...`);
          
          const res = await fetch(`${API}/announcements/${a.id}/read`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });

          const responseText = await res.text();
          console.log(`  Response ${res.status}:`, responseText);

          if (!res.ok) {
            console.warn(`  ⚠️ Failed to mark ${a.id} as read: ${res.status} ${responseText}`);
            failCount++;
            // Don't fail the whole operation, just skip this one
            continue;
          }

          successCount++;
          console.log(`  ✅ Marked announcement ${a.id} as read`);
        } catch (err) {
          console.error(`  ❌ Error marking ${a.id} as read:`, err);
          failCount++;
          // Continue to next announcement
        }
      }

      // Update local state to reflect changes
      setAnnouncements((prev) =>
        prev.map((a) => {
          let readBy = [];
          try { readBy = JSON.parse(a.readBy || '[]'); } catch (e) { readBy = a.readBy || []; }
          const readByStrings = Array.isArray(readBy) ? readBy.map(String) : [];
          
          if (!readByStrings.includes(String(user?.id))) {
            readByStrings.push(String(user?.id));
            return {
              ...a,
              readBy: JSON.stringify(readByStrings),
            };
          }
          return a;
        })
      );

      setHasUnread(false);
      console.log(`✅ Mark as read complete: ${successCount} success, ${failCount} failed`);
    } catch (err) {
      console.error("🔴 Failed to mark announcements as read", err);
      // Don't block UI - this is a "nice to have" operation
    }
  };

  /* ================= INITIAL LOAD ================= */
  useEffect(() => {
    fetchAnnouncements();
  }, [user?.id, token, API]);

  /* ================= PERIODIC POLLING ================= */
  useEffect(() => {
    // Fetch announcements every 10 seconds to ensure latest data always shows
    const interval = setInterval(() => {
      console.log(`🔄 Polling announcements...`);
      fetchAnnouncements();
    }, 10000);

    return () => clearInterval(interval);
  }, [token, API, user?.id]);

  /* ================= REAL-TIME SOCKET ================= */
  useEffect(() => {
    let studentCourseIds = new Set();

    // If student, fetch enrolled courses so we can filter course-specific announcements
    const fetchStudentCourses = async () => {
      try {
        if (user?.role === 'student') {
          const res = await fetch(`${API}/courses/student`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const ids = Array.isArray(data) ? data.map(c => String(c._id || c.id || c.id || c.courseId || c._id)) : [];
            studentCourseIds = new Set(ids.filter(Boolean));
            console.log('🔔 Student enrolled course IDs:', Array.from(studentCourseIds));
          } else {
            console.warn('🔔 Failed to fetch student courses for announcement filtering');
          }
        }
      } catch (err) {
        console.warn('🔔 Error fetching student courses:', err);
      }
    };

    fetchStudentCourses();

    const socketUrl = API.replace(/\/api\/?$/, '');
    // Pass the backend URL explicitly; io({...}) alone connects to the page
    // origin (the Vite dev server), which has no Socket.IO endpoint.
    socketRef.current = io(socketUrl, {
      auth: { token },
    });

    // A notification addressed to this user arrived: reload the list
    socketRef.current.on("notification:new", () => {
      fetchAnnouncements();
    });

    const userRole = user?.role || 'student';
    console.log(`🔔 Socket listener setup for role: ${userRole}`);
    
    // Helper to normalize incoming payloads and avoid duplicates
    const handleIncoming = (payload) => {
      // payload might be { data: announcement, ... } or the announcement object directly
      const ann = payload && payload.data ? payload.data : payload;
      if (!ann) {
        console.warn(`🔴 Empty announcement payload received`);
        return;
      }

      // If this is a course-specific announcement, ensure the student is enrolled
      if (ann.courseId && userRole === 'student') {
        const annCourseId = String(ann.courseId);
        if (!studentCourseIds.has(annCourseId)) {
          console.log(`  → Ignoring course announcement ${ann.id} for course ${annCourseId} (student not enrolled)`);
          return;
        }
      }
      
      console.log(`📬 Received announcement on bell:`, ann.title);
      
      setAnnouncements((prev) => {
        const exists = prev.some((p) => String(p.id) === String(ann.id));
        if (exists) {
          console.log(`  ℹ️ Announcement already in list, skipping duplicate`);
          return prev;
        }
        console.log(`  ✅ Adding new announcement to list`);
        return [ann, ...prev];
      });
      setHasUnread(true);
    };

    // Listen to role-specific channels
    if (userRole === 'student') {
      console.log(`  → Listening to: announcement:students`);
      socketRef.current.on("announcement:students", handleIncoming);
      socketRef.current.on("announcement:student", handleIncoming); // legacy
    } else if (userRole === 'mentor' || userRole === 'teacher' || userRole === 'faculty') {
      console.log(`  → Listening to: announcement:mentors`);
      socketRef.current.on("announcement:mentors", handleIncoming);
      socketRef.current.on("announcement:mentor", handleIncoming); // legacy
      socketRef.current.on("announcement:faculty", handleIncoming); // legacy
    } else if (userRole === 'admin') {
      console.log(`  → Listening to: all channels (admin)`);
      socketRef.current.on("announcement:students", handleIncoming);
      socketRef.current.on("announcement:mentors", handleIncoming);
    }

    // Also listen for course-specific events using a generic onAny handler
    socketRef.current.onAny((event, ...args) => {
      try {
        if (typeof event === 'string' && event.startsWith('announcement:course:')) {
          const courseId = event.split(':').pop();
          const payload = args[0];
          // If student, only process if enrolled; for mentors/admins we process anyway
          if (userRole === 'student') {
            if (!studentCourseIds.has(String(courseId))) return;
          }
          handleIncoming(payload);
        }
      } catch (e) {
        console.warn('🔔 onAny handler error:', e);
      }
    });

    // All roles listen to 'both' and general channels
    socketRef.current.on("announcement:both", handleIncoming);
    socketRef.current.on("new-announcement", handleIncoming);

    // Refresh announcements when socket connects
    socketRef.current.on("connect", () => {
      console.log("🔔 Socket connected, fetching announcements");
      fetchAnnouncements();
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user?.role, token]);

  /* ================= TOGGLE DROPDOWN ================= */
  const toggleBell = () => {
    setOpen((prev) => !prev);

    if (!open && hasUnread) {
      markAllAsRead();
    }
  };

  /* ================= OPEN THE SCREEN A NOTIFICATION IS ABOUT ================= */
  const openNotification = (a) => {
    const target = notificationTarget(a, user?.role);
    if (!target) return;
    setOpen(false);
    navigate(target);
  };

  const unreadCount = announcements.filter((a) => {
    let readBy = [];
    try { readBy = JSON.parse(a.readBy || '[]'); } catch (e) { readBy = a.readBy || []; }
    return !(Array.isArray(readBy) ? readBy : []).map(String).includes(String(user?.id));
  }).length;

  /* ================= CLOSE ON OUTSIDE CLICK ================= */
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-center gap-4">
    <ChatbotButton />
    <div className="relative" ref={ref}>
      {/* 🔔 BELL ICON (UI UNCHANGED) */}
      <button onClick={toggleBell} className="relative" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}>
        <Bell className="w-5 h-5" />
        {hasUnread && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] leading-4 font-bold rounded-full text-center" data-testid="notification-unread-count">
            {unreadCount > 9 ? "9+" : unreadCount || ""}
          </span>
        )}
      </button>

      {/* 📢 ANNOUNCEMENT DROPDOWN */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded-lg shadow-lg z-50">
          <div className="p-3 font-semibold border-b">
            {t('announcements_title', 'Announcements')}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {announcements.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">
                {t('no_announcements_available', 'No announcements')}
              </p>
            ) : (
              announcements.map((a) => {
                let readBy = [];
                try {
                  readBy = JSON.parse(a.readBy || '[]');
                } catch (e) {
                  readBy = a.readBy || [];
                }
                // Handle both string and number comparisons
                const readByStrings = (Array.isArray(readBy) ? readBy : []).map(String);
                const isUnread = !readByStrings.includes(String(user?.id));

                const isFeeAlert = a.title?.includes('Fee') || a.content?.toLowerCase()?.includes('fee') || a.content?.toLowerCase()?.includes('due');

                return (
                  <div
                    key={a.id}
                    data-testid="notification-item"
                    data-type={a.type || "announcement"}
                    role={target ? "button" : undefined}
                    tabIndex={target ? 0 : undefined}
                    onClick={target ? () => openNotification(a) : undefined}
                    onKeyDown={target ? (e) => { if (e.key === "Enter") openNotification(a); } : undefined}
                    className={`p-3 border-b last:border-0 ${
                      isUnread ? (isFeeAlert ? "bg-amber-50/60" : "bg-gray-50") : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800 text-sm">{a.title}</p>
                      {a.priority === 'high' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-none shrink-0">
                          {t('urgent', 'Urgent')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {a.content || a.message}
                    </p>
                    {isFeeAlert && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <a
                          href="/student/pay-fees"
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#002366] hover:bg-[#001744] text-white text-xs font-bold uppercase tracking-wider transition-all"
                        >
                          💳 {t('pay_dues_now', 'Pay Dues Now')}
                        </a>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default AnnouncementBell;
