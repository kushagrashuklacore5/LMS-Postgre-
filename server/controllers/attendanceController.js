const db = require('../config/database-switch');
const { all, run, withTransaction } = require('../helpers/dbAsync');
const { authorizeClassroom } = require('../helpers/teachingScope');
const ExcelJS = require('exceljs');



/* ================= MARK ATTENDANCE ================= */
// The values the attendance table accepts
const ATTENDANCE_STATUSES = ['present', 'absent'];

// One day's register for one classroom. The teacher must work in that classroom and every
// student named must be in it. The day is replaced inside a single transaction, so a failure
// cannot leave the register half written (the old version deleted the day first and then
// inserted row by row without waiting).
const markAttendance = async (req, res) => {
  try {
    const { classroomId, date, attendanceData } = req.body || {};
    const day = new Date(date);

    if (!classroomId || !date || Number.isNaN(day.getTime()) || !Array.isArray(attendanceData)) {
      return res.status(400).json({ message: "Invalid attendance data" });
    }

    if (day.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Attendance cannot be marked for a future date" });
    }

    await authorizeClassroom(req, classroomId);

    const members = new Set(
      (await all('SELECT studentId FROM student_classroom_assignment WHERE classroomId = ?', [classroomId])).map((row) => String(row.studentId))
    );
    const register = new Map();
    for (const item of attendanceData) {
      const status = typeof item?.status === 'string' ? item.status.trim().toLowerCase() : '';
      if (!ATTENDANCE_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Attendance status must be present or absent" });
      }
      if (!members.has(String(item?.studentId))) {
        return res.status(400).json({ message: "Attendance can only be marked for students of this classroom" });
      }
      register.set(String(item.studentId), status); // one entry per student per day
    }

    const attendanceDate = day.toISOString().split('T')[0];
    const markedBy = req.user.userId;

    await withTransaction(async () => {
      await run('DELETE FROM attendance WHERE classroomId = ? AND DATE(date) = ?', [classroomId, attendanceDate]);
      for (const [studentId, status] of register) {
        await run('INSERT INTO attendance (classroomId, studentId, date, status, markedBy) VALUES (?, ?, ?, ?, ?)', [
          classroomId, studentId, attendanceDate, status, markedBy,
        ]);
      }
    });

    res.json({ message: "Attendance marked successfully", count: register.size });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Error marking attendance:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET ATTENDANCE ================= */
const getAttendance = async (req, res) => {
  try {
    const { classroomId, date } = req.query;

    if (!classroomId || !date) {
      return res.status(400).json({ message: "ClassroomId and date are required" });
    }

    const attendanceDate = new Date(date).toISOString().split('T')[0];

    db.all(
      `SELECT * FROM attendance WHERE classroomId = ? AND DATE(date) = ?`,
      [classroomId, attendanceDate],
      (err, attendance) => {
        if (err) {
          console.error("Error fetching attendance:", err);
          return res.status(500).json({ message: "Database error" });
        }

        res.json(attendance || []);
      }
    );
  } catch (error) {
    console.error("Error getting attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT ATTENDANCE ================= */
const getStudentAttendance = async (req, res) => {
  try {
    const studentId = req.user.userId;

      db.all(
        `SELECT a.*, c.name as classroomName, c.grade
         FROM attendance a
         LEFT JOIN classrooms c ON a.classroomId = c.id
         WHERE a.studentId = ?
         ORDER BY a.date DESC`,
        [studentId],
        (err, attendance) => {
        if (err) {
          console.error("Error fetching student attendance:", err);
          return res.status(500).json({ message: "Database error" });
        }

        res.json(attendance || []);
      }
    );
  } catch (error) {
    console.error("Error getting student attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= DOWNLOAD ATTENDANCE EXCEL ================= */
const downloadAttendanceExcel = async (req, res) => {
  try {
    const { classroomId, startDate, endDate } = req.query;

    if (!classroomId) {
      return res.status(400).json({ message: "Classroom ID is required" });
    }

    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    db.all(
      `SELECT
        a.date,
        u.id as studentId,
        u.name as studentName,
        u.email as studentEmail,
        a.status,
        c.name as classroomName,
        c.grade,
        c.section
       FROM attendance a
       LEFT JOIN users u ON a.studentId = u.id
       LEFT JOIN classrooms c ON a.classroomId = c.id
       WHERE a.classroomId = ? AND DATE(a.date) BETWEEN ? AND ?
       ORDER BY a.date DESC, u.name`,
      [classroomId, start, end],
      async (err, attendance) => {
        if (err) {
          console.error("Error fetching attendance for download:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!attendance || attendance.length === 0) {
          return res.status(400).json({ message: "No attendance records found for this period" });
        }

        try {
          // Get classroom details
          const classroom = attendance[0];

          // Group attendance by date
          const groupedByDate = {};
          attendance.forEach(record => {
            const date = record.date;
            if (!groupedByDate[date]) {
              groupedByDate[date] = [];
            }
            groupedByDate[date].push(record);
          });

          // Create a new workbook
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Attendance');

          // Add title and header info
          let rowNum = 1;
          worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
          const titleCell = worksheet.getCell(`A${rowNum}`);
          titleCell.value = `Attendance Report - ${classroom.classroomName} (Grade ${classroom.grade})`;
          titleCell.font = { bold: true, size: 14 };
          titleCell.alignment = { horizontal: 'center' };

          rowNum++;
          worksheet.mergeCells(`A${rowNum}:D${rowNum}`);
          const dateRangeCell = worksheet.getCell(`A${rowNum}`);
          dateRangeCell.value = `From: ${start} To: ${end}`;
          dateRangeCell.font = { italic: true };
          dateRangeCell.alignment = { horizontal: 'center' };

          rowNum += 2;

          // Add headers
          const headers = ['Date', 'Student Name', 'Email', 'Status'];
          const headerRow = worksheet.addRow(headers);
          headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
          headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

          // Add data rows
          const sortedDates = Object.keys(groupedByDate).sort().reverse();
          sortedDates.forEach(date => {
            groupedByDate[date].forEach((record) => {
              const dataRow = worksheet.addRow([
                date,
                record.studentName,
                record.studentEmail,
                record.status.charAt(0).toUpperCase() + record.status.slice(1)
              ]);

              // Style status cell
              const statusCell = dataRow.getCell(4);
              if (record.status.toLowerCase() === 'present') {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                statusCell.font = { color: { argb: 'FF006100' } };
              } else if (record.status.toLowerCase() === 'absent') {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                statusCell.font = { color: { argb: 'FF9C0006' } };
              }
            });
          });

          // Set column widths
          worksheet.columns = [
            { width: 12 },  // Date
            { width: 20 },  // Student Name
            { width: 25 },  // Email
            { width: 12 }   // Status
          ];

          // Generate buffer and send
          const buffer = await workbook.xlsx.writeBuffer();

          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="attendance-${classroom.classroomName}-${start}.xlsx"`);
          res.send(buffer);
        } catch (excelError) {
          console.error("Error generating Excel file:", excelError);
          res.status(500).json({ message: "Error generating Excel file", error: excelError.message });
        }
      }
    );
  } catch (error) {
    console.error("Error downloading attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  markAttendance,
  getAttendance,
  getStudentAttendance,
  downloadAttendanceExcel,
};
