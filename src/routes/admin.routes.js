const express = require("express");
const path = require("path");
const db = require("../db/database");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/admin/applications", requireAdmin, (req, res) => {
  const limit = 10;
  const total = db.prepare("SELECT COUNT(*) as total FROM applications").get().total;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const requestedPage = Number.parseInt(req.query.page, 10) || 1;
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const offset = (page - 1) * limit;
  const rows = db
    .prepare(`
      SELECT a.*, u.full_name, u.email
      FROM applications a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(limit, offset);

  res.render("admin/applications", {
    applications: rows,
    pagination: {
      currentPage: page,
      totalPages,
      basePath: "/admin/applications",
    },
  });
});

router.get("/admin/applications/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`
    SELECT a.*, u.full_name, u.email
    FROM applications a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
  `).get(id);

  if (!row) return res.status(404).send("Not found");
    const files = db
    .prepare("SELECT * FROM application_files WHERE application_id = ? ORDER BY created_at DESC")
    .all(id);
  res.render("admin/application_detail", { application: row, files });
});

router.get("/admin/files/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const file = db.prepare(`
    SELECT af.*
    FROM application_files af
    WHERE af.id = ?
  `).get(id);

  if (!file) return res.status(404).send("Not found");

  const resolvedPath = path.isAbsolute(file.storage_path)
    ? file.storage_path
    : path.join(process.cwd(), file.storage_path);

  return res.download(resolvedPath, file.original_name);
});

router.post("/admin/applications/:id/status", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status, admin_note } = req.body;

  if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    return res.status(400).send("Invalid status");
  }

  db.prepare("UPDATE applications SET status = ?, admin_note = ? WHERE id = ?")
    .run(status, admin_note || null, id);

  res.redirect(`/admin/applications/${id}`);
});

module.exports = router;
