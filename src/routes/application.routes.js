const express = require("express");
const path = require("path");
const multer = require("multer");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.get("/dashboard", requireAuth, (req, res) => {
  const userId = req.session.user.id;
  const applications = db
    .prepare("SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
	
	res.render("app/dashboard", {
    applications,
  });
});

router.get("/apply", requireAuth, (req, res) => {
  res.render("app/apply");
});

router.post("/apply", requireAuth, (req, res) => {
  upload.array("documents", 5)(req, res, (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError
          ? `Upload error: ${err.message}`
          : err.message || "Upload error.";
      req.session.flash = { type: "danger", message };
      return res.redirect("/apply");
    }

    const userId = req.session.user.id;
    const { organization, phone, message } = req.body;

    const result = db
      .prepare(
        "INSERT INTO applications (user_id, organization, phone, message, status) VALUES (?, ?, ?, ?, 'PENDING')"
      )
      .run(userId, organization || null, phone || null, message || null);

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length) {
      const insertFile = db.prepare(`
        INSERT INTO application_files
          (application_id, user_id, original_name, stored_name, mime_type, size, storage_path)
        VALUES
          (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const file of files) {
        const relativePath = path.relative(process.cwd(), file.path);
        insertFile.run(
          result.lastInsertRowid,
          userId,
          file.originalname,
          file.filename,
          file.mimetype,
          file.size,
          relativePath
        );
      }
    }

    return res.redirect("/dashboard");
  });
});

module.exports = router;
