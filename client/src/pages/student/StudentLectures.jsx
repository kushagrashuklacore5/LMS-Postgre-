import StudentLayout from "../../components/StudentLayout";
import LecturesTable from "../../components/lectures/LecturesTable";
import { useAuth } from "../../auth/auth";

// The student's lectures: upcoming and live ones of their classes and enrolled courses (Join when
// live), and the history with their own attendance.
export default function StudentLectures() {
  const { API, token } = useAuth();
  return (
    <StudentLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <LecturesTable API={API} token={token} mode="student" />
      </div>
    </StudentLayout>
  );
}
