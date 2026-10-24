import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../auth/auth";
import { toast } from "react-toastify";
import { showPasswordNotice } from "./PasswordNotice";

const AddTeacherModal = ({ open, onClose, onSuccess }) => {
  const { API, token } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  if (!open) return null;

  const submit = async () => {
    try {
      const res = await fetch(`${API}/admin/create-teacher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.message || "Failed to create teacher");

      showPasswordNotice({ message: "Teacher created", label: "Temporary password", password: data.generatedPassword });
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Failed to create teacher");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#fffdf4] border border-[#ebdcaa] rounded-none w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-[#ebdcaa]">
          <h2 className="font-bold font-['DM_Serif_Display',serif] text-xl text-[#1e1b4b]">Add Teacher</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-[#1e1b4b]"><X size={18} /></button>
        </div>

        <input
          className="w-full bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
          placeholder="Full Name"
          onChange={e => setForm({ ...form, name: e.target.value })}
        />

        <input
          className="w-full bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
          placeholder="Email"
          onChange={e => setForm({ ...form, email: e.target.value })}
        />

        <input
          className="w-full bg-white border border-[#ebdcaa] rounded-none px-3.5 py-2 text-sm focus:outline-none focus:border-[#B99652] focus:ring-1 focus:ring-[#B99652]"
          placeholder="Password"
          type="password"
          onChange={e => setForm({ ...form, password: e.target.value })}
        />

        <button
          onClick={submit}
          className="w-full bg-[#B99652] hover:bg-[#a38241] text-white py-2.5 rounded-none font-semibold text-sm shadow-sm transition-all"
        >
          Create Teacher
        </button>
      </div>
    </div>
  );
};

export default AddTeacherModal;
