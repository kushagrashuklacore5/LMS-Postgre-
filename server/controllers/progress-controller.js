const db = require('../config/database-switch');



// Get progress for a student in a course
const getProgress = (req, res) => {
  try {
    const { courseId } = req.params;
    const loggedInUserId = req.user.userId;
    const loggedInUserRole = req.user.role;

    if (!courseId) {
      return res.status(400).json({ message: "courseId parameter is required" });
    }

    // Determine which student's progress to fetch
    let targetStudentId;
    if (loggedInUserRole === 'student') {
      targetStudentId = loggedInUserId;
    } else if (loggedInUserRole === 'mentor' || loggedInUserRole === 'admin') {
      targetStudentId = req.query.studentId || loggedInUserId;
    } else {
      return res.status(403).json({ message: "Access denied: Invalid user role" });
    }

    // Check if course exists
    db.get("SELECT * FROM courses WHERE id = ?", [courseId], (err, course) => {
      if (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
      }
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Authorization checks
      if (loggedInUserRole === 'student') {
        // Student can only view their own progress and must be enrolled
        db.get("SELECT * FROM course_students WHERE courseId = ? AND studentId = ?", [courseId, targetStudentId], (err, enrollment) => {
          if (err || !enrollment) {
            return res.status(403).json({ message: "Access denied: Student can only view their own enrolled course progress" });
          }
          fetchProgressData();
        });
      } else if (loggedInUserRole === 'mentor') {
        // Mentor can view progress for students in their courses
        if (course.mentorId !== loggedInUserId) {
          return res.status(403).json({ message: "Access denied: Mentor can only view progress for their own courses" });
        }
        // Check if student is in course
        if (req.query.studentId) {
          db.get("SELECT * FROM course_students WHERE courseId = ? AND studentId = ?", [courseId, targetStudentId], (err, enrollment) => {
            if (err || !enrollment) {
              return res.status(403).json({ message: "Access denied: Specified student is not enrolled in this course" });
            }
            fetchProgressData();
          });
        } else {
          fetchProgressData();
        }
      } else if (loggedInUserRole === 'admin') {
        // Admin can view any progress
        db.get("SELECT * FROM users WHERE id = ? AND role = 'student'", [targetStudentId], (err, student) => {
          if (err || !student) {
            return res.status(404).json({ message: "Student not found or not a student" });
          }
          fetchProgressData();
        });
      }

      function fetchProgressData() {
        // Get all progress for this student and course
        db.all("SELECT * FROM progress WHERE studentId = ? AND courseId = ?", [targetStudentId, courseId], (err, progressRecords) => {
          if (err) {
            return res.status(500).json({ message: "Server error", error: err.message });
          }

          // Get total content items in the course (chapters + materials + assessments)
          db.get("SELECT COUNT(*) as total FROM chapters WHERE courseId = ?", [courseId], (err, chaptersCount) => {
            if (err) return res.status(500).json({ message: "Server error", error: err.message });

            db.get("SELECT COUNT(*) as total FROM course_materials WHERE courseId = ?", [courseId], (err, materialsCount) => {
              if (err) return res.status(500).json({ message: "Server error", error: err.message });

              db.get("SELECT COUNT(*) as total FROM assessments WHERE courseId = ?", [courseId], (err, assessmentsCount) => {
                if (err) return res.status(500).json({ message: "Server error", error: err.message });

                const totalChapters = chaptersCount?.total || 0;
                const totalMaterials = materialsCount?.total || 0;
                const totalAssessments = assessmentsCount?.total || 0;
                const totalContentItems = totalChapters + totalMaterials + totalAssessments;

                // Calculate completed items by content type
                const completedChapters = (progressRecords || []).filter(p => p.completed && p.contentType === 'chapter').length;
                const completedMaterials = (progressRecords || []).filter(p => p.completed && p.contentType === 'material').length;
                const completedAssessments = (progressRecords || []).filter(p => p.completed && p.contentType === 'assessment').length;
                const totalCompleted = completedChapters + completedMaterials + completedAssessments;

                // Calculate completion percentage (includes all content types)
                const completionPercentage = totalContentItems > 0 ? Math.round((totalCompleted / totalContentItems) * 100) : 0;

                // Separate progress by content type
                const chaptersProgress = (progressRecords || []).filter(p => p.contentType === 'chapter');
                const materialsProgress = (progressRecords || []).filter(p => p.contentType === 'material');
                const assessmentsProgress = (progressRecords || []).filter(p => p.contentType === 'assessment');

                res.json({
                  courseId,
                  progress: progressRecords || [],
                  totalContentItems,
                  totalChapters,
                  totalMaterials,
                  totalAssessments,
                  completedChapters,
                  completedMaterials,
                  completedAssessments,
                  totalCompleted,
                  completionPercentage,
                  chaptersProgress,
                  materialsProgress,
                  assessmentsProgress
                });
              });
            });
          });
        });
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Universal function to mark any content as completed
const markContentCompleted = (req, res) => {
  try {
    const { contentId, contentType, courseId } = req.body;
    const studentId = req.user.userId;

    console.log('📝 markContentCompleted called:', { contentId, contentType, courseId, studentId });

    if (!contentId || !contentType) {
      return res.status(400).json({ message: "contentId and contentType are required" });
    }

    if (!['chapter', 'material', 'assessment'].includes(contentType)) {
      return res.status(400).json({ message: "Invalid contentType. Must be 'chapter', 'material', or 'assessment'" });
    }

    // For materials and assessments, we need courseId from request
    if (!courseId && contentType !== 'chapter') {
      return res.status(400).json({ message: "courseId is required for materials and assessments" });
    }

    let finalCourseId = courseId;

    // Get courseId for chapters
    if (contentType === 'chapter') {
      db.get("SELECT courseId FROM chapters WHERE id = ?", [contentId], (err, chapter) => {
        if (err) {
          return res.status(500).json({ message: "Server error", error: err.message });
        }
        if (!chapter) {
          return res.status(404).json({ message: "Chapter not found" });
        }
        finalCourseId = chapter.courseId;
        checkEnrollmentAndMark();
      });
    } else {
      checkEnrollmentAndMark();
    }

    function checkEnrollmentAndMark() {
      // Check if student is enrolled in the course
      console.log('🔍 Checking enrollment:', { courseId: finalCourseId, studentId });
      
      db.get("SELECT * FROM course_students WHERE courseId = ? AND studentId = ?", [finalCourseId, studentId], (err, enrollment) => {
        console.log('📌 Enrollment check result:', { err, enrollment });
        
        if (!enrollment && contentType !== 'material' && contentType !== 'assessment') {
          // Only require enrollment for chapters
          console.error('❌ Enrollment check failed - not enrolled');
          return res.status(403).json({ message: "Access denied: Not enrolled in this course" });
        }

        // For materials and assessments, allow marking without explicit enrollment 
        // since student can access the course through other means
        if (contentType === 'material' || contentType === 'assessment') {
          console.log('✅ Allowing material/assessment marking without explicit enrollment');
          markAsCompleted();
        } else if (enrollment) {
          // Chapter requires enrollment
          if (contentType === 'chapter') {
            checkSequentialCompletion();
          } else {
            markAsCompleted();
          }
        } else {
          console.error('❌ Enrollment required for this action');
          return res.status(403).json({ message: "Access denied: Not enrolled in this course" });
        }
      });
    }

    function checkSequentialCompletion() {
      // Get all chapters in the course sorted by order
      db.all('SELECT * FROM chapters WHERE courseId = ? ORDER BY "order" ASC', [finalCourseId], (err, allChapters) => {
        if (err) {
          return res.status(500).json({ message: "Server error", error: err.message });
        }

        // Find the index of the chapter to complete
        const chapterIndex = allChapters.findIndex(c => c.id === contentId);
        if (chapterIndex === -1) {
          return res.status(404).json({ message: "Chapter not found in course" });
        }

        // Check sequential completion: all previous chapters must be completed
        let checkCount = 0;
        let allPreviousCompleted = true;

        if (chapterIndex === 0) {
          // First chapter can always be marked
          markAsCompleted();
        } else {
          for (let i = 0; i < chapterIndex; i++) {
            const prevChapter = allChapters[i];
            db.get("SELECT * FROM progress WHERE studentId = ? AND contentId = ? AND contentType = 'chapter' AND completed = 1", [studentId, prevChapter.id], (err, prevProgress) => {
              checkCount++;
              if (err || !prevProgress) {
                allPreviousCompleted = false;
              }
              
              if (checkCount === chapterIndex) {
                if (!allPreviousCompleted) {
                  return res.status(400).json({ message: "Cannot complete this chapter. All previous chapters must be completed first." });
                }
                markAsCompleted();
              }
            });
          }
        }
      });
    }

    function markAsCompleted() {
      const now = new Date().toISOString();
      console.log('🎯 markAsCompleted called for:', { contentId, contentType, studentId, finalCourseId });

      // Check if already completed
      db.get("SELECT * FROM progress WHERE studentId = ? AND contentId = ? AND contentType = ?", [studentId, contentId, contentType], (err, existingProgress) => {
        console.log('📊 Existing progress check:', { err, exists: !!existingProgress });
        
        if (err) {
          return res.status(500).json({ message: "Server error", error: err.message });
        }

        if (existingProgress && existingProgress.completed) {
          console.warn('⚠️ Already completed');
          return res.status(400).json({ message: `${contentType} already completed` });
        }

        const completedAt = now;
        const metadata = req.body.metadata ? JSON.stringify(req.body.metadata) : null;

        if (!existingProgress) {
          // Insert new progress record
          console.log('➕ Inserting new progress record');
          db.run(
            "INSERT INTO progress (studentId, courseId, contentType, contentId, completed, completedAt, metadata) VALUES (?, ?, ?, ?, 1, ?, ?)",
            [studentId, finalCourseId, contentType, contentId, completedAt, metadata],
            function(err) {
              console.log('✅ INSERT result:', { err, lastID: this.lastID });
              
              if (err && err.message.includes('UNIQUE')) {
                return res.status(400).json({ message: "Progress already exists for this student and content" });
              }
              if (err) {
                console.error('❌ Insert error:', err);
                return res.status(500).json({ message: "Server error", error: err.message });
              }

              const newId = this.lastID;
              db.get("SELECT * FROM progress WHERE id = ?", [newId], (err, progress) => {
                console.log('🔎 Fetched inserted record:', { err, progress });
                
                if (err) {
                  return res.status(500).json({ message: "Server error", error: err.message });
                }

                // Check if course is completed (only based on chapters)
                if (contentType === 'chapter') {
                  checkCourseCompletion();
                }

                res.json({ message: `${contentType} marked as completed`, progress });
              });
            }
          );
        } else {
          // Update existing progress record
          console.log('🔄 Updating existing progress record');
          db.run(
            "UPDATE progress SET completed = 1, completedAt = ?, metadata = ? WHERE id = ?",
            [completedAt, metadata, existingProgress.id],
            (err) => {
              console.log('✅ UPDATE result:', { err });
              
              if (err) {
                console.error('❌ Update error:', err);
                return res.status(500).json({ message: "Server error", error: err.message });
              }

              if (contentType === 'chapter') {
                checkCourseCompletion();
              }

              res.json({ message: `${contentType} marked as completed`, progress: existingProgress });
            }
          );
        }
      });
    }

    function checkCourseCompletion() {
      // Check if all chapters are completed
      db.get("SELECT COUNT(*) as total FROM chapters WHERE courseId = ?", [finalCourseId], (err, chaptersCount) => {
        if (err) return;

        db.get("SELECT COUNT(*) as completed FROM progress WHERE studentId = ? AND courseId = ? AND contentType = 'chapter' AND completed = 1", [studentId, finalCourseId], (err, completedCount) => {
          if (err) return;

          const totalChapters = chaptersCount?.total || 0;
          const completedChapters = completedCount?.completed || 0;

          if (totalChapters > 0 && completedChapters === totalChapters) {
            // Check if certificate already exists
            db.get("SELECT * FROM certificates WHERE studentId = ? AND courseId = ?", [studentId, finalCourseId], (err, existingCert) => {
              if (err) return;

              if (!existingCert) {
                // Create certificate (simplified - just record the certificate)
                const issuedAt = new Date().toISOString();
                db.run(
                  "INSERT INTO certificates (studentId, courseId, issuedAt) VALUES (?, ?, ?)",
                  [studentId, finalCourseId, issuedAt],
                  (err) => {
                    if (err) {
                      console.error('Error creating certificate:', err);
                    }
                  }
                );
              }
            });

            // Emit socket event for real-time updates
            if (req.io) {
              req.io.emit("course-progress-updated", {
                courseId: finalCourseId,
                studentId,
                completedChapters,
                totalChapters,
                completionPercentage: totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0
              });
            }
          }
        });
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Legacy function for backward compatibility
const markChapterCompleted = (req, res) => {
  try {
    const { chapterId } = req.body;
    
    // Call the generic function with contentType set to 'chapter'
    req.body.contentId = chapterId;
    req.body.contentType = 'chapter';
    
    return markContentCompleted(req, res);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get progress for all students in mentor's courses
const getMentorProgress = (req, res) => {
  try {
    const mentorId = req.user.userId;

    // Get all courses by mentor
    db.all("SELECT * FROM courses WHERE mentorId = ?", [mentorId], (err, courses) => {
      if (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
      }

      if (!courses || courses.length === 0) {
        return res.json([]);
      }

      const progressData = [];
      let coursesProcessed = 0;

      courses.forEach(course => {
        // Get students assigned to this course
        db.all("SELECT u.id, u.name, u.email FROM users u JOIN course_students cs ON u.id = cs.studentId WHERE cs.courseId = ? AND u.role = 'student'", [course.id], (err, students) => {
          if (err) {
            coursesProcessed++;
            if (coursesProcessed === courses.length) {
              return res.json(progressData);
            }
            return;
          }

          if (!students || students.length === 0) {
            coursesProcessed++;
            if (coursesProcessed === courses.length) {
              return res.json(progressData);
            }
            return;
          }

          let studentsProcessed = 0;

          students.forEach(student => {
            // Get progress for this student in this course
            db.all("SELECT * FROM progress WHERE studentId = ? AND courseId = ?", [student.id, course.id], (err, progress) => {
              if (err) {
                studentsProcessed++;
              } else {
                // Get total chapters, materials, and assessments in the course
                db.get("SELECT COUNT(*) as total FROM chapters WHERE courseId = ?", [course.id], (err, chaptersCount) => {
                  const totalChapters = chaptersCount?.total || 0;

                  db.get("SELECT COUNT(*) as total FROM course_materials WHERE courseId = ?", [course.id], (err, materialsCount) => {
                    const totalMaterials = materialsCount?.total || 0;

                    db.get("SELECT COUNT(*) as total FROM assessments WHERE courseId = ?", [course.id], (err, assessmentsCount) => {
                      const totalAssessments = assessmentsCount?.total || 0;

                      // Calculate completion for each content type
                      const completedChapters = (progress || []).filter(p => p.completed && p.contentType === 'chapter').length;
                      const completedMaterials = (progress || []).filter(p => p.completed && p.contentType === 'material').length;
                      const completedAssessments = (progress || []).filter(p => p.completed && p.contentType === 'assessment').length;
                      
                      // Calculate overall completion percentage
                      const totalItems = totalChapters + totalMaterials + totalAssessments;
                      const totalCompleted = completedChapters + completedMaterials + completedAssessments;
                      const completionPercentage = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

                      progressData.push({
                        student: {
                          id: student.id,
                          name: student.name,
                          email: student.email
                        },
                        course: {
                          id: course.id,
                          title: course.title
                        },
                        progress: {
                          // Chapter progress
                          completedChapters,
                          totalChapters,
                          // Material progress
                          completedMaterials,
                          totalMaterials,
                          // Assessment progress
                          completedAssessments,
                          totalAssessments,
                          // Overall progress
                          totalItems,
                          totalCompleted,
                          completionPercentage,
                          // Detailed breakdown
                          details: progress || [],
                          progressBreakdown: {
                            chapters: {
                              completed: completedChapters,
                              total: totalChapters,
                              percentage: totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0
                            },
                            materials: {
                              completed: completedMaterials,
                              total: totalMaterials,
                              percentage: totalMaterials > 0 ? Math.round((completedMaterials / totalMaterials) * 100) : 0
                            },
                            assessments: {
                              completed: completedAssessments,
                              total: totalAssessments,
                              percentage: totalAssessments > 0 ? Math.round((completedAssessments / totalAssessments) * 100) : 0
                            }
                          }
                        }
                      });

                      studentsProcessed++;
                      if (studentsProcessed === students.length) {
                        coursesProcessed++;
                        if (coursesProcessed === courses.length) {
                          return res.json(progressData);
                        }
                      }
                    });
                  });
                });
              }
            });
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


module.exports = {
  getProgress,
  markContentCompleted,
  markChapterCompleted,
  getMentorProgress
};
