const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
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

router.get("/admin/users/new", requireAdmin, (req, res) => {
  res.render("admin/new_user", { title: "Admin - Create User" });
});

router.post("/admin/users", requireAdmin, async (req, res) => {
  const full_name = (req.body.full_name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const role = (req.body.role || "USER").trim().toUpperCase();

  if (!full_name || !email || !password) {
    req.session.flash = { type: "danger", message: "Please fill out all required fields." };
    return res.redirect("/admin/users/new");
  }

  if (!["USER", "ADMIN"].includes(role)) {
    req.session.flash = { type: "danger", message: "Invalid role selected." };
    return res.redirect("/admin/users/new");
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    req.session.flash = { type: "danger", message: "Email already in use." };
    return res.redirect("/admin/users/new");
  }

  const password_hash = await bcrypt.hash(password, 12);

  db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(full_name, email, password_hash, role);

  req.session.flash = { type: "success", message: "User created successfully." };
  return res.redirect("/admin/users/new");
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
