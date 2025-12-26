const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const db = require("../db/database");
const { requireAdmin } = require("../middleware/auth");
const { logAudit } = require("../db/audit");
const {
  isValidEmail,
  getNameValidationError,
  getPasswordValidationError
} = require("../middleware/validation");

const router = express.Router();

router.get("/admin/applications", requireAdmin, (req, res) => {
  const limit = 10;
  const search = (req.query.search || "").trim();
  const status = (req.query.status || "ALL").trim().toUpperCase();
  const sort = (req.query.sort || "latest").trim().toLowerCase();

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push("(u.full_name LIKE ? OR u.email LIKE ? OR a.organization LIKE ?)");
    const likeValue = `%${search}%`;
    params.push(likeValue, likeValue, likeValue);
  }

  if (["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    whereClauses.push("a.status = ?");
    params.push(status);
  }

  let orderBy = "a.created_at DESC";
  if (sort === "oldest") {
    orderBy = "a.created_at ASC";
  } else if (sort === "name") {
    orderBy = "u.full_name ASC";
  } else if (sort === "status") {
    orderBy = "a.status ASC, a.created_at DESC";
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const total = db
    .prepare(
      `
      SELECT COUNT(*) as total
      FROM applications a
      JOIN users u ON u.id = a.user_id
      ${whereSql}
    `
    )
    .get(...params).total;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const requestedPage = Number.parseInt(req.query.page, 10) || 1;
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const offset = (page - 1) * limit;
  const rows = db
    .prepare(`
      SELECT a.*, u.full_name, u.email
      FROM applications a
      JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset);

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (status && status !== "ALL") queryParams.set("status", status);
  if (sort && sort !== "latest") queryParams.set("sort", sort);

  res.render("admin/applications", {
    applications: rows,
	filters: {
      search,
      status,
      sort,
    },
    pagination: {
      currentPage: page,
      totalPages,
      basePath: "/admin/applications",
	  queryString: queryParams.toString(),
    },
  });
});

router.get("/admin/audit-logs", requireAdmin, (req, res) => {
  const limit = 20;
  const total = db.prepare("SELECT COUNT(*) as total FROM audit_logs").get().total;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const requestedPage = Number.parseInt(req.query.page, 10) || 1;
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const offset = (page - 1) * limit;
  const rows = db
    .prepare(
      `
      SELECT al.*, u.full_name, u.email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_user_id
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(limit, offset)
    .map((row) => {
      let metadata = null;
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
        } catch (error) {
          metadata = row.metadata;
        }
      }
      return { ...row, metadata };
    });

  res.render("admin/audit_logs", {
    logs: rows,
    pagination: {
      currentPage: page,
      totalPages,
      basePath: "/admin/audit-logs",
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

router.get("/admin/users", requireAdmin, (req, res) => {
  const search = (req.query.search || "").trim();
  const role = (req.query.role || "ALL").trim().toUpperCase();
  const sort = (req.query.sort || "latest").trim().toLowerCase();

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push("(u.full_name LIKE ? OR u.email LIKE ?)");
    const likeValue = `%${search}%`;
    params.push(likeValue, likeValue);
  }

  if (["USER", "ADMIN"].includes(role)) {
    whereClauses.push("u.role = ?");
    params.push(role);
  }

  let orderBy = "u.created_at DESC";
  if (sort === "oldest") {
    orderBy = "u.created_at ASC";
  } else if (sort === "name") {
    orderBy = "u.full_name ASC";
  } else if (sort === "applications") {
    orderBy = "application_count DESC";
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  
  const users = db
    .prepare(`
      SELECT u.*, COUNT(a.id) as application_count
      FROM users u
      LEFT JOIN applications a ON a.user_id = u.id
	  ${whereSql}
      GROUP BY u.id
      ORDER BY ${orderBy}
    `
    )
    .all(...params);

  res.render("admin/users", {
    users,
    filters: {
      search,
      role,
      sort,
    },
  });
});

router.post("/admin/users", requireAdmin, async (req, res) => {
  const full_name = (req.body.full_name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirmPassword = req.body.confirm_password || "";
  const role = (req.body.role || "USER").trim().toUpperCase();

  if (!full_name || !email || !password || !confirmPassword) {
    req.session.flash = { type: "danger", message: "Please fill out all required fields." };
    return res.redirect("/admin/users/new");
  }
  
    const nameError = getNameValidationError(full_name);
  if (nameError) {
    req.session.flash = { type: "danger", message: nameError };
    return res.redirect("/admin/users/new");
  }

  if (!isValidEmail(email)) {
    req.session.flash = { type: "danger", message: "Please provide a valid email address." };
    return res.redirect("/admin/users/new");
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    req.session.flash = { type: "danger", message: passwordError };
    return res.redirect("/admin/users/new");
  }

  if (password !== confirmPassword) {
    req.session.flash = { type: "danger", message: "Passwords do not match." };
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

  const result = db
    .prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(full_name, email, password_hash, role);
	
  logAudit({
	actorUserId: req.session.user.id,
	action: "USER_CREATED",
	entityType: "USER",
	entityId: result.lastInsertRowid,
	metadata: { email, role }
  });

  req.session.flash = { type: "success", message: "User created successfully." };
  return res.redirect("/admin/users");
});

router.post("/admin/users/:id/delete", requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);

  if (!Number.isInteger(targetId)) {
    return res.status(400).send("Invalid user id");
  }

  if (targetId === req.session.user.id) {
    req.session.flash = { type: "danger", message: "You cannot delete your own account." };
    return res.redirect("/admin/users");
  }

  const targetUser = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(targetId);
  if (!targetUser) {
    return res.status(404).send("User not found");
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(targetId);

  logAudit({
    actorUserId: req.session.user.id,
    action: "USER_DELETED",
    entityType: "USER",
    entityId: targetId,
    metadata: { email: targetUser.email, role: targetUser.role }
  });

  req.session.flash = { type: "success", message: "User deleted successfully." };
  return res.redirect("/admin/users");
});

router.post("/admin/users/:id/role", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const role = (req.body.role || "").trim().toUpperCase();
  if (!["USER", "ADMIN"].includes(role)) {
    req.session.flash = { type: "danger", message: "Invalid role selected." };
    return res.redirect("/admin/users");
  }
  if (req.session.user && req.session.user.id === id && role !== "ADMIN") {
    req.session.flash = { type: "danger", message: "You cannot remove your own admin access." };
    return res.redirect("/admin/users");
  }

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  req.session.flash = { type: "success", message: "User role updated." };
  return res.redirect("/admin/users");
});

router.post("/admin/users/:id/delete", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (req.session.user && req.session.user.id === id) {
    req.session.flash = { type: "danger", message: "You cannot delete your own account." };
    return res.redirect("/admin/users");
  }

  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  if (!result.changes) {
    req.session.flash = { type: "danger", message: "User not found." };
    return res.redirect("/admin/users");
  }

  req.session.flash = { type: "success", message: "User removed." };
  return res.redirect("/admin/users");
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
  
  const existing = db
    .prepare("SELECT id, status, user_id FROM applications WHERE id = ?")
    .get(id);
  if (!existing) {
    return res.status(404).send("Not found");
  }

  db.prepare("UPDATE applications SET status = ?, admin_note = ? WHERE id = ?")
    .run(status, admin_note || null, id);
	
  logAudit({
    actorUserId: req.session.user.id,
    action: "APPLICATION_STATUS_UPDATED",
    entityType: "APPLICATION",
    entityId: id,
    metadata: { from: existing.status, to: status, targetUserId: existing.user_id }
  });

  req.session.flash = { type: "success", message: "Application status updated." };
  res.redirect("/admin/applications");
});

module.exports = router;
