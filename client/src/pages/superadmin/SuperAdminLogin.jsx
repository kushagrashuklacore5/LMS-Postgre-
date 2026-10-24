import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "../../context/TranslationContext";
import { useAuth } from "../../auth/auth";
import GlobalLanguageSelector from "../../components/GlobalLanguageSelector";

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { loginUser, API } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      // The server checks the password and signs the session; nothing is decided in the browser.
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get("Retry-After") || res.headers.get("retry-after");
          const retrySec = parseInt(retryAfterHeader, 10) || 
                           (typeof data?.remainingTime === 'number' ? data.remainingTime : null);
          let rateLimitMsg = t('too_many_login_attempts');
          if (retrySec && retrySec > 0) {
            if (retrySec >= 60) {
              const mins = Math.ceil(retrySec / 60);
              rateLimitMsg = t('too_many_login_attempts_minutes', { minutes: mins });
            } else {
              rateLimitMsg = t('too_many_login_attempts_seconds', { seconds: retrySec });
            }
          } else if (data?.message) {
            rateLimitMsg = data.message;
          }
          throw new Error(rateLimitMsg);
        }
        throw new Error(data.message || t('login_failed'));
      }

      if (data.user.role !== "superadmin") {
        toast.error(t('access_denied_superadmin'));
        return;
      }

      // Use loginUser to update auth context and localStorage
      loginUser(data.token, data.user);

      toast.success(t('superadmin_logged_in'));
      navigate("/superadmin/dashboard");
    } catch (err) {
      toast.error(err.message || t('login_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1b4b] p-6 relative">
      {/* Universal Language Selector */}
      <div className="absolute top-5 right-5 z-50 pointer-events-auto">
        <GlobalLanguageSelector compact={true} />
      </div>

      <div className="bg-[#fffdf4] rounded-none border border-[#ebdcaa] p-8 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#B99652]/10 text-[#B99652] border border-[#ebdcaa] rounded-none mx-auto mb-3 flex items-center justify-center">
            <span className="text-2xl font-bold font-['DM_Serif_Display',serif]">SA</span>
          </div>
          <h1 className="text-3xl font-bold font-['DM_Serif_Display',serif] text-[#1e1b4b]">{t('superadmin')}</h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">{t('superadmin_login_desc')}</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700">{t('email_label')}</label>
            <input
              type="email"
              className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] transition text-sm text-[#1e1b4b]"
              placeholder={t('email_placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700">{t('password_label')}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full px-3.5 py-2.5 bg-white border border-[#ebdcaa] rounded-none focus:outline-none focus:border-[#B99652] transition text-sm text-[#1e1b4b]"
                placeholder={t('password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? t('hide') || 'Hide' : t('show') || 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#B99652] hover:bg-[#a38241] text-white text-xs font-semibold uppercase tracking-wider py-3 rounded-none transition-colors disabled:opacity-50 shadow-sm mt-2 cursor-pointer"
          >
            {loading ? t('logging_in') : t('sign_in_button')}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[#ebdcaa] text-center text-[11px] uppercase tracking-wider text-slate-400">
          <p>{t('core5_academy')}</p>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
