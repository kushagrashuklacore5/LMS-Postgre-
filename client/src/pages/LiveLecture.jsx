import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowLeft, Link2, Loader2, PhoneOff, Video } from "lucide-react";
import { useAuth } from "../auth/auth";

// One lecture's meeting, embedded with the JaaS IFrame API
// (https://developer.8x8.com/jaas/docs/iframe-api-integration/).
// The server decides who may join and hands over a short-lived token for this room only; the
// private key never reaches the browser. For a student, the page reports join / leave and a
// heartbeat every minute so attendance can be measured; the server stamps the times. Leaving the
// page never ends the lecture: only the teacher's "End class" (or the provider) does.

const scriptPromises = {};
const loadJaas = (appId) => {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  const src = `https://8x8.vc/${encodeURIComponent(appId)}/external_api.js`;
  if (!scriptPromises[src]) {
    scriptPromises[src] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { delete scriptPromises[src]; reject(new Error("The meeting could not be loaded. Check your internet connection.")); };
      document.body.appendChild(script);
    });
  }
  return scriptPromises[src];
};

const HEARTBEAT_MS = 60 * 1000;

export default function LiveLecture() {
  const { lectureId } = useParams();
  const navigate = useNavigate();
  const { API, token, user } = useAuth();
  const [lecture, setLecture] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | joining | live | waiting | ended | error
  const [message, setMessage] = useState("");
  const [ending, setEnding] = useState(false);
  const container = useRef(null);
  const meeting = useRef(null);
  const beat = useRef(null);
  const joined = useRef(false);
  const isStudent = user?.role === "student";

  const call = useCallback(
    (method, path, body, extra = {}) =>
      fetch(`${API}/live-classes/${lectureId}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        ...extra,
      }),
    [API, token, lectureId]
  );

  const presence = useCallback(
    (kind, keepalive = false) => { if (isStudent) call("POST", "/presence", { kind }, { keepalive }).catch(() => {}); },
    [call, isStudent]
  );

  // closes the meeting and stops reporting presence (safe to call twice)
  const teardown = useCallback(() => {
    if (beat.current) { clearInterval(beat.current); beat.current = null; }
    if (joined.current) { presence("leave", true); joined.current = false; }
    if (meeting.current) { try { meeting.current.dispose(); } catch { /* already gone */ } meeting.current = null; }
  }, [presence]);

  const join = useCallback(async () => {
    setPhase("joining");
    setMessage("");
    try {
      const res = await call("POST", "/join");
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        const info = await call("GET", "").then((r) => r.json()).catch(() => null);
        if (info?.data) setLecture(info.data);
        setPhase(info?.data?.status === "scheduled" ? "waiting" : "ended");
        setMessage(data.message || "");
        return;
      }
      if (!res.ok) throw new Error(data.message || "You cannot join this class");
      setLecture(data.data.lecture);
      const { domain, appId, roomName, jwt } = data.data.meeting;
      await loadJaas(appId);
      if (!container.current) return;
      teardown();
      const api = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        jwt,
        parentNode: container.current,
        width: "100%",
        height: "100%",
        configOverwrite: { startWithAudioMuted: true, startWithVideoMuted: isStudent, disableDeepLinking: true },
        userInfo: { displayName: user?.name || "" },
      });
      meeting.current = api;
      api.addListener("videoConferenceJoined", () => {
        setPhase("live");
        if (!joined.current) { joined.current = true; presence("join"); }
        if (isStudent && !beat.current) beat.current = setInterval(() => presence("beat"), HEARTBEAT_MS);
      });
      api.addListener("videoConferenceLeft", () => {
        if (joined.current) { presence("leave"); joined.current = false; }
        if (beat.current) { clearInterval(beat.current); beat.current = null; }
      });
      api.addListener("readyToClose", () => { teardown(); setPhase("left"); });
    } catch (err) {
      setPhase("error");
      setMessage(err.message);
    }
  }, [call, isStudent, presence, teardown, user?.name]);

  useEffect(() => {
    join();
    const onUnload = () => teardown();
    window.addEventListener("pagehide", onUnload);
    return () => { window.removeEventListener("pagehide", onUnload); teardown(); };
  }, [join, teardown]);

  // notice when the lecture ends elsewhere (teacher, admin or the provider)
  useEffect(() => {
    if (phase !== "live" && phase !== "waiting") return undefined;
    const timer = setInterval(async () => {
      const info = await call("GET", "").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!info?.data) return;
      setLecture(info.data);
      if (["completed", "cancelled", "failed"].includes(info.data.status)) { teardown(); setPhase("ended"); }
      else if (phase === "waiting" && info.data.status === "live") join();
    }, phase === "waiting" ? 10000 : 30000); // in the waiting room: join within seconds of the start
    return () => clearInterval(timer);
  }, [phase, call, join, teardown]);

  const endClass = async () => {
    if (ending || !window.confirm(`End "${lecture?.title}" for everyone?`)) return;
    setEnding(true);
    try {
      const res = await call("POST", "/end");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not end the class");
      teardown();
      setLecture(data.data);
      setPhase("ended");
      toast.success("Class ended");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEnding(false);
    }
  };

  const showMeeting = phase === "joining" || phase === "live";
  return (
    <div className="h-screen flex flex-col bg-[#fffdf4]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[#ebdcaa] bg-white">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-[#1e1b4b] hover:underline">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-[#1e1b4b] truncate">{lecture?.title || "Live class"}</h1>
          {lecture && <p className="text-xs text-gray-500 truncate">{[lecture.courseTitle, lecture.classLabel, lecture.teacherName].filter(Boolean).join(" · ")}</p>}
        </div>
        {phase === "live" && <span className="text-xs font-semibold text-red-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" /> LIVE</span>}
        {lecture?.isOwner && ["live", "scheduled"].includes(lecture?.status) && (
          <button
            onClick={async () => {
              // one link for everyone: the LMS page; each student is checked again when opening it
              const link = `${window.location.origin}/live/${lectureId}`;
              try { await navigator.clipboard.writeText(link); toast.success("Class link copied. Enrolled students were also notified."); }
              catch { window.prompt("Copy the class link:", link); }
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-[#B99652] text-[#1e1b4b] rounded-none"
          >
            <Link2 size={14} /> Copy class link
          </button>
        )}
        {lecture?.isOwner && lecture?.status === "live" && (
          <button onClick={endClass} disabled={ending} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-700 text-white rounded-none disabled:opacity-50">
            <PhoneOff size={14} /> {ending ? "Ending..." : "End class"}
          </button>
        )}
      </header>

      <main className="flex-1 relative">
        <div ref={container} className={`absolute inset-0 ${showMeeting ? "" : "hidden"}`} />
        {phase === "joining" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="animate-spin" size={16} /> Joining the class...</p>
          </div>
        )}
        {phase === "loading" && <Centered><Loader2 className="animate-spin" /> Loading...</Centered>}
        {phase === "waiting" && (
          <Centered>
            <Video className="text-[#B99652]" size={32} />
            <p className="font-semibold text-[#1e1b4b]">The class has not started yet</p>
            {lecture?.scheduledStartTime && <p className="text-sm text-gray-500">Scheduled for {new Date(lecture.scheduledStartTime).toLocaleString()}</p>}
            <p className="text-xs text-gray-400">This page joins automatically when the teacher starts it.</p>
          </Centered>
        )}
        {phase === "ended" && (
          <Centered>
            <p className="font-semibold text-[#1e1b4b]">This class is {lecture?.status === "cancelled" ? "cancelled" : "over"}.</p>
            {message && <p className="text-sm text-gray-500">{message}</p>}
            <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm border border-[#B99652] rounded-none">Back</button>
          </Centered>
        )}
        {phase === "left" && (
          <Centered>
            <p className="font-semibold text-[#1e1b4b]">You left the meeting.</p>
            <div className="flex gap-2">
              <button onClick={join} className="px-4 py-2 text-sm bg-[#1e1b4b] text-white rounded-none">Rejoin</button>
              <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm border border-gray-300 rounded-none">Back</button>
            </div>
          </Centered>
        )}
        {phase === "error" && (
          <Centered>
            <p className="font-semibold text-red-700">Could not open the class</p>
            <p className="text-sm text-gray-600 max-w-md text-center">{message}</p>
            <button onClick={join} className="px-4 py-2 text-sm border border-[#B99652] rounded-none">Try again</button>
          </Centered>
        )}
      </main>
    </div>
  );
}

const Centered = ({ children }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>
);
