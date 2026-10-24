const db = require('../config/database-switch');
const { get, run } = require('../helpers/dbAsync');
const notifications = require('../services/notificationService');
const { IMAGE_KEY, contentTypeOfKey } = require('../../ai-modules/ai-assessment-agent/backend/src/integration/lmsAssessmentAgent');

// A question picture is the key of a private uploaded file, or (older data) a plain web address
const cleanQuestionImage = (value) => {
  const image = String(value || '').trim();
  if (!image) return null;
  if (IMAGE_KEY.test(image)) return image;
  return /^https?:\/\/\S{1,500}$/i.test(image) ? image : null;
};



// Helper function to add _id field for frontend compatibility
const mapAssessment = (assessment) => {
  if (!assessment) return assessment;
  return { ...assessment, _id: assessment.id };
};

/**
 * ================================
 * CREATE ASSESSMENT (MENTOR)
 * ================================
 */
exports.createAssessment = async (req, res) => {
  try {
    const { courseId, weekId, title, description, startTime, endTime, timer } = req.body;

    if (!courseId || !title || !startTime || !endTime) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    // A window that closes before it opens can never be attempted by a student
    const opens = new Date(startTime).getTime();
    const closes = new Date(endTime).getTime();
    if (!Number.isFinite(opens) || !Number.isFinite(closes)) {
      return res.status(400).json({ message: "Start and end must be valid dates" });
    }
    if (closes <= opens) {
      return res.status(400).json({ message: "The end time must be after the start time" });
    }
    if (timer !== undefined && timer !== null && timer !== "" && !(Number(timer) > 0 && Number(timer) <= 1440)) {
      return res.status(400).json({ message: "The timer must be between 1 and 1440 minutes" });
    }

    // Verify course exists and user is the mentor/course teacher
    db.get(
      "SELECT id, mentorId FROM courses WHERE id = ?",
      [courseId],
      (err, course) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!course) {
          return res.status(404).json({ message: "Course not found" });
        }

        // Check if user is the course teacher/mentor
        if (course.mentorId !== req.user.userId) {
          return res.status(403).json({ message: "Not authorized for this course" });
        }

        // Insert assessment into database
        db.run(
          `INSERT INTO assessments (courseId, weekId, title, description, startTime, endTime, timer, createdBy, isPublished, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, utc_now_text(), utc_now_text())`,
          [courseId, weekId || null, title, description || "", startTime, endTime, timer || 60, req.user.userId],
          function(err) {
            if (err) {
              console.error("Error creating assessment:", err);
              return res.status(500).json({ message: "Failed to create assessment" });
            }

            // Fetch the created assessment
            db.get(
              "SELECT * FROM assessments WHERE id = ?",
              [this.lastID],
              (selectErr, assessment) => {
                if (selectErr) {
                  console.error("Error fetching assessment:", selectErr);
                  return res.status(500).json({ message: "Assessment created but could not fetch details" });
                }

                res.status(201).json({
                  message: "Assessment created successfully",
                  assessment: mapAssessment(assessment)
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error("CREATE ASSESSMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * GET ALL ASSESSMENTS (MENTOR)
 * ================================
 */
exports.getAllCourseAssessments = (req, res) => {
  try {
    const { courseId } = req.params;

    db.all(
      "SELECT * FROM assessments WHERE courseId = ? ORDER BY createdAt DESC",
      [courseId],
      (err, assessments) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const mapped = (assessments || []).map(mapAssessment);
        res.json(mapped);
      }
    );
  } catch (error) {
    console.error("GET ASSESSMENTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * GET COURSE ASSESSMENTS (STUDENT)
 * ================================
 */
exports.getCourseAssessments = (req, res) => {
  try {
    const { courseId } = req.params;
    const now = new Date();

    // Staff see every assessment of the course. A student sees published ones only:
    // a draft cannot be attempted, and its title is not theirs to read yet.
    const draftsToo = req.user?.role !== "student";
    db.all(
      `SELECT * FROM assessments WHERE courseId = ?${draftsToo ? "" : " AND isPublished = 1"} ORDER BY createdAt DESC`,
      [courseId],
      (err, assessments) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const response = (assessments || []).map(a => {
          // Auto-unlock assessments - show all assessments to enrolled students
          // If no startTime/endTime set, assessment is unlocked by default
          const startTime = a.startTime ? new Date(a.startTime) : new Date(0); // Default to past
          const endTime = a.endTime ? new Date(a.endTime) : new Date(9999999999999); // Default to future
          const isUnlocked = startTime <= now && now <= endTime;

          return {
            ...mapAssessment(a),
            isUnlocked: isUnlocked || (!a.startTime && !a.endTime) // Unlock if no time restrictions
          };
        });

        res.json(response);
      }
    );
  } catch (error) {
    console.error("GET COURSE ASSESSMENTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * ADD QUESTION (MENTOR)
 * ================================
 */
exports.addQuestion = (req, res) => {
  try {
    let { assessmentId, questionText, questionType, options, correctAnswer, correctOptionIndex, marks } = req.body;

    if (!assessmentId || (!questionText && !req.body.questionImage)) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!questionType || questionType === "text" || questionType === "image") {
      questionType = "multiple_choice";
    }

    if (!correctAnswer && correctOptionIndex !== undefined && Array.isArray(options)) {
      correctAnswer = options[correctOptionIndex] !== undefined ? options[correctOptionIndex] : String(correctOptionIndex);
    }

    // Get the next question number
    db.get(
      "SELECT MAX(questionNumber) as maxNum FROM assessment_questions WHERE assessmentId = ?",
      [assessmentId],
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const questionNumber = (result?.maxNum || 0) + 1;
        const optionsJson = options ? JSON.stringify(options) : null;

        db.run(
          `INSERT INTO assessment_questions (assessmentId, questionNumber, questionText, questionType, options, correctAnswer, marks, questionImage, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())`,
          [assessmentId, questionNumber, questionText || "", questionType, optionsJson, correctAnswer || "", marks || 1, cleanQuestionImage(req.body.questionImage)],
          function(err) {
            if (err) {
              console.error("Error creating question:", err);
              return res.status(500).json({ message: "Failed to create question" });
            }

            db.get(
              "SELECT * FROM assessment_questions WHERE id = ?",
              [this.lastID],
              (selectErr, question) => {
                if (selectErr) {
                  console.error("Error fetching question:", selectErr);
                  return res.status(500).json({ message: "Question created but could not fetch details" });
                }

                // Parse options if they exist
                if (question.options) {
                  try {
                    question.options = JSON.parse(question.options);
                  } catch (e) {
                    // keep raw
                  }
                }

                res.status(201).json({
                  message: "Question added successfully",
                  question: { ...question, _id: question.id }
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error("ADD QUESTION ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * GET ASSESSMENT QUESTIONS
 * ================================
 */
exports.getAssessmentQuestions = (req, res) => {
  try {
    const { assessmentId } = req.params;

    db.get(
      "SELECT * FROM assessments WHERE id = ?",
      [assessmentId],
      (err, assessment) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const isStudent = req.user.role === "student";
        if (!assessment || (isStudent && !assessment.isPublished)) {
          return res.status(404).json({ message: "Assessment not found" });
        }

        db.all(
          "SELECT * FROM assessment_questions WHERE assessmentId = ? ORDER BY questionNumber ASC",
          [assessmentId],
          (questErr, questions) => {
            if (questErr) {
              console.error("Database error:", questErr);
              return res.status(500).json({ message: "Database error" });
            }

            const mappedQuestions = (questions || []).map(q => {
              let parsedOptions = [];
              if (q.options) {
                try {
                  parsedOptions = JSON.parse(q.options);
                } catch (e) {
                  parsedOptions = [];
                }
              }
              const question = {
                ...q,
                _id: q.id,
                options: parsedOptions
              };
              // The answer key stays on the server; answers are marked in submitAssessment
              if (isStudent) delete question.correctAnswer;
              return question;
            });

            res.json({
              assessment: mapAssessment(assessment),
              questions: mappedQuestions
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("GET ASSESSMENT QUESTIONS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * QUESTION PICTURE (PRIVATE FILE)
 * ================================
 * The teacher of the course, an admin of its school, or a student enrolled in the
 * course (once the assessment is published) may fetch the picture of a question.
 */
exports.getQuestionImage = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const row = await get(
      `SELECT q.questionImage, a.isPublished, a.createdBy, c.id AS courseId, c.mentorId, c.university_id
       FROM assessment_questions q
       JOIN assessments a ON a.id = q.assessmentId
       LEFT JOIN courses c ON c.id = a.courseId
       WHERE q.id = ?`,
      [req.params.questionId]
    );
    if (!row || !row.questionImage || !IMAGE_KEY.test(row.questionImage)) {
      return res.status(404).json({ message: "Picture not found" });
    }

    let allowed = String(row.createdBy) === String(userId) || String(row.mentorId) === String(userId);
    if (!allowed && req.user.role === "admin") {
      allowed = Number(row.university_id) === Number(req.user.universityId);
    }
    if (!allowed && req.user.role === "student" && row.isPublished) {
      allowed = !!(await get("SELECT id FROM course_students WHERE courseId = ? AND studentId = ?", [row.courseId, userId]));
    }
    if (!allowed) return res.status(404).json({ message: "Picture not found" });

    const { questionImageStore } = require("../routes/assessmentAgentRoutes");
    let bytes;
    try {
      bytes = await questionImageStore.read(row.questionImage);
    } catch (readErr) {
      return res.status(404).json({ message: "Picture not found" });
    }
    res.set({
      "Content-Type": contentTypeOfKey(row.questionImage),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    });
    res.send(bytes);
  } catch (error) {
    console.error("GET QUESTION IMAGE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * PUBLISH ASSESSMENT (MENTOR)
 * ================================
 */
exports.publishAssessment = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const assessment = await get("SELECT * FROM assessments WHERE id = ?", [assessmentId]);
    if (!assessment) {
      return res.status(404).json({ message: "Assessment not found" });
    }

    // Only the assessment's creator, the course teacher, or an admin of the course's school may publish
    const course = await get("SELECT id, mentorId, university_id FROM courses WHERE id = ?", [assessment.courseId]);
    const isOwner = String(assessment.createdBy) === String(userId) || (course && String(course.mentorId) === String(userId));
    const isSchoolAdmin =
      req.user.role === "admin" && course && Number(course.university_id) === Number(req.user.universityId);
    if (!isOwner && !isSchoolAdmin) {
      return res.status(403).json({ message: "Not authorized for this assessment" });
    }

    // Already published: nothing is changed and nobody is notified again
    if (assessment.isPublished) {
      return res.status(409).json({
        message: "This assessment is already published",
        alreadyPublished: true,
        assessment: mapAssessment(assessment),
      });
    }

    // Verify that assessment has at least one question
    const countResult = await get(
      "SELECT COUNT(*) as count FROM assessment_questions WHERE assessmentId = ?",
      [assessmentId]
    );
    if (!countResult || countResult.count === 0) {
      return res.status(400).json({
        message: "Cannot publish an assessment with no questions. Please add at least one question first."
      });
    }

    // The WHERE clause makes two simultaneous requests publish only once
    const updated = await run(
      "UPDATE assessments SET isPublished = 1, updatedAt = utc_now_text() WHERE id = ? AND isPublished = 0",
      [assessmentId]
    );
    const published = await get("SELECT * FROM assessments WHERE id = ?", [assessmentId]);
    if (!updated.changes) {
      return res.status(409).json({
        message: "This assessment is already published",
        alreadyPublished: true,
        assessment: mapAssessment(published),
      });
    }

    res.json({ message: "Assessment published successfully", assessment: mapAssessment(published) });

    // Tell the students enrolled in the course (after the response; never fails the publish)
    if (course) {
      notifications
        .studentsOfCourse(course.id, course.university_id)
        .then((recipientIds) =>
          notifications.notify({
            type: "ASSESSMENT_PUBLISHED",
            data: { title: published.title, deadline: published.endTime },
            universityId: course.university_id,
            recipientIds,
            entityType: "course",
            entityId: course.id,
            createdBy: userId,
            createdByRole: req.user.role,
            dedupeSuffix: `assessment-${published.id}`,
          })
        )
        .catch((notifyErr) => console.error("PUBLISH NOTIFY ERROR:", notifyErr.message));
    }
  } catch (error) {
    console.error("PUBLISH ASSESSMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * SUBMIT ASSESSMENT (STUDENT)
 * ================================
 */
exports.submitAssessment = async (req, res) => {
  try {
    const { assessmentId, answers } = req.body;
    const studentId = req.user.userId;

    if (!assessmentId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    // Published, and (for a first attempt) inside its start and end time. Whether the
    // student takes this course at all was already checked by the API gate.
    const assessment = await get("SELECT id, isPublished, startTime, endTime FROM assessments WHERE id = ?", [assessmentId]);
    if (!assessment || !assessment.isPublished) {
      return res.status(404).json({ message: "Assessment not found" });
    }
    const now = Date.now();
    const notOpenYet = assessment.startTime && now < new Date(assessment.startTime).getTime();
    const closed = assessment.endTime && now > new Date(assessment.endTime).getTime();

    // Check if student has already attempted this assessment
    db.get(
      "SELECT * FROM assessment_attempts WHERE assessmentId = ? AND studentId = ?",
      [assessmentId, studentId],
      (checkErr, previousAttempt) => {
        if (checkErr) {
          console.error("Database error:", checkErr);
          return res.status(500).json({ message: "Database error" });
        }

        // If already attempted, return previous result
        if (previousAttempt) {
          return res.status(200).json({
            alreadyAttempted: true,
            previousResult: {
              score: previousAttempt.score,
              totalQuestions: previousAttempt.totalQuestions,
              percentage: Math.round((previousAttempt.score / previousAttempt.totalQuestions) * 100),
              result: previousAttempt.score >= (previousAttempt.totalQuestions * 0.6) ? "PASS" : "FAIL",
              correctAnswers: previousAttempt.correctAnswers ? JSON.parse(previousAttempt.correctAnswers) : []
            }
          });
        }

        if (notOpenYet || closed) {
          return res.status(403).json({
            message: notOpenYet ? "This assessment has not started yet" : "The time for this assessment is over"
          });
        }

        // Fetch all questions for this assessment
        db.all(
          "SELECT * FROM assessment_questions WHERE assessmentId = ? ORDER BY questionNumber ASC",
          [assessmentId],
          (questErr, questions) => {
            if (questErr) {
              console.error("Database error:", questErr);
              return res.status(500).json({ message: "Database error" });
            }

            if (!questions || questions.length === 0) {
              return res.status(404).json({ message: "Assessment questions not found" });
            }

            // Calculate score
            let score = 0;
            const correctAnswers = [];

            questions.forEach((q, index) => {
              const studentAnswer = answers[index];

              // Parse options if stored as JSON
              let options = [];
              try {
                options = q.options ? JSON.parse(q.options) : [];
              } catch (e) {
                options = [];
              }

              // Determine correct option index:
              // correctAnswer should now be stored as a numeric index (0-based)
              let correctOption = -1;
              if (q.correctAnswer !== null && q.correctAnswer !== undefined) {
                const ca = String(q.correctAnswer).trim();
                const byText = options.findIndex(opt => String(opt).trim() === ca);
                if (byText !== -1) {
                  correctOption = byText;
                } else if (/^-?\d+$/.test(ca)) {
                  correctOption = parseInt(ca, 10);
                  // Validate it's within range
                  if (correctOption < 0 || correctOption >= options.length) {
                    correctOption = -1;
                  }
                } else if (/^[A-Za-z]$/.test(ca)) {
                  // Letter like A,B,C (convert to 0-based)
                  const letterIndex = ca.toUpperCase().charCodeAt(0) - 65;
                  if (letterIndex >= 0 && letterIndex < options.length) {
                    correctOption = letterIndex;
                  }
                } else {
                  // Try to match by option text as fallback
                  const found = options.findIndex(opt => String(opt).trim() === ca);
                  if (found !== -1) correctOption = found;
                }
              }

              // Check if answer matches
              console.log(`📝 Question ${index + 1}: Student Answer=${studentAnswer}, Correct Option=${correctOption}`);
              if (studentAnswer !== undefined && studentAnswer !== null && studentAnswer !== -1 && correctOption !== -1) {
                if (Number(studentAnswer) === Number(correctOption)) {
                  score++;
                  console.log(`   ✅ CORRECT`);
                } else {
                  console.log(`   ❌ WRONG (${studentAnswer} !== ${correctOption})`);
                }
              } else {
                console.log(`   ⚠️  SKIPPED (studentAnswer=${studentAnswer}, correctOption=${correctOption})`);
              }

              correctAnswers.push({
                questionId: q.id,
                question: q.questionText,
                correctOptionIndex: correctOption,
                correctOptionText: options[correctOption] || null,
                studentAnswerIndex: studentAnswer,
                studentAnswerText: (options && options[studentAnswer]) || null
              });
            });

            const totalQuestions = questions.length;
            const percentage = Math.round((score / totalQuestions) * 100);
            const result = score >= (totalQuestions * 0.6) ? "PASS" : "FAIL"; // 60% passing score

            // Save attempt to database
            db.run(
              `INSERT INTO assessment_attempts
               (assessmentId, studentId, score, totalQuestions, percentage, result, correctAnswers, attemptedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, utc_now_text())`,
              [assessmentId, studentId, score, totalQuestions, percentage, result, JSON.stringify(correctAnswers)],
              (insertErr) => {
                if (insertErr) {
                  console.error("Error saving assessment attempt:", insertErr);
                  // Return score anyway even if save fails
                }

                // Also mark assessment complete in progress
                db.run(
                  `INSERT INTO progress (studentId, contentId, contentType, courseId, completed, completedAt)
                   SELECT CAST(? AS BIGINT), CAST(? AS BIGINT), 'assessment', courseId, 1, utc_now_text() FROM assessments WHERE id = ?
                   ON CONFLICT (studentId, courseId, contentType, contentId)
                   DO UPDATE SET completed = excluded.completed, completedAt = excluded.completedAt`,
                  [studentId, assessmentId, assessmentId]
                );

                res.status(200).json({
                  score,
                  totalQuestions,
                  percentage,
                  result,
                  correctAnswers
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error("SUBMIT ASSESSMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * GET ASSESSMENT ATTEMPTS (TEACHER)
 * ================================
 */
exports.getAssessmentAttempts = (req, res) => {
  try {
    const { assessmentId } = req.params;
    db.all(
      `SELECT aa.*, u.name as studentName, u.email as studentEmail
       FROM assessment_attempts aa
       LEFT JOIN users u ON aa.studentId = u.id
       WHERE aa.assessmentId = ?
       ORDER BY aa.attemptedAt DESC`,
      [assessmentId],
      (err, attempts) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(attempts || []);
      }
    );
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * GET COURSE ATTEMPTS (TEACHER)
 * ================================
 */
exports.getCourseAssessmentAttempts = (req, res) => {
  try {
    const { courseId } = req.params;
    db.all(
      `SELECT aa.*, a.title as assessmentTitle, u.name as studentName, u.email as studentEmail
       FROM assessment_attempts aa
       JOIN assessments a ON aa.assessmentId = a.id
       LEFT JOIN users u ON aa.studentId = u.id
       WHERE a.courseId = ?
       ORDER BY aa.attemptedAt DESC`,
      [courseId],
      (err, attempts) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(attempts || []);
      }
    );
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
