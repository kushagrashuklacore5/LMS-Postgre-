import { useState } from "react";
import { useAuth } from "../../auth/auth";
import { toast } from "react-toastify";
import { Building2, MapPin, Mail, Phone, CheckCircle, Copy, KeyRound, ArrowRight } from "lucide-react";

const CreateUniversityForm = ({ onSuccess }) => {
  const { API, token } = useAuth();
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    country: "",
    email: "",
    phone: "",
  });

  const [loading, setLoading] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [phoneError, setPhoneError] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const cleanValue = value.replace(/\D/g, "").slice(0, 10);
      setForm({ ...form, [name]: cleanValue });
      if (cleanValue.length === 10 || cleanValue.length === 0) {
        setPhoneError(false);
      } else {
        setPhoneError(true);
      }
      return;
    }
    setForm({ ...form, [name]: value });
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Please enter the Institute Name");
      return;
    }

    if (!form.email.trim()) {
      toast.error("Please enter the Official Admin Email");
      return;
    }

    if (form.phone && form.phone.length !== 10) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);

    try {
      setLoading(true);

      const directToken = localStorage.getItem('token');
      const tokenToUse = token || directToken;
      
      const res = await fetch(`${API}/superadmin/create-university`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create institute");

      toast.success("✅ Institute created successfully!");
      setCreatedData(data);

      setForm({
        name: "",
        address: "",
        city: "",
        country: "",
        email: "",
        phone: "",
      });
    } catch (err) {
      toast.error(err.message || "Failed to create institute");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#ebdcaa]">
        <div className="w-12 h-12 bg-[#B99652]/10 border border-[#ebdcaa] rounded-none flex items-center justify-center text-[#B99652]">
          <Building2 size={22} />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">Create New Institute</h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">Register a new institution under your network</p>
        </div>
      </div>

      {/* Success Modal / Card if Created */}
      {createdData && (
        <div className="bg-[#fffdf4] border-2 border-emerald-600 p-6 shadow-md rounded-none space-y-4">
          <div className="flex items-center gap-3 text-emerald-800 font-bold text-lg font-['DM_Serif_Display',serif] pb-3 border-b border-emerald-200">
            <CheckCircle className="text-emerald-600" size={24} />
            Institute & Admin Created Successfully!
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-white border border-[#ebdcaa]">
              <span className="text-slate-500 uppercase font-semibold">Institute Name</span>
              <p className="text-sm font-bold text-[#1e1b4b] mt-1">{createdData.university?.name}</p>
              <p className="text-slate-600 mt-1">ID: #{createdData.university?.id}</p>
            </div>

            <div className="p-4 bg-white border border-[#ebdcaa]">
              <span className="text-slate-500 uppercase font-semibold">Admin Login Email</span>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm font-bold text-[#1e1b4b]">{createdData.admin?.email}</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdData.admin?.email, "Email")}
                  className="p-1 hover:bg-slate-100 text-slate-600 rounded"
                  title="Copy email"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-300 md:col-span-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold mb-1">
                <KeyRound size={16} />
                Generated Admin Password (Save this now):
              </div>
              <div className="flex items-center justify-between bg-white px-3 py-2 border border-amber-300">
                <span className="font-mono text-base font-bold text-[#1e1b4b] tracking-wider">
                  {createdData.generatedPassword}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdData.generatedPassword, "Password")}
                  className="px-3 py-1 bg-[#B99652] hover:bg-[#a38241] text-white text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5"
                >
                  <Copy size={13} />
                  Copy Password
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setCreatedData(null);
                if (onSuccess) onSuccess();
              }}
              className="px-5 py-2.5 bg-[#002366] hover:bg-[#08173e] text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            >
              Continue to Dashboard <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-[#fffdf4] rounded-none shadow-sm border border-[#ebdcaa] overflow-hidden">
        <div className="p-8">
          <form onSubmit={handleCreate} className="space-y-6">
            {/* University Information */}
            <div className="mb-6">
              <h3 className="text-lg font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b] mb-4 flex items-center gap-2 pb-2 border-b border-[#ebdcaa]">
                <Building2 className="text-[#B99652]" size={18} />
                Institute Information
              </h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Institute Name <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="name"
                      data-tour="input-institute-name"
                      placeholder="e.g., Tech Institute of Engineering"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Address
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="address"
                      placeholder="e.g., 123 Main Campus Avenue"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.address}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    City
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="city"
                      placeholder="e.g., New Delhi"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.city}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Country
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="country"
                      placeholder="e.g., India"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.country}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Official Email (Admin Account) <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="email"
                      type="email"
                      placeholder="admin@institute.edu"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#1e1b4b]">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#B99652]" size={18} />
                    <input
                      name="phone"
                      type="tel"
                      maxLength={10}
                      placeholder="10-digit mobile number"
                      className={`w-full pl-10 pr-4 py-3 bg-white border ${phoneError ? 'border-rose-400 focus:border-rose-500' : 'border-[#ebdcaa] focus:border-[#B99652]'} rounded-none focus:outline-none focus:ring-1 focus:ring-[#B99652] transition-all text-[#1e1b4b] placeholder-slate-400 text-sm`}
                      value={form.phone}
                      onChange={handleChange}
                    />
                  </div>
                  {phoneError && (
                    <p className="text-[11px] text-rose-600 font-medium mt-1">Please enter a 10-digit number</p>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-[#ebdcaa]">
              <button
                type="submit"
                disabled={loading}
                data-tour="btn-submit-institute"
                className="w-full bg-[#B99652] hover:bg-[#a38241] disabled:opacity-50 text-white font-semibold py-3.5 rounded-none uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-none h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Creating Institute...
                  </>
                ) : (
                  <>
                    <Building2 size={16} />
                    Create Institute
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateUniversityForm;
