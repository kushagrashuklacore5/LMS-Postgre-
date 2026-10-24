import { useEffect, useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import CreateClassroomModal from "./CreateClassroomModal";

const Classrooms = () => {
  const { API, token } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);

  // Load classrooms from API
  const loadClassrooms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/classrooms`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Classrooms data:', data);
        
        // Handle both direct array and wrapped response formats
        if (data.success && Array.isArray(data.data)) {
          setClassrooms(data.data);
        } else if (Array.isArray(data)) {
          setClassrooms(data);
        } else {
          console.warn('Unexpected response format:', data);
          setClassrooms([]);
        }
      } else {
        console.error('Failed to load classrooms');
        setClassrooms([]);
      }
    } catch (error) {
      console.error('Error loading classrooms:', error);
      setClassrooms([]);
    } finally {
      setLoading(false);
    }
  };

  // Load classrooms on component mount
  useEffect(() => {
    loadClassrooms();
  }, []);

  const handleCreateClassroom = async (classroomData) => {
    try {
      const response = await fetch(`${API}/classrooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(classroomData)
      });
      
      if (response.ok) {
        toast.success(t('classroom_created_successfully'));
        setOpenModal(false);
        loadClassrooms(); // Reload classrooms
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('failed_to_create_classroom'));
      }
    } catch (error) {
      console.error('Create error:', error);
      toast.error(t('failed_to_create_classroom'));
    }
  };

  const handleDeleteClassroom = async (id) => {
    try {
      const response = await fetch(`${API}/classrooms/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        toast.success(t('classroom_deleted_successfully'));
        loadClassrooms(); // Reload classrooms
      } else {
        toast.error(t('failed_to_delete_classroom'));
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('failed_to_delete_classroom'));
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebdcaa]">
          <div>
            <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('classrooms')}</h1>
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">{t('manage_classrooms')}</p>
          </div>

          {/* CREATE CLASSROOM BUTTON */}
          <button
            onClick={() => setOpenModal(true)}
            data-tour="btn-create-classroom"
            className="flex items-center gap-2 bg-[#B99652] hover:bg-[#a38241] text-white px-4 py-2.5 rounded-none font-semibold text-xs uppercase tracking-wider transition-colors shadow-xs self-start sm:self-auto"
          >
            <Plus size={16} />
            {t('create_classroom_button')}
          </button>
        </div>

        {/* CONTENT */}
        {loading ? (
          <div className="text-center py-16 bg-[#fffdf4] border border-[#ebdcaa]">
            <div className="animate-spin rounded-none h-10 w-10 border-4 border-[#B99652] border-t-transparent mx-auto"></div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-3">{t('loading_classrooms')}</p>
          </div>
        ) : classrooms && classrooms.length === 0 ? (
          <div className="text-center py-16 bg-[#fffdf4] border border-[#ebdcaa]">
            <p className="text-sm font-semibold text-[#1e1b4b]">{t('no_classrooms_created')}</p>
            <p className="text-xs text-slate-500 mt-1">Click the button above to add your first classroom</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {classrooms && classrooms.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/admin/classrooms/${c.id}`)}
                className="bg-[#fffdf4] border border-[#ebdcaa] border-l-4 border-l-[#B99652] rounded-none p-5 shadow-xs hover:border-[#B99652] transition-colors cursor-pointer group flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-[#B99652] bg-white border border-[#ebdcaa] px-2 py-0.5">
                      Grade {c.grade || 'General'}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      {c.studentCount || 0} {t('students')}
                    </span>
                  </div>
                  <h3 className="font-bold text-xl font-['DM_Serif_Display',serif] text-[#1e1b4b] group-hover:text-[#B99652] transition-colors">
                    {c.name} {c.section && `- Section ${c.section}`}
                  </h3>
                </div>
                <div className="pt-3 mt-3 border-t border-[#ebdcaa]/60 flex items-center justify-between text-xs text-slate-600">
                  <span>{t('class_teacher')}:</span>
                  <span className="font-semibold text-[#1e1b4b]">
                    {(typeof c.classTeacher === 'object' ? c.classTeacher?.name : c.classTeacher) || t('not_assigned')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE CLASSROOM MODAL */}
        <CreateClassroomModal
          open={openModal}
          onClose={() => setOpenModal(false)}
          onSuccess={loadClassrooms}
        />
      </div>
    </AdminLayout>
  );
};

export default Classrooms;
