const db = require('../config/database-switch');
const { get, run } = require('../helpers/dbAsync');
const {
  HttpError,
  cleanName,
  nameKey,
  authorizeClassroom,
  requireStudentInClassroom,
  getEffectiveSubjects,
} = require('../helpers/subjectConfig');
const notifications = require('../services/notificationService');

/* ================= ADD/UPDATE RESULT (TEACHER) ================= */
const parseSavedSubjects = (raw) => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const addResult = async (req, res) => {
  try {
    let { studentId, classroomId, subjects, term, comments, marks, totalMarks, status, remarks } = req.body;

    if (!classroomId || !studentId) {
      return res.status(400).json({ message: "Student ID and Classroom ID are required" });
    }

    // The teacher must be allowed to manage this classroom and the student must belong to it
    const classroom = await authorizeClassroom(req, classroomId);
    const student = await requireStudentInClassroom(classroom, studentId);

    // Normalize payload: if legacy fields provided, convert to subjects array
    let submitted = Array.isArray(subjects) ? subjects : [];
    if (submitted.length === 0 && (marks !== undefined || totalMarks !== undefined || status)) {
      submitted = [
        {
          name: "General",
          marks: Number(marks || 0),
          total: Number(totalMarks || 100),
          status: String(status || "PASS").toUpperCase() === "FAIL" ? "FAIL" : "PASS",
        },
      ];
      comments = remarks || comments || "";
    }

    if (submitted.length === 0) {
      return res.status(400).json({ message: "At least one subject with marks is required" });
    }

    const termName = String(term || "").trim() || "General Examination";
    const existing = await get(
      "SELECT id, subjects FROM results WHERE studentId = ? AND classroomId = ? AND term = ?",
      [student.id, classroom.id, termName]
    );

    // Subjects the student currently has (class template + student overrides) and the
    // subjects already saved in this result. A saved result keeps its own subject
    // names and maximum marks, so both are accepted.
    const effective = await getEffectiveSubjects(classroom.id, student.id);
    const effectiveByKey = new Map(effective.subjects.map((s) => [nameKey(s.name), s]));
    const savedByKey = new Map(
      parseSavedSubjects(existing?.subjects).map((s) => [nameKey(s.name), s])
    );
    const hasSubjectConfig = effective.subjects.length > 0;

    const seen = new Set();
    const normalizedSubjects = submitted.map((sub) => {
      const name = cleanName(sub?.name);
      if (!name) throw new HttpError(400, "Subject name is required");

      const key = nameKey(name);
      if (seen.has(key)) throw new HttpError(400, `Duplicate subject: ${name}`);
      seen.add(key);

      const configured = effectiveByKey.get(key);
      const saved = savedByKey.get(key);
      const providedTotal = sub.total === "" || sub.total === null || sub.total === undefined ? null : Number(sub.total);

      let total;
      if (hasSubjectConfig) {
        if (!configured && !saved) {
          throw new HttpError(400, `Subject "${name}" is not configured for this student`);
        }
        const allowedTotals = [configured?.maxMarks, saved?.total]
          .filter((value) => value !== undefined && value !== null && value !== "")
          .map(Number);
        if (providedTotal === null) {
          total = allowedTotals[0];
        } else if (allowedTotals.includes(providedTotal)) {
          total = providedTotal;
        } else {
          throw new HttpError(400, `Maximum marks for ${name} must be ${allowedTotals.join(" or ")}`);
        }
      } else {
        // No subject configuration yet: keep the original free-form behaviour
        total = providedTotal === null ? 100 : providedTotal;
      }

      if (!Number.isFinite(total) || total <= 0) {
        throw new HttpError(400, `Maximum marks for ${name} must be greater than 0`);
      }

      const obtained = Number(sub.marks);
      if (sub.marks === "" || sub.marks === null || sub.marks === undefined || !Number.isFinite(obtained)) {
        throw new HttpError(400, `Marks are required for ${name}`);
      }
      if (obtained < 0 || obtained > total) {
        throw new HttpError(400, `Marks for ${name} must be between 0 and ${total}`);
      }

      return {
        name: configured?.name || saved?.name || name,
        marks: obtained,
        total,
        status: String(sub.status || "PASS").toUpperCase() === "FAIL" ? "FAIL" : "PASS",
      };
    });

    let totalObtained = 0;
    let totalMax = 0;
    let failCount = 0;

    normalizedSubjects.forEach(sub => {
      totalObtained += sub.marks;
      totalMax += sub.total;
      if (sub.status === "FAIL") failCount++;
    });

    const overallPercentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    const overallStatus = failCount > 0 ? "FAIL" : "PASS";
    const subjectsJson = JSON.stringify(normalizedSubjects);

    // Upsert into results
    if (existing) {
      await run(
        `UPDATE results SET
          subjects = ?,
          overallPercentage = ?,
          overallStatus = ?,
          comments = ?,
          updatedAt = utc_now_text()
         WHERE id = ?`,
        [subjectsJson, overallPercentage, overallStatus, comments || "", existing.id]
      );
      return res.json({
        message: "Result updated successfully",
        resultId: existing.id,
        subjects: normalizedSubjects,
        overallPercentage,
        overallStatus,
      });
    }

    const inserted = await run(
      `INSERT INTO results (studentId, classroomId, term, subjects, overallPercentage, overallStatus, comments)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [student.id, classroom.id, termName, subjectsJson, overallPercentage, overallStatus, comments || ""]
    );
    res.status(201).json({
      message: "Result saved successfully",
      resultId: inserted.lastID,
      subjects: normalizedSubjects,
      overallPercentage,
      overallStatus,
    });

    // New result: one notification for the student (later edits of the same result do not repeat it)
    notifications.notify({
      type: "RESULT_AVAILABLE",
      data: { title: `${termName} - ${classroom.name}` },
      universityId: classroom.university_id,
      recipientIds: [student.id],
      entityType: "result",
      entityId: inserted.lastID,
      createdBy: req.user.userId,
      createdByRole: req.user.role,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("ADD RESULT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET UNIFIED RESULTS (FOR A STUDENT) ================= */
const fetchStudentUnifiedResults = (studentId, callback) => {
  const unifiedResults = [];

  // 1. Term results
  db.all(
    `SELECT r.*, c.name as classroomName, c.grade, c.section 
     FROM results r 
     LEFT JOIN classrooms c ON r.classroomId = c.id 
     WHERE r.studentId = ? 
     ORDER BY r.createdAt DESC`,
    [studentId],
    (err1, termResults) => {
      if (!err1 && termResults) {
        termResults.forEach(r => {
          let parsedSubjects = [];
          try {
            parsedSubjects = r.subjects ? JSON.parse(r.subjects) : [];
          } catch (e) {
            parsedSubjects = [];
          }
          unifiedResults.push({
            id: `term-${r.id}`,
            _id: `term-${r.id}`,
            type: 'term_exam',
            term: r.term || 'Academic Term',
            classroomName: r.classroomName,
            grade: r.grade,
            section: r.section,
            overallPercentage: r.overallPercentage,
            overallStatus: r.overallStatus,
            comments: r.comments,
            subjects: parsedSubjects,
            createdAt: r.createdAt
          });
        });
      }

      // 2. Course Test Attempts (Legacy)
      db.all(
        `SELECT aa.*, a.title as assessmentTitle, c.title as courseTitle 
         FROM assessment_attempts aa 
         LEFT JOIN assessments a ON aa.assessmentId = a.id 
         LEFT JOIN courses c ON a.courseId = c.id 
         WHERE aa.studentId = ? 
         ORDER BY aa.attemptedAt DESC`,
        [studentId],
        (err2, courseAttempts) => {
          if (!err2 && courseAttempts) {
            courseAttempts.forEach(ca => {
              unifiedResults.push({
                id: `course-test-${ca.id}`,
                _id: `course-test-${ca.id}`,
                type: 'course_test',
                term: `${ca.courseTitle || 'Course'}: ${ca.assessmentTitle || 'Assessment'}`,
                classroomName: ca.courseTitle || 'Course Test',
                overallPercentage: ca.percentage,
                overallStatus: ca.result,
                score: ca.score,
                totalQuestions: ca.totalQuestions,
                subjects: [
                  {
                    name: ca.assessmentTitle || 'Quiz',
                    marks: ca.score,
                    total: ca.totalQuestions,
                    status: ca.result
                  }
                ],
                createdAt: ca.attemptedAt
              });
            });
          }

          // 3. AI Assessment Agent Attempts (Class Tests)
          db.all(
            `SELECT att.*, a.title as assessmentTitle, cl.name as classroomName, cl.grade, cl.section 
             FROM aia_attempts att 
             LEFT JOIN aia_assessments a ON att.assessment_id = a.id 
             LEFT JOIN classrooms cl ON a.classroom_id = cl.id 
             WHERE att.student_id = ? 
             ORDER BY att.created_at DESC`,
            [studentId],
            (err3, aiaAttempts) => {
              if (!err3 && aiaAttempts) {
                aiaAttempts.forEach(aa => {
                  const status = (aa.percentage >= 50 || aa.status === 'passed') ? 'PASS' : 'FAIL';
                  unifiedResults.push({
                    id: `aia-test-${aa.id}`,
                    _id: `aia-test-${aa.id}`,
                    type: 'ai_assessment',
                    term: aa.assessmentTitle || 'AI Assessment Test',
                    classroomName: aa.classroomName || 'Class Test',
                    grade: aa.grade,
                    section: aa.section,
                    overallPercentage: aa.percentage,
                    overallStatus: status,
                    score: aa.score,
                    totalQuestions: aa.total_questions,
                    subjects: [
                      {
                        name: aa.assessmentTitle || 'Class Assessment',
                        marks: aa.score,
                        total: aa.total_questions,
                        status: status
                      }
                    ],
                    createdAt: aa.created_at
                  });
                });
              }

              // 4. AI Assignment Submissions (Evaluated PDF Assignments)
              db.all(
                `SELECT sub.*, asg.title as assignmentTitle, asg.max_marks, cl.name as classroomName 
                 FROM aia_assignment_submissions sub 
                 LEFT JOIN aia_assignments asg ON sub.assignment_id = asg.id 
                 LEFT JOIN classrooms cl ON asg.classroom_id = cl.id 
                 WHERE sub.student_id = ? AND sub.status = 'evaluated' 
                 ORDER BY sub.evaluated_at DESC`,
                [studentId],
                (err4, submissions) => {
                  if (!err4 && submissions) {
                    submissions.forEach(sub => {
                      const maxMarks = sub.max_marks || 10;
                      const marks = sub.final_marks || 0;
                      const pct = maxMarks > 0 ? Math.round((marks / maxMarks) * 100) : 0;
                      const status = pct >= 40 ? 'PASS' : 'FAIL';

                      unifiedResults.push({
                        id: `asg-${sub.id}`,
                        _id: `asg-${sub.id}`,
                        type: 'assignment',
                        term: sub.assignmentTitle || 'Assignment',
                        classroomName: sub.classroomName || 'Classroom Assignment',
                        overallPercentage: pct,
                        overallStatus: status,
                        comments: sub.teacher_feedback,
                        subjects: [
                          {
                            name: sub.assignmentTitle || 'Assignment Submission',
                            marks: marks,
                            total: maxMarks,
                            status: status
                          }
                        ],
                        createdAt: sub.evaluated_at || sub.created_at
                      });
                    });
                  }

                  // Sort all results chronologically
                  unifiedResults.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                  callback(null, unifiedResults);
                }
              );
            }
          );
        }
      );
    }
  );
};

/* ================= GET MY RESULTS (STUDENT) ================= */
const getMyResults = async (req, res) => {
  try {
    const studentId = req.user.userId || req.user.id;
    fetchStudentUnifiedResults(studentId, (err, results) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json(results);
    });
  } catch (error) {
    console.error("GET MY RESULTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET RESULTS BY STUDENT ID ================= */
const getStudentResults = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.query.studentId || req.user.userId || req.user.id;
    fetchStudentUnifiedResults(studentId, (err, results) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json(results);
    });
  } catch (error) {
    console.error("GET STUDENT RESULTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET CLASSROOM RESULTS (TEACHER) ================= */
const getClassroomResults = async (req, res) => {
  try {
    const { classroomId } = req.params;

    // Fetch all students in the classroom
    db.all(
      `SELECT u.id, u.name, u.email 
       FROM users u 
       JOIN student_classroom_assignment sca ON u.id = sca.studentId 
       WHERE sca.classroomId = ? 
       ORDER BY u.name ASC`,
      [classroomId],
      (err, students) => {
        if (err) return res.status(500).json({ message: "Database error" });

        if (!students || students.length === 0) {
          return res.json([]);
        }

        let completed = 0;
        const studentReports = [];

        students.forEach(student => {
          fetchStudentUnifiedResults(student.id, (stuErr, stuResults) => {
            studentReports.push({
              student: {
                _id: student.id,
                id: student.id,
                name: student.name,
                email: student.email
              },
              results: stuResults || [],
              latestResult: stuResults && stuResults.length > 0 ? stuResults[0] : null
            });

            completed++;
            if (completed === students.length) {
              res.json(studentReports);
            }
          });
        });
      }
    );
  } catch (error) {
    console.error("GET CLASSROOM RESULTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET ALL RESULTS (COMPAT) ================= */
const getResults = async (req, res) => {
  try {
    const studentId = req.query.studentId || req.user?.userId;
    if (studentId) {
      return getStudentResults(req, res);
    }
    const classroomId = req.query.classroomId;
    if (classroomId) {
      req.params.classroomId = classroomId;
      return getClassroomResults(req, res);
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addResult,
  getMyResults,
  getStudentResults,
  getClassroomResults,
  getResults
};
