import { useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { useAuth } from "../auth/auth";
import { API_BASE } from "../config/api";

// Help assistant (universalChatbot). The widget script renders the chat panel in its own
// Shadow DOM; this header button opens and closes it. Questions go to the LMS server
// (/api/assistant), which checks the session and sends the user's verified role to the chatbot.
const CHATBOT_URL = (import.meta.env.VITE_CHATBOT_URL || "http://localhost:8000").replace(/\/$/, "");
const SCRIPT_ID = "rag-chat-widget-script";
let chatOwner = null; // the account the open conversation belongs to

function loadWidget() {
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.src = `${CHATBOT_URL}/widget/widget.js`;
  s.defer = true;
  Object.assign(s.dataset, {
    appId: "default",
    apiBase: `${API_BASE}/assistant`,
    title: "Core5 Help Assistant",
    position: "right",
    launcher: "none",
    theme: "lms",
    top: "64px",
  });
  document.body.appendChild(s);
}

const ChatbotButton = () => {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);

  // The widget adds the session token to its requests to the LMS server.
  useEffect(() => {
    window.ragChat = { headers: () => (token ? { Authorization: `Bearer ${token}` } : {}) };
  }, [token]);

  // Another account in this tab never sees the previous user's conversation.
  useEffect(() => {
    const id = user ? `${user.role}:${user.id}` : null;
    if (chatOwner !== null && chatOwner !== id) window.dispatchEvent(new CustomEvent("rag-chat:reset"));
    chatOwner = id;
  }, [user]);

  useEffect(() => {
    loadWidget();
    const onClosed = () => setOpen(false);
    window.addEventListener("rag-chat:closed", onClosed);
    return () => window.removeEventListener("rag-chat:closed", onClosed);
  }, []);

  const toggle = () => {
    setOpen((o) => !o);
    window.dispatchEvent(new CustomEvent("rag-chat:toggle"));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded-none transition-colors ${
        open
          ? "bg-[#B99652] border-[#B99652] text-white"
          : "bg-[#1e1b4b] border-[#1e1b4b] text-white hover:bg-[#B99652] hover:border-[#B99652]"
      }`}
      aria-label={open ? "Close help assistant" : "Open help assistant"}
      aria-expanded={open}
      title="Help assistant: ask how to do anything in the LMS"
    >
      <MessageCircleQuestion className="w-4 h-4" />
      <span className="hidden sm:inline">Ask AI</span>
    </button>
  );
};

// The help assistant is switched off for now: the "Ask AI" button renders nothing
// everywhere it is used, so the chatbot widget is never loaded. Set to true to bring it back.
const CHATBOT_ENABLED = false;

export default CHATBOT_ENABLED ? ChatbotButton : () => null;
