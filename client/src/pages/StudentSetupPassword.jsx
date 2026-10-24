import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { CheckCircle, CircleAlert, Loader2, Lock } from "lucide-react";
import { useAuth } from "../auth/auth";

/*
 * Public page for students created by a bulk import: set a password from the one-time
 * link emailed to them (…/setup-password#token=…).
 * The token lives in the URL fragment, which browsers never send to the server; the
 * page removes it from the address bar and sends it only in the POST body.
 */
const LINK_MESSAGES = {
  LINK_INVALID: "This setup link is not valid. Ask your school to send a new one.",
  LINK_EXPIRED: "This setup link has expired. Ask your school to send a new one.",
  LINK_USED: "This setup link has already been used. Log in with your password.",
  SETUP_NOT_READY: "Password setup is not available right now. Please try again later.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
};

function readTokenFromHash() {
  const m = /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash || "");
  return m ? m[1] : null;
}

const StudentSetupPassword = () => {
  const { API } = useAuth();
  const [token] = useState(readTokenFromHash);
  const [phase, setPhase] = useState("checking"); // checking | ready | done | dead
  const [deadCode, setDeadCode] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const errorOf = (err) => {
    const status = err?.response?.status;
    const code = err?.response?.data?.error?.code;
    if (status === 429) return { code: "RATE_LIMITED", message: LINK_MESSAGES.RATE_LIMITED };
    if (code) return { code, message: LINK_MESSAGES[code] || err.response.data.error.message || "Something went wrong." };
    return { code: "NETWORK_ERROR", message: "Could not reach the server. Please try again." };
  };

  useEffect(() => {
    // Remove the token from the address bar / history as soon as it has been read.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setDeadCode("LINK_INVALID");
      setPhase("dead");
      return;
    }
    axios
      .post(`${API}/student-setup/check`, { token })
      .then(() => setPhase("ready"))
      .catch((err) => {
        const e = errorOf(err);
        setDeadCode(e.code);
        setPhase(e.code.startsWith("LINK_") ? "dead" : "ready");
        if (!e.code.startsWith("LINK_")) setFormError(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (password.length < 8) return setFormError("Use at least 8 characters.");
    if (new TextEncoder().encode(password).length > 72) return setFormError("That password is too long (at most 72 bytes).");
    if (password !== confirm) return setFormError("The two passwords do not match.");
    setSaving(true);
    try {
      await axios.post(`${API}/student-setup/complete`, { token, password });
      setPassword("");
      setConfirm("");
      setPhase("done");
    } catch (err) {
      const x = errorOf(err);
      if (x.code.startsWith("LINK_")) {
        setDeadCode(x.code);
        setPhase("dead");
      } else {
        setFormError(x.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl border p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Lock size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Set your password</h1>
            <p className="text-sm text-gray-500">Finish setting up your student account.</p>
          </div>
        </div>

        {phase === "checking" && (
          <p className="flex items-center gap-2 text-gray-600"><Loader2 size={16} className="animate-spin" /> Checking your link…</p>
        )}

        {phase === "dead" && (
          <div role="alert" className="space-y-4">
            <p className="flex items-start gap-2 text-red-700"><CircleAlert size={18} className="shrink-0 mt-0.5" />{LINK_MESSAGES[deadCode] || LINK_MESSAGES.LINK_INVALID}</p>
            <Link to="/login" className="inline-block text-primary font-medium">Go to login</Link>
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-green-700"><CheckCircle size={18} className="shrink-0 mt-0.5" />Your password is set. You can now log in with your email address and new password.</p>
            <Link to="/login" className="inline-block bg-primary text-white px-5 py-2 rounded-lg">Go to login</Link>
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium mb-1">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-gray-500 mt-1">At least 8 characters.</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
            <button type="submit" disabled={saving} className="w-full bg-primary text-white py-2 rounded-lg disabled:opacity-50">
              {saving ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default StudentSetupPassword;
