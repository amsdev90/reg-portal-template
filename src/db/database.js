const fs = require("fs");
const path = require("path");

const path = require("path");
const Database = require("better-sqlite3");
require("dotenv").config();

const dbPath = process.env.DB_PATH || "./data/app.db";
const absolutePath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

const dir = path.dirname(absolutePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(absolutePath);
db.pragma("foreign_keys = ON");

module.exports = db;
