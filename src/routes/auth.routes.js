const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db/database");
const { logAudit } = require("../db/audit");
const {
  isValidEmail,
  getNameValidationError,
  getPasswordValidationError
} = require("../middleware/validation");

const router = express.Router();

router.get("/register", (req, res) => res.render("auth/register"));
router.get("/login", (req, res) => res.render("auth/login"));

router.post("/register", async (req, res) => {
  const full_name = (req.body.full_name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirmPassword = req.body.confirm_password || "";

  if (!full_name || !email || !password || !confirmPassword) {
    req.session.flash = { type: "danger", message: "Missing fields." };
    return res.redirect("/register");
  }
  
    const nameError = getNameValidationError(full_name);
  if (nameError) {
    req.session.flash = { type: "danger", message: nameError };
    return res.redirect("/register");
  }

  if (!isValidEmail(email)) {
    req.session.flash = { type: "danger", message: "Please provide a valid email address." };
    return res.redirect("/register");
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    req.session.flash = { type: "danger", message: passwordError };
    return res.redirect("/register");
  }

  if (password !== confirmPassword) {
    req.session.flash = { type: "danger", message: "Passwords do not match." };
    return res.redirect("/register");
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    req.session.flash = { type: "danger", message: "Email already in use." };
    return res.redirect("/register");
  }

  const password_hash = await bcrypt.hash(password, 12);

  const result = db
    .prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'USER')")
    .run(full_name, email, password_hash);

  req.session.user = { id: result.lastInsertRowid, full_name, email, role: "USER" };
  logAudit({
    actorUserId: result.lastInsertRowid,
    action: "USER_REGISTERED",
    entityType: "USER",
    entityId: result.lastInsertRowid,
    metadata: { email }
  });
  req.session.flash = { type: "success", message: "Account created successfully." };
  res.redirect("/dashboard");
});

router.post("/login", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    req.session.flash = { type: "danger", message: "Invalid email or password." };
    return res.redirect("/login");
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    req.session.flash = { type: "danger", message: "Invalid email or password." };
    return res.redirect("/login");
  }

  req.session.user = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
  req.session.flash = {
    type: "success",
    message: `Welcome back, ${user.full_name}!`
  };
  
  if (user.role === "ADMIN") return res.redirect("/admin/applications");
  res.redirect("/dashboard");
});


router.post("/logout", (req, res) => {
  //req.session.destroy(() => res.redirect("/login"));
    req.session.regenerate((err) => {
    if (err) return res.redirect("/login");
    req.session.flash = { type: "success", message: "Logged out successfully." };
    res.redirect("/login");
  });
});

module.exports = router;
