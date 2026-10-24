import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../auth/auth";

/*
 * Pictures attached to questions (diagrams, graphs, figures).
 * They are private files: every request carries the user's token, so an <img src> cannot be
 * used directly. AuthedImage downloads the picture and shows it from memory.
 */

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_KEY = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

export function AuthedImage({ url, alt = "Question picture", className = "max-w-full max-h-80 h-auto border border-gray-200 mt-2" }) {
  const { token } = useAuth();
  const [state, setState] = useState({ src: null, failed: false });

  useEffect(() => {
    let alive = true;
    let objectUrl = null;
    setState({ src: null, failed: false });
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("not available"))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setState({ src: objectUrl, failed: false });
      })
      .catch(() => { if (alive) setState({ src: null, failed: true }); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  if (state.failed) return <p className="text-xs text-gray-500 mt-2">The picture could not be loaded.</p>;
  if (!state.src) return <p className="text-xs text-gray-400 mt-2">Loading picture...</p>;
  return <img src={state.src} alt={alt} className={className} data-testid="question-image" />;
}

/* Picture of a course-assessment question: a private file key, or (older data) an ordinary web address. */
export function LegacyQuestionImage({ question, className }) {
  const { API } = useAuth();
  const value = question?.questionImage;
  if (!value) return null;
  if (IMAGE_KEY.test(value)) {
    return <AuthedImage url={`${API}/assessments/questions/${question.id || question._id}/image`} className={className} />;
  }
  return <img src={value} alt="Question" className={className || "max-w-full h-auto rounded-lg mb-4 border"} />;
}

/**
 * Optional picture for one question in a teacher's editor.
 * imageKey: the stored picture's key, or null. onChange(key | null).
 */
export function QuestionImageField({ imageKey, onChange, disabled = false }) {
  const { API, token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const input = useRef(null);
  const base = `${API}/assessment-agent/teacher/question-images`;

  const upload = async (file) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Choose a PNG, JPG, GIF or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("The image is too large. The limit is 2 MB.");
      return;
    }
    try {
      setUploading(true);
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || "The image could not be uploaded.");
      onChange(data.image.key);
    } catch (err) {
      toast.error(err.message || "The image could not be uploaded.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div data-testid="question-image-field">
      {imageKey ? (
        <div className="inline-block relative">
          <AuthedImage url={`${base}/${imageKey}`} className="max-w-full max-h-48 h-auto border border-[#ebdcaa]" />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-3 right-1 bg-white border border-gray-300 text-red-600 p-1"
              title="Remove picture"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <label className={`inline-flex items-center gap-2 text-xs font-semibold text-[#B99652] ${disabled || uploading ? "opacity-60" : "cursor-pointer hover:text-[#a38241]"}`}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          {uploading ? "Uploading..." : "Add a picture (optional)"}
          <input
            ref={input}
            type="file"
            hidden
            accept={IMAGE_TYPES.join(",")}
            disabled={disabled || uploading}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
