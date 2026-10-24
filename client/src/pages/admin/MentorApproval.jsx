import { useState, useEffect } from 'react';
import { useAuth } from '../../auth/auth';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'react-toastify';
import { showPasswordNotice } from '../../components/admin/PasswordNotice';
import { useTranslation } from '../../context/TranslationContext';
import {
  UserCheck,
  UserX,
  UserPlus,
  Users,
  CheckCircle,
  XCircle,
  MoreVertical,
  Plus,
  X
} from 'lucide-react';

const MentorApproval = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();
  const [mentorList, setMentorList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    getMentors();
  }, []);

  const getMentors = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/admin/mentors`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('could_not_load_mentors'));
      }

      const data = await response.json();
      setMentorList(data);

    } catch (error) {
      toast.error(t('failed_to_load_mentors'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const approveMentor = async (mentorId) => {
    try {
      const response = await fetch(`${API}/admin/approve-mentor/${mentorId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('approval_failed'));
      }

      setMentorList(mentorList.map(mentor =>
        mentor.id === mentorId ? { ...mentor, isApproved: true } : mentor
      ));
      toast.success(t('mentor_approved_successfully'));

    } catch (error) {
      toast.error(t('could_not_approve_mentor'));
      console.error(error);
    }
  };

  const removeMentor = async (mentorId, mentorName) => {
    if (!confirm(t('confirm_remove_mentor', { name: mentorName }))) {
      return;
    }

    try {
      const response = await fetch(`${API}/admin/users/${mentorId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('delete_failed'));
      }

      setMentorList(mentorList.filter(mentor => mentor.id !== mentorId));
      toast.success(t('mentor_removed_successfully'));

    } catch (error) {
      toast.error(t('could_not_remove_mentor'));
      console.error(error);
    }
  };

  const addMentor = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API}/admin/create-teacher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(t('registration_failed'));
      }

      const data = await response.json();
      setMentorList([...mentorList, data]);
      setShowForm(false);
      setFormData({ name: '', email: '', password: '' });
      showPasswordNotice({ message: t('mentor_added_successfully'), label: t('temporary_password'), password: data.generatedPassword });

    } catch (error) {
      toast.error(t('could_not_add_mentor'));
      console.error(error);
    }
  };

  const stats = {
    approved: mentorList.filter(m => m.isApproved).length,
    pending: mentorList.filter(m => !m.isApproved).length,
    total: mentorList.length
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin h-12 w-12 border-t-2 border-b-2 border-[#B99652] mx-auto rounded-none"></div>
              <p className="mt-4 text-[#1e1b4b] font-medium">{t('loading_mentors')}</p>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#ebdcaa] pb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">
                {t('mentor_approval_title')}
              </h1>
              <p className="text-gray-600 mt-1">{t('manage_mentor_applications')}</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white font-medium rounded-none shadow-sm transition-all"
            >
              <Plus size={18} />
              <span>{t('add_mentor')}</span>
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Approved Mentors</p>
                  <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{stats.approved}</p>
                </div>
                <div className="p-3 rounded-none bg-[#B99652]/10 border border-[#ebdcaa]">
                  <CheckCircle className="text-[#B99652]" size={22} />
                </div>
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Pending Approval</p>
                  <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{stats.pending}</p>
                </div>
                <div className="p-3 rounded-none bg-amber-500/10 border border-amber-200">
                  <UserX className="text-amber-600" size={22} />
                </div>
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total Mentors</p>
                  <p className="text-2xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{stats.total}</p>
                </div>
                <div className="p-3 rounded-none bg-[#1e1b4b]/10 border border-[#ebdcaa]">
                  <Users className="text-[#1e1b4b]" size={22} />
                </div>
              </div>
            </div>
          </div>

          {/* Mentors List */}
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] shadow-sm overflow-hidden">
            {mentorList.length === 0 ? (
              <div className="text-center py-12">
                <UserCheck className="mx-auto text-[#B99652]" size={48} />
                <p className="mt-4 text-[#1e1b4b] font-medium">{t('no_mentors_found')}</p>
                <p className="text-gray-600 text-sm">{t('add_your_first_mentor')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#ebdcaa]/30 border-b border-[#ebdcaa]">
                    <tr>
                      <th className="p-4 font-bold text-sm text-[#1e1b4b]">{t('mentor')}</th>
                      <th className="p-4 font-bold text-sm text-[#1e1b4b]">{t('status')}</th>
                      <th className="p-4 font-bold text-sm text-[#1e1b4b]">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ebdcaa]/50">
                    {mentorList.map((mentor) => (
                      <tr key={mentor.id} className="hover:bg-[#ebdcaa]/10 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-none bg-[#B99652]/15 border border-[#ebdcaa] flex items-center justify-center font-bold text-[#B99652]">
                              {mentor.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-[#1e1b4b]">{mentor.name}</p>
                              <p className="text-xs text-gray-500">{mentor.email}</p>
                              {mentor.bio && (
                                <p className="text-xs text-gray-400 mt-1">{mentor.bio}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-none text-xs font-semibold uppercase tracking-wider border ${
                            mentor.isApproved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-amber-50 text-amber-700 border-amber-300'
                          }`}>
                            {mentor.isApproved ? t('approved') : t('pending')}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            {!mentor.isApproved ? (
                              <>
                                <button
                                  onClick={() => approveMentor(mentor.id)}
                                  className="px-3 py-1.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-xs font-semibold tracking-wide transition-all shadow-sm"
                                >
                                  {t('approve')}
                                </button>
                                <button
                                  onClick={() => removeMentor(mentor.id, mentor.name)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-none text-xs font-semibold tracking-wide transition-all shadow-sm"
                                >
                                  {t('reject')}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => removeMentor(mentor.id, mentor.name)}
                                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white rounded-none text-xs font-semibold tracking-wide transition-all"
                              >
                                {t('remove')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Mentor Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none w-full max-w-md shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#ebdcaa]">
                <h2 className="text-xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('add_new_mentor')}</h2>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ name: '', email: '', password: '' });
                  }}
                  className="text-gray-400 hover:text-[#1e1b4b]"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={addMentor} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('name')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa] rounded-none text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                    placeholder={t('full_name')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('email_address')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa] rounded-none text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                    placeholder={t('email_placeholder')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{t('password')}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa] rounded-none text-sm focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] outline-none"
                    placeholder={t('temporary_password')}
                    required
                  />
                </div>

                <div className="pt-4 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ name: '', email: '', password: '' });
                    }}
                    className="flex-1 px-4 py-2.5 border border-[#ebdcaa] text-gray-700 bg-white rounded-none hover:bg-gray-50 text-sm font-medium transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none text-sm font-semibold tracking-wide shadow-sm transition-all"
                  >
                    {t('add_mentor')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default MentorApproval;