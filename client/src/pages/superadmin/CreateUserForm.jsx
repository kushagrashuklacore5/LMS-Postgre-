import { useState, useEffect } from "react";
import { useTranslation } from "../../context/TranslationContext";
import { useAuth } from "../../auth/auth";
import QuotaLimitModal from "../../components/QuotaLimitModal";
import { toast } from "react-toastify";
import { UserPlus, User, Mail, Building2, Key, Copy, Shield } from "lucide-react";

const ROLES = ["admin", "accountant", "storekeeper"];

const CreateUserForm = ({ onSuccess }) => {
  const { t } = useTranslation();
  const { API, token } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "admin",
    universityId: "",
  });

  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaDetails, setQuotaDetails] = useState(null);

  useEffect(() => {
    const fetchUniversities = async () => {
      try {
        const res = await fetch(`${API}/superadmin/universities`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data && data.data) setUniversities(data.data);
      } catch (err) {
        console.error("Failed to load universities", err);
      }
    };

    fetchUniversities();
  }, [API, token]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.role || !form.universityId) {
      toast.error("All fields are required");
      return;
    }

    // Check subscription for accountant and storekeeper roles
    if (form.role === "accountant" || form.role === "storekeeper") {
      try {
        const res = await fetch(`${API}/subscriptions/check-feature-access`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Feature check failed');
        const data = await res.json();

        // Block if on free plan
        if (data.currentPlan === 'free') {
          setQuotaDetails({
            type: 'feature',
            resourceType: form.role + ' creation',
            message: 'Your account is on the Free plan — upgrade to create ' + form.role + ' accounts.'
          });
          setShowQuotaModal(true);
          return;
        }
      } catch (err) {
        console.error('Feature check error', err);
        setQuotaDetails({
          type: 'feature',
          resourceType: form.role + ' creation',
          message: 'Your account is on the Free plan — upgrade to create ' + form.role + ' accounts.'
        });
        setShowQuotaModal(true);
        return;
      }
    }

    try {
      setLoading(true);

      const password = generatePassword();
      const tokenToUse = token || localStorage.getItem('token');

      const res = await fetch(`${API}/superadmin/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({
          ...form,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create user");

      // Call success callback with credentials
      onSuccess({
        name: form.name,
        email: form.email,
        password: password,
        role: form.role,
      });

      setForm({
        name: "",
        email: "",
        role: "admin",
        universityId: "",
      });
      setGeneratedPassword(null);
    } catch (err) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#ebdcaa]">
        <div className="w-12 h-12 bg-[#B99652]/10 border border-[#ebdcaa] rounded-none flex items-center justify-center text-[#B99652]">
          <UserPlus size={22} />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">Create New Staff Member</h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">Assign admin, accountant or storekeeper roles</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-[#fffdf4] rounded-none shadow-sm border border-[#ebdcaa] overflow-hidden">
        <div className="p-8">
          <form onSubmit={handleCreate} className="space-y-6">
            {/* User Information */}
            <div data-tour="staff-user-info" className="mb-6">
              <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2 pb-2 border-b border-[#ebdcaa]">
                <User className="text-[#B99652]" size={18} />
                User Information
              </h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="name"
                      placeholder="e.g., John Doe"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="email"
                      type="email"
                      placeholder="user@example.com"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Role & Assignment */}
            <div data-tour="staff-role-assignment">
              <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2 pb-2 border-b border-[#ebdcaa]">
                <Shield className="text-[#B99652]" size={18} />
                Role & Assignment
              </h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    User Role <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <select
                      name="role"
                      data-tour="select-staff-role"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] text-sm appearance-none"
                      value={form.role}
                      onChange={handleChange}
                      required
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Institute / University <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <select
                      name="universityId"
                      data-tour="select-staff-university"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] text-sm appearance-none"
                      value={form.universityId}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select University</option>
                      {universities.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-[#ebdcaa]">
              <button
                type="submit"
                disabled={loading}
                data-tour="btn-submit-staff"
                className="w-full bg-[#B99652] hover:bg-[#a38241] disabled:opacity-50 text-white font-semibold py-3.5 rounded-none uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-none h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Creating Staff Member...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Create Staff Member
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none p-5 text-[#1e1b4b]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-9 h-9 bg-[#B99652]/10 border border-[#ebdcaa] rounded-none flex items-center justify-center text-[#B99652]">
              <Key size={16} />
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm text-[#1e1b4b] mb-1 font-['DM_Serif_Display',serif]">Password Information</h4>
            <p className="text-slate-600 text-xs leading-relaxed">
              A strong random password will be automatically generated and displayed once. The staff member will need to save this password securely for their first login.
            </p>
          </div>
        </div>
      </div>

      {/* Quota Limit Modal */}
      {showQuotaModal && (
        <QuotaLimitModal
          details={quotaDetails}
          onClose={() => setShowQuotaModal(false)}
        />
      )}
    </div>
  );
};

export default CreateUserForm;
