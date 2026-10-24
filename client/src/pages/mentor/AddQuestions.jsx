import { useState } from "react";
import { useAuth } from "../../auth/auth";
import { useTranslation } from "../../context/TranslationContext";
import { toast } from "react-toastify";

export default function AddQuestion({ assessmentId }) {
  const { API, token } = useAuth();
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  const handleOptionChange = (index, value) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const submitQuestion = async () => {
    if (!question || options.some(o => o === "")) {
      toast.error("Fill all fields");
      return;
    }

    try {
      const res = await fetch(`${API}/assessments/add-question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          assessmentId,
          questionText: question,
          options,
          correctOptionIndex: correctIndex,
          questionType: "text"
        })
      });

      if (!res.ok) throw new Error();

      toast.success("Question added successfully");

      // reset form
      setQuestion("");
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add question");
    }
  };

  return (
    <div>
      <h3>Add MCQ Question</h3>

      <input
        type="text"
        placeholder="Enter question"
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />

      {options.map((opt, i) => (
        <div key={i}>
          <input
            type="text"
            placeholder={`Option ${i + 1}`}
            value={opt}
            onChange={e => handleOptionChange(i, e.target.value)}
          />
          <input
            type="radio"
            name="correct"
            checked={correctIndex === i}
            onChange={() => setCorrectIndex(i)}
          />
          Correct
        </div>
      ))}

      <button onClick={submitQuestion}>
        Save Question
      </button>
    </div>
  );
}
