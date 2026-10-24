import AnnouncementBell from "../../components/AnnouncementBell";
import CreateAnnouncementModal from "../announcements/CreateAnnouncementModal";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth";
import { useSimpleTranslation } from "../../context/SimpleTranslationContext";
import { useTranslation } from "../../context/TranslationContext";
import AdminLayout from "../../components/AdminLayout";
import { toast } from "react-toastify";
import {
  Users,
  UserCheck,
  BarChart3,
  UserPlus,
  BookOpen,
  Award,
  Clock,
  RefreshCw,
} from "lucide-react";

const AdminDashboard = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    students: 0,
    mentors: 0,
    courses: 0,
    certificates: 0,
    newUsers: 0,
    pendingMentors: 0,
    publishedCourses: 0,
  });

  const [loading, setLoading] = useState(true);
  const [openAnnouncementModal, setOpenAnnouncementModal] = useState(false);

  useEffect(() => {
    getDashboardData();
  }, []);

  const getDashboardData = async () => {
    try {
      setLoading(true);
      // If there's no auth token, avoid calling protected API and prompt login
      if (!token) {
        setLoading(false);
        toast.info('Please sign in to view the admin dashboard');
        navigate('/login');
        return;
      }
      const res = await fetch(`${API}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Handle unauthorized responses explicitly so we can guide the user
      if (res.status === 401 || res.status === 403) {
        toast.error('Not authorized — please sign in as an admin');
        setLoading(false);
        navigate('/login');
        return;
      }

      if (!res.ok) throw new Error();

      const data = await res.json();
      setStats({
        students: data?.userStats?.find(u => u.role === 'student')?.count || 0,
        mentors: data?.userStats?.find(u => u.role === 'mentor')?.count || 0,
        courses: data?.totalCourses || 0,
        certificates: 0,
        newUsers: data?.recentUsers?.length || 0,
        pendingMentors: data?.userStats?.find(u => u.role === 'mentor' && u.isApproved === 0)?.count || 0,
        publishedCourses: data?.totalCourses || 0,
      });
    } catch {
      toast.error(t('could_not_load_dashboard_data'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6 flex justify-center items-center h-96">
          <div className="animate-spin h-10 w-10 border-4 border-[#B99652] border-t-transparent rounded-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* ================= HEADER ================= */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]/60">
            <div>
              <h1 className="text-2xl sm:text-3xl font-['DM_Serif_Display',serif] text-[#1e1b4b] tracking-tight">
                {t('admin_dashboard_title')}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                {t('welcome_control_panel')}
              </p>
            </div>

            {/* ✅ RIGHT CONTROLS */}
            <div className="flex items-center gap-3">
              <AnnouncementBell />

              {/* ➕ CREATE ANNOUNCEMENT */}
              <button
                data-tour="admin-announcement-btn"
                onClick={() => setOpenAnnouncementModal(true)}
                className="px-4 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs font-semibold uppercase tracking-wider shadow-sm transition-all"
              >
                {t('announcement_button')}
              </button>

              <button
                onClick={getDashboardData}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#ebdcaa] rounded-none hover:bg-[#fffdf4] text-slate-700 text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs"
              >
                <RefreshCw size={15} />
                <span>{t('refresh')}</span>
              </button>
            </div>
          </div>

          {/* ================= STATS ================= */}
          <div data-tour="admin-overview-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title={t('total_students')} value={stats.students} icon={<Users className="w-5 h-5" />} link="/admin/users" />
            <StatCard title={t('total_mentors')} value={stats.mentors} icon={<UserCheck className="w-5 h-5" />} link="/admin/users" />
            <StatCard title={t('total_courses')} value={stats.courses} icon={<BookOpen className="w-5 h-5" />} />
            <StatCard title={t('certificates')} value={stats.certificates} icon={<Award className="w-5 h-5" />} />
          </div>

          {/* ================= QUICK ACTIONS ================= */}
          <div>
            <h2 className="font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b] mb-3">{t('quick_actions')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <QuickLink to="/admin/users" icon={<Users className="w-5 h-5" />} title={t('manage_users')} />
              <QuickLink to="/admin/fee-structure" icon={<BarChart3 className="w-5 h-5" />} title={t('nav_fee_structure')} />
              <QuickLink to="/admin/database-export" icon={<RefreshCw className="w-5 h-5" />} title={t('nav_database_export')} />
            </div>
          </div>

          {/* ================= RECENT ACTIVITY ================= */}
          <div data-tour="admin-recent-activity" className="bg-white border border-[#ebdcaa] rounded-none p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#ebdcaa]/50">
              <h2 className="font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">{t('recent_activity')}</h2>
              <Clock size={18} className="text-[#B99652]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Activity label={t('new_users')} value={stats.newUsers} icon={<UserPlus className="w-4 h-4 text-[#B99652]" />} />
              <Activity label={t('pending_mentors')} value={stats.pendingMentors} icon={<UserCheck className="w-4 h-4 text-[#B99652]" />} />
              <Activity label={t('published_courses')} value={stats.publishedCourses} icon={<BookOpen className="w-4 h-4 text-[#B99652]" />} />
            </div>
          </div>

        </div>
      </div>

      {/* 📢 CREATE ANNOUNCEMENT MODAL */}
      <CreateAnnouncementModal
        open={openAnnouncementModal}
        onClose={() => setOpenAnnouncementModal(false)}
        onSuccess={() => setOpenAnnouncementModal(false)}
      />
    </AdminLayout>
  );
};

/* ================= HELPERS ================= */

const StatCard = ({ title, value, icon, link }) => (
  <div className="bg-white border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs hover:shadow-sm transition-all">
    <div className="flex justify-between items-start mb-3">
      <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] rounded-none">
        {icon}
      </div>
      {link && <Link to={link} className="text-xs font-bold uppercase tracking-wider text-[#B99652] hover:underline">View →</Link>}
    </div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{title}</p>
    <p className="text-2xl sm:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{value}</p>
  </div>
);

const QuickLink = ({ to, icon, title }) => (
  <Link to={to} className="bg-white border border-[#ebdcaa] p-4 rounded-none hover:border-[#B99652] hover:bg-[#fffdf4]/40 transition-all flex items-center gap-3.5 group shadow-xs">
    <div className="w-10 h-10 bg-[#fffdf4] border border-[#ebdcaa]/80 flex items-center justify-center text-[#B99652] rounded-none group-hover:bg-[#B99652] group-hover:text-white transition-colors">
      {icon}
    </div>
    <h3 className="font-semibold text-sm text-slate-800 group-hover:text-[#1e1b4b]">{title}</h3>
  </Link>
);

const Activity = ({ label, value, icon }) => (
  <div className="bg-[#fffdf4] border border-[#ebdcaa]/60 p-4 rounded-none text-center">
    <div className="flex items-center justify-center gap-1.5 mb-1.5">
      {icon}
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
    <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{value}</p>
  </div>
);

export default AdminDashboard;
