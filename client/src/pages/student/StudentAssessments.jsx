import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from '../../context/TranslationContext';
import { API_ORIGIN } from '../../config/api';

export default function StudentAssessments({ courseId }) {
  const { t } = useTranslation();
  const [assessments, setAssessments] = useState([]);

  useEffect(() => {
    axios
      .get(`${API_ORIGIN}/api/assessments/course/${courseId}`, {
        withCredentials: true
      })
      .then(res => setAssessments(res.data))
      .catch(err => console.error(err));
  }, [courseId]);

  return (
    <div>
      <h2>{t('assessments')}</h2>

      {assessments.map(a => (
        <div key={a.id}>
          <h4>{a.title}</h4>
          {a.isUnlocked ? (
            <button>{t('start_assessment')}</button>
          ) : (
            <span>🔒 {t('locked')}</span>
          )}
        </div>
      ))}
    </div>
  );
}
