import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth";
import { LegacyQuestionImage } from "../../components/QuestionImage";
import StudentLayout from "../../components/StudentLayout";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";

export default function AttemptAssessment() {
  const { assessmentId } = useParams();
  const { API, token } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['common', 'forms']);

  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // FETCH ASSESSMENT & QUESTIONS
  // =========================
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Correct endpoint: /assessments/:assessmentId/questions
        const res = await fetch(`${API}/assessments/${assessmentId}/questions`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          // Try parse JSON error, otherwise fall back to text to avoid unexpected JSON parse errors
          try {
            const err = await res.json();
            throw new Error(err.message || t('failed_to_load_assessment'));
          } catch (parseErr) {
            const txt = await res.text().catch(() => null);
            throw new Error((txt && txt.substring(0, 200)) || t('failed_to_load_assessment'));
          }
        }

        // Parse JSON response safely
        let data;
        try {
          data = await res.json();
        } catch (parseErr) {
          const txt = await res.text().catch(() => null);
          throw new Error((txt && txt.substring(0, 200)) || t('failed_to_load_assessment'));
        }
        
        // Handle response format { assessment, questions } or just [questions]
        if (data.assessment && data.questions) {
          setAssessment(data.assessment);
          setQuestions(data.questions);
          
          // Initialize timer
          const endTime = new Date(data.assessment.endTime).getTime();
          const now = new Date().getTime();
          const remaining = endTime - now;
          setTimeLeft(remaining > 0 ? remaining : 0);
        } else if (Array.isArray(data)) {
           // Fallback if backend not updated (though we just updated it)
           setQuestions(data);
           setAssessment({ title: "Assessment", endTime: new Date(Date.now() + 60*60*1000) });
        }
      } catch (error) {
        console.error(error);
        toast.error(error.message);
        navigate("/student/dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [assessmentId, API, token, navigate]);

  // =========================
  // COUNTDOWN TIMER
  // =========================
  useEffect(() => {
    if (submitted || timeLeft === null) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1000) {
          clearInterval(timer);
          autoSubmit();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, submitted]);

  // =========================
  // HANDLE ANSWER SELECT
  // =========================
  const handleSelect = (questionId, optionIndex) => {
    if (submitted) return;
    setAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex
    }));
  };

  // =========================
  // SUBMIT
  // =========================
  const submitAssessment = async () => {
    if (submitted) return;

    try {
      // Ensure all questions are answered or just send what we have
      const formattedAnswers = questions.map((q, index) => {
        // Map answers array index to question options
        // The backend expects `answers` as an array where index corresponds to question index
        // Wait, looking at submitAssessment controller:
        // questions.forEach((q, i) => { if (answers[i] === q.correctOptionIndex) score++; });
        // So answers is an array where answers[i] is the selected option index for question i.
        
        // My handleSelect uses questionId as key.
        // I need to map it back to array based on questions order.
        return answers[q._id] !== undefined ? answers[q._id] : -1;
      });

      const res = await fetch(`${API}/assessments/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          assessmentId,
          answers: formattedAnswers
        })
      });

      const data = await res.json();
      if (!res.ok) {
        // ✅ CHECK FOR DUPLICATE ATTEMPT
        if (data.alreadyAttempted) {
          setResult(data.previousResult);
          setSubmitted(true);
          toast.warn(t('already_attempted'));
          return;
        }
        throw new Error(data.message);
      }

      setResult(data);
      setSubmitted(true);
      toast.success(t('assessment_submitted_successfully'));
    } catch (error) {
      console.error(error);
      toast.error(t('submission_failed') + ": " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const autoSubmit = () => {
    toast.info(t('time_is_up'));
    submitAssessment();
  };

  // =========================
  // HELPER: FORMAT TIME
  // =========================
  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  if (loading) {
    return (
      <StudentLayout><div className="flex-1 overflow-y-auto scrollable-content p-3 sm:p-4 md:p-6">
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div></StudentLayout>
    );
  }

  // =========================
  // RESULT VIEW
  // =========================
  if (submitted && result) {
    return (
      <StudentLayout>
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center mb-8">
            <div className="flex justify-center mb-6">
              {result.result === "PASS" ? (
                <CheckCircle className="w-20 h-20 text-green-500" />
              ) : (
                <AlertCircle className="w-20 h-20 text-red-500" />
              )}
            </div>
            
            <h2 className="text-3xl font-bold mb-2">
              {result.result === "PASS" ? t('congratulations') : t('keep_practicing')}
            </h2>
            <p className="text-gray-500 mb-8">
              {result.result === "PASS" ? t('you_have_passed') : t('you_have_failed')}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">{t('score')}</p>
                <p className="text-2xl font-bold">{result.score} / {questions.length}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">{t('percentage')}</p>
                <p className={`text-2xl font-bold ${result.result === "PASS" ? "text-green-600" : "text-red-600"}`}>
                  {result.percentage}%
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate("/student/dashboard")}
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              {t('back_to_dashboard')}
            </button>
          </div>

          {/* REVIEW ANSWERS */}
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-gray-800">{t('review_answers')}</h3>
            {questions.map((q, idx) => {
              const userAnswer = answers[q._id];
              const correctAnswer = result.correctAnswers?.find(a => a.questionId === q._id)?.correctOptionIndex;
              const isCorrect = userAnswer === correctAnswer;

              return (
                <div key={q._id} className={`bg-white rounded-xl shadow-sm p-6 border-l-4 ${isCorrect ? 'border-green-500' : 'border-red-500'}`}>
                  <h3 className="text-lg font-semibold mb-4 flex gap-3">
                    <span className="text-gray-400">Q{idx + 1}.</span>
                    {q.questionText}
                  </h3>

                  <LegacyQuestionImage question={q} className="max-w-full h-auto rounded-lg mb-4 border" />

                  <div className="space-y-3">
                    {q.options.map((opt, i) => {
                      let optionClass = "border-gray-200";
                      let icon = null;

                      if (i === correctAnswer) {
                        optionClass = "border-green-500 bg-green-50 text-green-700 font-medium";
                        icon = <CheckCircle className="w-5 h-5 text-green-500" />;
                      } else if (i === userAnswer && i !== correctAnswer) {
                        optionClass = "border-red-500 bg-red-50 text-red-700";
                        icon = <AlertCircle className="w-5 h-5 text-red-500" />;
                      }

                      return (
                        <div
                          key={i}
                          className={`flex items-center justify-between p-4 rounded-lg border-2 ${optionClass}`}
                        >
                          <span className="flex items-center gap-3">
                            <span className="w-6 h-6 flex items-center justify-center rounded-full border text-xs">
                              {String.fromCharCode(65 + i)}
                            </span>
                            {opt}
                          </span>
                          {icon}
                        </div>
                      );
                    })}
                  </div>
                  
                  {!isCorrect && (
                    <div className="mt-4 text-sm text-red-600 font-medium">
                      {t('your_answer')}: {q.options[userAnswer] || t('not_answered')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </StudentLayout>
    );
  }

  // =========================
  // ATTEMPT VIEW
  // =========================
  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto p-6">
        
        {/* HEADER */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 flex justify-between items-center sticky top-4 z-10 border-b-4 border-primary">
          <div>
            <h1 className="text-xl font-bold">{assessment?.title}</h1>
            <p className="text-sm text-gray-500">{t('total_questions')}: {questions.length}</p>
          </div>
          <div className={`flex items-center gap-2 text-xl font-mono font-bold ${timeLeft < 300000 ? "text-red-600" : "text-primary"}`}>
            <Clock className="w-6 h-6" />
            {formatTime(timeLeft || 0)}
          </div>
        </div>

        {/* QUESTIONS */}
        <div className="space-y-6">
          {questions.map((q, idx) => (
            <div key={q._id} className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4 flex gap-3">
                <span className="text-gray-400">Q{idx + 1}.</span>
                {q.questionText}
              </h3>

              <LegacyQuestionImage question={q} className="max-w-full h-auto rounded-lg mb-4 border" />

              <div className="space-y-3">
                {q.options.map((opt, i) => (
                  <label
                    key={i}
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      answers[q._id] === i
                        ? "border-primary bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q._id}`}
                      checked={answers[q._id] === i}
                      onChange={() => handleSelect(q._id, i)}
                      className="w-5 h-5 text-primary border-gray-300 focus:ring-primary"
                    />
                    <span className="ml-3 text-gray-700">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* SUBMIT BUTTON */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={submitAssessment}
            className="px-8 py-4 bg-primary text-white rounded-xl font-bold text-lg shadow-lg hover:bg-primary/90 transition-transform active:scale-95"
          >
            {t('submit_assessment')}
          </button>
        </div>

      </div>
    </StudentLayout>
  );
}
