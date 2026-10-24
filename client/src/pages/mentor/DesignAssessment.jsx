import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import MentorLayout from "../../components/MentorLayout";
import { toast } from "react-toastify";
import { QuestionImageField, LegacyQuestionImage } from "../../components/QuestionImage";

const DesignAssessment = () => {
  const { assessmentId } = useParams();
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState(null); // loaded from the server, including isPublished
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const publishLock = useRef(false); // set immediately, so rapid clicks send one request
  const isPublished = !!assessment?.isPublished;

  const [questionType, setQuestionType] = useState("text"); // text | image
  const [questionText, setQuestionText] = useState("");
  const [questionImage, setQuestionImage] = useState(null);
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [questions, setQuestions] = useState([]);

  // Load existing questions
  useEffect(() => {
    setQuestions([]); // Reset questions on load
    setAssessment(null);
    setJustPublished(false);
    fetch(`${API}/assessments/questions/${assessmentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        // Handle new response structure { assessment, questions }
        if (data.assessment) setAssessment(data.assessment); // a refresh shows the real published state
        if (data.questions) {
          setQuestions(data.questions);
        } else if (Array.isArray(data)) {
          // Fallback for backward compatibility (if needed)
          setQuestions(data);
        } else {
          setQuestions([]);
        }
      })
      .catch(() => setQuestions([]));
  }, [assessmentId]);

  const addOption = () => {
    setOptions([...options, ""]);
  };

  const updateOption = (i, value) => {
    const updated = [...options];
    updated[i] = value;
    setOptions(updated);
  };

  const resetEditor = () => {
    setQuestionText("");
    setQuestionImage(null);
    setOptions(["", ""]);
    setCorrectIndex(0);
    setQuestionType("text");
  };

  const addQuestion = async () => {
    if (questionType === "text" && !questionText.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (questionType === "image" && !questionImage) {
      toast.error("Add the picture for this question");
      return;
    }
    if (options.some(opt => !opt.trim())) {
      toast.error("All options must be filled");
      return;
    }

    try {
      const payload = {
        assessmentId,
        questionText,
        questionImage: questionImage || "", // optional for a text question, required for a picture question
        options,
        correctOptionIndex: correctIndex
      };

      const res = await fetch(`${API}/assessments/add-question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setQuestions(prev => [...prev, data.question]);
      resetEditor();
      toast.success("Question added");
    } catch {
      toast.error("Failed to add question");
    }
  };

  const publishAssessment = async () => {
    if (publishLock.current || publishing || isPublished) return; // a second click does nothing
    if (questions.length === 0) {
      toast.error("Add at least one question before publishing");
      return;
    }

    publishLock.current = true;
    try {
      setPublishing(true);
      const res = await fetch(
        `${API}/assessments/${assessmentId}/publish`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const data = await res.json().catch(() => ({}));

      // 409 = the server says it is already published: show the published state, change nothing
      if (res.status === 409 && data.alreadyPublished) {
        setAssessment(prev => ({ ...(prev || {}), ...(data.assessment || {}), isPublished: 1 }));
        toast.info("This assessment is already published");
        return;
      }
      if (!res.ok) throw new Error(data.message);

      setAssessment(prev => ({ ...(prev || {}), ...(data.assessment || {}), isPublished: 1 }));
      setJustPublished(true);
      toast.success("Assessment published successfully.");
    } catch (err) {
      toast.error(err?.message || "Publish failed");
    } finally {
      publishLock.current = false;
      setPublishing(false);
    }
  };

  return (
    <MentorLayout>
      <div className="max-w-4xl mx-auto p-6">

        {/* PUBLISHED STATE */}
        {isPublished && (
          <div className="mb-6 p-5 bg-[#fffdf4] border border-[#ebdcaa]" data-testid="assessment-published">
            <h3 className="text-lg font-bold text-[#1e1b4b]">
              {justPublished ? "Assessment published successfully." : "This assessment is published."}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {assessment?.title ? `"${assessment.title}" is ` : "It is "}
              now available to the students of the course. It cannot be published again.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              {assessment?.courseId && (
                <button
                  onClick={() => navigate(`/mentor/course/${assessment.courseId}`)}
                  className="px-4 py-2 bg-[#B99652] hover:bg-[#a38241] text-white rounded-none font-semibold text-sm"
                >
                  View Course
                </button>
              )}
              <button
                onClick={() => navigate("/mentor/classroom")}
                className="px-4 py-2 border border-[#B99652] text-[#B99652] hover:bg-white rounded-none font-semibold text-sm"
              >
                Back to Classroom
              </button>
              {assessment?.courseId && (
                <button
                  onClick={() => navigate("/mentor/create-assessment", { state: { courseId: assessment.courseId } })}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-none font-semibold text-sm"
                >
                  Create New Assessment
                </button>
              )}
            </div>
          </div>
        )}

        {/* QUESTION LIST */}
        {questions.map((q, idx) => (
          <div
            key={idx}
            className="mb-4 p-4 bg-white border rounded-xl shadow-sm"
          >
            <h4 className="font-semibold mb-2">
              Q{idx + 1}
            </h4>

            {q.questionText && (
              <p className="mb-3">{q.questionText}</p>
            )}

            <LegacyQuestionImage question={q} className="mb-3 max-h-60 rounded" />

            <ul className="space-y-1">
              {q.options.map((opt, i) => (
                <li
                  key={i}
                  className={`p-2 rounded ${
                    i === q.correctOptionIndex
                      ? "bg-green-50 text-green-700 font-medium"
                      : "bg-gray-50"
                  }`}
                >
                  {opt}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* QUESTION EDITOR (drafts only) */}
        {!isPublished && (
        <div className="mt-8 p-6 bg-white border rounded-xl shadow">
          <h3 className="text-lg font-bold mb-4">
            Add New Question
          </h3>

          {/* Question Type */}
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={questionType === "text"}
                onChange={() => setQuestionType("text")}
              />
              Text Question
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={questionType === "image"}
                onChange={() => setQuestionType("image")}
              />
              Image Question
            </label>
          </div>

          {/* Question Input */}
          <textarea
            className="w-full border p-2 rounded mb-3"
            placeholder={questionType === "text" ? "Enter question text" : "Question text (optional for a picture question)"}
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
          />
          {/* Optional picture for a text question; the question itself for a picture question */}
          <div className="mb-4">
            <QuestionImageField imageKey={questionImage} onChange={setQuestionImage} />
          </div>

          {/* OPTIONS */}
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="radio"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
              />
              <input
                className="flex-1 border p-2 rounded"
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={e => updateOption(i, e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addOption}
            className="text-sm text-blue-600 mt-2"
          >
            + Add Option
          </button>

          <button
            onClick={addQuestion}
            className="w-full mt-4 py-2 bg-primary text-white rounded"
          >
            Add Question
          </button>
        </div>

        )}

        {/* PUBLISH (drafts only) */}
        {!isPublished && (
          <button
            onClick={publishAssessment}
            disabled={publishing || !assessment}
            data-testid="publish-assessment"
            className="w-full mt-8 py-3 bg-green-600 text-white rounded-xl font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {publishing ? "Publishing..." : "Publish Assessment"}
          </button>
        )}

      </div>
    </MentorLayout>
  );
};

export default DesignAssessment;
