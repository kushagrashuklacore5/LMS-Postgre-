-- One student belongs to at most one classroom at a time.
--
-- student_classroom_assignment holds current memberships only (there is no history or "active" flag:
-- leaving a classroom deletes the row), so the rule is simply one row per student. The application
-- already replaces the membership on a class change and refuses a second classroom elsewhere
-- (helpers/classroomEnrollment.js); this index makes the database refuse it too, including for
-- concurrent requests.
--
-- Fails, and changes nothing (each migration runs in its own transaction), if a student is already in
-- more than one classroom. Find those students first with:
--   SELECT studentId, COUNT(*) FROM student_classroom_assignment GROUP BY studentId HAVING COUNT(*) > 1;
-- and use the admin "Change class" action to keep the right one.
CREATE UNIQUE INDEX uq_student_classroom_assignment_one_per_student
  ON student_classroom_assignment (studentId);
