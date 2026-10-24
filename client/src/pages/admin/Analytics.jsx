import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/auth';
import AdminLayout from '../../components/AdminLayout';
import { useTranslation } from '../../context/TranslationContext';
import { toast } from 'react-toastify';
import { 
  Users, 
  UserCheck, 
  BookOpen, 
  Award,
  TrendingUp,
  BarChart3,
  RefreshCw
} from 'lucide-react';

const Analytics = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    students: 0,
    mentors: 0,
    approvedMentors: 0,
    totalCourses: 0,
    publishedCourses: 0,
    totalCertificates: 0,
    newUsers: 0,
    newCourses: 0,
    newCertificates: 0,
    completionRate: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics();
  }, []);

  const getAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/users/analytics`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('could_not_load_analytics'));
      }

      const data = await response.json();
      setStats({
        totalUsers: data?.users?.total || 0,
        activeUsers: data?.users?.active || 0,
        students: data?.users?.students || 0,
        mentors: data?.users?.mentors || 0,
        approvedMentors: data?.users?.approvedMentors || 0,
        totalCourses: data?.courses?.total || 0,
        publishedCourses: data?.courses?.published || 0,
        totalCertificates: data?.certificates?.total || 0,
        newUsers: data?.users?.newUsers || 0,
        newCourses: data?.courses?.newCourses || 0,
        newCertificates: data?.certificates?.newCertificates || 0,
        completionRate: data?.courses?.completionRate || 0
      });

    } catch (error) {
      toast.error(t('could_not_load_analytics'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'total_users_label',
      value: stats.totalUsers,
      change: `${stats.newUsers} ${t('this_month_suffix')}`,
      icon: <Users size={22} className="text-[#B99652]" />,
      accentBg: 'bg-[#B99652]/10 border border-[#ebdcaa]'
    },
    {
      title: 'active_users_label',
      value: stats.activeUsers,
      change: `${stats.students} ${t('students')}`,
      icon: <UserCheck size={22} className="text-[#1e1b4b]" />,
      accentBg: 'bg-[#1e1b4b]/10 border border-[#ebdcaa]'
    },
    {
      title: 'total_courses_label',
      value: stats.totalCourses,
      change: `${stats.publishedCourses} ${t('published')}`,
      icon: <BookOpen size={22} className="text-[#B99652]" />,
      accentBg: 'bg-[#B99652]/10 border border-[#ebdcaa]'
    },
    {
      title: 'certificates_label',
      value: stats.totalCertificates,
      change: `${stats.newCertificates} ${t('this_month_suffix')}`,
      icon: <Award size={22} className="text-[#1e1b4b]" />,
      accentBg: 'bg-[#1e1b4b]/10 border border-[#ebdcaa]'
    }
  ];

  const userStats = [
    { label: 'students', value: stats.students },
    { label: 'mentors', value: stats.mentors },
    { label: 'approved_mentors', value: stats.approvedMentors }
  ];

  const recentActivity = [
    { label: 'new_users_label', value: stats.newUsers, color: 'text-[#B99652]' },
    { label: 'new_courses_label', value: stats.newCourses, color: 'text-[#1e1b4b]' },
    { label: 'new_certificates_label', value: stats.newCertificates, color: 'text-[#B99652]' }
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin h-12 w-12 border-t-2 border-b-2 border-[#B99652] mx-auto rounded-none"></div>
              <p className="mt-4 text-[#1e1b4b] font-medium">{t('loading_analytics')}</p>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="border-b border-[#ebdcaa] pb-4">
            <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
              {t('analytics_dashboard_title')}
            </h1>
            <p className="text-gray-600 mt-1">{t('system_performance_overview')}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card, index) => (
              <div key={index} className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2.5 rounded-none ${card.accentBg}`}>
                    {card.icon}
                  </div>
                  <TrendingUp className="text-[#B99652]" size={18} />
                </div>
                <h3 className="text-gray-600 text-sm mb-1">{t(card.title)}</h3>
                <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{card.value}</p>
                <p className="text-xs text-gray-500 mt-1">{card.change}</p>
              </div>
            ))}
          </div>

          {/* User Breakdown & Completion */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#ebdcaa]">
                <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('user_breakdown')}</h2>
                <Users className="text-[#B99652]" size={20} />
              </div>
              <div className="space-y-4">
                {userStats.map((stat, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white border border-[#ebdcaa] rounded-none">
                    <span className="text-gray-700 font-medium">{t(stat.label)}</span>
                    <span className="font-bold text-[#1e1b4b] font-['DM_Serif_Display',serif] text-lg">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#ebdcaa]">
                <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('course_completion')}</h2>
                <BarChart3 className="text-[#B99652]" size={20} />
              </div>
              <div className="text-center py-6">
                <div className="text-5xl font-bold font-['DM_Serif_Display',serif] text-[#B99652] mb-2">{stats.completionRate}%</div>
                <p className="text-gray-600 text-sm">Overall Course Completion Rate</p>
                <div className="w-full bg-gray-200 h-2 mt-4 rounded-none overflow-hidden">
                  <div className="bg-[#B99652] h-full" style={{ width: `${Math.min(stats.completionRate, 100)}%` }}></div>
                </div>
              </div>
              <div className="text-xs text-center text-gray-500">
                Calculated across all published curriculums
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#ebdcaa]">
              <h2 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('recent_activity_30_days')}</h2>
              <TrendingUp className="text-[#B99652]" size={20} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {recentActivity.map((item, index) => (
                <div key={index} className="text-center p-4 bg-white border border-[#ebdcaa] rounded-none">
                  <div className={`text-3xl font-bold font-['DM_Serif_Display',serif] ${item.color}`}>{item.value}</div>
                  <div className="text-gray-600 text-sm mt-1">{t(item.label)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <h3 className="font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] text-lg mb-4 pb-2 border-b border-[#ebdcaa]">{t('course_statistics')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcaa]/50">
                  <span className="text-gray-600 text-sm">Total Courses</span>
                  <span className="font-bold text-[#1e1b4b]">{stats.totalCourses}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcaa]/50">
                  <span className="text-gray-600 text-sm">Published Courses</span>
                  <span className="font-bold text-[#1e1b4b]">{stats.publishedCourses}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-600 text-sm">New Courses (30 days)</span>
                  <span className="font-bold text-[#B99652]">{stats.newCourses}</span>
                </div>
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <h3 className="font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] text-lg mb-4 pb-2 border-b border-[#ebdcaa]">{t('certificate_statistics')}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcaa]/50">
                  <span className="text-gray-600 text-sm">Total Certificates</span>
                  <span className="font-bold text-[#1e1b4b]">{stats.totalCertificates}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#ebdcaa]/50">
                  <span className="text-gray-600 text-sm">New Certificates (30 days)</span>
                  <span className="font-bold text-[#B99652]">{stats.newCertificates}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-gray-600 text-sm">Issuance Rate</span>
                  <span className="font-bold text-[#1e1b4b]">
                    {stats.totalUsers > 0 ? Math.round((stats.totalCertificates / stats.totalUsers) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
            <h3 className="font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] text-lg mb-4 pb-2 border-b border-[#ebdcaa]">{t('system_summary')}</h3>
            <div className="text-gray-700 space-y-2 text-sm">
              <p>• {t('total_users_colon')} <span className="font-bold text-[#1e1b4b]">{stats.totalUsers}</span></p>
              <p>• {t('active_mentors_colon')} <span className="font-bold text-[#1e1b4b]">{stats.approvedMentors}</span></p>
              <p>• {t('course_completion_rate_colon')} <span className="font-bold text-[#1e1b4b]">{stats.completionRate}%</span></p>
              <p>• {t('new_activity_this_month')} <span className="font-bold text-[#B99652]">
                {stats.newUsers + stats.newCourses + stats.newCertificates} total events
              </span></p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Analytics;