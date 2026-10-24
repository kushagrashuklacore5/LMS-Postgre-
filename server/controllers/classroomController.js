const db = require('../config/database-switch');
const { get } = require('../helpers/dbAsync');
const dbGet = get;
const { enrollStudentInClassroom, studentsWithAClassroom, ClassroomConflictError } = require('../helpers/classroomEnrollment');
const { HttpError, CLASSROOM_ACCESS_SQL, getTeachingScope } = require('../helpers/teachingScope');
const { teacherRunsClassroom } = require('../helpers/schoolScope');



/* ================= DEBUG: CREATE TEST ASSIGNMENT ================= */
const createTestAssignment = async (req, res) => {
  try {
    console.log("DEBUG: Creating test classroom assignment");
    
    const universityId = req.user?.universityId;
    // Create a test classroom first
    db.run(`
      INSERT INTO classrooms (university_id, name, grade, section, classTeacher, studentCount)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [universityId, "Test Classroom", "1", "A", req.user.userId, 0], function(err) {
      if (err) {
        console.error("DEBUG: Error creating test classroom:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      
      const classroomId = this.lastID;
      console.log("DEBUG: Test classroom created with ID:", classroomId);
      
      // Create assignment
      db.run(`
        INSERT INTO classroomAssignments (classroomId, teacherId, role)
        VALUES (?, ?, 'class_teacher')
      `, [classroomId, req.user.userId], (err) => {
        if (err) {
          console.error("DEBUG: Error creating test assignment:", err);
          return res.status(500).json({ message: 'Database error' });
        }
        
        console.log("DEBUG: Test assignment created successfully");
        res.json({ 
          message: 'Test assignment created successfully',
          classroomId,
          teacherId: req.user.userId
        });
      });
    });
  } catch (error) {
    console.error("DEBUG: Create test assignment error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET ASSIGNED CLASSROOMS FOR TEACHER ================= */
const getAssignedClassrooms = async (req, res) => {
  try {
    // Get user ID - handle both authenticated and default users
    const role = req.user?.role;
    if (!req.user?.userId || !["admin", "mentor", "teacher"].includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    // Admin: every classroom of the school (list below). Teacher: only assigned classrooms.
    let teacherId = role === "admin" ? null : req.user.userId;
    
    
    // If no user or invalid ID, fallback to fetching all classrooms
    if (!teacherId || teacherId === "default_user") {
      console.log("GET ASSIGNED CLASSROOMS - No valid teacherId, returning all classrooms");
      
      const universityId = req.user?.universityId;
      db.all(`
        SELECT 
          c.id,
          c.name,
          c.grade,
          c.section,
          c.classTeacher,
          c.studentCount,
          c.createdAt,
          u.name as classTeacherName,
          'class_teacher' as role
        FROM classrooms c
        LEFT JOIN users u ON c.classTeacher = CAST(u.id AS TEXT)
        WHERE c.university_id = ?
        ORDER BY c.createdAt DESC
      `, [universityId], (err, classrooms) => {
        if (err) {
          console.error("❌ Database error in getAssignedClassrooms (fallback):", err);
          console.error("❌ Error message:", err.message);
          return res.status(500).json({ message: 'Database error', error: err.message });
        }
        
        const formattedClassrooms = classrooms.map(classroom => {
          const { classTeacherName, ...classroomData } = classroom;
          return {
            ...classroomData,
            classTeacher: classroom.classTeacher ? {
              id: classroom.classTeacher,
              name: classroom.classTeacherName
            } : null
          };
        });
        
        res.json({
          success: true,
          data: formattedClassrooms || []
        });
      });
    } else {
      // Get classrooms assigned to this specific teacher
      console.log("GET ASSIGNED CLASSROOMS - Getting classrooms for teacher:", teacherId);
      
      db.all(`
        SELECT
          c.id as classroomId,
          CASE WHEN c.classTeacher = CAST(? AS TEXT) OR c.classTeacherId = ?
                 OR EXISTS (SELECT 1 FROM classroomAssignments ca WHERE ca.classroomId = c.id AND ca.teacherId = ? AND ca.role = 'class_teacher')
               THEN 'class_teacher' ELSE 'course_teacher' END as role,
          c.id,
          c.name,
          c.grade,
          c.section,
          c.classTeacher,
          c.studentCount,
          c.createdAt,
          u.name as classTeacherName
        FROM classrooms c
        LEFT JOIN users u ON c.classTeacher = CAST(u.id AS TEXT)
        WHERE c.university_id = ? AND ${CLASSROOM_ACCESS_SQL}
        ORDER BY c.createdAt DESC
      `, [teacherId, teacherId, teacherId, req.user.universityId, teacherId, teacherId, teacherId, teacherId], (err, assignments) => {
        if (err) {
          console.error("❌ Database error in getAssignedClassrooms (teacher):", err);
          console.error("❌ Error message:", err.message);
          return res.status(500).json({ message: 'Database error', error: err.message });
        }
        
        const formattedClassrooms = assignments.map(assignment => {
          const { classTeacherName, ...assignmentData } = assignment;
          return {
            ...assignmentData,
            classTeacher: assignment.classTeacher ? {
              id: assignment.classTeacher,
              name: assignment.classTeacherName
            } : null
          };
        });
        
        console.log("GET ASSIGNED CLASSROOMS - Found assignments:", formattedClassrooms);
        res.json({
          success: true,
          data: formattedClassrooms || []
        });
      });
    }
  } catch (error) {
    console.error("❌ GET ASSIGNED CLASSROOMS - Catch block error:", error);
    console.error("❌ Error message:", error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/* ================= GET SINGLE CLASSROOM ================= */
const getSingleClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    const universityId = req.user?.universityId;
    
    console.log("GET SINGLE CLASSROOM - ID:", id, "University:", universityId);
    
    db.get(`
      SELECT 
        c.id,
        c.name,
        c.grade,
        c.section,
        c.classTeacher,
        c.studentCount,
        c.createdAt,
        u.name as classTeacherName
      FROM classrooms c
      LEFT JOIN users u ON c.classTeacher = CAST(u.id AS TEXT)
      WHERE c.id = ? AND c.university_id = ?
    `, [id, universityId], (err, classroom) => {
      if (err) {
        console.error("❌ Database error in getSingleClassroom:", err);
        console.error("❌ Error message:", err.message);
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      
      if (!classroom) {
        console.log("GET SINGLE CLASSROOM - Classroom not found");
        return res.status(404).json({ message: 'Classroom not found' });
      }
      
      const formattedClassroom = {
        ...classroom,
        classTeacher: classroom.classTeacher ? {
          id: classroom.classTeacher,
          name: classroom.classTeacherName
        } : null
      };
      
      res.json(formattedClassroom);
    });
  } catch (error) {
    console.error("❌ GET SINGLE CLASSROOM - Error:", error);
    console.error("❌ Error message:", error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/* ================= GET ALL CLASSROOMS ================= */
const getAllClassrooms = async (req, res) => {
  try {
    console.log("GET ALL CLASSROOMS - Request received");
    
    const universityId = req.user?.universityId;
    console.log(`🏫 GET ALL CLASSROOMS - University ID: ${universityId}`);
    
    db.all(`
      SELECT 
        c.id,
        c.university_id,
        c.name,
        c.grade,
        c.section,
        c.classTeacher,
        c.studentCount,
        c.createdAt,
        u.name as classTeacherName
      FROM classrooms c
      LEFT JOIN users u ON c.classTeacher = CAST(u.id AS TEXT)
      WHERE c.university_id = ?
      ORDER BY c.createdAt DESC
    `, [universityId], (err, classrooms) => {
      if (err) {
        console.error("❌ Database error in getAllClassrooms:", err);
        console.error("❌ Error code:", err.code);
        console.error("❌ Error message:", err.message);
        console.error("❌ Error stack:", err.stack);
        return res.status(500).json({ message: 'Database error', error: err.message });
      }
      
      console.log(`🏫 GET ALL CLASSROOMS - Found ${classrooms?.length || 0} classrooms for university ${universityId}:`, classrooms?.map(c => ({ id: c.id, name: c.name, university_id: c.university_id })));
      
      // Format the response to include classTeacher as object
      const formattedClassrooms = classrooms.map(classroom => {
        const { classTeacherName, ...classroomData } = classroom;
        return {
          ...classroomData,
          classTeacher: classroom.classTeacher ? {
            id: classroom.classTeacher,
            name: classroom.classTeacherName
          } : null
        };
      });
      
      console.log("GET ALL CLASSROOMS - Found classrooms:", formattedClassrooms);
      res.json({
        success: true,
        data: formattedClassrooms || []
      });
    });
  } catch (error) {
    console.error("❌ GET ALL CLASSROOMS - Catch block error:", error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/* ================= CREATE CLASSROOM ================= */
const createClassroom = async (req, res) => {
  try {
    
    const { grade, section, classTeacherId, studentIds } = req.body;

    if (!grade) {
      console.log("CREATE CLASSROOM - Grade missing");
      return res.status(400).json({ message: 'Grade is required' });
    }

    if (!section) {
      console.log("CREATE CLASSROOM - Section missing");
      return res.status(400).json({ message: 'Section is required' });
    }

    console.log("CREATE CLASSROOM - Processing grade:", grade);

    const className = String(grade).trim();
    const sectionName = String(section).trim();
    if (!className || !sectionName || className.length > 50 || sectionName.length > 50) {
      return res.status(400).json({ message: 'Class and section must be between 1 and 50 characters' });
    }

    // Every class has a class teacher: an approved teacher of this school
    if (!classTeacherId) {
      return res.status(400).json({ message: 'Class teacher is required' });
    }
    const classTeacherOk = await get(
      `SELECT id FROM users WHERE id = ? AND university_id = ? AND role IN ('mentor', 'teacher') AND isApproved = 1`,
      [Number(classTeacherId), req.user?.universityId]
    );
    if (!classTeacherOk) {
      return res.status(400).json({ message: 'Choose a teacher of this school as class teacher' });
    }

    const duplicate = await get(
      `SELECT id, name, grade, section FROM classrooms
       WHERE university_id = ? AND LOWER(TRIM(grade)) = LOWER(?) AND LOWER(TRIM(COALESCE(section, ''))) = LOWER(?)`,
      [req.user?.universityId, className, sectionName]
    );
    if (duplicate) {
      return res.status(409).json({
        message: `${duplicate.name} already exists`,
        classroom: duplicate,
      });
    }

    // One classroom per student: checked before the classroom is created, so nothing is half-done
    const alreadyPlaced = await studentsWithAClassroom(Array.isArray(studentIds) ? studentIds : []);
    if (alreadyPlaced.length) {
      return res.status(409).json({
        message: `${alreadyPlaced.length} selected student(s) are already in a classroom. Use "Change class" to move them, or leave them out.`,
        code: 'STUDENT_IN_OTHER_CLASSROOM',
        students: alreadyPlaced.map((p) => ({ studentId: p.studentId, classroom: { id: p.id, name: p.name } })),
      });
    }

    // Determine fee structure category based on grade
    const gradeNum = parseInt(grade);
    const feeCategory = gradeNum >= 1 && gradeNum <= 4 ? 'Primary' : 'Secondary';
    
    console.log("CREATE CLASSROOM - Grade:", grade, "Fee Category:", feeCategory);

    // Get fee structure for the category (don't fail hard if table/migration missing)
    const universityId = req.user?.universityId;
    db.get(
      `SELECT * FROM feeStructures WHERE category = ? AND university_id = ?`,
      [feeCategory, universityId],
      (err, feeStructure) => {
        if (err) {
          console.warn("CREATE CLASSROOM - Fee structure lookup failed, continuing without fees:", err.message || err);
          feeStructure = null; // proceed without fee structure
        }

        console.log("CREATE CLASSROOM - Fee structure:", feeStructure);

        // Create classroom name
        // "Grade 10 - A" for numbered grades, "BSc - A" for named classes
        const classroomName = /^\d+$/.test(className) ? `Grade ${className} - ${sectionName}` : `${className} - ${sectionName}`;

        // Use the classTeacherId directly from the request
        let teacherIdToAssign = classTeacherId ? parseInt(classTeacherId, 10) : null;
        
        if (Number.isNaN(teacherIdToAssign)) {
          teacherIdToAssign = null;
        }

        console.log("CREATE CLASSROOM - teacherIdToAssign:", teacherIdToAssign);

        // Insert classroom into database
        db.run(
          `INSERT INTO classrooms (university_id, name, grade, section, classTeacher, studentCount) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            universityId,
            classroomName,
            grade,
            section,
            teacherIdToAssign,
            studentIds ? studentIds.length : 0
          ],
          function(err) {
            if (err) {
              console.error("Error creating classroom:", err);
              return res.status(500).json({ message: 'Error creating classroom' });
            }

            // SAVE classroomId from this context before using in nested callbacks
            const classroomId = this.lastID;

            const classroom = {
              id: classroomId,
              name: classroomName,
              grade,
              section,
              classTeacher: teacherIdToAssign,
              studentCount: studentIds ? studentIds.length : 0,
              feeStructure: feeStructure || null,
              feeCategory: feeCategory
            };

        console.log("CREATE CLASSROOM - Classroom created:", classroom);

        // Create classroom assignment if a teacher id is provided
        if (teacherIdToAssign) {
          console.log("CREATE CLASSROOM - Creating assignment for teacher id:", teacherIdToAssign, "Classroom ID:", classroomId);
          db.run(`
            INSERT INTO classroomAssignments (classroomId, teacherId, role)
            VALUES (?, ?, 'class_teacher')
          `, [classroomId, teacherIdToAssign], (err) => {
            if (err) {
              console.error("Error creating classroom assignment:", err);
            } else {
              console.log("CREATE CLASSROOM - Class teacher assigned successfully");
            }
          });
        } else {
          console.log("CREATE CLASSROOM - No class teacher provided");
        }

        // ASSIGN STUDENTS TO CLASSROOM (KEY FIX)
        const validStudentIds = (studentIds && Array.isArray(studentIds)) 
          ? studentIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
          : [];

        if (validStudentIds.length > 0) {
          console.log("CREATE CLASSROOM - Assigning students to classroom:", validStudentIds);
          
          let completed = 0;
          validStudentIds.forEach(studentId => {
            db.run(
              `INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?) ON CONFLICT DO NOTHING`,
              [studentId, classroomId],
              (err) => {
                if (err) {
                  console.error(`Error assigning student ${studentId} to classroom:`, err);
                }
                
                // Update student grade
                db.run(`UPDATE students SET grade = ? WHERE userId = ?`, [grade, studentId]);

                completed++;
                if (completed === validStudentIds.length) {
                  sendResponse();
                }
              }
            );
          });
        } else {
          sendResponse();
        }

        function sendResponse() {
          console.log("CREATE CLASSROOM - Sending success response");
          res.status(201).json({
            message: 'Classroom created successfully',
            data: {
              classroom: {
                id: classroomId,
                name: classroom.name,
                grade: classroom.grade,
                section: classroom.section,
                classTeacher: classroom.classTeacher,
                studentCount: validStudentIds.length,
                feeStructure: classroom.feeStructure,
                feeCategory: classroom.feeCategory
              },
              feeApplied: feeStructure ? true : false,
              studentsAssigned: validStudentIds.length
            }
          });
        }
      });
    });
  } catch (error) {
    console.error("CREATE CLASSROOM - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= FEE AMOUNTS ================= */
const FEE_FIELDS = ['tuitionFee', 'transportFee', 'computerLabFee', 'libraryFee', 'sportsFee', 'examinationFee', 'miscellaneousFee'];
const MAX_FEE = 100000000;

// Reads the fee parts from a request. Each part must be a number from 0 upwards; the
// total is always their sum, whatever total the browser sent.
const readFeeAmounts = (body) => {
  const amounts = {};
  for (const field of FEE_FIELDS) {
    const raw = body[field];
    const value = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > MAX_FEE) {
      return { error: `${field} must be a number from 0 upwards` };
    }
    amounts[field] = value;
  }
  amounts.totalFee = FEE_FIELDS.reduce((sum, field) => sum + amounts[field], 0);
  if (amounts.totalFee <= 0) return { error: 'At least one fee amount is required' };
  return { amounts };
};

/* ================= SAVE FEE STRUCTURE ================= */
const saveFeeStructure = async (req, res) => {
  try {
    const { category, grade, dueDate, installmentOptions } = req.body;

    if (!category) {
      console.log('SAVE FEE STRUCTURE - Category missing');
      return res.status(400).json({ message: 'Category is required' });
    }
    if (!['Primary', 'Secondary'].includes(category)) {
      return res.status(400).json({ message: 'Category must be Primary or Secondary' });
    }
    const { amounts, error: amountError } = readFeeAmounts(req.body);
    if (amountError) return res.status(400).json({ message: amountError });
    const { tuitionFee, transportFee, computerLabFee, libraryFee, sportsFee, examinationFee, miscellaneousFee, totalFee } = amounts;
    // Class first: fees are charged to students of classes, so the school needs a class
    const anyClass = await new Promise((resolve) =>
      db.get('SELECT 1 AS ok FROM classrooms WHERE university_id = ? LIMIT 1', [req.user?.universityId], (err, row) => resolve(!err && !!row)));
    if (!anyClass) {
      return res.status(400).json({ message: 'Create a class first (Classrooms), then its fee structure.' });
    }

    const installmentJson = typeof installmentOptions === 'object' ? JSON.stringify(installmentOptions) : (installmentOptions || null);

    // Check if fee structure already exists for this category
    const universityId = req.user?.universityId;
    db.get(`
      SELECT * FROM feeStructures WHERE category = ? AND university_id = ?
    `, [category, universityId], (err, existing) => {
      if (err) {
        console.error("Error checking existing fee structure:", err);
        return res.status(500).json({ message: 'Database error: ' + err.message });
      }

      if (existing) {
        console.log('SAVE FEE STRUCTURE - Structure already exists for category:', category);
        return res.status(400).json({ message: `Fee structure for ${category} already exists. Use edit to modify it.` });
      }

      console.log('SAVE FEE STRUCTURE - Inserting new structure for:', category);
      // Insert new fee structure
      db.run(`
        INSERT INTO feeStructures 
        (university_id, category, grade, tuitionFee, transportFee, computerLabFee, libraryFee, sportsFee, examinationFee, miscellaneousFee, totalFee, dueDate, installmentOptions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        universityId,
        category,
        grade || (category === 'Primary' ? '1-4' : '5-12'),
        tuitionFee || 0,
        transportFee || 0,
        computerLabFee || 0,
        libraryFee || 0,
        sportsFee || 0,
        examinationFee || 0,
        miscellaneousFee || 0,
        totalFee || 0,
        dueDate,
        installmentJson
      ], function(err) {
        if (err) {
          console.error("Error saving fee structure:", err);
          return res.status(500).json({ message: 'Error saving fee structure: ' + err.message });
        }

        console.log('SAVE FEE STRUCTURE - Inserted successfully with ID:', this.lastID);
        
        // Apply fee structure to existing students in respective classrooms
        applyFeeStructureToStudents(category, {
          tuitionFee: tuitionFee || 0,
          transportFee: transportFee || 0,
          computerLabFee: computerLabFee || 0,
          libraryFee: libraryFee || 0,
          sportsFee: sportsFee || 0,
          examinationFee: examinationFee || 0,
          miscellaneousFee: miscellaneousFee || 0,
          totalFee: totalFee || 0
        }, universityId);

        res.status(201).json({
          message: 'Fee structure saved successfully',
          feeStructure: {
            id: this.lastID,
            category,
            grade: grade || (category === 'Primary' ? '1-4' : '5-12'),
            tuitionFee,
            transportFee,
            computerLabFee,
            libraryFee,
            sportsFee,
            examinationFee,
            miscellaneousFee,
            totalFee,
            dueDate
          }
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= APPLY FEE STRUCTURE TO STUDENTS ================= */
const applyFeeStructureToStudents = (category, feeData, universityId) => {
  try {
    const gradeRange = category === 'Primary' ? ['1', '2', '3', '4'] : ['5', '6', '7', '8', '9', '10', '11', '12'];

    // Update students assigned to classrooms in each grade in a safe way:
    // - only students who are assigned to classrooms (student_classroom_assignment) will be updated
    // - pendingFees is calculated as totalFee - feesPaid to preserve payments already recorded
    gradeRange.forEach(grade => {
      const sql = `
        UPDATE students
        SET totalFees = ?, pendingFees = (? - feesPaid)
        WHERE userId IN (
          SELECT sca.studentId FROM student_classroom_assignment sca
          INNER JOIN classrooms c ON sca.classroomId = c.id
          WHERE c.grade = ? AND c.university_id = ?
        )
      `;

      // Only this school's classes: another school's students keep their own fees
      db.run(sql, [feeData.totalFee, feeData.totalFee, grade, universityId], (err) => {
        if (err) {
          console.error(`Error updating fees for grade ${grade}:`, err);
        } else {
          console.log(`Applied ${category} fee structure to grade ${grade} students (assigned to classrooms)`);
        }
      });
    });
  } catch (error) {
    console.error('Error applying fee structure to students:', error);
  }
};

/* ================= UPDATE FEE STRUCTURE ================= */
const updateFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const { dueDate, installmentOptions } = req.body;

    const { amounts, error: amountError } = readFeeAmounts(req.body);
    if (amountError) return res.status(400).json({ message: amountError });
    const { tuitionFee, transportFee, computerLabFee, libraryFee, sportsFee, examinationFee, miscellaneousFee } = amounts;
    const calculatedTotalFee = amounts.totalFee;

    const installmentJson = typeof installmentOptions === 'object' ? JSON.stringify(installmentOptions) : (installmentOptions || null);
    const universityId = req.user?.universityId;
    db.run(`
      UPDATE feeStructures 
      SET tuitionFee = ?, transportFee = ?, computerLabFee = ?, libraryFee = ?, sportsFee = ?, examinationFee = ?, miscellaneousFee = ?, totalFee = ?, dueDate = ?, installmentOptions = ?
      WHERE id = ? AND university_id = ?
    `, [
      tuitionFee || 0,
      transportFee || 0,
      computerLabFee || 0,
      libraryFee || 0,
      sportsFee || 0,
      examinationFee || 0,
      miscellaneousFee || 0,
      calculatedTotalFee,
      dueDate,
      installmentJson,
      id,
      universityId
    ], function(err) {
      if (err) {
        console.error("Error updating fee structure:", err);
        return res.status(500).json({ message: 'Error updating fee structure' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Fee structure not found' });
      }

      // Get the updated fee structure to apply to students
      db.get(`
        SELECT * FROM feeStructures WHERE id = ? AND university_id = ?
      `, [id, universityId], (err, structure) => {
        if (err) {
          console.error("Error fetching updated fee structure:", err);
        } else if (structure) {
          // Apply updated fee structure to students
          applyFeeStructureToStudents(structure.category, {
            tuitionFee: structure.tuitionFee,
            transportFee: structure.transportFee,
            computerLabFee: structure.computerLabFee,
            libraryFee: structure.libraryFee,
            sportsFee: structure.sportsFee,
            examinationFee: structure.examinationFee,
            miscellaneousFee: structure.miscellaneousFee,
            totalFee: structure.totalFee
          }, universityId);
        }
      });

      res.json({
        message: 'Fee structure updated successfully',
        feeStructure: {
          id,
          tuitionFee,
          transportFee,
          computerLabFee,
          libraryFee,
          sportsFee,
          examinationFee,
          miscellaneousFee,
          totalFee: calculatedTotalFee,
          dueDate
        }
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET ALL FEE STRUCTURES ================= */
const getAllFeeStructures = async (req, res) => {
  try {
    const universityId = req.user?.universityId;
    db.all(`
      SELECT * FROM feeStructures WHERE university_id = ? ORDER BY category
    `, [universityId], (err, structures) => {
      if (err) {
        console.error("Error fetching fee structures:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      res.json(structures || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET FEE STRUCTURE BY GRADE ================= */
const getFeeStructureByGrade = async (req, res) => {
  try {
    const { grade } = req.params;

    const universityId = req.user?.universityId;
    db.get(`
      SELECT * FROM feeStructures WHERE grade = ? AND university_id = ?
    `, [parseInt(grade), universityId], (err, feeStructure) => {
      if (err) {
        console.error("Error fetching fee structure:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!feeStructure) {
        return res.status(404).json({ message: 'Fee structure not found for this grade' });
      }

      res.json(feeStructure);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= UPDATE CLASSROOM ================= */
const updateClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    const { className, classTeacher, description } = req.body;

    // For now, just return success since we don't have a classrooms table
    res.json({
      message: 'Classroom updated successfully',
      classroom: {
        id,
        className,
        classTeacher,
        description,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= DELETE CLASSROOM ================= */
const deleteClassroom = async (req, res) => {
  try {
    const { id } = req.params;

    // For now, just return success since we don't have a classrooms table
    res.json({ message: 'Classroom deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET CLASSROOM ANALYTICS ================= */
const getClassroomAnalytics = async (req, res) => {
  try {
    const universityId = req.user?.universityId;
    // Get analytics data
    db.all(`
      SELECT 
        u.name as className,
        u.email as classTeacherEmail,
        COUNT(s.id) as studentCount,
        COUNT(CASE WHEN s.pendingFees > 0 THEN 1 END) as studentsWithPendingFees,
        SUM(s.pendingFees) as totalPendingFees
      FROM users u
      LEFT JOIN students s ON u.id = s.userId
      WHERE u.role = 'mentor' AND u.isApproved = 1 AND u.university_id = ?
      GROUP BY u.id, u.name, u.email
      ORDER BY studentCount DESC
    `, [universityId], (err, analytics) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(analytics || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= ASSIGN STUDENT TO CLASSROOM ================= */
// One classroom per student: a student who is already in another classroom is refused (409);
// moving a student is the admin "Change class" action (adminController.changeStudentClassroom).
const assignStudentToClassroom = async (req, res) => {
  try {
    const { classroomId, studentId } = req.body;
    const universityId = req.user?.universityId;

    if (!classroomId || !studentId) {
      return res.status(400).json({ message: 'Classroom ID and Student ID are required' });
    }

    // Who is in a class is decided by the admin or its class teacher, not by a course teacher
    if (req.user?.role !== 'admin' && !(await teacherRunsClassroom(req.user.userId, classroomId))) {
      return res.status(403).json({ message: 'Only the class teacher or an admin adds students to this class' });
    }

    const classroom = await dbGet('SELECT id FROM classrooms WHERE id = ? AND university_id = ?', [classroomId, universityId]);
    if (!classroom) {
      return res.status(403).json({ message: 'Classroom not found or does not belong to your university' });
    }
    const student = await dbGet("SELECT id FROM users WHERE id = ? AND role = 'student' AND university_id = ?", [studentId, universityId]);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let enrollment;
    try {
      enrollment = await enrollStudentInClassroom(student.id, classroom.id);
    } catch (err) {
      if (err instanceof ClassroomConflictError) {
        return res.status(409).json({ message: err.message, code: err.code, currentClassroom: err.currentClassroom });
      }
      throw err;
    }
    if (enrollment.alreadyEnrolled) {
      return res.status(400).json({ message: 'Student already assigned to this classroom' });
    }

    res.json({
      message: 'Student assigned to classroom successfully',
      studentId,
      classroomId,
      studentCount: enrollment.studentCount
    });
  } catch (error) {
    console.error('Error in assignStudentToClassroom:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET CLASSROOM FEE STRUCTURE ================= */
const getClassroomFeeStructure = async (req, res) => {
  try {
    const { id: classroomId } = req.params;
    const universityId = req.user?.universityId;

    if (!classroomId) {
      return res.status(400).json({ message: 'Classroom ID is required' });
    }

    // First, get the classroom to find its grade
    db.get(
      `SELECT id, name, grade, section FROM classrooms WHERE id = ? AND university_id = ?`,
      [classroomId, universityId],
      (err, classroom) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        if (!classroom) {
          return res.status(404).json({ message: 'Classroom not found' });
        }

        // Determine fee category based on classroom grade
        const gradeNum = parseInt(classroom.grade);
        const feeCategory = gradeNum >= 1 && gradeNum <= 4 ? 'Primary' : 'Secondary';
        
        // Now fetch the fee structure for this classroom's category
        db.get(
          `SELECT 
            tuitionFee,
            transportFee,
            computerLabFee,
            libraryFee,
            sportsFee,
            examinationFee,
            miscellaneousFee,
            totalFee,
            dueDate,
            category,
            installmentOptions
          FROM feeStructures WHERE category = ? AND university_id = ?`,
          [feeCategory, universityId],
          (err, fees) => {
            if (err) {
              console.error("Database error fetching fees:", err);
              return res.status(500).json({ message: 'Database error' });
            }

            // Return classroom info with fee structure (use defaults if not found)
            res.json({
              id: classroom.id,
              name: classroom.name,
              grade: classroom.grade,
              section: classroom.section,
              feeCategory: feeCategory,
              tuitionFee: fees?.tuitionFee || 5000,
              transportFee: fees?.transportFee || 1000,
              computerLabFee: fees?.computerLabFee || 800,
              libraryFee: fees?.libraryFee || 500,
              sportsFee: fees?.sportsFee || 300,
              examinationFee: fees?.examinationFee || 700,
              miscellaneousFee: fees?.miscellaneousFee || 200,
              totalFee: fees?.totalFee || 8050,
              dueDate: fees?.dueDate || '2026-01-31',
              category: fees?.category || feeCategory,
              installmentOptions: fees?.installmentOptions || null
            });
          }
        );
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET STUDENT CLASSROOMS ================= */
const getStudentClassrooms = async (req, res) => {
  try {
    const studentId = req.user?.userId || req.user?.id;
    if (!studentId) {
      return res.status(401).json({ message: 'Student not authenticated' });
    }
    console.log("getStudentClassrooms - Student ID:", studentId);

    const activeDb = req.tenant?.database || db;
    activeDb.all(
      `SELECT 
        c.id,
        c.name,
        c.grade,
        c.section,
        c.classTeacher,
        c.classTeacherId,
        c.studentCount,
        c.timetable,
        u.name as classTeacherName,
        u.email as classTeacherEmail
      FROM classrooms c
      INNER JOIN student_classroom_assignment sca ON c.id = sca.classroomId
      INNER JOIN users s ON s.id = sca.studentId
      LEFT JOIN users u ON (u.id = c.classTeacherId OR (c.classTeacherId IS NULL AND CAST(u.id AS TEXT) = c.classTeacher))
      WHERE sca.studentId = ?
        AND c.university_id = s.university_id`,
      [studentId],
      (err, classrooms) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        console.log("getStudentClassrooms - Found classrooms:", classrooms);

        // Add fee structure information and classTeacher object to each classroom
        const classroomsWithFees = (classrooms || []).map(classroom => {
          const gradeNum = parseInt(classroom.grade);
          const feeCategory = gradeNum >= 1 && gradeNum <= 4 ? 'Primary' : 'Secondary';
          
          return {
            ...classroom,
            _id: classroom.id,
            feeCategory: feeCategory,
            classTeacher: {
              name: classroom.classTeacherName || classroom.classTeacher || "Not Assigned",
              email: classroom.classTeacherEmail || ""
            }
          };
        });

        console.log("getStudentClassrooms - Returning:", classroomsWithFees);
        res.json(classroomsWithFees || []);
      }
    );
  } catch (error) {
    console.error("getStudentClassrooms - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= TEST STUDENT ASSIGNMENT ================= */
const testStudentAssignment = async (req, res) => {
  try {
    const studentId = req.user.userId;
    console.log("testStudentAssignment - Student ID:", studentId);

    // Check if student exists
    db.get("SELECT id, name, email, role FROM users WHERE id = ?", [studentId], (err, student) => {
      if (err) {
        console.error("Error finding student:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!student) {
        return res.status(404).json({ message: 'Student not found', studentId });
      }

      console.log("testStudentAssignment - Found student:", student);

      // Check all classroom assignments
      db.all("SELECT * FROM student_classroom_assignment", [], (err, allAssignments) => {
        if (err) {
          console.error("Error getting all assignments:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        console.log("testStudentAssignment - All assignments:", allAssignments);

        // Check student's specific assignments
        db.all(
          "SELECT sca.*, c.name as classroomName, c.grade, c.section FROM student_classroom_assignment sca LEFT JOIN classrooms c ON sca.classroomId = c.id WHERE sca.studentId = ?",
          [studentId],
          (err, studentAssignments) => {
            if (err) {
              console.error("Error getting student assignments:", err);
              return res.status(500).json({ message: 'Database error' });
            }

            console.log("testStudentAssignment - Student assignments:", studentAssignments);

            res.json({
              student,
              allAssignments,
              studentAssignments,
              message: `Found ${studentAssignments.length} assignments for student`
            });
          }
        );
      });
    });
  } catch (error) {
    console.error("testStudentAssignment - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};
const getClassroomStudents = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const universityId = req.user?.universityId;

    if (!classroomId) {
      return res.status(400).json({ message: 'Classroom ID is required' });
    }

    // The class teacher sees the whole class. A teacher who only teaches a course to the class
    // sees just the students of the class enrolled in their courses.
    const role = req.user?.role;
    const onlyMyCourses = (role === 'mentor' || role === 'teacher')
      && !(await teacherRunsClassroom(req.user.userId, classroomId));

    db.all(`
      SELECT
        u.id,
        u.name,
        u.email,
        s.grade,
        s.rollNumber
      FROM users u
      INNER JOIN student_classroom_assignment sca ON u.id = sca.studentId
      LEFT JOIN students s ON u.id = s.userId
      WHERE sca.classroomId = ? AND u.role = 'student' AND u.university_id = ?
        AND (? = 0 OR EXISTS (SELECT 1 FROM course_students cs JOIN courses co ON co.id = cs.courseId
                              WHERE cs.studentId = u.id AND co.mentorId = ?))
      ORDER BY u.name
    `, [classroomId, universityId, onlyMyCourses ? 1 : 0, req.user?.userId || 0], (err, students) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      // A student may see who is in the class, not how to contact each classmate
      if (req.user?.role === 'student') {
        return res.json((students || []).map(({ email, ...classmate }) => classmate));
      }
      res.json(students || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= TEACHING SCOPE (CLASS -> SECTION -> COURSE) ================= */
// What the signed-in admin/teacher may target: their classrooms with the courses inside each.
const getTeachingScopeTree = async (req, res) => {
  try {
    res.json({ success: true, data: await getTeachingScope(req) });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    console.error("GET TEACHING SCOPE ERROR:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getTeachingScopeTree,
  getAllClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getClassroomAnalytics,
  getFeeStructureByGrade,
  saveFeeStructure,
  updateFeeStructure,
  getAllFeeStructures,
  getSingleClassroom,
  getAssignedClassrooms,
  createTestAssignment,
  assignStudentToClassroom,
  getClassroomFeeStructure,
  getStudentClassrooms,
  getClassroomStudents,
  testStudentAssignment
};
