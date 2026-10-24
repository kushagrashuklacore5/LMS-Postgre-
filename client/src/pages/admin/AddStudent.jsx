import { useState } from "react";
import AdminLayout from "../../components/AdminLayout";
import { Camera } from "lucide-react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";
import ClassSectionSelect from "../../components/admin/ClassSectionSelect";
import { showPasswordNotice } from "../../components/admin/PasswordNotice";

const AddStudent = () => {
  const { token, API } = useAuth();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    fullName: "",
    parentName: "",
    email: "",
    phone: "",
    bloodGroup: "",
    address: "",
    admissionDate: "",
    dob: "",
    className: "",
    section: "",
    classroomId: "",
  });

  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const cleanValue = value.replace(/\D/g, "").slice(0, 10);
      setForm({ ...form, [name]: cleanValue });
      setPhoneError(cleanValue.length > 0 && cleanValue.length < 10);
      return;
    }
    setForm({ ...form, [name]: value });
  };

  const handlePhotoChange = (e) => {
    if (e.target.files[0]) {
      setPhoto(URL.createObjectURL(e.target.files[0]));
    }
  };

  /* ================= SAVE STUDENT ================= */
  const handleSaveStudent = async () => {
    if (!form.fullName || !form.email) {
      return toast.error(t('name_and_email_required'));
    }
    if (!form.className) {
      return toast.error(t('class_required'));
    }
    if (!form.classroomId) {
      return toast.error(t('section_required'));
    }

    if (form.phone && form.phone.length !== 10) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);

    try {
      setLoading(true);

      const res = await fetch(`${API}/admin/create-student`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...form, classroomId: Number(form.classroomId) }),
      });

      const data = await res.json();

      if (!res.ok) {
        return toast.error(data.message || t('failed_to_create_student'));
      }

      showPasswordNotice({
        message: `${t('student_created_successfully')}\n${t('added_to_class')}: ${data.student.classroom?.name || ''}`,
        label: t('login_password'),
        password: data.student.password,
      });

      // reset form
      setForm({
        fullName: "",
        parentName: "",
        email: "",
        phone: "",
        bloodGroup: "",
        address: "",
        admissionDate: "",
        dob: "",
        className: "",
        section: "",
        classroomId: "",
      });
      setPhoto(null);
    } catch (err) {
      toast.error(t('server_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* ===== PAGE TITLE ===== */}
        <div className="border-b border-[#ebdcaa] pb-4">
          <h1 className="text-2xl md:text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('add_student')}</h1>
          <p className="text-gray-600 text-sm mt-1">{t('student_details')}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ================= LEFT PROFILE CARD ================= */}
          <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="w-32 h-32 rounded-none bg-white border-2 border-[#ebdcaa] flex items-center justify-center overflow-hidden">
                  {photo ? (
                    <img
                      src={photo}
                      alt="Student"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 text-xs">{t('no_photo')}</span>
                  )}
                </div>

                <label className="absolute -bottom-2 -right-2 bg-[#B99652] hover:bg-[#a38241] text-white p-2 rounded-none cursor-pointer shadow-md transition-all">
                  <Camera size={16} />
                  <input type="file" hidden onChange={handlePhotoChange} />
                </label>
              </div>

              <h2 className="mt-5 font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">
                {form.fullName || t('full_name')}
              </h2>
              <p className="text-gray-500 text-xs uppercase tracking-wider mt-1">{t('student_role')}</p>

              <button
                onClick={handleSaveStudent}
                disabled={loading}
                data-tour="btn-save-student"
                className="mt-6 w-full bg-[#B99652] hover:bg-[#a38241] text-white py-2.5 rounded-none font-semibold text-sm shadow-sm transition-all disabled:opacity-50"
              >
                {loading ? t('saving') : t('save_student')}
              </button>
            </div>
          </div>

          {/* ================= RIGHT FORM ================= */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <h3 className="font-bold font-['DM_Serif_Display',serif] text-lg text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa]">{t('personal_information')}</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input data-tour="input-student-name" label={t('full_name')} name="fullName" value={form.fullName} onChange={handleChange} />
                <Input label={t('parent_name')} name="parentName" value={form.parentName} onChange={handleChange} />
                <Input label={t('email_address')} name="email" value={form.email} onChange={handleChange} />
                <Input label={t('phone')} name="phone" type="tel" maxLength={10} placeholder={t('phone_placeholder')} value={form.phone} onChange={handleChange} error={phoneError ? t('phone_error_10_digits') : null} />
                <Input label={t('blood_group')} name="bloodGroup" value={form.bloodGroup} onChange={handleChange} />
                <Input label={t('date_of_birth')} type="date" name="dob" value={form.dob} onChange={handleChange} />
              </div>

              <div className="mt-4">
                <Input label={t('address')} name="address" value={form.address} onChange={handleChange} />
              </div>
            </div>

            <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-6 shadow-sm">
              <h3 className="font-bold font-['DM_Serif_Display',serif] text-lg text-[#1e1b4b] mb-4 pb-2 border-b border-[#ebdcaa]">{t('academic_information')}</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ClassSectionSelect
                  value={form}
                  onChange={(selection) => setForm((prev) => ({ ...prev, ...selection }))}
                />
                <Input label={t('admission_date')} type="date" name="admissionDate" value={form.admissionDate} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AddStudent;

/* ================= INPUT ================= */
const Input = ({ label, error, ...props }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">{label}</label>
    <input
      {...props}
      className={`w-full bg-white border ${error ? 'border-rose-400 focus:border-rose-500' : 'border-[#ebdcaa] focus:border-[#B99652]'} rounded-none px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#B99652]`}
    />
    {error && (
      <p className="text-[11px] text-rose-600 font-medium mt-1">{error}</p>
    )}
  </div>
);

