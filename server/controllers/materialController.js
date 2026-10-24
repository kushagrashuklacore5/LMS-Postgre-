const { isWebUrl, isEmptyOrWebUrl } = require('../helpers/safeUrl');
const db = require('../config/database-switch');
const path = require("path");
const fs = require("fs");



// ✅ UPLOAD COURSE MATERIAL (Video, PDF, or any file)
exports.uploadMaterial = async (req, res) => {
  try {
    const { courseId, weekId, title, type, linkUrl, description } = req.body;

    // Validate inputs
    if (!courseId || !title || !type) {
      return res.status(400).json({ message: "Missing required fields: courseId, title, type" });
    }

    const userId = req.user.userId || req.user.id;
    const normalizedWeekId = weekId === undefined || weekId === null ? "" : String(weekId).trim();

    // ✅ VERIFY COURSE EXISTS
    db.get("SELECT * FROM courses WHERE id = ?", [courseId], (err, course) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // ✅ VERIFY USER IS COURSE TEACHER
      if (String(course.mentorId) !== String(userId) && req.user.role !== "admin") {
        return res.status(403).json({ message: "Only course teacher can add materials" });
      }

      let fileUrl = "";
      let linkUrlValue = "";

      // ✅ HANDLE FILE UPLOADS
      if (type === "video" || type === "pdf" || type === "file") {
        if (!req.file) {
          return res.status(400).json({ message: `File is required for ${type} upload` });
        }
        // Store relative path to uploads folder
        fileUrl = `/uploads/${req.file.filename}`;
        console.log("✅ File uploaded:", fileUrl);
      }
      // ✅ HANDLE EXTERNAL LINKS
      else if (type === "video_link" || type === "pdf_link") {
        if (!linkUrl) {
          return res.status(400).json({ message: "Link URL is required for link type" });
        }
        if (!isWebUrl(linkUrl)) {
          return res.status(400).json({ message: "The link must be a web address starting with http:// or https://" });
        }
        linkUrlValue = linkUrl;
      } else {
        return res.status(400).json({ message: "Invalid material type. Use: video, pdf, file, video_link, pdf_link" });
      }

      // ✅ INSERT INTO DATABASE
      const sql = normalizedWeekId
        ? `INSERT INTO course_materials (courseId, weekId, title, type, fileUrl, linkUrl, uploadedBy, description, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, utc_now_text())`
        : `INSERT INTO course_materials (courseId, title, type, fileUrl, linkUrl, uploadedBy, description, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, utc_now_text())`;

      const values = normalizedWeekId
        ? [courseId, normalizedWeekId, title, type, fileUrl || "", linkUrlValue || "", userId, description || ""]
        : [courseId, title, type, fileUrl || "", linkUrlValue || "", userId, description || ""];

      db.run(sql, values, function(err) {
        if (err) {
          console.error("Error inserting material:", err);
          return res.status(500).json({ message: "Error saving material to database" });
        }

          const materialId = this.lastID;

          // ✅ FETCH UPLOADED BY USER NAME
          db.get("SELECT name FROM users WHERE id = ?", [userId], (userErr, user) => {
            res.status(201).json({
              message: "Material uploaded successfully",
              material: {
                id: materialId,
                courseId,
                weekId: normalizedWeekId || null,
                title,
                type,
                fileUrl,
                linkUrl: linkUrlValue,
                uploadedBy: userId,
                uploadedByName: user ? user.name : "Unknown",
                description: description || "",
                createdAt: new Date().toISOString()
              }
            });
          });
        }
      );
    });
  } catch (error) {
    console.error("UPLOAD MATERIAL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET ALL MATERIALS FOR A COURSE
exports.getCourseMaterials = async (req, res) => {
  try {
    const courseId = req.params.courseId || req.query.courseId;

    if (!courseId) {
      return res.status(400).json({ message: "Course ID is required" });
    }

    db.all(
      `SELECT cm.*, u.name as uploadedByName, c.title as courseTitle
       FROM course_materials cm
       LEFT JOIN users u ON cm.uploadedBy = u.id
       LEFT JOIN courses c ON cm.courseId = c.id
       WHERE cm.courseId = ?
       ORDER BY cm.createdAt DESC`,
      [courseId],
      (err, materials) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        // Map id to _id for frontend compatibility
        const mappedMaterials = (materials || []).map(material => ({
          ...material,
          _id: material.id
        }));

        res.json(mappedMaterials);
      }
    );
  } catch (error) {
    console.error("GET MATERIALS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getWeekMaterials = async (req, res) => {
  try {
    const weekId = req.params.weekId;

    if (!weekId) {
      return res.status(400).json({ message: "Week ID is required" });
    }

    db.all(
      `SELECT cm.*, u.name as uploadedByName, c.title as courseTitle
       FROM course_materials cm
       LEFT JOIN users u ON cm.uploadedBy = u.id
       LEFT JOIN courses c ON cm.courseId = c.id
       WHERE cm.weekId = ?
       ORDER BY cm.createdAt DESC`,
      [weekId],
      (err, materials) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        const mappedMaterials = (materials || []).map(material => ({
          ...material,
          _id: material.id
        }));

        res.json(mappedMaterials);
      }
    );
  } catch (error) {
    console.error("GET WEEK MATERIALS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ DELETE COURSE MATERIAL
exports.deleteMaterial = async (req, res) => {
  try {
    const materialId = req.params.id;
    const userId = req.user.userId || req.user.id;

    if (!materialId) {
      return res.status(400).json({ message: "Material ID is required" });
    }

    // ✅ GET MATERIAL DETAILS
    db.get("SELECT * FROM course_materials WHERE id = ?", [materialId], (err, material) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!material) {
        return res.status(404).json({ message: "Material not found" });
      }

      // ✅ VERIFY COURSE AND USER PERMISSION
      db.get("SELECT * FROM courses WHERE id = ?", [material.courseId], (courseErr, course) => {
        if (courseErr || !course) {
          return res.status(500).json({ message: "Course not found" });
        }

        if (course.mentorId !== userId && req.user.role !== "admin") {
          return res.status(403).json({ message: "Not authorized to delete this material" });
        }

        // ✅ DELETE FILE IF IT EXISTS
        if (material.fileUrl && material.fileUrl.startsWith("/uploads/")) {
          const filePath = path.join(__dirname, "..", material.fileUrl);
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.warn("Could not delete file:", unlinkErr);
              // Continue anyway - delete from database
            }
          });
        }

        // ✅ DELETE FROM DATABASE
        db.run("DELETE FROM course_materials WHERE id = ?", [materialId], function(deleteErr) {
          if (deleteErr) {
            console.error("Error deleting material:", deleteErr);
            return res.status(500).json({ message: "Error deleting material" });
          }

          res.json({
            message: "Material deleted successfully",
            deletedMaterialId: materialId
          });
        });
      });
    });
  } catch (error) {
    console.error("DELETE MATERIAL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET MATERIAL BY ID
exports.getMaterialById = async (req, res) => {
  try {
    const materialId = req.params.id;

    db.get(
      `SELECT cm.*, u.name as uploadedByName, c.title as courseTitle
       FROM course_materials cm
       LEFT JOIN users u ON cm.uploadedBy = u.id
       LEFT JOIN courses c ON cm.courseId = c.id
       WHERE cm.id = ?`,
      [materialId],
      (err, material) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!material) {
          return res.status(404).json({ message: "Material not found" });
        }

        res.json(material);
      }
    );
  } catch (error) {
    console.error("GET MATERIAL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

