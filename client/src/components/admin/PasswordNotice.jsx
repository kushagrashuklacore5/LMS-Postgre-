import { useState } from "react";
import { toast } from "react-toastify";

// Copies text to the clipboard; resolves true or false. Falls back to a hidden text box where
// the Clipboard API is missing (plain http, older browsers). Nothing is stored anywhere.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(box);
    return ok;
  } catch {
    return false;
  }
}

// The body of the "account created" notification: the message, the one-time password and a
// Copy password button. It lives only as long as the notification is open.
function PasswordNotice({ message, label, password }) {
  const [copied, setCopied] = useState(false);
  const copy = async (event) => {
    event.stopPropagation(); // a click on the button must not close the notification
    if (await copyText(password)) {
      setCopied(true);
      toast.info("Password copied", { autoClose: 1500 });
    } else {
      toast.error("Could not copy. Select the password and copy it by hand.");
    }
  };
  return (
    <div className="space-y-1">
      <p className="whitespace-pre-line">{message}</p>
      <p>
        {label}: <code className="font-mono select-all">{password}</code>
      </p>
      <button type="button" onClick={copy} className="mt-1 px-2 py-1 text-xs border border-current rounded-none">
        {copied ? "Copied" : "Copy password"}
      </button>
    </div>
  );
}

/** Shows the one-time password of a new account until the admin closes the notification. */
export function showPasswordNotice({ message, label, password }) {
  if (!password) {
    toast.success(message, { autoClose: false });
    return;
  }
  toast.success(<PasswordNotice message={message} label={label} password={password} />, { autoClose: false });
}
