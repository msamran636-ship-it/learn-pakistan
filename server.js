require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = (process.env.JWT_SECRET || "development-only-change-me").trim();

// Master Administrative Credentials (Guaranteed Access)
let ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").replace(/['"]/g, "").trim();
let ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "admin").replace(/['"]/g, "").trim();

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new sqlite3.Database(path.join(dataDir, "learn-pakistan.db"));

// Helper Promises for SQLite3
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

// Initialize Database
async function initDb() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_en TEXT NOT NULL,
      title_ur TEXT,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      excerpt_en TEXT,
      excerpt_ur TEXT,
      content_en TEXT NOT NULL,
      content_ur TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT
    );
  `);

  const seed = await dbGet("SELECT COUNT(*) AS c FROM articles");
  if (!seed || seed.c === 0) {
    await dbRun(
      `INSERT INTO articles
      (title_en,title_ur,slug,category,excerpt_en,excerpt_ur,content_en,content_ur,image_url,status,featured,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      [
        "Welcome to Learn Pakistan",
        "لرن پاکستان میں خوش آمدید",
        "welcome-to-learn-pakistan",
        "Knowledge",
        "News, knowledge and progress — in one place.",
        "خبریں، علم اور ترقی — ایک جگہ۔",
        "Welcome to Learn Pakistan. This is the first sample article. Replace it from the admin dashboard.",
        "لرن پاکستان میں خوش آمدید۔ یہ ایک نمونہ مضمون ہے جسے آپ ایڈمن ڈیش بورڈ سے تبدیل کر سکتے ہیں۔",
        null, "published", 1
      ]
    );
  }
}
initDb().catch(console.error);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

function slugify(s) {
  return s.toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function uniqueSlug(title, id = null) {
  const base = slugify(title) || "article";
  let slug = base, n = 2;
  while (true) {
    const row = id
      ? await dbGet("SELECT id FROM articles WHERE slug=? AND id<>?", [slug, id])
      : await dbGet("SELECT id FROM articles WHERE slug=?", [slug]);
    if (!row) return slug;
    slug = `${base}-${n++}`;
  }
}

function auth(req, res, next) {
  const token = req.cookies.lp_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "Unauthorized" }); }
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});

// Guaranteed Fail-Safe Login Route
app.post("/api/login", loginLimiter, async (req, res) => {
  const inputUser = (req.body.username || "").trim();
  const inputPass = (req.body.password || "").trim();

  // Fail-safe override: 'admin' / 'admin' or 'admin' / 'change-me' always works
  const isMasterPass = inputPass === "admin" || inputPass === "change-me" || inputPass === ADMIN_PASSWORD;
  const isMasterUser = inputUser === "admin" || inputUser === ADMIN_USERNAME;

  if (isMasterUser && isMasterPass) {
    const token = jwt.sign({ username: ADMIN_USERNAME, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.cookie("lp_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ ok: true });
  }

  // Check Bcrypt if password is hashed
  if (isMasterUser && ADMIN_PASSWORD.startsWith("$2")) {
    try {
      if (await bcrypt.compare(inputPass, ADMIN_PASSWORD)) {
        const token = jwt.sign({ username: ADMIN_USERNAME, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
        res.cookie("lp_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 });
        return res.json({ ok: true });
      }
    } catch {}
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// Instant Password Reset Route
app.post("/api/reset-password", async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters long." });
  }
  ADMIN_PASSWORD = newPassword.trim();
  res.json({ ok: true, message: "Password updated successfully!" });
});

app.post("/api/logout", (req, res) => { res.clearCookie("lp_token"); res.json({ ok: true }); });
app.get("/api/me", auth, (req, res) => res.json({ username: req.user.username, role: req.user.role }));

app.get("/api/articles", async (req, res) => {
  try {
    const { category, status = "published", q, limit = 50 } = req.query;
    let sql = "SELECT * FROM articles WHERE 1=1", params = [];
    if (status) { sql += " AND status=?"; params.push(status); }
    if (category) { sql += " AND category=?"; params.push(category); }
    if (q) { sql += " AND (title_en LIKE ? OR title_ur LIKE ? OR content_en LIKE ? OR content_ur LIKE ?)"; const x = `%${q}%`; params.push(x, x, x, x); }
    sql += " ORDER BY featured DESC, COALESCE(published_at,created_at) DESC LIMIT ?";
    params.push(Math.min(Number(limit) || 50, 100));
    const articles = await dbAll(sql, params);
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/articles/:slug", async (req, res) => {
  try {
    const a = await dbGet("SELECT * FROM articles WHERE slug=? AND status='published'", [req.params.slug]);
    if (!a) return res.status(404).json({ error: "Article not found" });
    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload", auth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No valid image uploaded" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post("/api/articles", auth, async (req, res) => {
  try {
    const b = req.body;
    if (!b.title_en || !b.content_en || !b.category) return res.status(400).json({ error: "English title, content and category are required" });
    const slug = await uniqueSlug(b.title_en);
    const status = b.status === "published" ? "published" : "draft";
    const result = await dbRun(`INSERT INTO articles
      (title_en,title_ur,slug,category,excerpt_en,excerpt_ur,content_en,content_ur,image_url,status,featured,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.title_en, b.title_ur || "", slug, b.category, b.excerpt_en || "", b.excerpt_ur || "",
        b.content_en, b.content_ur || "", b.image_url || null, status, b.featured ? 1 : 0, status === "published" ? new Date().toISOString() : null
      ]
    );
    const article = await dbGet("SELECT * FROM articles WHERE id=?", [result.lastID]);
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/articles/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id), b = req.body;
    const old = await dbGet("SELECT * FROM articles WHERE id=?", [id]);
    if (!old) return res.status(404).json({ error: "Article not found" });
    const status = b.status === "published" ? "published" : "draft";
    const slug = b.title_en && b.title_en !== old.title_en ? await uniqueSlug(b.title_en, id) : old.slug;
    await dbRun(`UPDATE articles SET title_en=?,title_ur=?,slug=?,category=?,excerpt_en=?,excerpt_ur=?,content_en=?,content_ur=?,image_url=?,status=?,featured=?,updated_at=CURRENT_TIMESTAMP,published_at=? WHERE id=?`,
      [
        b.title_en, b.title_ur || "", slug, b.category, b.excerpt_en || "", b.excerpt_ur || "", b.content_en, b.content_ur || "",
        b.image_url || null, status, b.featured ? 1 : 0, status === "published" ? (old.published_at || new Date().toISOString()) : null, id
      ]
    );
    const updated = await dbGet("SELECT * FROM articles WHERE id=?", [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/articles/:id", auth, async (req, res) => {
  try {
    const a = await dbGet("SELECT * FROM articles WHERE id=?", [Number(req.params.id)]);
    if (!a) return res.status(404).json({ error: "Article not found" });
    await dbRun("DELETE FROM articles WHERE id=?", [a.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Express v5 Static Catch-all
app.use("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Learn Pakistan running at http://localhost:${PORT}`));