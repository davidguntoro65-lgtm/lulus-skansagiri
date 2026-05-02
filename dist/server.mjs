var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import "dotenv/config";
import express2 from "express";
import http from "http";
import path3 from "path";
import fs3 from "fs";

// server/routes.ts
import express from "express";
import multer from "multer";
import path2 from "path";
import fs2 from "fs";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { eq as eq2, ilike, or, and, asc, desc, inArray } from "drizzle-orm";

// server/db.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq } from "drizzle-orm";

// server/schema.ts
var schema_exports = {};
__export(schema_exports, {
  galleries: () => galleries,
  importArchives: () => importArchives,
  settings: () => settings,
  students: () => students
});
import { pgTable, serial, text, integer, timestamp, jsonb, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
var students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    nisn: varchar("nisn", { length: 32 }).notNull(),
    name: text("name").notNull(),
    birth_place: text("birth_place").default("").notNull(),
    birth_date: varchar("birth_date", { length: 10 }).notNull(),
    class: varchar("class", { length: 64 }).default("").notNull(),
    major: varchar("major", { length: 128 }).default("").notNull(),
    status_graduation: integer("status_graduation").default(1).notNull(),
    viewed_at: timestamp("viewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    nisnUx: uniqueIndex("students_nisn_ux").on(t.nisn),
    classIdx: index("students_class_idx").on(t.class)
  })
);
var settings = pgTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").default("").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var galleries = pgTable("galleries", {
  id: serial("id").primaryKey(),
  image_path: text("image_path").notNull(),
  title: varchar("title", { length: 200 }).default("").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var importArchives = pgTable("import_archives", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  imported: integer("imported").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  total_after: integer("total_after").default(0).notNull(),
  errors: jsonb("errors").$type().default([]).notNull(),
  snapshot: jsonb("snapshot").$type().default([]).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// server/db.ts
var { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. PostgreSQL is required.");
}
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 5e3
});
var db = drizzle(pool, { schema: schema_exports });
var DEFAULT_SETTINGS = {
  school_name: "SMKN 1 Wonogiri"
};
var SCHEMA_VERSION = 2;
var MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];
function formatBirthDateID(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso ?? "";
  const [, y, mo, d] = m;
  const month = MONTHS_ID[parseInt(mo, 10) - 1] ?? mo;
  return `${parseInt(d, 10)} ${month} ${y}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isoOf(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function rowToStudent(r) {
  return {
    id: r.id,
    nisn: r.nisn,
    name: r.name,
    birth_place: r.birth_place ?? "",
    birth_date: String(r.birth_date ?? "").slice(0, 10),
    class: r.class ?? "",
    major: r.major ?? "",
    status_graduation: Number(r.status_graduation) === 1 ? 1 : 0,
    viewed_at: isoOf(r.viewed_at),
    created_at: isoOf(r.created_at) ?? void 0,
    updated_at: isoOf(r.updated_at) ?? void 0
  };
}
function decorateStudent(s) {
  const formatted = formatBirthDateID(s.birth_date);
  return {
    ...s,
    status_graduation: typeof s.status_graduation === "boolean" ? s.status_graduation ? 1 : 0 : Number(s.status_graduation) === 1 ? 1 : 0,
    formatted_birth_date: formatted,
    inline_birth: s.birth_place ? `${s.birth_place}, ${formatted}` : formatted
  };
}
async function getAllSettings() {
  const rows = await db.select().from(settings);
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value ?? "";
  return out;
}
async function setSetting(key, value) {
  await db.execute(sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
  `);
}
async function setSettings(patch) {
  for (const [k, v] of Object.entries(patch)) {
    await setSetting(k, v);
  }
}
async function getSetting(key, fallback = "") {
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row[0]?.value ?? fallback;
}
async function ping() {
  const t0 = Date.now();
  try {
    const r = await pool.query("SELECT version() AS version");
    return { ok: true, latency_ms: Date.now() - t0, server_version: r.rows[0]?.version };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - t0, error: e?.message ?? String(e) };
  }
}
async function counts() {
  const [{ c: s }] = (await pool.query("SELECT COUNT(*)::text AS c FROM students")).rows;
  const [{ c: g }] = (await pool.query("SELECT COUNT(*)::text AS c FROM galleries")).rows;
  const [{ c: a }] = (await pool.query("SELECT COUNT(*)::text AS c FROM import_archives")).rows;
  return { students: Number(s), galleries: Number(g), import_archives: Number(a) };
}
async function migrate() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      nisn VARCHAR(32) NOT NULL,
      name TEXT NOT NULL,
      birth_place TEXT NOT NULL DEFAULT '',
      birth_date VARCHAR(10) NOT NULL,
      class VARCHAR(64) NOT NULL DEFAULT '',
      major VARCHAR(128) NOT NULL DEFAULT '',
      status_graduation INTEGER NOT NULL DEFAULT 1,
      viewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS students_nisn_ux ON students(nisn);
    CREATE INDEX IF NOT EXISTS students_class_idx ON students(class);
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS galleries (
      id SERIAL PRIMARY KEY,
      image_path TEXT NOT NULL,
      title VARCHAR(200) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS import_archives (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      imported INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      total_after INTEGER NOT NULL DEFAULT 0,
      errors JSONB NOT NULL DEFAULT '[]'::jsonb,
      snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(ddl);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [k, v]
    );
  }
  const c = await counts();
  return { created: false, schema_version: SCHEMA_VERSION, counts: c };
}
async function importLegacyJsonIfPresent() {
  const dataFile = path.resolve(process.cwd(), "server", "data.json");
  if (!fs.existsSync(dataFile)) return { migrated: false, reason: "no data.json" };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  } catch (e) {
    return { migrated: false, reason: `data.json is not valid JSON: ${e?.message}` };
  }
  const inserted = { students: 0, galleries: 0, settings: 0, import_archives: 0 };
  const sObj = parsed?.settings ?? {};
  for (const [k, v] of Object.entries(sObj)) {
    if (v === null || v === void 0) continue;
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [k, String(v)]
    );
    inserted.settings++;
  }
  for (const s of parsed?.students ?? []) {
    const r = await pool.query(
      `INSERT INTO students
        (nisn, name, birth_place, birth_date, class, major, status_graduation, viewed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW()))
       ON CONFLICT (nisn) DO NOTHING`,
      [
        String(s.nisn ?? "").trim(),
        String(s.name ?? "").trim(),
        String(s.birth_place ?? ""),
        String(s.birth_date ?? "").slice(0, 10),
        String(s.class ?? ""),
        String(s.major ?? ""),
        Number(s.status_graduation) === 1 || s.status_graduation === true ? 1 : 0,
        s.viewed_at ?? null,
        s.created_at ?? null,
        s.updated_at ?? null
      ]
    );
    if (r.rowCount && r.rowCount > 0) inserted.students++;
  }
  for (const g of parsed?.galleries ?? []) {
    const r = await pool.query(
      `INSERT INTO galleries (image_path, title, created_at)
       VALUES ($1,$2, COALESCE($3::timestamptz, NOW()))`,
      [String(g.image_path ?? ""), String(g.title ?? ""), g.created_at ?? null]
    );
    if (r.rowCount && r.rowCount > 0) inserted.galleries++;
  }
  for (const a of parsed?.import_archives ?? []) {
    const r = await pool.query(
      `INSERT INTO import_archives (filename, imported, failed, total_after, errors, snapshot, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb, COALESCE($7::timestamptz, NOW()))`,
      [
        String(a.filename ?? ""),
        Number(a.imported ?? 0),
        Number(a.failed ?? 0),
        Number(a.total_after ?? 0),
        JSON.stringify(a.errors ?? []),
        JSON.stringify(a.snapshot ?? []),
        a.created_at ?? null
      ]
    );
    if (r.rowCount && r.rowCount > 0) inserted.import_archives++;
  }
  const archivedPath = `${dataFile}.migrated-${Date.now()}.bak`;
  try {
    fs.renameSync(dataFile, archivedPath);
  } catch {
    fs.writeFileSync(dataFile, `MIGRATED_TO_POSTGRES_${nowIso()}
`);
  }
  return { migrated: true, inserted };
}

// server/routes.ts
var ADMIN_USER = "jobenapp";
var ADMIN_PASS = "081460081343";
var ALLOWED_SETTING_KEYS = [
  "announcement_date",
  "announcement_time",
  "maintenance_mode",
  "show_unduh_skl",
  "headline",
  "school_name",
  "school_npsn",
  "school_address",
  "principal_name",
  "school_logo",
  "principal_photo",
  "motivation_message"
];
var UPLOAD_ROOT = path2.resolve(process.cwd(), "server", "uploads");
function ensureDir(p) {
  if (!fs2.existsSync(p)) fs2.mkdirSync(p, { recursive: true });
}
ensureDir(UPLOAD_ROOT);
ensureDir(path2.join(UPLOAD_ROOT, "branding"));
ensureDir(path2.join(UPLOAD_ROOT, "principal"));
ensureDir(path2.join(UPLOAD_ROOT, "galleries"));
var storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let sub = "misc";
    if (file.fieldname === "logo") sub = "branding";
    else if (file.fieldname === "principal_photo") sub = "principal";
    else if (file.fieldname === "image") sub = "galleries";
    cb(null, path2.join(UPLOAD_ROOT, sub));
  },
  filename: (_req, file, cb) => {
    const safeBase = file.originalname.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "file";
    const ext = (path2.extname(file.originalname) || ".jpg").toLowerCase();
    const id = crypto.randomBytes(8).toString("hex");
    cb(null, `${safeBase}_${id}${ext}`);
  }
});
var uploadGeneral = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
var uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
var sessions = /* @__PURE__ */ new Map();
function readToken(req) {
  const h = req.header("authorization") || req.header("Authorization") || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (m) return m[1].trim();
  const t = req.header("x-admin-token") || req.query.token;
  return t ? String(t) : null;
}
var ok = (data, message) => ({ success: true, ...data !== void 0 ? { data } : {}, ...message ? { message } : {} });
function publicAssetUrl(req, relPath) {
  if (!relPath) return "";
  if (/^(https?:)?\/\//i.test(relPath)) return relPath;
  if (relPath.startsWith("data:")) return relPath;
  const origin = `${req.protocol}://${req.get("host")}`;
  return `${origin}/uploads/${relPath.replace(/^\/+/, "").replace(/^uploads\//, "")}`;
}
function isAnnouncementActive(date, time) {
  if (!date || !time) return { iso: "", active: false };
  const iso = (/* @__PURE__ */ new Date(`${date}T${time}:00`)).toISOString();
  const active = new Date(iso).getTime() <= Date.now();
  return { iso, active };
}
function aw(fn) {
  return (req, res) => {
    fn(req, res).catch((err) => {
      console.error("[api error]", req.method, req.path, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Server error: " + (err?.message ?? "unknown") });
      }
    });
  };
}
function buildApiRouter() {
  const r = express.Router();
  r.use(express.json({ limit: "10mb" }));
  r.use(express.urlencoded({ extended: true, limit: "10mb" }));
  (async () => {
    try {
      await migrate();
      const res = await importLegacyJsonIfPresent();
      if (res.migrated) {
        console.log("[db] legacy server/data.json imported into PostgreSQL:", res.inserted);
      }
    } catch (e) {
      console.error("[db] boot setup failed:", e);
    }
  })();
  r.get("/school-info", aw(async (req, res) => {
    const s = await getAllSettings();
    const { iso, active } = isAnnouncementActive(s.announcement_date ?? "", s.announcement_time ?? "");
    res.json(ok({
      headline: s.headline ?? "",
      school_name: s.school_name ?? "SMKN 1 Wonogiri",
      school_npsn: s.school_npsn ?? "",
      school_address: s.school_address ?? "",
      school_logo: publicAssetUrl(req, s.school_logo),
      principal_name: s.principal_name ?? "",
      principal_photo: publicAssetUrl(req, s.principal_photo),
      motivation_message: s.motivation_message ?? "",
      announcement_datetime: iso,
      announcement_active: active,
      maintenance_mode: s.maintenance_mode === "1",
      show_unduh_skl: s.show_unduh_skl === "1"
    }));
  }));
  r.get("/galleries", aw(async (req, res) => {
    const rows = await db.select().from(schema_exports.galleries).orderBy(desc(schema_exports.galleries.id));
    const items = rows.map((g) => ({
      id: g.id,
      image_path: publicAssetUrl(req, g.image_path),
      title: g.title ?? "",
      created_at: g.created_at?.toISOString() ?? nowIso()
    }));
    res.json(ok(items));
  }));
  r.post("/check-status", aw(async (req, res) => {
    const s = await getAllSettings();
    const { active } = isAnnouncementActive(s.announcement_date ?? "", s.announcement_time ?? "");
    if (s.announcement_date && s.announcement_time && !active) {
      return res.status(403).json({
        success: false,
        message: `Sabar, pengumuman belum dibuka! Kembali lagi jam ${s.announcement_time} WIB.`
      });
    }
    const { nisn, birth_date } = req.body ?? {};
    if (!nisn || !birth_date) {
      return res.status(422).json({ success: false, message: "NISN dan tanggal lahir wajib diisi." });
    }
    const bd = String(birth_date).slice(0, 10);
    const found = (await db.select().from(schema_exports.students).where(and(eq2(schema_exports.students.nisn, String(nisn)), eq2(schema_exports.students.birth_date, bd))).limit(1))[0];
    if (!found) {
      return res.status(404).json({ success: false, message: "Data NISN atau Tanggal Lahir tidak ditemukan." });
    }
    await db.update(schema_exports.students).set({ viewed_at: /* @__PURE__ */ new Date() }).where(eq2(schema_exports.students.id, found.id));
    const fresh = (await db.select().from(schema_exports.students).where(eq2(schema_exports.students.id, found.id)).limit(1))[0];
    res.json(ok(decorateStudent(rowToStudent(fresh))));
  }));
  r.post("/panel-admin/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(422).json({ success: false, message: "Username dan password wajib diisi." });
    }
    const user = String(username).trim();
    const pass = String(password);
    let valid = user === ADMIN_USER && pass.length === ADMIN_PASS.length;
    if (valid) {
      try {
        valid = crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_PASS));
      } catch {
        valid = pass === ADMIN_PASS;
      }
    }
    if (!valid) {
      return res.status(401).json({ success: false, message: "Username atau password salah." });
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, {
      username: ADMIN_USER,
      role: "built_in_admin",
      read_only: true,
      issued_at: nowIso()
    });
    res.json(ok({ username: ADMIN_USER, role: "built_in_admin", token, redirect: "/panel-admin/dashboard" }));
  });
  r.post("/panel-admin/logout", (req, res) => {
    const t = readToken(req);
    if (t) sessions.delete(t);
    res.json(ok());
  });
  r.get("/panel-admin/me", (req, res) => {
    const t = readToken(req);
    const sess = t ? sessions.get(t) : null;
    if (!sess) return res.status(401).json({ success: false, message: "Belum login." });
    res.json(ok({
      username: sess.username,
      role: sess.role,
      read_only: sess.read_only,
      issued_at: sess.issued_at
    }));
  });
  r.get("/admin/stats", aw(async (_req, res) => {
    const totalRow = await pool.query("SELECT COUNT(*)::text c FROM students");
    const lulusRow = await pool.query("SELECT COUNT(*)::text c FROM students WHERE status_graduation = 1");
    const checkedRow = await pool.query("SELECT COUNT(*)::text c FROM students WHERE viewed_at IS NOT NULL");
    const total = Number(totalRow.rows[0].c);
    const lulus = Number(lulusRow.rows[0].c);
    res.json(ok({ total, lulus, tidakLulus: total - lulus, checked: Number(checkedRow.rows[0].c) }));
  }));
  r.get("/admin/students", aw(async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const perPage = 15;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    let where = void 0;
    if (search) {
      const q = `%${search}%`;
      where = or(
        ilike(schema_exports.students.name, q),
        ilike(schema_exports.students.nisn, q),
        ilike(schema_exports.students.class, q),
        ilike(schema_exports.students.major, q)
      );
    }
    const totalRow = where ? await pool.query(
      `SELECT COUNT(*)::text c FROM students WHERE name ILIKE $1 OR nisn ILIKE $1 OR class ILIKE $1 OR major ILIKE $1`,
      [`%${search}%`]
    ) : await pool.query("SELECT COUNT(*)::text c FROM students");
    const total = Number(totalRow.rows[0].c);
    const last_page = Math.max(1, Math.ceil(total / perPage));
    const cur = Math.min(page, last_page);
    const rowsQ = db.select().from(schema_exports.students).orderBy(asc(schema_exports.students.class), asc(schema_exports.students.name)).limit(perPage).offset((cur - 1) * perPage);
    const rows = where ? await rowsQ.where(where) : await rowsQ;
    res.json(ok({
      data: rows.map((r2) => decorateStudent(rowToStudent(r2))),
      current_page: cur,
      last_page,
      per_page: perPage,
      total
    }));
  }));
  r.post("/admin/students/:id(\\d+)", aw(async (req, res) => {
    const id = Number(req.params.id);
    const allowed = ["name", "birth_place", "birth_date", "class", "major", "status_graduation"];
    const patch = {};
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k];
    }
    if ("status_graduation" in patch) {
      patch.status_graduation = patch.status_graduation === true || patch.status_graduation === 1 || patch.status_graduation === "1" ? 1 : 0;
    }
    if ("birth_date" in patch) {
      patch.birth_date = String(patch.birth_date ?? "").slice(0, 10);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(422).json({ success: false, message: "Tidak ada field yang diubah." });
    }
    patch.updated_at = /* @__PURE__ */ new Date();
    const updated = await db.update(schema_exports.students).set(patch).where(eq2(schema_exports.students.id, id)).returning();
    if (updated.length === 0) {
      return res.status(404).json({ success: false, message: "Siswa tidak ditemukan." });
    }
    res.json({ success: true, message: "Data siswa berhasil diperbarui", student: decorateStudent(rowToStudent(updated[0])) });
  }));
  r.get("/admin/settings", aw(async (_req, res) => {
    const s = await getAllSettings();
    res.json(ok({
      announcement_date: s.announcement_date ?? "",
      announcement_time: s.announcement_time ?? "",
      maintenance_mode: s.maintenance_mode === "1",
      show_unduh_skl: s.show_unduh_skl === "1",
      headline: s.headline ?? "",
      school_name: s.school_name ?? "SMKN 1 Wonogiri",
      school_npsn: s.school_npsn ?? "",
      school_address: s.school_address ?? "",
      principal_name: s.principal_name ?? "",
      school_logo: s.school_logo || null,
      principal_photo: s.principal_photo || null,
      motivation_message: s.motivation_message ?? ""
    }));
  }));
  r.post(
    "/admin/settings",
    uploadGeneral.fields([{ name: "logo", maxCount: 1 }, { name: "principal_photo", maxCount: 1 }]),
    aw(async (req, res) => {
      const body = req.body ?? {};
      if (body.principal_motivation && !body.motivation_message) {
        body.motivation_message = body.principal_motivation;
      }
      if ("maintenance_mode" in body) {
        const v = body.maintenance_mode;
        body.maintenance_mode = v === true || v === 1 || v === "1" || v === "true" ? "1" : "0";
      }
      if ("show_unduh_skl" in body) {
        const v = body.show_unduh_skl;
        body.show_unduh_skl = v === true || v === 1 || v === "1" || v === "true" ? "1" : "0";
      }
      const patch = {};
      for (const k of ALLOWED_SETTING_KEYS) {
        if (k === "school_logo" || k === "principal_photo") continue;
        if (k in body) patch[k] = String(body[k] ?? "");
      }
      const files = req.files ?? {};
      const logo = files.logo?.[0];
      if (logo) {
        const rel = path2.relative(UPLOAD_ROOT, logo.path).replace(/\\/g, "/");
        const old = await getSetting("school_logo");
        if (old && !/^https?:|^data:/.test(old)) {
          const oldPath = path2.join(UPLOAD_ROOT, old.replace(/^uploads\//, ""));
          if (fs2.existsSync(oldPath)) {
            try {
              fs2.unlinkSync(oldPath);
            } catch {
            }
          }
        }
        patch.school_logo = rel;
      }
      const photo = files.principal_photo?.[0];
      if (photo) {
        const rel = path2.relative(UPLOAD_ROOT, photo.path).replace(/\\/g, "/");
        const old = await getSetting("principal_photo");
        if (old && !/^https?:|^data:/.test(old)) {
          const oldPath = path2.join(UPLOAD_ROOT, old.replace(/^uploads\//, ""));
          if (fs2.existsSync(oldPath)) {
            try {
              fs2.unlinkSync(oldPath);
            } catch {
            }
          }
        }
        patch.principal_photo = rel;
      }
      await setSettings(patch);
      res.json(ok(void 0, "Pengaturan berhasil diperbarui"));
    })
  );
  r.post("/admin/import", uploadExcel.single("file"), aw(async (req, res) => {
    if (!req.file) return res.status(422).json({ success: false, message: "File Excel tidak ditemukan." });
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("siswa")) ?? wb.SheetNames[0];
    if (!sheetName) {
      return res.status(422).json({ success: false, message: "File Excel tidak memiliki sheet apapun." });
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false });
    let imported = 0;
    let failed = 0;
    const errors = [];
    const norm = (k) => k.toLowerCase().replace(/[^a-z]+/g, "");
    const pick = (row, names) => {
      for (const k of Object.keys(row)) {
        if (names.includes(norm(k))) return row[k];
      }
      return void 0;
    };
    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const str = String(v).trim();
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(str);
      if (dmy) {
        const [, d, m, y] = dmy;
        const yy = y.length === 2 ? `20${y}` : y;
        return `${yy.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      const parsed = new Date(str);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      return null;
    };
    const parseStatus = (v) => {
      const s = String(v ?? "").trim().toLowerCase();
      if (["1", "true", "lulus", "l", "ya", "y"].includes(s)) return 1;
      if (["0", "false", "tidak lulus", "tidak", "tl", "n", "no"].includes(s)) return 0;
      return 1;
    };
    const beforeRow = await pool.query("SELECT COUNT(*)::text c FROM students");
    const beforeCount = Number(beforeRow.rows[0].c);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const nisn = String(pick(row, ["nisn"]) ?? "").trim();
          const name = String(pick(row, ["name", "nama", "namasiswa", "namalengkap"]) ?? "").trim();
          const birthPlace = String(pick(row, ["birthplace", "tempatlahir", "tempat"]) ?? "").trim();
          const birthDate = parseDate(pick(row, ["birthdate", "tanggallahir", "tgllahir"]));
          const klass = String(pick(row, ["class", "kelas"]) ?? "").trim();
          const major = String(pick(row, ["major", "jurusan", "kompetensi"]) ?? "").trim();
          const status = parseStatus(pick(row, ["statusgraduation", "status", "kelulusan", "statuskelulusan", "lulus"]));
          if (!nisn || !name || !birthDate) {
            failed++;
            errors.push(`Baris ${i + 2}: NISN/Nama/Tanggal lahir kosong.`);
            continue;
          }
          await client.query(
            `INSERT INTO students
              (nisn, name, birth_place, birth_date, class, major, status_graduation, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), NOW())
             ON CONFLICT (nisn) DO UPDATE SET
                name = EXCLUDED.name,
                birth_place = EXCLUDED.birth_place,
                birth_date = EXCLUDED.birth_date,
                class = EXCLUDED.class,
                major = EXCLUDED.major,
                status_graduation = EXCLUDED.status_graduation,
                updated_at = NOW()`,
            [nisn, name, birthPlace, birthDate, klass, major, status]
          );
          imported++;
        } catch (err) {
          failed++;
          errors.push(`Baris ${i + 2}: ${err?.message ?? "gagal"}.`);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    const allNow = await db.select().from(schema_exports.students);
    const snapshot = allNow.map(rowToStudent);
    await pool.query(
      `INSERT INTO import_archives (filename, imported, failed, total_after, errors, snapshot, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb, NOW())`,
      [
        req.file.originalname,
        imported,
        failed,
        snapshot.length,
        JSON.stringify(errors.slice(0, 50)),
        JSON.stringify(snapshot)
      ]
    );
    await pool.query(
      `DELETE FROM import_archives WHERE id NOT IN (SELECT id FROM import_archives ORDER BY id DESC LIMIT 10)`
    );
    res.json({
      success: true,
      message: `Import selesai. ${imported} baris berhasil, ${failed} baris gagal.`,
      data: { imported, failed, errors: errors.slice(0, 20) },
      stats: {
        imported,
        failed,
        errors: errors.slice(0, 20),
        total: snapshot.length,
        last_import_time: nowIso(),
        before_count: beforeCount
      }
    });
  }));
  r.post("/admin/reset-tracking/:id?", aw(async (req, res) => {
    const id = req.params.id ? Number(req.params.id) : null;
    let result;
    if (id !== null) {
      result = await pool.query("UPDATE students SET viewed_at = NULL, updated_at = NOW() WHERE id = $1 AND viewed_at IS NOT NULL", [id]);
    } else {
      result = await pool.query("UPDATE students SET viewed_at = NULL, updated_at = NOW() WHERE viewed_at IS NOT NULL");
    }
    res.json(ok({ reset: result.rowCount ?? 0 }, "Tracking data reset"));
  }));
  r.post("/admin/students/purge", aw(async (_req, res) => {
    const beforeS = (await pool.query("SELECT COUNT(*)::text c FROM students")).rows[0].c;
    const beforeA = (await pool.query("SELECT COUNT(*)::text c FROM import_archives")).rows[0].c;
    await pool.query("TRUNCATE TABLE students RESTART IDENTITY");
    await pool.query("TRUNCATE TABLE import_archives RESTART IDENTITY");
    res.json({
      success: true,
      message: `Berhasil menghapus ${beforeS} siswa.`,
      data: { removed: Number(beforeS), archives_removed: Number(beforeA) }
    });
  }));
  r.post("/admin/students/bulk-delete", aw(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length === 0) return res.status(422).json({ success: false, message: "Tidak ada id siswa yang dipilih." });
    const r2 = await db.delete(schema_exports.students).where(inArray(schema_exports.students.id, ids));
    const removed = r2.rowCount ?? ids.length;
    res.json({ success: true, message: `Berhasil menghapus ${removed} siswa.`, data: { removed } });
  }));
  r.post("/admin/students/bulk-status", aw(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    const status = req.body?.status === 1 || req.body?.status === "1" || req.body?.status === true ? 1 : 0;
    if (ids.length === 0) return res.status(422).json({ success: false, message: "Tidak ada id siswa yang dipilih." });
    const r2 = await pool.query(
      `UPDATE students SET status_graduation = $1, updated_at = NOW() WHERE id = ANY($2::int[]) AND status_graduation <> $1`,
      [status, ids]
    );
    const updated = r2.rowCount ?? 0;
    res.json({ success: true, message: `Status diperbarui untuk ${updated} siswa.`, data: { updated } });
  }));
  r.post("/admin/galleries", uploadGeneral.single("image"), aw(async (req, res) => {
    const cnt = (await pool.query("SELECT COUNT(*)::text c FROM galleries")).rows[0].c;
    if (Number(cnt) >= 30) {
      if (req.file?.path && fs2.existsSync(req.file.path)) {
        try {
          fs2.unlinkSync(req.file.path);
        } catch {
        }
      }
      return res.status(422).json({
        success: false,
        message: "Galeri sudah mencapai batas maksimal 30 foto. Hapus salah satu sebelum mengunggah baru."
      });
    }
    if (!req.file) return res.status(422).json({ success: false, message: "File gambar tidak ditemukan." });
    const rel = path2.relative(UPLOAD_ROOT, req.file.path).replace(/\\/g, "/");
    const title = String(req.body?.title ?? req.body?.caption ?? "").slice(0, 200);
    const inserted = await db.insert(schema_exports.galleries).values({ image_path: rel, title }).returning();
    const item = inserted[0];
    res.json({
      success: true,
      data: {
        id: item.id,
        image_path: publicAssetUrl(req, item.image_path),
        title: item.title,
        created_at: item.created_at?.toISOString() ?? nowIso()
      },
      message: "Foto galeri berhasil diunggah."
    });
  }));
  r.delete("/admin/galleries/:id(\\d+)", aw(async (req, res) => {
    const id = Number(req.params.id);
    const found = await db.select().from(schema_exports.galleries).where(eq2(schema_exports.galleries.id, id)).limit(1);
    if (found.length === 0) return res.status(404).json({ success: false, message: "Foto tidak ditemukan." });
    const g = found[0];
    if (g.image_path && !/^(https?:|data:)/.test(g.image_path)) {
      const fp = path2.join(UPLOAD_ROOT, g.image_path.replace(/^uploads\//, ""));
      if (fs2.existsSync(fp)) {
        try {
          fs2.unlinkSync(fp);
        } catch {
        }
      }
    }
    await db.delete(schema_exports.galleries).where(eq2(schema_exports.galleries.id, id));
    res.json({ success: true, message: "Foto galeri dihapus." });
  }));
  r.post("/admin/galleries/clear", aw(async (_req, res) => {
    const all = await db.select().from(schema_exports.galleries);
    for (const g of all) {
      if (g.image_path && !/^(https?:|data:)/.test(g.image_path)) {
        const fp = path2.join(UPLOAD_ROOT, g.image_path.replace(/^uploads\//, ""));
        if (fs2.existsSync(fp)) {
          try {
            fs2.unlinkSync(fp);
          } catch {
          }
        }
      }
    }
    await pool.query("TRUNCATE TABLE galleries RESTART IDENTITY");
    res.json({ success: true, message: "Semua foto galeri telah dihapus." });
  }));
  r.get("/deploy/health", aw(async (req, res) => {
    const p = await ping();
    const c = p.ok ? await counts() : { students: 0, galleries: 0, import_archives: 0 };
    res.json(ok({
      app_url: process.env.APP_URL || `${req.protocol}://${req.get("host")}`,
      env: process.env.NODE_ENV ?? "development",
      backend: "node-express",
      database: "postgres",
      database_status: p.ok ? "connected" : "disconnected",
      database_latency_ms: p.latency_ms,
      database_version: p.server_version ?? null,
      database_error: p.error ?? null,
      runtime: process.version,
      time: nowIso(),
      students: c.students,
      galleries: c.galleries,
      import_archives: c.import_archives,
      schema_version: 2
    }));
  }));
  r.all("/deploy/setup", aw(async (req, res) => {
    const expected = process.env.DEPLOY_TOKEN || "";
    const given = String(req.query.token ?? req.body?.token ?? "");
    const auth = String(req.headers.authorization || "");
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const sessionOk = !!bearer && sessions.has(bearer);
    let authorized = false;
    if (expected) {
      try {
        authorized = !!given && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
      } catch {
        authorized = false;
      }
    }
    if (!authorized && sessionOk) authorized = true;
    if (!authorized && given && given === ADMIN_PASS) authorized = true;
    if (!authorized) {
      return res.status(401).json({
        success: false,
        message: expected ? "Token tidak valid. Masukkan DEPLOY_TOKEN yang benar atau login admin terlebih dahulu." : "Login admin terlebih dahulu, atau masukkan password admin sebagai token."
      });
    }
    const result = await migrate();
    const legacy = await importLegacyJsonIfPresent();
    res.json({
      success: true,
      message: "Setup selesai. Database PostgreSQL siap digunakan.",
      app_url: process.env.APP_URL || `${req.protocol}://${req.get("host")}`,
      steps: {
        migrate: { ok: true, output: "Skema PostgreSQL up-to-date." },
        schema: { ok: true, output: `schema_version=${result.schema_version}` },
        counts: { ok: true, output: JSON.stringify(result.counts) },
        legacy_json: legacy.migrated ? { ok: true, output: `Imported from data.json: ${JSON.stringify(legacy.inserted)}` } : { ok: true, output: legacy.reason ?? "no legacy file" }
      }
    });
  }));
  r.post("/deploy/backup-db", aw(async (req, res) => {
    const given = readToken(req) ?? "";
    const deployToken = process.env.DEPLOY_TOKEN ?? "";
    let authorized = false;
    if (deployToken) {
      try {
        authorized = !!given && given.length === deployToken.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(deployToken));
      } catch {
        authorized = false;
      }
    }
    if (!authorized && given && sessions.has(given)) authorized = true;
    if (!authorized && given === ADMIN_PASS) authorized = true;
    if (!authorized) {
      return res.status(401).json({ success: false, message: "Token tidak valid. Login admin terlebih dahulu." });
    }
    function pgLiteral(val) {
      if (val === null || val === void 0) return "NULL";
      if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
      if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
      if (val instanceof Date) {
        return Number.isNaN(val.getTime()) ? "NULL" : `'${val.toISOString()}'`;
      }
      if (typeof val === "object") {
        const j = JSON.stringify(val).replace(/'/g, "''");
        return `'${j}'::jsonb`;
      }
      return `'${String(val).replace(/'/g, "''")}'`;
    }
    async function dumpTable(tableName, orderBy, jsonbCols = []) {
      const { rows } = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`);
      if (rows.length === 0) return [`-- (no rows in ${tableName})`];
      const cols = Object.keys(rows[0]);
      const lines = [];
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const valueClauses = batch.map((row) => {
          const vals = cols.map((c) => {
            const v = row[c];
            if (jsonbCols.includes(c) && v !== null && v !== void 0) {
              const j = JSON.stringify(v).replace(/'/g, "''");
              return `'${j}'::jsonb`;
            }
            return pgLiteral(v);
          });
          return `  (${vals.join(", ")})`;
        });
        lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES`);
        lines.push(valueClauses.join(",\n") + ";");
      }
      return lines;
    }
    const ts = /* @__PURE__ */ new Date();
    const stamp = ts.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup_db_${stamp}.sql`;
    const parts = [];
    parts.push(`-- ============================================================`);
    parts.push(`-- Portal Kelulusan SMKN 1 Wonogiri \u2014 Database Backup`);
    parts.push(`-- Generated  : ${ts.toISOString()}`);
    parts.push(`-- Generator  : Node.js pure-JS dump (no pg_dump required)`);
    parts.push(`-- Tables     : students, settings, galleries, import_archives`);
    parts.push(`-- Usage      : psql $DATABASE_URL < ${filename}`);
    parts.push(`-- ============================================================`);
    parts.push(``);
    parts.push(`SET client_encoding = 'UTF8';`);
    parts.push(`SET standard_conforming_strings = on;`);
    parts.push(``);
    const tables = [
      { name: "students", order: "id ASC", jsonb: [], seq: "students_id_seq" },
      { name: "settings", order: "key ASC", jsonb: [] },
      { name: "galleries", order: "id ASC", jsonb: [], seq: "galleries_id_seq" },
      { name: "import_archives", order: "id ASC", jsonb: ["errors", "snapshot"], seq: "import_archives_id_seq" }
    ];
    for (const t of tables) {
      parts.push(`-- ------------------------------------------------------------`);
      parts.push(`-- Table: ${t.name}`);
      parts.push(`-- ------------------------------------------------------------`);
      parts.push(`TRUNCATE TABLE "${t.name}" RESTART IDENTITY CASCADE;`);
      const dumpLines = await dumpTable(t.name, t.order, t.jsonb);
      parts.push(...dumpLines);
      if (t.seq) {
        parts.push(`SELECT setval('${t.seq}', COALESCE((SELECT MAX(id) FROM "${t.name}"), 0), true);`);
      }
      parts.push(``);
    }
    parts.push(`-- ============================================================`);
    parts.push(`-- End of backup`);
    parts.push(`-- ============================================================`);
    const sql3 = parts.join("\n");
    const buf = Buffer.from(sql3, "utf8");
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buf.byteLength);
    res.send(buf);
  }));
  r.use((_req, res) => res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." }));
  return r;
}

// server/index.ts
var PORT = Number(process.env.PORT ?? 5e3);
var HOST = "0.0.0.0";
var isDev = process.env.NODE_ENV !== "production";
var LOG_DIR = path3.resolve(process.cwd(), "logs");
var LOG_FILE = path3.join(LOG_DIR, "stderr.log");
function ensureLogDir() {
  try {
    if (!fs3.existsSync(LOG_DIR)) fs3.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
  }
}
function writeLog(level, message, detail) {
  ensureLogDir();
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const extra = detail ? "\n  " + (detail instanceof Error ? `${detail.message}
  ${detail.stack ?? ""}` : String(detail)) : "";
  const line = `[${ts}] [${level}] ${message}${extra}
`;
  try {
    fs3.appendFileSync(LOG_FILE, line);
  } catch {
  }
  if (level === "ERROR") console.error(line.trimEnd());
  else console.warn(line.trimEnd());
}
process.on("uncaughtException", (err) => {
  writeLog("ERROR", "Uncaught exception \u2014 process will exit", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  writeLog("ERROR", "Unhandled promise rejection", reason);
});
if (!isDev && !process.env.DEPLOY_TOKEN) {
  const msg = "DEPLOY_TOKEN is not set. /api/deploy/setup will accept the admin password as a token. Set DEPLOY_TOKEN in Replit Secrets or .env.";
  writeLog("WARN", msg);
  console.warn("\n\u26A0\uFE0F  [security]", msg, "\n");
}
async function start() {
  const app = express2();
  const uploadRoot = path3.resolve(process.cwd(), "server", "uploads");
  if (!fs3.existsSync(uploadRoot)) fs3.mkdirSync(uploadRoot, { recursive: true });
  app.use("/uploads", express2.static(uploadRoot, { maxAge: "7d" }));
  app.use("/api", buildApiRouter());
  const httpServer = http.createServer(app);
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        allowedHosts: true
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPublic = path3.resolve(process.cwd(), "dist", "public");
    if (!fs3.existsSync(distPublic)) {
      writeLog("ERROR", `dist/public not found at ${distPublic}. Run 'npm run build' first.`);
      throw new Error(`dist/public not found. Run 'npm run build' first.`);
    }
    app.use(express2.static(distPublic, { maxAge: "1d" }));
    app.get("*", (_req, res) => res.sendFile(path3.join(distPublic, "index.html")));
  }
  httpServer.listen(PORT, HOST, () => {
    const appUrl = process.env.APP_URL || `http://${HOST}:${PORT}`;
    console.log(`[server] ready on http://${HOST}:${PORT} (APP_URL=${appUrl})`);
    writeLog("WARN", `Server started \u2014 port=${PORT} env=${process.env.NODE_ENV ?? "development"}`);
  });
}
start().catch((err) => {
  writeLog("ERROR", "Fatal startup error", err);
  process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2VydmVyL2luZGV4LnRzIiwgIi4uL3NlcnZlci9yb3V0ZXMudHMiLCAiLi4vc2VydmVyL2RiLnRzIiwgIi4uL3NlcnZlci9zY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCAnZG90ZW52L2NvbmZpZyc7XG5pbXBvcnQgZXhwcmVzcyBmcm9tICdleHByZXNzJztcbmltcG9ydCBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgYnVpbGRBcGlSb3V0ZXIgfSBmcm9tICcuL3JvdXRlcy5qcyc7XG5cbmNvbnN0IFBPUlQgPSBOdW1iZXIocHJvY2Vzcy5lbnYuUE9SVCA/PyA1MDAwKTtcbmNvbnN0IEhPU1QgPSAnMC4wLjAuMCc7XG5jb25zdCBpc0RldiA9IHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbic7XG5cbi8vIFx1MjUwMFx1MjUwMCBGaWxlc3lzdGVtIGVycm9yIGxvZ2dlciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIFdyaXRlcyB0aW1lc3RhbXBlZCBlcnJvcnMgdG8gbG9ncy9zdGRlcnIubG9nIHNvIGNQYW5lbCAvIFZQUyBvcGVyYXRvcnMgY2FuXG4vLyBkaWFnbm9zZSBzdGFydHVwIGZhaWx1cmVzIHdpdGhvdXQgYSBsaXZlIHRlcm1pbmFsIHNlc3Npb24uXG5jb25zdCBMT0dfRElSID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksICdsb2dzJyk7XG5jb25zdCBMT0dfRklMRSA9IHBhdGguam9pbihMT0dfRElSLCAnc3RkZXJyLmxvZycpO1xuXG5mdW5jdGlvbiBlbnN1cmVMb2dEaXIoKSB7XG4gIHRyeSB7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKExPR19ESVIpKSBmcy5ta2RpclN5bmMoTE9HX0RJUiwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCAqLyB9XG59XG5cbmZ1bmN0aW9uIHdyaXRlTG9nKGxldmVsOiAnRVJST1InIHwgJ1dBUk4nLCBtZXNzYWdlOiBzdHJpbmcsIGRldGFpbD86IHVua25vd24pIHtcbiAgZW5zdXJlTG9nRGlyKCk7XG4gIGNvbnN0IHRzID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBleHRyYSA9IGRldGFpbFxuICAgID8gJ1xcbiAgJyArIChkZXRhaWwgaW5zdGFuY2VvZiBFcnJvclxuICAgICAgICA/IGAke2RldGFpbC5tZXNzYWdlfVxcbiAgJHtkZXRhaWwuc3RhY2sgPz8gJyd9YFxuICAgICAgICA6IFN0cmluZyhkZXRhaWwpKVxuICAgIDogJyc7XG4gIGNvbnN0IGxpbmUgPSBgWyR7dHN9XSBbJHtsZXZlbH1dICR7bWVzc2FnZX0ke2V4dHJhfVxcbmA7XG4gIHRyeSB7IGZzLmFwcGVuZEZpbGVTeW5jKExPR19GSUxFLCBsaW5lKTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0ICovIH1cbiAgaWYgKGxldmVsID09PSAnRVJST1InKSBjb25zb2xlLmVycm9yKGxpbmUudHJpbUVuZCgpKTtcbiAgZWxzZSBjb25zb2xlLndhcm4obGluZS50cmltRW5kKCkpO1xufVxuXG5wcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIChlcnIpID0+IHtcbiAgd3JpdGVMb2coJ0VSUk9SJywgJ1VuY2F1Z2h0IGV4Y2VwdGlvbiBcdTIwMTQgcHJvY2VzcyB3aWxsIGV4aXQnLCBlcnIpO1xuICBwcm9jZXNzLmV4aXQoMSk7XG59KTtcblxucHJvY2Vzcy5vbigndW5oYW5kbGVkUmVqZWN0aW9uJywgKHJlYXNvbikgPT4ge1xuICB3cml0ZUxvZygnRVJST1InLCAnVW5oYW5kbGVkIHByb21pc2UgcmVqZWN0aW9uJywgcmVhc29uKTtcbn0pO1xuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8vIFx1MjUwMFx1MjUwMCBQcm9kdWN0aW9uIHNlY3VyaXR5IGNoZWNrIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuaWYgKCFpc0RldiAmJiAhcHJvY2Vzcy5lbnYuREVQTE9ZX1RPS0VOKSB7XG4gIGNvbnN0IG1zZyA9XG4gICAgJ0RFUExPWV9UT0tFTiBpcyBub3Qgc2V0LiAvYXBpL2RlcGxveS9zZXR1cCB3aWxsIGFjY2VwdCB0aGUgYWRtaW4gJyArXG4gICAgJ3Bhc3N3b3JkIGFzIGEgdG9rZW4uIFNldCBERVBMT1lfVE9LRU4gaW4gUmVwbGl0IFNlY3JldHMgb3IgLmVudi4nO1xuICB3cml0ZUxvZygnV0FSTicsIG1zZyk7XG4gIGNvbnNvbGUud2FybignXFxuXHUyNkEwXHVGRTBGICBbc2VjdXJpdHldJywgbXNnLCAnXFxuJyk7XG59XG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuYXN5bmMgZnVuY3Rpb24gc3RhcnQoKSB7XG4gIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcblxuICAvLyBTZXJ2ZSB1cGxvYWRlZCBmaWxlcyAobG9nb3MsIHByaW5jaXBhbCBwaG90b3MsIGdhbGxlcnkgcGhvdG9zKS5cbiAgLy8gQVBJIHJldHVybnMgcmVsYXRpdmUgcGF0aHMgbGlrZSBcImJyYW5kaW5nL2Zvby5wbmdcIiBcdTIxOTIgL3VwbG9hZHMvYnJhbmRpbmcvZm9vLnBuZ1xuICBjb25zdCB1cGxvYWRSb290ID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksICdzZXJ2ZXInLCAndXBsb2FkcycpO1xuICBpZiAoIWZzLmV4aXN0c1N5bmModXBsb2FkUm9vdCkpIGZzLm1rZGlyU3luYyh1cGxvYWRSb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgYXBwLnVzZSgnL3VwbG9hZHMnLCBleHByZXNzLnN0YXRpYyh1cGxvYWRSb290LCB7IG1heEFnZTogJzdkJyB9KSk7XG5cbiAgLy8gTW91bnQgdGhlIGVudGlyZSBKU09OIEFQSS5cbiAgYXBwLnVzZSgnL2FwaScsIGJ1aWxkQXBpUm91dGVyKCkpO1xuXG4gIGNvbnN0IGh0dHBTZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcihhcHApO1xuXG4gIGlmIChpc0Rldikge1xuICAgIC8vIFZpdGUgaW4gbWlkZGxld2FyZSBtb2RlIFx1MjAxNCBzaW5nbGUgcG9ydCwgc2luZ2xlIHByb2Nlc3MsIGZ1bGwgSE1SLlxuICAgIGNvbnN0IHsgY3JlYXRlU2VydmVyOiBjcmVhdGVWaXRlU2VydmVyIH0gPSBhd2FpdCBpbXBvcnQoJ3ZpdGUnKTtcbiAgICBjb25zdCB2aXRlID0gYXdhaXQgY3JlYXRlVml0ZVNlcnZlcih7XG4gICAgICBzZXJ2ZXI6IHtcbiAgICAgICAgbWlkZGxld2FyZU1vZGU6IHRydWUsXG4gICAgICAgIGhtcjogeyBzZXJ2ZXI6IGh0dHBTZXJ2ZXIgfSxcbiAgICAgICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGFwcFR5cGU6ICdzcGEnLFxuICAgIH0pO1xuICAgIGFwcC51c2Uodml0ZS5taWRkbGV3YXJlcyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gUHJvZHVjdGlvbjogc2VydmUgdGhlIHByZS1idWlsdCBTUEEgZnJvbSBkaXN0L3B1YmxpYy5cbiAgICAvLyBWaXRlIGlzIGNvbmZpZ3VyZWQgdG8gb3V0cHV0IHRoZXJlICh2aXRlLmNvbmZpZy50cyBcdTIxOTIgYnVpbGQub3V0RGlyKS5cbiAgICBjb25zdCBkaXN0UHVibGljID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksICdkaXN0JywgJ3B1YmxpYycpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXN0UHVibGljKSkge1xuICAgICAgd3JpdGVMb2coJ0VSUk9SJywgYGRpc3QvcHVibGljIG5vdCBmb3VuZCBhdCAke2Rpc3RQdWJsaWN9LiBSdW4gJ25wbSBydW4gYnVpbGQnIGZpcnN0LmApO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBkaXN0L3B1YmxpYyBub3QgZm91bmQuIFJ1biAnbnBtIHJ1biBidWlsZCcgZmlyc3QuYCk7XG4gICAgfVxuICAgIGFwcC51c2UoZXhwcmVzcy5zdGF0aWMoZGlzdFB1YmxpYywgeyBtYXhBZ2U6ICcxZCcgfSkpO1xuICAgIC8vIFNQQSBmYWxsYmFjayBcdTIwMTQgYWxsIHVua25vd24gcm91dGVzIHJldHVybiBpbmRleC5odG1sIHNvIGNsaWVudC1zaWRlXG4gICAgLy8gcm91dGluZyAoZS5nLiAvcGFuZWwtYWRtaW4pIHdvcmtzIGNvcnJlY3RseS5cbiAgICBhcHAuZ2V0KCcqJywgKF9yZXEsIHJlcykgPT4gcmVzLnNlbmRGaWxlKHBhdGguam9pbihkaXN0UHVibGljLCAnaW5kZXguaHRtbCcpKSk7XG4gIH1cblxuICBodHRwU2VydmVyLmxpc3RlbihQT1JULCBIT1NULCAoKSA9PiB7XG4gICAgY29uc3QgYXBwVXJsID0gcHJvY2Vzcy5lbnYuQVBQX1VSTCB8fCBgaHR0cDovLyR7SE9TVH06JHtQT1JUfWA7XG4gICAgY29uc29sZS5sb2coYFtzZXJ2ZXJdIHJlYWR5IG9uIGh0dHA6Ly8ke0hPU1R9OiR7UE9SVH0gKEFQUF9VUkw9JHthcHBVcmx9KWApO1xuICAgIHdyaXRlTG9nKCdXQVJOJywgYFNlcnZlciBzdGFydGVkIFx1MjAxNCBwb3J0PSR7UE9SVH0gZW52PSR7cHJvY2Vzcy5lbnYuTk9ERV9FTlYgPz8gJ2RldmVsb3BtZW50J31gKTtcbiAgfSk7XG59XG5cbnN0YXJ0KCkuY2F0Y2goKGVycikgPT4ge1xuICB3cml0ZUxvZygnRVJST1InLCAnRmF0YWwgc3RhcnR1cCBlcnJvcicsIGVycik7XG4gIHByb2Nlc3MuZXhpdCgxKTtcbn0pO1xuIiwgImltcG9ydCBleHByZXNzLCB7IHR5cGUgUmVxdWVzdCwgdHlwZSBSZXNwb25zZSwgdHlwZSBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCBtdWx0ZXIgZnJvbSAnbXVsdGVyJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCAqIGFzIFhMU1ggZnJvbSAneGxzeCc7XG5pbXBvcnQgeyBzcWwsIGVxLCBpbGlrZSwgb3IsIGFuZCwgYXNjLCBkZXNjLCBpbkFycmF5IH0gZnJvbSAnZHJpenpsZS1vcm0nO1xuaW1wb3J0IHtcbiAgcG9vbCxcbiAgZGIsXG4gIHNjaGVtYSxcbiAgbWlncmF0ZSxcbiAgaW1wb3J0TGVnYWN5SnNvbklmUHJlc2VudCxcbiAgcGluZyxcbiAgY291bnRzLFxuICBnZXRBbGxTZXR0aW5ncyxcbiAgc2V0U2V0dGluZ3MsXG4gIHNldFNldHRpbmcsXG4gIGdldFNldHRpbmcsXG4gIGRlY29yYXRlU3R1ZGVudCxcbiAgcm93VG9TdHVkZW50LFxuICByb3dUb0dhbGxlcnksXG4gIG5vd0lzbyxcbiAgdHlwZSBTdHVkZW50LFxuICB0eXBlIEdhbGxlcnlJdGVtLFxufSBmcm9tICcuL2RiLmpzJztcblxuY29uc3QgQURNSU5fVVNFUiA9ICdqb2JlbmFwcCc7XG5jb25zdCBBRE1JTl9QQVNTID0gJzA4MTQ2MDA4MTM0Myc7XG5cbmNvbnN0IEFMTE9XRURfU0VUVElOR19LRVlTID0gW1xuICAnYW5ub3VuY2VtZW50X2RhdGUnLFxuICAnYW5ub3VuY2VtZW50X3RpbWUnLFxuICAnbWFpbnRlbmFuY2VfbW9kZScsXG4gICdzaG93X3VuZHVoX3NrbCcsXG4gICdoZWFkbGluZScsXG4gICdzY2hvb2xfbmFtZScsXG4gICdzY2hvb2xfbnBzbicsXG4gICdzY2hvb2xfYWRkcmVzcycsXG4gICdwcmluY2lwYWxfbmFtZScsXG4gICdzY2hvb2xfbG9nbycsXG4gICdwcmluY2lwYWxfcGhvdG8nLFxuICAnbW90aXZhdGlvbl9tZXNzYWdlJyxcbl0gYXMgY29uc3Q7XG5cbmNvbnN0IFVQTE9BRF9ST09UID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksICdzZXJ2ZXInLCAndXBsb2FkcycpO1xuXG5mdW5jdGlvbiBlbnN1cmVEaXIocDogc3RyaW5nKSB7XG4gIGlmICghZnMuZXhpc3RzU3luYyhwKSkgZnMubWtkaXJTeW5jKHAsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xufVxuXG5lbnN1cmVEaXIoVVBMT0FEX1JPT1QpO1xuZW5zdXJlRGlyKHBhdGguam9pbihVUExPQURfUk9PVCwgJ2JyYW5kaW5nJykpO1xuZW5zdXJlRGlyKHBhdGguam9pbihVUExPQURfUk9PVCwgJ3ByaW5jaXBhbCcpKTtcbmVuc3VyZURpcihwYXRoLmpvaW4oVVBMT0FEX1JPT1QsICdnYWxsZXJpZXMnKSk7XG5cbmNvbnN0IHN0b3JhZ2UgPSBtdWx0ZXIuZGlza1N0b3JhZ2Uoe1xuICBkZXN0aW5hdGlvbjogKF9yZXEsIGZpbGUsIGNiKSA9PiB7XG4gICAgbGV0IHN1YiA9ICdtaXNjJztcbiAgICBpZiAoZmlsZS5maWVsZG5hbWUgPT09ICdsb2dvJykgc3ViID0gJ2JyYW5kaW5nJztcbiAgICBlbHNlIGlmIChmaWxlLmZpZWxkbmFtZSA9PT0gJ3ByaW5jaXBhbF9waG90bycpIHN1YiA9ICdwcmluY2lwYWwnO1xuICAgIGVsc2UgaWYgKGZpbGUuZmllbGRuYW1lID09PSAnaW1hZ2UnKSBzdWIgPSAnZ2FsbGVyaWVzJztcbiAgICBjYihudWxsLCBwYXRoLmpvaW4oVVBMT0FEX1JPT1QsIHN1YikpO1xuICB9LFxuICBmaWxlbmFtZTogKF9yZXEsIGZpbGUsIGNiKSA9PiB7XG4gICAgY29uc3Qgc2FmZUJhc2UgPSBmaWxlLm9yaWdpbmFsbmFtZVxuICAgICAgLnJlcGxhY2UoL1xcLlteLl0rJC8sICcnKVxuICAgICAgLnJlcGxhY2UoL1teYS16QS1aMC05Xy1dKy9nLCAnXycpXG4gICAgICAuc2xpY2UoMCwgNjApIHx8ICdmaWxlJztcbiAgICBjb25zdCBleHQgPSAocGF0aC5leHRuYW1lKGZpbGUub3JpZ2luYWxuYW1lKSB8fCAnLmpwZycpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgaWQgPSBjcnlwdG8ucmFuZG9tQnl0ZXMoOCkudG9TdHJpbmcoJ2hleCcpO1xuICAgIGNiKG51bGwsIGAke3NhZmVCYXNlfV8ke2lkfSR7ZXh0fWApO1xuICB9LFxufSk7XG5cbmNvbnN0IHVwbG9hZEdlbmVyYWwgPSBtdWx0ZXIoeyBzdG9yYWdlLCBsaW1pdHM6IHsgZmlsZVNpemU6IDEwICogMTAyNCAqIDEwMjQgfSB9KTtcbmNvbnN0IHVwbG9hZEV4Y2VsID0gbXVsdGVyKHsgc3RvcmFnZTogbXVsdGVyLm1lbW9yeVN0b3JhZ2UoKSwgbGltaXRzOiB7IGZpbGVTaXplOiAxMCAqIDEwMjQgKiAxMDI0IH0gfSk7XG5cbi8vIC0tLS0tIFNlc3Npb25zIChpbi1tZW1vcnkpIC0tLS0tXG50eXBlIFNlc3Npb24gPSB7IHVzZXJuYW1lOiBzdHJpbmc7IHJvbGU6IHN0cmluZzsgcmVhZF9vbmx5OiBib29sZWFuOyBpc3N1ZWRfYXQ6IHN0cmluZyB9O1xuY29uc3Qgc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgU2Vzc2lvbj4oKTtcbmZ1bmN0aW9uIHJlYWRUb2tlbihyZXE6IFJlcXVlc3QpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgaCA9IHJlcS5oZWFkZXIoJ2F1dGhvcml6YXRpb24nKSB8fCByZXEuaGVhZGVyKCdBdXRob3JpemF0aW9uJykgfHwgJyc7XG4gIGNvbnN0IG0gPSAvXkJlYXJlclxccysoLispJC8uZXhlYyhoKTtcbiAgaWYgKG0pIHJldHVybiBtWzFdLnRyaW0oKTtcbiAgY29uc3QgdCA9IChyZXEuaGVhZGVyKCd4LWFkbWluLXRva2VuJykgfHwgcmVxLnF1ZXJ5LnRva2VuKSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIHJldHVybiB0ID8gU3RyaW5nKHQpIDogbnVsbDtcbn1cblxuLy8gLS0tLSBoZWxwZXJzIC0tLS1cbmNvbnN0IG9rID0gPFQ+KGRhdGE/OiBULCBtZXNzYWdlPzogc3RyaW5nKSA9PiAoeyBzdWNjZXNzOiB0cnVlLCAuLi4oZGF0YSAhPT0gdW5kZWZpbmVkID8geyBkYXRhIH0gOiB7fSksIC4uLihtZXNzYWdlID8geyBtZXNzYWdlIH0gOiB7fSkgfSk7XG5cbmZ1bmN0aW9uIHB1YmxpY0Fzc2V0VXJsKHJlcTogUmVxdWVzdCwgcmVsUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGlmICghcmVsUGF0aCkgcmV0dXJuICcnO1xuICBpZiAoL14oaHR0cHM/Oik/XFwvXFwvL2kudGVzdChyZWxQYXRoKSkgcmV0dXJuIHJlbFBhdGg7XG4gIGlmIChyZWxQYXRoLnN0YXJ0c1dpdGgoJ2RhdGE6JykpIHJldHVybiByZWxQYXRoO1xuICBjb25zdCBvcmlnaW4gPSBgJHtyZXEucHJvdG9jb2x9Oi8vJHtyZXEuZ2V0KCdob3N0Jyl9YDtcbiAgcmV0dXJuIGAke29yaWdpbn0vdXBsb2Fkcy8ke3JlbFBhdGgucmVwbGFjZSgvXlxcLysvLCAnJykucmVwbGFjZSgvXnVwbG9hZHNcXC8vLCAnJyl9YDtcbn1cblxuZnVuY3Rpb24gaXNBbm5vdW5jZW1lbnRBY3RpdmUoZGF0ZTogc3RyaW5nLCB0aW1lOiBzdHJpbmcpOiB7IGlzbzogc3RyaW5nOyBhY3RpdmU6IGJvb2xlYW4gfSB7XG4gIGlmICghZGF0ZSB8fCAhdGltZSkgcmV0dXJuIHsgaXNvOiAnJywgYWN0aXZlOiBmYWxzZSB9O1xuICBjb25zdCBpc28gPSBuZXcgRGF0ZShgJHtkYXRlfVQke3RpbWV9OjAwYCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3QgYWN0aXZlID0gbmV3IERhdGUoaXNvKS5nZXRUaW1lKCkgPD0gRGF0ZS5ub3coKTtcbiAgcmV0dXJuIHsgaXNvLCBhY3RpdmUgfTtcbn1cblxuLy8gV3JhcCBhc3luYyByb3V0ZSBoYW5kbGVycyBzbyB0aHJvd24gZXJyb3JzIHJldHVybiA1MDAgSlNPTiBpbnN0ZWFkIG9mIGhhbmdpbmdcbmZ1bmN0aW9uIGF3KGZuOiAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiBQcm9taXNlPGFueT4pIHtcbiAgcmV0dXJuIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgICBmbihyZXEsIHJlcykuY2F0Y2goKGVycikgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcignW2FwaSBlcnJvcl0nLCByZXEubWV0aG9kLCByZXEucGF0aCwgZXJyKTtcbiAgICAgIGlmICghcmVzLmhlYWRlcnNTZW50KSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdTZXJ2ZXIgZXJyb3I6ICcgKyAoZXJyPy5tZXNzYWdlID8/ICd1bmtub3duJykgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59XG5cbi8vIC0tLS0gUk9VVEVSIC0tLS1cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFwaVJvdXRlcigpOiBSb3V0ZXIge1xuICBjb25zdCByID0gZXhwcmVzcy5Sb3V0ZXIoKTtcbiAgci51c2UoZXhwcmVzcy5qc29uKHsgbGltaXQ6ICcxMG1iJyB9KSk7XG4gIHIudXNlKGV4cHJlc3MudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiB0cnVlLCBsaW1pdDogJzEwbWInIH0pKTtcblxuICAvLyBCb290LXRpbWUgc2V0dXA6IGVuc3VyZSB0YWJsZXMgZXhpc3QgKyBtaWdyYXRlIGxlZ2FjeSBKU09OIGlmIHByZXNlbnQuXG4gIChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG1pZ3JhdGUoKTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGltcG9ydExlZ2FjeUpzb25JZlByZXNlbnQoKTtcbiAgICAgIGlmIChyZXMubWlncmF0ZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tkYl0gbGVnYWN5IHNlcnZlci9kYXRhLmpzb24gaW1wb3J0ZWQgaW50byBQb3N0Z3JlU1FMOicsIHJlcy5pbnNlcnRlZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcignW2RiXSBib290IHNldHVwIGZhaWxlZDonLCBlKTtcbiAgICB9XG4gIH0pKCk7XG5cbiAgLy8gLS0tLS0tLS0gUHVibGljIC0tLS0tLS0tXG4gIHIuZ2V0KCcvc2Nob29sLWluZm8nLCBhdyhhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBzID0gYXdhaXQgZ2V0QWxsU2V0dGluZ3MoKTtcbiAgICBjb25zdCB7IGlzbywgYWN0aXZlIH0gPSBpc0Fubm91bmNlbWVudEFjdGl2ZShzLmFubm91bmNlbWVudF9kYXRlID8/ICcnLCBzLmFubm91bmNlbWVudF90aW1lID8/ICcnKTtcbiAgICByZXMuanNvbihvayh7XG4gICAgICBoZWFkbGluZTogcy5oZWFkbGluZSA/PyAnJyxcbiAgICAgIHNjaG9vbF9uYW1lOiBzLnNjaG9vbF9uYW1lID8/ICdTTUtOIDEgV29ub2dpcmknLFxuICAgICAgc2Nob29sX25wc246IHMuc2Nob29sX25wc24gPz8gJycsXG4gICAgICBzY2hvb2xfYWRkcmVzczogcy5zY2hvb2xfYWRkcmVzcyA/PyAnJyxcbiAgICAgIHNjaG9vbF9sb2dvOiBwdWJsaWNBc3NldFVybChyZXEsIHMuc2Nob29sX2xvZ28pLFxuICAgICAgcHJpbmNpcGFsX25hbWU6IHMucHJpbmNpcGFsX25hbWUgPz8gJycsXG4gICAgICBwcmluY2lwYWxfcGhvdG86IHB1YmxpY0Fzc2V0VXJsKHJlcSwgcy5wcmluY2lwYWxfcGhvdG8pLFxuICAgICAgbW90aXZhdGlvbl9tZXNzYWdlOiBzLm1vdGl2YXRpb25fbWVzc2FnZSA/PyAnJyxcbiAgICAgIGFubm91bmNlbWVudF9kYXRldGltZTogaXNvLFxuICAgICAgYW5ub3VuY2VtZW50X2FjdGl2ZTogYWN0aXZlLFxuICAgICAgbWFpbnRlbmFuY2VfbW9kZTogcy5tYWludGVuYW5jZV9tb2RlID09PSAnMScsXG4gICAgICBzaG93X3VuZHVoX3NrbDogcy5zaG93X3VuZHVoX3NrbCA9PT0gJzEnLFxuICAgIH0pKTtcbiAgfSkpO1xuXG4gIHIuZ2V0KCcvZ2FsbGVyaWVzJywgYXcoYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgcm93cyA9IGF3YWl0IGRiLnNlbGVjdCgpLmZyb20oc2NoZW1hLmdhbGxlcmllcykub3JkZXJCeShkZXNjKHNjaGVtYS5nYWxsZXJpZXMuaWQpKTtcbiAgICBjb25zdCBpdGVtcyA9IHJvd3MubWFwKChnKSA9PiAoe1xuICAgICAgaWQ6IGcuaWQsXG4gICAgICBpbWFnZV9wYXRoOiBwdWJsaWNBc3NldFVybChyZXEsIGcuaW1hZ2VfcGF0aCksXG4gICAgICB0aXRsZTogZy50aXRsZSA/PyAnJyxcbiAgICAgIGNyZWF0ZWRfYXQ6IGcuY3JlYXRlZF9hdD8udG9JU09TdHJpbmcoKSA/PyBub3dJc28oKSxcbiAgICB9KSk7XG4gICAgcmVzLmpzb24ob2soaXRlbXMpKTtcbiAgfSkpO1xuXG4gIHIucG9zdCgnL2NoZWNrLXN0YXR1cycsIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHMgPSBhd2FpdCBnZXRBbGxTZXR0aW5ncygpO1xuICAgIGNvbnN0IHsgYWN0aXZlIH0gPSBpc0Fubm91bmNlbWVudEFjdGl2ZShzLmFubm91bmNlbWVudF9kYXRlID8/ICcnLCBzLmFubm91bmNlbWVudF90aW1lID8/ICcnKTtcbiAgICBpZiAocy5hbm5vdW5jZW1lbnRfZGF0ZSAmJiBzLmFubm91bmNlbWVudF90aW1lICYmICFhY3RpdmUpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMykuanNvbih7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBtZXNzYWdlOiBgU2FiYXIsIHBlbmd1bXVtYW4gYmVsdW0gZGlidWthISBLZW1iYWxpIGxhZ2kgamFtICR7cy5hbm5vdW5jZW1lbnRfdGltZX0gV0lCLmAsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgeyBuaXNuLCBiaXJ0aF9kYXRlIH0gPSByZXEuYm9keSA/PyB7fTtcbiAgICBpZiAoIW5pc24gfHwgIWJpcnRoX2RhdGUpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQyMikuanNvbih7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiAnTklTTiBkYW4gdGFuZ2dhbCBsYWhpciB3YWppYiBkaWlzaS4nIH0pO1xuICAgIH1cbiAgICBjb25zdCBiZCA9IFN0cmluZyhiaXJ0aF9kYXRlKS5zbGljZSgwLCAxMCk7XG4gICAgY29uc3QgZm91bmQgPSAoYXdhaXQgZGIuc2VsZWN0KCkuZnJvbShzY2hlbWEuc3R1ZGVudHMpXG4gICAgICAud2hlcmUoYW5kKGVxKHNjaGVtYS5zdHVkZW50cy5uaXNuLCBTdHJpbmcobmlzbikpLCBlcShzY2hlbWEuc3R1ZGVudHMuYmlydGhfZGF0ZSwgYmQpKSlcbiAgICAgIC5saW1pdCgxKSlbMF07XG4gICAgaWYgKCFmb3VuZCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdEYXRhIE5JU04gYXRhdSBUYW5nZ2FsIExhaGlyIHRpZGFrIGRpdGVtdWthbi4nIH0pO1xuICAgIH1cbiAgICBhd2FpdCBkYi51cGRhdGUoc2NoZW1hLnN0dWRlbnRzKVxuICAgICAgLnNldCh7IHZpZXdlZF9hdDogbmV3IERhdGUoKSB9KVxuICAgICAgLndoZXJlKGVxKHNjaGVtYS5zdHVkZW50cy5pZCwgZm91bmQuaWQpKTtcbiAgICBjb25zdCBmcmVzaCA9IChhd2FpdCBkYi5zZWxlY3QoKS5mcm9tKHNjaGVtYS5zdHVkZW50cykud2hlcmUoZXEoc2NoZW1hLnN0dWRlbnRzLmlkLCBmb3VuZC5pZCkpLmxpbWl0KDEpKVswXTtcbiAgICByZXMuanNvbihvayhkZWNvcmF0ZVN0dWRlbnQocm93VG9TdHVkZW50KGZyZXNoKSkpKTtcbiAgfSkpO1xuXG4gIC8vIC0tLS0tLS0tIFBhbmVsIGFkbWluIGF1dGggLS0tLS0tLS1cbiAgci5wb3N0KCcvcGFuZWwtYWRtaW4vbG9naW4nLCAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCB9ID0gcmVxLmJvZHkgPz8ge307XG4gICAgaWYgKCF1c2VybmFtZSB8fCAhcGFzc3dvcmQpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQyMikuanNvbih7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiAnVXNlcm5hbWUgZGFuIHBhc3N3b3JkIHdhamliIGRpaXNpLicgfSk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXIgPSBTdHJpbmcodXNlcm5hbWUpLnRyaW0oKTtcbiAgICBjb25zdCBwYXNzID0gU3RyaW5nKHBhc3N3b3JkKTtcbiAgICBsZXQgdmFsaWQgPSB1c2VyID09PSBBRE1JTl9VU0VSICYmIHBhc3MubGVuZ3RoID09PSBBRE1JTl9QQVNTLmxlbmd0aDtcbiAgICBpZiAodmFsaWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhbGlkID0gY3J5cHRvLnRpbWluZ1NhZmVFcXVhbChCdWZmZXIuZnJvbShwYXNzKSwgQnVmZmVyLmZyb20oQURNSU5fUEFTUykpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHZhbGlkID0gcGFzcyA9PT0gQURNSU5fUEFTUztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCF2YWxpZCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdVc2VybmFtZSBhdGF1IHBhc3N3b3JkIHNhbGFoLicgfSk7XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gY3J5cHRvLnJhbmRvbUJ5dGVzKDI0KS50b1N0cmluZygnaGV4Jyk7XG4gICAgc2Vzc2lvbnMuc2V0KHRva2VuLCB7XG4gICAgICB1c2VybmFtZTogQURNSU5fVVNFUixcbiAgICAgIHJvbGU6ICdidWlsdF9pbl9hZG1pbicsXG4gICAgICByZWFkX29ubHk6IHRydWUsXG4gICAgICBpc3N1ZWRfYXQ6IG5vd0lzbygpLFxuICAgIH0pO1xuICAgIHJlcy5qc29uKG9rKHsgdXNlcm5hbWU6IEFETUlOX1VTRVIsIHJvbGU6ICdidWlsdF9pbl9hZG1pbicsIHRva2VuLCByZWRpcmVjdDogJy9wYW5lbC1hZG1pbi9kYXNoYm9hcmQnIH0pKTtcbiAgfSk7XG5cbiAgci5wb3N0KCcvcGFuZWwtYWRtaW4vbG9nb3V0JywgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3QgdCA9IHJlYWRUb2tlbihyZXEpO1xuICAgIGlmICh0KSBzZXNzaW9ucy5kZWxldGUodCk7XG4gICAgcmVzLmpzb24ob2soKSk7XG4gIH0pO1xuXG4gIHIuZ2V0KCcvcGFuZWwtYWRtaW4vbWUnLCAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCB0ID0gcmVhZFRva2VuKHJlcSk7XG4gICAgY29uc3Qgc2VzcyA9IHQgPyBzZXNzaW9ucy5nZXQodCkgOiBudWxsO1xuICAgIGlmICghc2VzcykgcmV0dXJuIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdCZWx1bSBsb2dpbi4nIH0pO1xuICAgIHJlcy5qc29uKG9rKHtcbiAgICAgIHVzZXJuYW1lOiBzZXNzLnVzZXJuYW1lLFxuICAgICAgcm9sZTogc2Vzcy5yb2xlLFxuICAgICAgcmVhZF9vbmx5OiBzZXNzLnJlYWRfb25seSxcbiAgICAgIGlzc3VlZF9hdDogc2Vzcy5pc3N1ZWRfYXQsXG4gICAgfSkpO1xuICB9KTtcblxuICAvLyAtLS0tLS0tLSBBZG1pbjogc3RhdHMgLyBzdHVkZW50cyAtLS0tLS0tLVxuICByLmdldCgnL2FkbWluL3N0YXRzJywgYXcoYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHRvdGFsUm93ID0gYXdhaXQgcG9vbC5xdWVyeTx7IGM6IHN0cmluZyB9PignU0VMRUNUIENPVU5UKCopOjp0ZXh0IGMgRlJPTSBzdHVkZW50cycpO1xuICAgIGNvbnN0IGx1bHVzUm93ID0gYXdhaXQgcG9vbC5xdWVyeTx7IGM6IHN0cmluZyB9PignU0VMRUNUIENPVU5UKCopOjp0ZXh0IGMgRlJPTSBzdHVkZW50cyBXSEVSRSBzdGF0dXNfZ3JhZHVhdGlvbiA9IDEnKTtcbiAgICBjb25zdCBjaGVja2VkUm93ID0gYXdhaXQgcG9vbC5xdWVyeTx7IGM6IHN0cmluZyB9PignU0VMRUNUIENPVU5UKCopOjp0ZXh0IGMgRlJPTSBzdHVkZW50cyBXSEVSRSB2aWV3ZWRfYXQgSVMgTk9UIE5VTEwnKTtcbiAgICBjb25zdCB0b3RhbCA9IE51bWJlcih0b3RhbFJvdy5yb3dzWzBdLmMpO1xuICAgIGNvbnN0IGx1bHVzID0gTnVtYmVyKGx1bHVzUm93LnJvd3NbMF0uYyk7XG4gICAgcmVzLmpzb24ob2soeyB0b3RhbCwgbHVsdXMsIHRpZGFrTHVsdXM6IHRvdGFsIC0gbHVsdXMsIGNoZWNrZWQ6IE51bWJlcihjaGVja2VkUm93LnJvd3NbMF0uYykgfSkpO1xuICB9KSk7XG5cbiAgci5nZXQoJy9hZG1pbi9zdHVkZW50cycsIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHNlYXJjaCA9IFN0cmluZyhyZXEucXVlcnkuc2VhcmNoID8/ICcnKS50cmltKCk7XG4gICAgY29uc3QgcGVyUGFnZSA9IDE1O1xuICAgIGNvbnN0IHBhZ2UgPSBNYXRoLm1heCgxLCBwYXJzZUludChTdHJpbmcocmVxLnF1ZXJ5LnBhZ2UgPz8gJzEnKSwgMTApIHx8IDEpO1xuXG4gICAgbGV0IHdoZXJlID0gdW5kZWZpbmVkIGFzIGFueTtcbiAgICBpZiAoc2VhcmNoKSB7XG4gICAgICBjb25zdCBxID0gYCUke3NlYXJjaH0lYDtcbiAgICAgIHdoZXJlID0gb3IoXG4gICAgICAgIGlsaWtlKHNjaGVtYS5zdHVkZW50cy5uYW1lLCBxKSxcbiAgICAgICAgaWxpa2Uoc2NoZW1hLnN0dWRlbnRzLm5pc24sIHEpLFxuICAgICAgICBpbGlrZShzY2hlbWEuc3R1ZGVudHMuY2xhc3MsIHEpLFxuICAgICAgICBpbGlrZShzY2hlbWEuc3R1ZGVudHMubWFqb3IsIHEpLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB0b3RhbFJvdyA9IHdoZXJlXG4gICAgICA/IGF3YWl0IHBvb2wucXVlcnk8eyBjOiBzdHJpbmcgfT4oXG4gICAgICAgICAgYFNFTEVDVCBDT1VOVCgqKTo6dGV4dCBjIEZST00gc3R1ZGVudHMgV0hFUkUgbmFtZSBJTElLRSAkMSBPUiBuaXNuIElMSUtFICQxIE9SIGNsYXNzIElMSUtFICQxIE9SIG1ham9yIElMSUtFICQxYCxcbiAgICAgICAgICBbYCUke3NlYXJjaH0lYF0sXG4gICAgICAgIClcbiAgICAgIDogYXdhaXQgcG9vbC5xdWVyeTx7IGM6IHN0cmluZyB9PignU0VMRUNUIENPVU5UKCopOjp0ZXh0IGMgRlJPTSBzdHVkZW50cycpO1xuICAgIGNvbnN0IHRvdGFsID0gTnVtYmVyKHRvdGFsUm93LnJvd3NbMF0uYyk7XG4gICAgY29uc3QgbGFzdF9wYWdlID0gTWF0aC5tYXgoMSwgTWF0aC5jZWlsKHRvdGFsIC8gcGVyUGFnZSkpO1xuICAgIGNvbnN0IGN1ciA9IE1hdGgubWluKHBhZ2UsIGxhc3RfcGFnZSk7XG5cbiAgICBjb25zdCByb3dzUSA9IGRiLnNlbGVjdCgpLmZyb20oc2NoZW1hLnN0dWRlbnRzKVxuICAgICAgLm9yZGVyQnkoYXNjKHNjaGVtYS5zdHVkZW50cy5jbGFzcyksIGFzYyhzY2hlbWEuc3R1ZGVudHMubmFtZSkpXG4gICAgICAubGltaXQocGVyUGFnZSkub2Zmc2V0KChjdXIgLSAxKSAqIHBlclBhZ2UpO1xuICAgIGNvbnN0IHJvd3MgPSB3aGVyZSA/IGF3YWl0IHJvd3NRLndoZXJlKHdoZXJlKSA6IGF3YWl0IHJvd3NRO1xuXG4gICAgcmVzLmpzb24ob2soe1xuICAgICAgZGF0YTogcm93cy5tYXAoKHIpID0+IGRlY29yYXRlU3R1ZGVudChyb3dUb1N0dWRlbnQocikpKSxcbiAgICAgIGN1cnJlbnRfcGFnZTogY3VyLFxuICAgICAgbGFzdF9wYWdlLFxuICAgICAgcGVyX3BhZ2U6IHBlclBhZ2UsXG4gICAgICB0b3RhbCxcbiAgICB9KSk7XG4gIH0pKTtcblxuICByLnBvc3QoJy9hZG1pbi9zdHVkZW50cy86aWQoXFxcXGQrKScsIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IGlkID0gTnVtYmVyKHJlcS5wYXJhbXMuaWQpO1xuICAgIGNvbnN0IGFsbG93ZWQgPSBbJ25hbWUnLCAnYmlydGhfcGxhY2UnLCAnYmlydGhfZGF0ZScsICdjbGFzcycsICdtYWpvcicsICdzdGF0dXNfZ3JhZHVhdGlvbiddIGFzIGNvbnN0O1xuICAgIGNvbnN0IHBhdGNoOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgZm9yIChjb25zdCBrIG9mIGFsbG93ZWQpIHtcbiAgICAgIGlmIChrIGluIHJlcS5ib2R5KSBwYXRjaFtrXSA9IHJlcS5ib2R5W2tdO1xuICAgIH1cbiAgICBpZiAoJ3N0YXR1c19ncmFkdWF0aW9uJyBpbiBwYXRjaCkge1xuICAgICAgcGF0Y2guc3RhdHVzX2dyYWR1YXRpb24gPSAocGF0Y2guc3RhdHVzX2dyYWR1YXRpb24gPT09IHRydWUgfHwgcGF0Y2guc3RhdHVzX2dyYWR1YXRpb24gPT09IDEgfHwgcGF0Y2guc3RhdHVzX2dyYWR1YXRpb24gPT09ICcxJykgPyAxIDogMDtcbiAgICB9XG4gICAgaWYgKCdiaXJ0aF9kYXRlJyBpbiBwYXRjaCkge1xuICAgICAgcGF0Y2guYmlydGhfZGF0ZSA9IFN0cmluZyhwYXRjaC5iaXJ0aF9kYXRlID8/ICcnKS5zbGljZSgwLCAxMCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhwYXRjaCkubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MjIpLmpzb24oeyBzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogJ1RpZGFrIGFkYSBmaWVsZCB5YW5nIGRpdWJhaC4nIH0pO1xuICAgIH1cbiAgICBwYXRjaC51cGRhdGVkX2F0ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB1cGRhdGVkID0gYXdhaXQgZGIudXBkYXRlKHNjaGVtYS5zdHVkZW50cykuc2V0KHBhdGNoKS53aGVyZShlcShzY2hlbWEuc3R1ZGVudHMuaWQsIGlkKSkucmV0dXJuaW5nKCk7XG4gICAgaWYgKHVwZGF0ZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogJ1Npc3dhIHRpZGFrIGRpdGVtdWthbi4nIH0pO1xuICAgIH1cbiAgICByZXMuanNvbih7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdEYXRhIHNpc3dhIGJlcmhhc2lsIGRpcGVyYmFydWknLCBzdHVkZW50OiBkZWNvcmF0ZVN0dWRlbnQocm93VG9TdHVkZW50KHVwZGF0ZWRbMF0pKSB9KTtcbiAgfSkpO1xuXG4gIC8vIC0tLS0tLS0tIEFkbWluOiBzZXR0aW5ncyAtLS0tLS0tLVxuICByLmdldCgnL2FkbWluL3NldHRpbmdzJywgYXcoYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHMgPSBhd2FpdCBnZXRBbGxTZXR0aW5ncygpO1xuICAgIHJlcy5qc29uKG9rKHtcbiAgICAgIGFubm91bmNlbWVudF9kYXRlOiBzLmFubm91bmNlbWVudF9kYXRlID8/ICcnLFxuICAgICAgYW5ub3VuY2VtZW50X3RpbWU6IHMuYW5ub3VuY2VtZW50X3RpbWUgPz8gJycsXG4gICAgICBtYWludGVuYW5jZV9tb2RlOiBzLm1haW50ZW5hbmNlX21vZGUgPT09ICcxJyxcbiAgICAgIHNob3dfdW5kdWhfc2tsOiBzLnNob3dfdW5kdWhfc2tsID09PSAnMScsXG4gICAgICBoZWFkbGluZTogcy5oZWFkbGluZSA/PyAnJyxcbiAgICAgIHNjaG9vbF9uYW1lOiBzLnNjaG9vbF9uYW1lID8/ICdTTUtOIDEgV29ub2dpcmknLFxuICAgICAgc2Nob29sX25wc246IHMuc2Nob29sX25wc24gPz8gJycsXG4gICAgICBzY2hvb2xfYWRkcmVzczogcy5zY2hvb2xfYWRkcmVzcyA/PyAnJyxcbiAgICAgIHByaW5jaXBhbF9uYW1lOiBzLnByaW5jaXBhbF9uYW1lID8/ICcnLFxuICAgICAgc2Nob29sX2xvZ286IHMuc2Nob29sX2xvZ28gfHwgbnVsbCxcbiAgICAgIHByaW5jaXBhbF9waG90bzogcy5wcmluY2lwYWxfcGhvdG8gfHwgbnVsbCxcbiAgICAgIG1vdGl2YXRpb25fbWVzc2FnZTogcy5tb3RpdmF0aW9uX21lc3NhZ2UgPz8gJycsXG4gICAgfSkpO1xuICB9KSk7XG5cbiAgci5wb3N0KCcvYWRtaW4vc2V0dGluZ3MnLFxuICAgIHVwbG9hZEdlbmVyYWwuZmllbGRzKFt7IG5hbWU6ICdsb2dvJywgbWF4Q291bnQ6IDEgfSwgeyBuYW1lOiAncHJpbmNpcGFsX3Bob3RvJywgbWF4Q291bnQ6IDEgfV0pLFxuICAgIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgICAgY29uc3QgYm9keSA9IHJlcS5ib2R5ID8/IHt9O1xuICAgICAgaWYgKGJvZHkucHJpbmNpcGFsX21vdGl2YXRpb24gJiYgIWJvZHkubW90aXZhdGlvbl9tZXNzYWdlKSB7XG4gICAgICAgIGJvZHkubW90aXZhdGlvbl9tZXNzYWdlID0gYm9keS5wcmluY2lwYWxfbW90aXZhdGlvbjtcbiAgICAgIH1cbiAgICAgIGlmICgnbWFpbnRlbmFuY2VfbW9kZScgaW4gYm9keSkge1xuICAgICAgICBjb25zdCB2ID0gYm9keS5tYWludGVuYW5jZV9tb2RlO1xuICAgICAgICBib2R5Lm1haW50ZW5hbmNlX21vZGUgPSAodiA9PT0gdHJ1ZSB8fCB2ID09PSAxIHx8IHYgPT09ICcxJyB8fCB2ID09PSAndHJ1ZScpID8gJzEnIDogJzAnO1xuICAgICAgfVxuICAgICAgaWYgKCdzaG93X3VuZHVoX3NrbCcgaW4gYm9keSkge1xuICAgICAgICBjb25zdCB2ID0gYm9keS5zaG93X3VuZHVoX3NrbDtcbiAgICAgICAgYm9keS5zaG93X3VuZHVoX3NrbCA9ICh2ID09PSB0cnVlIHx8IHYgPT09IDEgfHwgdiA9PT0gJzEnIHx8IHYgPT09ICd0cnVlJykgPyAnMScgOiAnMCc7XG4gICAgICB9XG4gICAgICBjb25zdCBwYXRjaDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBrIG9mIEFMTE9XRURfU0VUVElOR19LRVlTKSB7XG4gICAgICAgIGlmIChrID09PSAnc2Nob29sX2xvZ28nIHx8IGsgPT09ICdwcmluY2lwYWxfcGhvdG8nKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGsgaW4gYm9keSkgcGF0Y2hba10gPSBTdHJpbmcoYm9keVtrXSA/PyAnJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGZpbGVzID0gKHJlcS5maWxlcyBhcyBSZWNvcmQ8c3RyaW5nLCBFeHByZXNzLk11bHRlci5GaWxlW10+KSA/PyB7fTtcbiAgICAgIGNvbnN0IGxvZ28gPSBmaWxlcy5sb2dvPy5bMF07XG4gICAgICBpZiAobG9nbykge1xuICAgICAgICBjb25zdCByZWwgPSBwYXRoLnJlbGF0aXZlKFVQTE9BRF9ST09ULCBsb2dvLnBhdGgpLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcbiAgICAgICAgY29uc3Qgb2xkID0gYXdhaXQgZ2V0U2V0dGluZygnc2Nob29sX2xvZ28nKTtcbiAgICAgICAgaWYgKG9sZCAmJiAhL15odHRwcz86fF5kYXRhOi8udGVzdChvbGQpKSB7XG4gICAgICAgICAgY29uc3Qgb2xkUGF0aCA9IHBhdGguam9pbihVUExPQURfUk9PVCwgb2xkLnJlcGxhY2UoL151cGxvYWRzXFwvLywgJycpKTtcbiAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhvbGRQYXRoKSkgeyB0cnkgeyBmcy51bmxpbmtTeW5jKG9sZFBhdGgpOyB9IGNhdGNoIHt9IH1cbiAgICAgICAgfVxuICAgICAgICBwYXRjaC5zY2hvb2xfbG9nbyA9IHJlbDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHBob3RvID0gZmlsZXMucHJpbmNpcGFsX3Bob3RvPy5bMF07XG4gICAgICBpZiAocGhvdG8pIHtcbiAgICAgICAgY29uc3QgcmVsID0gcGF0aC5yZWxhdGl2ZShVUExPQURfUk9PVCwgcGhvdG8ucGF0aCkucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuICAgICAgICBjb25zdCBvbGQgPSBhd2FpdCBnZXRTZXR0aW5nKCdwcmluY2lwYWxfcGhvdG8nKTtcbiAgICAgICAgaWYgKG9sZCAmJiAhL15odHRwcz86fF5kYXRhOi8udGVzdChvbGQpKSB7XG4gICAgICAgICAgY29uc3Qgb2xkUGF0aCA9IHBhdGguam9pbihVUExPQURfUk9PVCwgb2xkLnJlcGxhY2UoL151cGxvYWRzXFwvLywgJycpKTtcbiAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhvbGRQYXRoKSkgeyB0cnkgeyBmcy51bmxpbmtTeW5jKG9sZFBhdGgpOyB9IGNhdGNoIHt9IH1cbiAgICAgICAgfVxuICAgICAgICBwYXRjaC5wcmluY2lwYWxfcGhvdG8gPSByZWw7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHNldFNldHRpbmdzKHBhdGNoKTtcbiAgICAgIHJlcy5qc29uKG9rKHVuZGVmaW5lZCwgJ1BlbmdhdHVyYW4gYmVyaGFzaWwgZGlwZXJiYXJ1aScpKTtcbiAgICB9KSxcbiAgKTtcblxuICAvLyAtLS0tLS0tLSBBZG1pbjogaW1wb3J0IChFeGNlbCkgLS0tLS0tLS1cbiAgci5wb3N0KCcvYWRtaW4vaW1wb3J0JywgdXBsb2FkRXhjZWwuc2luZ2xlKCdmaWxlJyksIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGlmICghcmVxLmZpbGUpIHJldHVybiByZXMuc3RhdHVzKDQyMikuanNvbih7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiAnRmlsZSBFeGNlbCB0aWRhayBkaXRlbXVrYW4uJyB9KTtcbiAgICBjb25zdCB3YiA9IFhMU1gucmVhZChyZXEuZmlsZS5idWZmZXIsIHsgdHlwZTogJ2J1ZmZlcicsIGNlbGxEYXRlczogdHJ1ZSB9KTtcbiAgICBjb25zdCBzaGVldE5hbWUgPSB3Yi5TaGVldE5hbWVzLmZpbmQoKG4pID0+IG4udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnc2lzd2EnKSkgPz8gd2IuU2hlZXROYW1lc1swXTtcbiAgICBpZiAoIXNoZWV0TmFtZSkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDIyKS5qc29uKHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdGaWxlIEV4Y2VsIHRpZGFrIG1lbWlsaWtpIHNoZWV0IGFwYXB1bi4nIH0pO1xuICAgIH1cbiAgICBjb25zdCByb3dzID0gWExTWC51dGlscy5zaGVldF90b19qc29uPFJlY29yZDxzdHJpbmcsIGFueT4+KHdiLlNoZWV0c1tzaGVldE5hbWVdLCB7IGRlZnZhbDogJycsIHJhdzogZmFsc2UgfSk7XG5cbiAgICBsZXQgaW1wb3J0ZWQgPSAwO1xuICAgIGxldCBmYWlsZWQgPSAwO1xuICAgIGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcblxuICAgIGNvbnN0IG5vcm0gPSAoazogc3RyaW5nKSA9PiBrLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXpdKy9nLCAnJyk7XG4gICAgY29uc3QgcGljayA9IChyb3c6IFJlY29yZDxzdHJpbmcsIGFueT4sIG5hbWVzOiBzdHJpbmdbXSk6IGFueSA9PiB7XG4gICAgICBmb3IgKGNvbnN0IGsgb2YgT2JqZWN0LmtleXMocm93KSkge1xuICAgICAgICBpZiAobmFtZXMuaW5jbHVkZXMobm9ybShrKSkpIHJldHVybiByb3dba107XG4gICAgICB9XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH07XG4gICAgY29uc3QgcGFyc2VEYXRlID0gKHY6IGFueSk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgICAgaWYgKCF2KSByZXR1cm4gbnVsbDtcbiAgICAgIGlmICh2IGluc3RhbmNlb2YgRGF0ZSkgcmV0dXJuIHYudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gICAgICBjb25zdCBzdHIgPSBTdHJpbmcodikudHJpbSgpO1xuICAgICAgY29uc3QgaXNvID0gL14oXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KS8uZXhlYyhzdHIpO1xuICAgICAgaWYgKGlzbykgcmV0dXJuIGAke2lzb1sxXX0tJHtpc29bMl19LSR7aXNvWzNdfWA7XG4gICAgICBjb25zdCBkbXkgPSAvXihcXGR7MSwyfSlbXFwvXFwtXShcXGR7MSwyfSlbXFwvXFwtXShcXGR7Miw0fSkkLy5leGVjKHN0cik7XG4gICAgICBpZiAoZG15KSB7XG4gICAgICAgIGNvbnN0IFssIGQsIG0sIHldID0gZG15O1xuICAgICAgICBjb25zdCB5eSA9IHkubGVuZ3RoID09PSAyID8gYDIwJHt5fWAgOiB5O1xuICAgICAgICByZXR1cm4gYCR7eXkucGFkU3RhcnQoNCwgJzAnKX0tJHttLnBhZFN0YXJ0KDIsICcwJyl9LSR7ZC5wYWRTdGFydCgyLCAnMCcpfWA7XG4gICAgICB9XG4gICAgICBjb25zdCBwYXJzZWQgPSBuZXcgRGF0ZShzdHIpO1xuICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkLmdldFRpbWUoKSkpIHJldHVybiBwYXJzZWQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9O1xuICAgIGNvbnN0IHBhcnNlU3RhdHVzID0gKHY6IGFueSk6IDAgfCAxID0+IHtcbiAgICAgIGNvbnN0IHMgPSBTdHJpbmcodiA/PyAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoWycxJywgJ3RydWUnLCAnbHVsdXMnLCAnbCcsICd5YScsICd5J10uaW5jbHVkZXMocykpIHJldHVybiAxO1xuICAgICAgaWYgKFsnMCcsICdmYWxzZScsICd0aWRhayBsdWx1cycsICd0aWRhaycsICd0bCcsICduJywgJ25vJ10uaW5jbHVkZXMocykpIHJldHVybiAwO1xuICAgICAgcmV0dXJuIDE7XG4gICAgfTtcblxuICAgIGNvbnN0IGJlZm9yZVJvdyA9IGF3YWl0IHBvb2wucXVlcnk8eyBjOiBzdHJpbmcgfT4oJ1NFTEVDVCBDT1VOVCgqKTo6dGV4dCBjIEZST00gc3R1ZGVudHMnKTtcbiAgICBjb25zdCBiZWZvcmVDb3VudCA9IE51bWJlcihiZWZvcmVSb3cucm93c1swXS5jKTtcblxuICAgIGNvbnN0IGNsaWVudCA9IGF3YWl0IHBvb2wuY29ubmVjdCgpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0JFR0lOJyk7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgcm93ID0gcm93c1tpXTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBuaXNuID0gU3RyaW5nKHBpY2socm93LCBbJ25pc24nXSkgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICBjb25zdCBuYW1lID0gU3RyaW5nKHBpY2socm93LCBbJ25hbWUnLCAnbmFtYScsICduYW1hc2lzd2EnLCAnbmFtYWxlbmdrYXAnXSkgPz8gJycpLnRyaW0oKTtcbiAgICAgICAgICBjb25zdCBiaXJ0aFBsYWNlID0gU3RyaW5nKHBpY2socm93LCBbJ2JpcnRocGxhY2UnLCAndGVtcGF0bGFoaXInLCAndGVtcGF0J10pID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgY29uc3QgYmlydGhEYXRlID0gcGFyc2VEYXRlKHBpY2socm93LCBbJ2JpcnRoZGF0ZScsICd0YW5nZ2FsbGFoaXInLCAndGdsbGFoaXInXSkpO1xuICAgICAgICAgIGNvbnN0IGtsYXNzID0gU3RyaW5nKHBpY2socm93LCBbJ2NsYXNzJywgJ2tlbGFzJ10pID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgY29uc3QgbWFqb3IgPSBTdHJpbmcocGljayhyb3csIFsnbWFqb3InLCAnanVydXNhbicsICdrb21wZXRlbnNpJ10pID8/ICcnKS50cmltKCk7XG4gICAgICAgICAgY29uc3Qgc3RhdHVzID0gcGFyc2VTdGF0dXMocGljayhyb3csIFsnc3RhdHVzZ3JhZHVhdGlvbicsICdzdGF0dXMnLCAna2VsdWx1c2FuJywgJ3N0YXR1c2tlbHVsdXNhbicsICdsdWx1cyddKSk7XG5cbiAgICAgICAgICBpZiAoIW5pc24gfHwgIW5hbWUgfHwgIWJpcnRoRGF0ZSkge1xuICAgICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgICBlcnJvcnMucHVzaChgQmFyaXMgJHtpICsgMn06IE5JU04vTmFtYS9UYW5nZ2FsIGxhaGlyIGtvc29uZy5gKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoXG4gICAgICAgICAgICBgSU5TRVJUIElOVE8gc3R1ZGVudHNcbiAgICAgICAgICAgICAgKG5pc24sIG5hbWUsIGJpcnRoX3BsYWNlLCBiaXJ0aF9kYXRlLCBjbGFzcywgbWFqb3IsIHN0YXR1c19ncmFkdWF0aW9uLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KVxuICAgICAgICAgICAgIFZBTFVFUyAoJDEsJDIsJDMsJDQsJDUsJDYsJDcsIE5PVygpLCBOT1coKSlcbiAgICAgICAgICAgICBPTiBDT05GTElDVCAobmlzbikgRE8gVVBEQVRFIFNFVFxuICAgICAgICAgICAgICAgIG5hbWUgPSBFWENMVURFRC5uYW1lLFxuICAgICAgICAgICAgICAgIGJpcnRoX3BsYWNlID0gRVhDTFVERUQuYmlydGhfcGxhY2UsXG4gICAgICAgICAgICAgICAgYmlydGhfZGF0ZSA9IEVYQ0xVREVELmJpcnRoX2RhdGUsXG4gICAgICAgICAgICAgICAgY2xhc3MgPSBFWENMVURFRC5jbGFzcyxcbiAgICAgICAgICAgICAgICBtYWpvciA9IEVYQ0xVREVELm1ham9yLFxuICAgICAgICAgICAgICAgIHN0YXR1c19ncmFkdWF0aW9uID0gRVhDTFVERUQuc3RhdHVzX2dyYWR1YXRpb24sXG4gICAgICAgICAgICAgICAgdXBkYXRlZF9hdCA9IE5PVygpYCxcbiAgICAgICAgICAgIFtuaXNuLCBuYW1lLCBiaXJ0aFBsYWNlLCBiaXJ0aERhdGUsIGtsYXNzLCBtYWpvciwgc3RhdHVzXSxcbiAgICAgICAgICApO1xuICAgICAgICAgIGltcG9ydGVkKys7XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgZXJyb3JzLnB1c2goYEJhcmlzICR7aSArIDJ9OiAke2Vycj8ubWVzc2FnZSA/PyAnZ2FnYWwnfS5gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdDT01NSVQnKTtcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQucmVsZWFzZSgpO1xuICAgIH1cblxuICAgIC8vIFNuYXBzaG90IHRvIGltcG9ydF9hcmNoaXZlc1xuICAgIGNvbnN0IGFsbE5vdyA9IGF3YWl0IGRiLnNlbGVjdCgpLmZyb20oc2NoZW1hLnN0dWRlbnRzKTtcbiAgICBjb25zdCBzbmFwc2hvdCA9IGFsbE5vdy5tYXAocm93VG9TdHVkZW50KTtcbiAgICBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgYElOU0VSVCBJTlRPIGltcG9ydF9hcmNoaXZlcyAoZmlsZW5hbWUsIGltcG9ydGVkLCBmYWlsZWQsIHRvdGFsX2FmdGVyLCBlcnJvcnMsIHNuYXBzaG90LCBjcmVhdGVkX2F0KVxuICAgICAgIFZBTFVFUyAoJDEsJDIsJDMsJDQsJDU6Ompzb25iLCQ2Ojpqc29uYiwgTk9XKCkpYCxcbiAgICAgIFtcbiAgICAgICAgcmVxLmZpbGUub3JpZ2luYWxuYW1lLFxuICAgICAgICBpbXBvcnRlZCwgZmFpbGVkLFxuICAgICAgICBzbmFwc2hvdC5sZW5ndGgsXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9ycy5zbGljZSgwLCA1MCkpLFxuICAgICAgICBKU09OLnN0cmluZ2lmeShzbmFwc2hvdCksXG4gICAgICBdLFxuICAgICk7XG4gICAgLy8gQ2FwIGFyY2hpdmVzIHRvIGxhc3QgMTBcbiAgICBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgYERFTEVURSBGUk9NIGltcG9ydF9hcmNoaXZlcyBXSEVSRSBpZCBOT1QgSU4gKFNFTEVDVCBpZCBGUk9NIGltcG9ydF9hcmNoaXZlcyBPUkRFUiBCWSBpZCBERVNDIExJTUlUIDEwKWAsXG4gICAgKTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBtZXNzYWdlOiBgSW1wb3J0IHNlbGVzYWkuICR7aW1wb3J0ZWR9IGJhcmlzIGJlcmhhc2lsLCAke2ZhaWxlZH0gYmFyaXMgZ2FnYWwuYCxcbiAgICAgIGRhdGE6IHsgaW1wb3J0ZWQsIGZhaWxlZCwgZXJyb3JzOiBlcnJvcnMuc2xpY2UoMCwgMjApIH0sXG4gICAgICBzdGF0czoge1xuICAgICAgICBpbXBvcnRlZCwgZmFpbGVkLFxuICAgICAgICBlcnJvcnM6IGVycm9ycy5zbGljZSgwLCAyMCksXG4gICAgICAgIHRvdGFsOiBzbmFwc2hvdC5sZW5ndGgsXG4gICAgICAgIGxhc3RfaW1wb3J0X3RpbWU6IG5vd0lzbygpLFxuICAgICAgICBiZWZvcmVfY291bnQ6IGJlZm9yZUNvdW50LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSkpO1xuXG4gIHIucG9zdCgnL2FkbWluL3Jlc2V0LXRyYWNraW5nLzppZD8nLCBhdyhhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBpZCA9IHJlcS5wYXJhbXMuaWQgPyBOdW1iZXIocmVxLnBhcmFtcy5pZCkgOiBudWxsO1xuICAgIGxldCByZXN1bHQ7XG4gICAgaWYgKGlkICE9PSBudWxsKSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCBwb29sLnF1ZXJ5KCdVUERBVEUgc3R1ZGVudHMgU0VUIHZpZXdlZF9hdCA9IE5VTEwsIHVwZGF0ZWRfYXQgPSBOT1coKSBXSEVSRSBpZCA9ICQxIEFORCB2aWV3ZWRfYXQgSVMgTk9UIE5VTEwnLCBbaWRdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0gYXdhaXQgcG9vbC5xdWVyeSgnVVBEQVRFIHN0dWRlbnRzIFNFVCB2aWV3ZWRfYXQgPSBOVUxMLCB1cGRhdGVkX2F0ID0gTk9XKCkgV0hFUkUgdmlld2VkX2F0IElTIE5PVCBOVUxMJyk7XG4gICAgfVxuICAgIHJlcy5qc29uKG9rKHsgcmVzZXQ6IHJlc3VsdC5yb3dDb3VudCA/PyAwIH0sICdUcmFja2luZyBkYXRhIHJlc2V0JykpO1xuICB9KSk7XG5cbiAgci5wb3N0KCcvYWRtaW4vc3R1ZGVudHMvcHVyZ2UnLCBhdyhhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG4gICAgY29uc3QgYmVmb3JlUyA9IChhd2FpdCBwb29sLnF1ZXJ5PHsgYzogc3RyaW5nIH0+KCdTRUxFQ1QgQ09VTlQoKik6OnRleHQgYyBGUk9NIHN0dWRlbnRzJykpLnJvd3NbMF0uYztcbiAgICBjb25zdCBiZWZvcmVBID0gKGF3YWl0IHBvb2wucXVlcnk8eyBjOiBzdHJpbmcgfT4oJ1NFTEVDVCBDT1VOVCgqKTo6dGV4dCBjIEZST00gaW1wb3J0X2FyY2hpdmVzJykpLnJvd3NbMF0uYztcbiAgICBhd2FpdCBwb29sLnF1ZXJ5KCdUUlVOQ0FURSBUQUJMRSBzdHVkZW50cyBSRVNUQVJUIElERU5USVRZJyk7XG4gICAgYXdhaXQgcG9vbC5xdWVyeSgnVFJVTkNBVEUgVEFCTEUgaW1wb3J0X2FyY2hpdmVzIFJFU1RBUlQgSURFTlRJVFknKTtcbiAgICByZXMuanNvbih7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgbWVzc2FnZTogYEJlcmhhc2lsIG1lbmdoYXB1cyAke2JlZm9yZVN9IHNpc3dhLmAsXG4gICAgICBkYXRhOiB7IHJlbW92ZWQ6IE51bWJlcihiZWZvcmVTKSwgYXJjaGl2ZXNfcmVtb3ZlZDogTnVtYmVyKGJlZm9yZUEpIH0sXG4gICAgfSk7XG4gIH0pKTtcblxuICByLnBvc3QoJy9hZG1pbi9zdHVkZW50cy9idWxrLWRlbGV0ZScsIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IGlkczogbnVtYmVyW10gPSBBcnJheS5pc0FycmF5KHJlcS5ib2R5Py5pZHMpID8gcmVxLmJvZHkuaWRzLm1hcChOdW1iZXIpLmZpbHRlcihOdW1iZXIuaXNGaW5pdGUpIDogW107XG4gICAgaWYgKGlkcy5sZW5ndGggPT09IDApIHJldHVybiByZXMuc3RhdHVzKDQyMikuanNvbih7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiAnVGlkYWsgYWRhIGlkIHNpc3dhIHlhbmcgZGlwaWxpaC4nIH0pO1xuICAgIGNvbnN0IHIyID0gYXdhaXQgZGIuZGVsZXRlKHNjaGVtYS5zdHVkZW50cykud2hlcmUoaW5BcnJheShzY2hlbWEuc3R1ZGVudHMuaWQsIGlkcykpO1xuICAgIGNvbnN0IHJlbW92ZWQgPSAocjIgYXMgYW55KS5yb3dDb3VudCA/PyBpZHMubGVuZ3RoO1xuICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogYEJlcmhhc2lsIG1lbmdoYXB1cyAke3JlbW92ZWR9IHNpc3dhLmAsIGRhdGE6IHsgcmVtb3ZlZCB9IH0pO1xuICB9KSk7XG5cbiAgci5wb3N0KCcvYWRtaW4vc3R1ZGVudHMvYnVsay1zdGF0dXMnLCBhdyhhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBpZHM6IG51bWJlcltdID0gQXJyYXkuaXNBcnJheShyZXEuYm9keT8uaWRzKSA/IHJlcS5ib2R5Lmlkcy5tYXAoTnVtYmVyKS5maWx0ZXIoTnVtYmVyLmlzRmluaXRlKSA6IFtdO1xuICAgIGNvbnN0IHN0YXR1cyA9IChyZXEuYm9keT8uc3RhdHVzID09PSAxIHx8IHJlcS5ib2R5Py5zdGF0dXMgPT09ICcxJyB8fCByZXEuYm9keT8uc3RhdHVzID09PSB0cnVlKSA/IDEgOiAwO1xuICAgIGlmIChpZHMubGVuZ3RoID09PSAwKSByZXR1cm4gcmVzLnN0YXR1cyg0MjIpLmpzb24oeyBzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogJ1RpZGFrIGFkYSBpZCBzaXN3YSB5YW5nIGRpcGlsaWguJyB9KTtcbiAgICBjb25zdCByMiA9IGF3YWl0IHBvb2wucXVlcnkoXG4gICAgICBgVVBEQVRFIHN0dWRlbnRzIFNFVCBzdGF0dXNfZ3JhZHVhdGlvbiA9ICQxLCB1cGRhdGVkX2F0ID0gTk9XKCkgV0hFUkUgaWQgPSBBTlkoJDI6OmludFtdKSBBTkQgc3RhdHVzX2dyYWR1YXRpb24gPD4gJDFgLFxuICAgICAgW3N0YXR1cywgaWRzXSxcbiAgICApO1xuICAgIGNvbnN0IHVwZGF0ZWQgPSByMi5yb3dDb3VudCA/PyAwO1xuICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogYFN0YXR1cyBkaXBlcmJhcnVpIHVudHVrICR7dXBkYXRlZH0gc2lzd2EuYCwgZGF0YTogeyB1cGRhdGVkIH0gfSk7XG4gIH0pKTtcblxuICAvLyAtLS0tLS0tLSBBZG1pbjogZ2FsbGVyaWVzIC0tLS0tLS0tXG4gIHIucG9zdCgnL2FkbWluL2dhbGxlcmllcycsIHVwbG9hZEdlbmVyYWwuc2luZ2xlKCdpbWFnZScpLCBhdyhhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBjbnQgPSAoYXdhaXQgcG9vbC5xdWVyeTx7IGM6IHN0cmluZyB9PignU0VMRUNUIENPVU5UKCopOjp0ZXh0IGMgRlJPTSBnYWxsZXJpZXMnKSkucm93c1swXS5jO1xuICAgIGlmIChOdW1iZXIoY250KSA+PSAzMCkge1xuICAgICAgaWYgKHJlcS5maWxlPy5wYXRoICYmIGZzLmV4aXN0c1N5bmMocmVxLmZpbGUucGF0aCkpIHsgdHJ5IHsgZnMudW5saW5rU3luYyhyZXEuZmlsZS5wYXRoKTsgfSBjYXRjaCB7fSB9XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MjIpLmpzb24oe1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogJ0dhbGVyaSBzdWRhaCBtZW5jYXBhaSBiYXRhcyBtYWtzaW1hbCAzMCBmb3RvLiBIYXB1cyBzYWxhaCBzYXR1IHNlYmVsdW0gbWVuZ3VuZ2dhaCBiYXJ1LicsXG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKCFyZXEuZmlsZSkgcmV0dXJuIHJlcy5zdGF0dXMoNDIyKS5qc29uKHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdGaWxlIGdhbWJhciB0aWRhayBkaXRlbXVrYW4uJyB9KTtcbiAgICBjb25zdCByZWwgPSBwYXRoLnJlbGF0aXZlKFVQTE9BRF9ST09ULCByZXEuZmlsZS5wYXRoKS5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG4gICAgY29uc3QgdGl0bGUgPSBTdHJpbmcocmVxLmJvZHk/LnRpdGxlID8/IHJlcS5ib2R5Py5jYXB0aW9uID8/ICcnKS5zbGljZSgwLCAyMDApO1xuICAgIGNvbnN0IGluc2VydGVkID0gYXdhaXQgZGIuaW5zZXJ0KHNjaGVtYS5nYWxsZXJpZXMpXG4gICAgICAudmFsdWVzKHsgaW1hZ2VfcGF0aDogcmVsLCB0aXRsZSB9KVxuICAgICAgLnJldHVybmluZygpO1xuICAgIGNvbnN0IGl0ZW0gPSBpbnNlcnRlZFswXTtcbiAgICByZXMuanNvbih7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgZGF0YToge1xuICAgICAgICBpZDogaXRlbS5pZCxcbiAgICAgICAgaW1hZ2VfcGF0aDogcHVibGljQXNzZXRVcmwocmVxLCBpdGVtLmltYWdlX3BhdGgpLFxuICAgICAgICB0aXRsZTogaXRlbS50aXRsZSxcbiAgICAgICAgY3JlYXRlZF9hdDogaXRlbS5jcmVhdGVkX2F0Py50b0lTT1N0cmluZygpID8/IG5vd0lzbygpLFxuICAgICAgfSxcbiAgICAgIG1lc3NhZ2U6ICdGb3RvIGdhbGVyaSBiZXJoYXNpbCBkaXVuZ2dhaC4nLFxuICAgIH0pO1xuICB9KSk7XG5cbiAgci5kZWxldGUoJy9hZG1pbi9nYWxsZXJpZXMvOmlkKFxcXFxkKyknLCBhdyhhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBpZCA9IE51bWJlcihyZXEucGFyYW1zLmlkKTtcbiAgICBjb25zdCBmb3VuZCA9IGF3YWl0IGRiLnNlbGVjdCgpLmZyb20oc2NoZW1hLmdhbGxlcmllcykud2hlcmUoZXEoc2NoZW1hLmdhbGxlcmllcy5pZCwgaWQpKS5saW1pdCgxKTtcbiAgICBpZiAoZm91bmQubGVuZ3RoID09PSAwKSByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogJ0ZvdG8gdGlkYWsgZGl0ZW11a2FuLicgfSk7XG4gICAgY29uc3QgZyA9IGZvdW5kWzBdO1xuICAgIGlmIChnLmltYWdlX3BhdGggJiYgIS9eKGh0dHBzPzp8ZGF0YTopLy50ZXN0KGcuaW1hZ2VfcGF0aCkpIHtcbiAgICAgIGNvbnN0IGZwID0gcGF0aC5qb2luKFVQTE9BRF9ST09ULCBnLmltYWdlX3BhdGgucmVwbGFjZSgvXnVwbG9hZHNcXC8vLCAnJykpO1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZnApKSB7IHRyeSB7IGZzLnVubGlua1N5bmMoZnApOyB9IGNhdGNoIHt9IH1cbiAgICB9XG4gICAgYXdhaXQgZGIuZGVsZXRlKHNjaGVtYS5nYWxsZXJpZXMpLndoZXJlKGVxKHNjaGVtYS5nYWxsZXJpZXMuaWQsIGlkKSk7XG4gICAgcmVzLmpzb24oeyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnRm90byBnYWxlcmkgZGloYXB1cy4nIH0pO1xuICB9KSk7XG5cbiAgci5wb3N0KCcvYWRtaW4vZ2FsbGVyaWVzL2NsZWFyJywgYXcoYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IGFsbCA9IGF3YWl0IGRiLnNlbGVjdCgpLmZyb20oc2NoZW1hLmdhbGxlcmllcyk7XG4gICAgZm9yIChjb25zdCBnIG9mIGFsbCkge1xuICAgICAgaWYgKGcuaW1hZ2VfcGF0aCAmJiAhL14oaHR0cHM/OnxkYXRhOikvLnRlc3QoZy5pbWFnZV9wYXRoKSkge1xuICAgICAgICBjb25zdCBmcCA9IHBhdGguam9pbihVUExPQURfUk9PVCwgZy5pbWFnZV9wYXRoLnJlcGxhY2UoL151cGxvYWRzXFwvLywgJycpKTtcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZnApKSB7IHRyeSB7IGZzLnVubGlua1N5bmMoZnApOyB9IGNhdGNoIHt9IH1cbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgcG9vbC5xdWVyeSgnVFJVTkNBVEUgVEFCTEUgZ2FsbGVyaWVzIFJFU1RBUlQgSURFTlRJVFknKTtcbiAgICByZXMuanNvbih7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdTZW11YSBmb3RvIGdhbGVyaSB0ZWxhaCBkaWhhcHVzLicgfSk7XG4gIH0pKTtcblxuICAvLyAtLS0tLS0tLSBEZXBsb3kgLyBIZWFsdGggLS0tLS0tLS1cbiAgci5nZXQoJy9kZXBsb3kvaGVhbHRoJywgYXcoYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3QgcCA9IGF3YWl0IHBpbmcoKTtcbiAgICBjb25zdCBjID0gcC5vayA/IGF3YWl0IGNvdW50cygpIDogeyBzdHVkZW50czogMCwgZ2FsbGVyaWVzOiAwLCBpbXBvcnRfYXJjaGl2ZXM6IDAgfTtcbiAgICByZXMuanNvbihvayh7XG4gICAgICBhcHBfdXJsOiBwcm9jZXNzLmVudi5BUFBfVVJMIHx8IGAke3JlcS5wcm90b2NvbH06Ly8ke3JlcS5nZXQoJ2hvc3QnKX1gLFxuICAgICAgZW52OiBwcm9jZXNzLmVudi5OT0RFX0VOViA/PyAnZGV2ZWxvcG1lbnQnLFxuICAgICAgYmFja2VuZDogJ25vZGUtZXhwcmVzcycsXG4gICAgICBkYXRhYmFzZTogJ3Bvc3RncmVzJyxcbiAgICAgIGRhdGFiYXNlX3N0YXR1czogcC5vayA/ICdjb25uZWN0ZWQnIDogJ2Rpc2Nvbm5lY3RlZCcsXG4gICAgICBkYXRhYmFzZV9sYXRlbmN5X21zOiBwLmxhdGVuY3lfbXMsXG4gICAgICBkYXRhYmFzZV92ZXJzaW9uOiBwLnNlcnZlcl92ZXJzaW9uID8/IG51bGwsXG4gICAgICBkYXRhYmFzZV9lcnJvcjogcC5lcnJvciA/PyBudWxsLFxuICAgICAgcnVudGltZTogcHJvY2Vzcy52ZXJzaW9uLFxuICAgICAgdGltZTogbm93SXNvKCksXG4gICAgICBzdHVkZW50czogYy5zdHVkZW50cyxcbiAgICAgIGdhbGxlcmllczogYy5nYWxsZXJpZXMsXG4gICAgICBpbXBvcnRfYXJjaGl2ZXM6IGMuaW1wb3J0X2FyY2hpdmVzLFxuICAgICAgc2NoZW1hX3ZlcnNpb246IDIsXG4gICAgfSkpO1xuICB9KSk7XG5cbiAgci5hbGwoJy9kZXBsb3kvc2V0dXAnLCBhdyhhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBleHBlY3RlZCA9IHByb2Nlc3MuZW52LkRFUExPWV9UT0tFTiB8fCAnJztcbiAgICBjb25zdCBnaXZlbiA9IFN0cmluZygocmVxLnF1ZXJ5LnRva2VuID8/IHJlcS5ib2R5Py50b2tlbikgPz8gJycpO1xuICAgIGNvbnN0IGF1dGggPSBTdHJpbmcocmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbiB8fCAnJyk7XG4gICAgY29uc3QgYmVhcmVyID0gYXV0aC5zdGFydHNXaXRoKCdCZWFyZXIgJykgPyBhdXRoLnNsaWNlKDcpIDogJyc7XG4gICAgY29uc3Qgc2Vzc2lvbk9rID0gISFiZWFyZXIgJiYgc2Vzc2lvbnMuaGFzKGJlYXJlcik7XG5cbiAgICBsZXQgYXV0aG9yaXplZCA9IGZhbHNlO1xuICAgIGlmIChleHBlY3RlZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXV0aG9yaXplZCA9ICEhZ2l2ZW5cbiAgICAgICAgICAmJiBnaXZlbi5sZW5ndGggPT09IGV4cGVjdGVkLmxlbmd0aFxuICAgICAgICAgICYmIGNyeXB0by50aW1pbmdTYWZlRXF1YWwoQnVmZmVyLmZyb20oZ2l2ZW4pLCBCdWZmZXIuZnJvbShleHBlY3RlZCkpO1xuICAgICAgfSBjYXRjaCB7IGF1dGhvcml6ZWQgPSBmYWxzZTsgfVxuICAgIH1cbiAgICBpZiAoIWF1dGhvcml6ZWQgJiYgc2Vzc2lvbk9rKSBhdXRob3JpemVkID0gdHJ1ZTtcbiAgICBpZiAoIWF1dGhvcml6ZWQgJiYgZ2l2ZW4gJiYgZ2l2ZW4gPT09IEFETUlOX1BBU1MpIGF1dGhvcml6ZWQgPSB0cnVlO1xuXG4gICAgaWYgKCFhdXRob3JpemVkKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDEpLmpzb24oe1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogZXhwZWN0ZWRcbiAgICAgICAgICA/ICdUb2tlbiB0aWRhayB2YWxpZC4gTWFzdWtrYW4gREVQTE9ZX1RPS0VOIHlhbmcgYmVuYXIgYXRhdSBsb2dpbiBhZG1pbiB0ZXJsZWJpaCBkYWh1bHUuJ1xuICAgICAgICAgIDogJ0xvZ2luIGFkbWluIHRlcmxlYmloIGRhaHVsdSwgYXRhdSBtYXN1a2thbiBwYXNzd29yZCBhZG1pbiBzZWJhZ2FpIHRva2VuLicsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbWlncmF0ZSgpO1xuICAgIGNvbnN0IGxlZ2FjeSA9IGF3YWl0IGltcG9ydExlZ2FjeUpzb25JZlByZXNlbnQoKTtcbiAgICByZXMuanNvbih7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgbWVzc2FnZTogJ1NldHVwIHNlbGVzYWkuIERhdGFiYXNlIFBvc3RncmVTUUwgc2lhcCBkaWd1bmFrYW4uJyxcbiAgICAgIGFwcF91cmw6IHByb2Nlc3MuZW52LkFQUF9VUkwgfHwgYCR7cmVxLnByb3RvY29sfTovLyR7cmVxLmdldCgnaG9zdCcpfWAsXG4gICAgICBzdGVwczoge1xuICAgICAgICBtaWdyYXRlOiB7IG9rOiB0cnVlLCBvdXRwdXQ6ICdTa2VtYSBQb3N0Z3JlU1FMIHVwLXRvLWRhdGUuJyB9LFxuICAgICAgICBzY2hlbWE6IHsgb2s6IHRydWUsIG91dHB1dDogYHNjaGVtYV92ZXJzaW9uPSR7cmVzdWx0LnNjaGVtYV92ZXJzaW9ufWAgfSxcbiAgICAgICAgY291bnRzOiB7IG9rOiB0cnVlLCBvdXRwdXQ6IEpTT04uc3RyaW5naWZ5KHJlc3VsdC5jb3VudHMpIH0sXG4gICAgICAgIGxlZ2FjeV9qc29uOiBsZWdhY3kubWlncmF0ZWRcbiAgICAgICAgICA/IHsgb2s6IHRydWUsIG91dHB1dDogYEltcG9ydGVkIGZyb20gZGF0YS5qc29uOiAke0pTT04uc3RyaW5naWZ5KGxlZ2FjeS5pbnNlcnRlZCl9YCB9XG4gICAgICAgICAgOiB7IG9rOiB0cnVlLCBvdXRwdXQ6IGxlZ2FjeS5yZWFzb24gPz8gJ25vIGxlZ2FjeSBmaWxlJyB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSkpO1xuXG4gIC8vIC0tLS0tLS0tIERhdGFiYXNlIEJhY2t1cCAoU1FMIGR1bXAgdmlhIHB1cmUgTm9kZS5qcykgLS0tLS0tLS1cbiAgci5wb3N0KCcvZGVwbG95L2JhY2t1cC1kYicsIGF3KGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIC8vIEFjY2VwdHMgdGhlIHNhbWUgdG9rZW4gYXMgL2RlcGxveS9zZXR1cDpcbiAgICAvLyAgIDEuIERFUExPWV9UT0tFTiAoZW52IHZhcikgdmlhIEJlYXJlciBvciB4LWFkbWluLXRva2VuXG4gICAgLy8gICAyLiBBY3RpdmUgYWRtaW4gc2Vzc2lvbiB0b2tlbiAoQmVhcmVyKVxuICAgIC8vICAgMy4gQWRtaW4gcGFzc3dvcmQgYXMgZmFsbGJhY2sgKGZvciB0aGUgYnVpbHQtaW4gY2xpZW50KVxuICAgIGNvbnN0IGdpdmVuID0gcmVhZFRva2VuKHJlcSkgPz8gJyc7XG4gICAgY29uc3QgZGVwbG95VG9rZW4gPSBwcm9jZXNzLmVudi5ERVBMT1lfVE9LRU4gPz8gJyc7XG4gICAgbGV0IGF1dGhvcml6ZWQgPSBmYWxzZTtcblxuICAgIGlmIChkZXBsb3lUb2tlbikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXV0aG9yaXplZCA9ICEhZ2l2ZW4gJiYgZ2l2ZW4ubGVuZ3RoID09PSBkZXBsb3lUb2tlbi5sZW5ndGggJiZcbiAgICAgICAgICBjcnlwdG8udGltaW5nU2FmZUVxdWFsKEJ1ZmZlci5mcm9tKGdpdmVuKSwgQnVmZmVyLmZyb20oZGVwbG95VG9rZW4pKTtcbiAgICAgIH0gY2F0Y2ggeyBhdXRob3JpemVkID0gZmFsc2U7IH1cbiAgICB9XG4gICAgaWYgKCFhdXRob3JpemVkICYmIGdpdmVuICYmIHNlc3Npb25zLmhhcyhnaXZlbikpIGF1dGhvcml6ZWQgPSB0cnVlO1xuICAgIGlmICghYXV0aG9yaXplZCAmJiBnaXZlbiA9PT0gQURNSU5fUEFTUykgYXV0aG9yaXplZCA9IHRydWU7XG5cbiAgICBpZiAoIWF1dGhvcml6ZWQpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMSkuanNvbih7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiAnVG9rZW4gdGlkYWsgdmFsaWQuIExvZ2luIGFkbWluIHRlcmxlYmloIGRhaHVsdS4nIH0pO1xuICAgIH1cblxuICAgIC8vIEhlbHBlcjogZXNjYXBlIGEgSlMgdmFsdWUgdG8gYSBzYWZlIFBvc3RncmVTUUwgbGl0ZXJhbC5cbiAgICBmdW5jdGlvbiBwZ0xpdGVyYWwodmFsOiB1bmtub3duKTogc3RyaW5nIHtcbiAgICAgIGlmICh2YWwgPT09IG51bGwgfHwgdmFsID09PSB1bmRlZmluZWQpIHJldHVybiAnTlVMTCc7XG4gICAgICBpZiAodHlwZW9mIHZhbCA9PT0gJ2Jvb2xlYW4nKSByZXR1cm4gdmFsID8gJ1RSVUUnIDogJ0ZBTFNFJztcbiAgICAgIGlmICh0eXBlb2YgdmFsID09PSAnbnVtYmVyJykgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2YWwpID8gU3RyaW5nKHZhbCkgOiAnTlVMTCc7XG4gICAgICBpZiAodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gTnVtYmVyLmlzTmFOKHZhbC5nZXRUaW1lKCkpID8gJ05VTEwnIDogYCcke3ZhbC50b0lTT1N0cmluZygpfSdgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIC8vIEpTT05CIGNvbHVtbnMgXHUyMDE0IHNlcmlhbGl6ZSB0aGVuIGVzY2FwZSBhcyBhIHN0cmluZyBsaXRlcmFsIGNhc3QgdG8ganNvbmJcbiAgICAgICAgY29uc3QgaiA9IEpTT04uc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvJy9nLCBcIicnXCIpO1xuICAgICAgICByZXR1cm4gYCcke2p9Jzo6anNvbmJgO1xuICAgICAgfVxuICAgICAgLy8gU3RyaW5nIFx1MjAxNCBlc2NhcGUgc2luZ2xlIHF1b3RlcyBieSBkb3VibGluZ1xuICAgICAgcmV0dXJuIGAnJHtTdHJpbmcodmFsKS5yZXBsYWNlKC8nL2csIFwiJydcIil9J2A7XG4gICAgfVxuXG4gICAgLy8gRHVtcCBvbmUgdGFibGU6IHJldHVybnMgU1FMIGxpbmVzIChubyB0cmFpbGluZyBuZXdsaW5lIG9uIGxhc3QgbGluZSkuXG4gICAgYXN5bmMgZnVuY3Rpb24gZHVtcFRhYmxlKFxuICAgICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgICBvcmRlckJ5OiBzdHJpbmcsXG4gICAgICBqc29uYkNvbHM6IHN0cmluZ1tdID0gW10sXG4gICAgKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgICAgY29uc3QgeyByb3dzIH0gPSBhd2FpdCBwb29sLnF1ZXJ5KGBTRUxFQ1QgKiBGUk9NICR7dGFibGVOYW1lfSBPUkRFUiBCWSAke29yZGVyQnl9YCk7XG4gICAgICBpZiAocm93cy5sZW5ndGggPT09IDApIHJldHVybiBbYC0tIChubyByb3dzIGluICR7dGFibGVOYW1lfSlgXTtcblxuICAgICAgY29uc3QgY29scyA9IE9iamVjdC5rZXlzKHJvd3NbMF0pO1xuICAgICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICBjb25zdCBCQVRDSCA9IDEwMDtcblxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByb3dzLmxlbmd0aDsgaSArPSBCQVRDSCkge1xuICAgICAgICBjb25zdCBiYXRjaCA9IHJvd3Muc2xpY2UoaSwgaSArIEJBVENIKTtcbiAgICAgICAgY29uc3QgY29sTGlzdCA9IGNvbHMubWFwKChjKSA9PiBgXCIke2N9XCJgKS5qb2luKCcsICcpO1xuICAgICAgICBjb25zdCB2YWx1ZUNsYXVzZXMgPSBiYXRjaC5tYXAoKHJvdykgPT4ge1xuICAgICAgICAgIGNvbnN0IHZhbHMgPSBjb2xzLm1hcCgoYykgPT4ge1xuICAgICAgICAgICAgY29uc3QgdiA9IChyb3cgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2NdO1xuICAgICAgICAgICAgaWYgKGpzb25iQ29scy5pbmNsdWRlcyhjKSAmJiB2ICE9PSBudWxsICYmIHYgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICBjb25zdCBqID0gSlNPTi5zdHJpbmdpZnkodikucmVwbGFjZSgvJy9nLCBcIicnXCIpO1xuICAgICAgICAgICAgICByZXR1cm4gYCcke2p9Jzo6anNvbmJgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHBnTGl0ZXJhbCh2KTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gYCAgKCR7dmFscy5qb2luKCcsICcpfSlgO1xuICAgICAgICB9KTtcbiAgICAgICAgbGluZXMucHVzaChgSU5TRVJUIElOVE8gXCIke3RhYmxlTmFtZX1cIiAoJHtjb2xMaXN0fSkgVkFMVUVTYCk7XG4gICAgICAgIGxpbmVzLnB1c2godmFsdWVDbGF1c2VzLmpvaW4oJyxcXG4nKSArICc7Jyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGluZXM7XG4gICAgfVxuXG4gICAgY29uc3QgdHMgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IHN0YW1wID0gdHMudG9JU09TdHJpbmcoKS5yZXBsYWNlKC9bOi5dL2csICctJykuc2xpY2UoMCwgMTkpO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gYGJhY2t1cF9kYl8ke3N0YW1wfS5zcWxgO1xuXG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cbiAgICBwYXJ0cy5wdXNoKGAtLSA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1gKTtcbiAgICBwYXJ0cy5wdXNoKGAtLSBQb3J0YWwgS2VsdWx1c2FuIFNNS04gMSBXb25vZ2lyaSBcdTIwMTQgRGF0YWJhc2UgQmFja3VwYCk7XG4gICAgcGFydHMucHVzaChgLS0gR2VuZXJhdGVkICA6ICR7dHMudG9JU09TdHJpbmcoKX1gKTtcbiAgICBwYXJ0cy5wdXNoKGAtLSBHZW5lcmF0b3IgIDogTm9kZS5qcyBwdXJlLUpTIGR1bXAgKG5vIHBnX2R1bXAgcmVxdWlyZWQpYCk7XG4gICAgcGFydHMucHVzaChgLS0gVGFibGVzICAgICA6IHN0dWRlbnRzLCBzZXR0aW5ncywgZ2FsbGVyaWVzLCBpbXBvcnRfYXJjaGl2ZXNgKTtcbiAgICBwYXJ0cy5wdXNoKGAtLSBVc2FnZSAgICAgIDogcHNxbCAkREFUQUJBU0VfVVJMIDwgJHtmaWxlbmFtZX1gKTtcbiAgICBwYXJ0cy5wdXNoKGAtLSA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1gKTtcbiAgICBwYXJ0cy5wdXNoKGBgKTtcbiAgICBwYXJ0cy5wdXNoKGBTRVQgY2xpZW50X2VuY29kaW5nID0gJ1VURjgnO2ApO1xuICAgIHBhcnRzLnB1c2goYFNFVCBzdGFuZGFyZF9jb25mb3JtaW5nX3N0cmluZ3MgPSBvbjtgKTtcbiAgICBwYXJ0cy5wdXNoKGBgKTtcblxuICAgIGNvbnN0IHRhYmxlczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IG9yZGVyOiBzdHJpbmc7IGpzb25iOiBzdHJpbmdbXTsgc2VxPzogc3RyaW5nIH0+ID0gW1xuICAgICAgeyBuYW1lOiAnc3R1ZGVudHMnLCAgICAgICAgb3JkZXI6ICdpZCBBU0MnLCAganNvbmI6IFtdLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VxOiAnc3R1ZGVudHNfaWRfc2VxJyB9LFxuICAgICAgeyBuYW1lOiAnc2V0dGluZ3MnLCAgICAgICAgb3JkZXI6ICdrZXkgQVNDJywganNvbmI6IFtdIH0sXG4gICAgICB7IG5hbWU6ICdnYWxsZXJpZXMnLCAgICAgICBvcmRlcjogJ2lkIEFTQycsICBqc29uYjogW10sICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXE6ICdnYWxsZXJpZXNfaWRfc2VxJyB9LFxuICAgICAgeyBuYW1lOiAnaW1wb3J0X2FyY2hpdmVzJywgb3JkZXI6ICdpZCBBU0MnLCAganNvbmI6IFsnZXJyb3JzJywgJ3NuYXBzaG90J10sICAgICAgICAgc2VxOiAnaW1wb3J0X2FyY2hpdmVzX2lkX3NlcScgfSxcbiAgICBdO1xuXG4gICAgZm9yIChjb25zdCB0IG9mIHRhYmxlcykge1xuICAgICAgcGFydHMucHVzaChgLS0gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tYCk7XG4gICAgICBwYXJ0cy5wdXNoKGAtLSBUYWJsZTogJHt0Lm5hbWV9YCk7XG4gICAgICBwYXJ0cy5wdXNoKGAtLSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcbiAgICAgIHBhcnRzLnB1c2goYFRSVU5DQVRFIFRBQkxFIFwiJHt0Lm5hbWV9XCIgUkVTVEFSVCBJREVOVElUWSBDQVNDQURFO2ApO1xuICAgICAgY29uc3QgZHVtcExpbmVzID0gYXdhaXQgZHVtcFRhYmxlKHQubmFtZSwgdC5vcmRlciwgdC5qc29uYik7XG4gICAgICBwYXJ0cy5wdXNoKC4uLmR1bXBMaW5lcyk7XG4gICAgICBpZiAodC5zZXEpIHtcbiAgICAgICAgcGFydHMucHVzaChgU0VMRUNUIHNldHZhbCgnJHt0LnNlcX0nLCBDT0FMRVNDRSgoU0VMRUNUIE1BWChpZCkgRlJPTSBcIiR7dC5uYW1lfVwiKSwgMCksIHRydWUpO2ApO1xuICAgICAgfVxuICAgICAgcGFydHMucHVzaChgYCk7XG4gICAgfVxuXG4gICAgcGFydHMucHVzaChgLS0gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09YCk7XG4gICAgcGFydHMucHVzaChgLS0gRW5kIG9mIGJhY2t1cGApO1xuICAgIHBhcnRzLnB1c2goYC0tID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PWApO1xuXG4gICAgY29uc3Qgc3FsID0gcGFydHMuam9pbignXFxuJyk7XG4gICAgY29uc3QgYnVmID0gQnVmZmVyLmZyb20oc3FsLCAndXRmOCcpO1xuXG4gICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL3NxbDsgY2hhcnNldD11dGYtOCcpO1xuICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtRGlzcG9zaXRpb24nLCBgYXR0YWNobWVudDsgZmlsZW5hbWU9XCIke2ZpbGVuYW1lfVwiYCk7XG4gICAgcmVzLnNldEhlYWRlcignQ29udGVudC1MZW5ndGgnLCBidWYuYnl0ZUxlbmd0aCk7XG4gICAgcmVzLnNlbmQoYnVmKTtcbiAgfSkpO1xuXG4gIC8vIDQwNCBpbnNpZGUgL2FwaSBzbyB0aGUgU1BBIGZhbGxiYWNrIG5ldmVyIGNhdGNoZXMgdGhlc2VcbiAgci51c2UoKF9yZXEsIHJlcykgPT4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBzdWNjZXNzOiBmYWxzZSwgbWVzc2FnZTogJ0VuZHBvaW50IHRpZGFrIGRpdGVtdWthbi4nIH0pKTtcblxuICByZXR1cm4gcjtcbn1cbiIsICJpbXBvcnQgJ2RvdGVudi9jb25maWcnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHBnIGZyb20gJ3BnJztcbmltcG9ydCB7IGRyaXp6bGUsIHR5cGUgTm9kZVBnRGF0YWJhc2UgfSBmcm9tICdkcml6emxlLW9ybS9ub2RlLXBvc3RncmVzJztcbmltcG9ydCB7IHNxbCwgZXEgfSBmcm9tICdkcml6emxlLW9ybSc7XG5pbXBvcnQgKiBhcyBzY2hlbWEgZnJvbSAnLi9zY2hlbWEuanMnO1xuXG5jb25zdCB7IFBvb2wgfSA9IHBnO1xuXG5pZiAoIXByb2Nlc3MuZW52LkRBVEFCQVNFX1VSTCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ0RBVEFCQVNFX1VSTCBpcyBub3Qgc2V0LiBQb3N0Z3JlU1FMIGlzIHJlcXVpcmVkLicpO1xufVxuXG5leHBvcnQgY29uc3QgcG9vbCA9IG5ldyBQb29sKHtcbiAgY29ubmVjdGlvblN0cmluZzogcHJvY2Vzcy5lbnYuREFUQUJBU0VfVVJMLFxuICBtYXg6IDEwLFxuICBpZGxlVGltZW91dE1pbGxpczogMzBfMDAwLFxuICBjb25uZWN0aW9uVGltZW91dE1pbGxpczogNV8wMDAsXG59KTtcblxuZXhwb3J0IGNvbnN0IGRiOiBOb2RlUGdEYXRhYmFzZTx0eXBlb2Ygc2NoZW1hPiA9IGRyaXp6bGUocG9vbCwgeyBzY2hlbWEgfSk7XG5cbmV4cG9ydCB7IHNjaGVtYSB9O1xuXG4vLyAtLS0tIEJhY2t3YXJkLWNvbXBhdGlibGUgdHlwZXMgZm9yIHRoZSByZXN0IG9mIHRoZSBjb2RlYmFzZSAtLS0tXG5leHBvcnQgdHlwZSBTdHVkZW50ID0ge1xuICBpZDogbnVtYmVyO1xuICBuaXNuOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgYmlydGhfcGxhY2U6IHN0cmluZztcbiAgYmlydGhfZGF0ZTogc3RyaW5nO1xuICBjbGFzczogc3RyaW5nO1xuICBtYWpvcjogc3RyaW5nO1xuICBzdGF0dXNfZ3JhZHVhdGlvbjogMCB8IDEgfCBib29sZWFuO1xuICB2aWV3ZWRfYXQ6IHN0cmluZyB8IG51bGw7XG4gIGZvcm1hdHRlZF9iaXJ0aF9kYXRlPzogc3RyaW5nO1xuICBpbmxpbmVfYmlydGg/OiBzdHJpbmc7XG4gIGNyZWF0ZWRfYXQ/OiBzdHJpbmc7XG4gIHVwZGF0ZWRfYXQ/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBHYWxsZXJ5SXRlbSA9IHtcbiAgaWQ6IG51bWJlcjtcbiAgaW1hZ2VfcGF0aDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICBjcmVhdGVkX2F0OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBJbXBvcnRBcmNoaXZlID0ge1xuICBpZDogbnVtYmVyO1xuICBmaWxlbmFtZTogc3RyaW5nO1xuICBpbXBvcnRlZDogbnVtYmVyO1xuICBmYWlsZWQ6IG51bWJlcjtcbiAgdG90YWxfYWZ0ZXI6IG51bWJlcjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbiAgc25hcHNob3Q6IFN0dWRlbnRbXTtcbiAgY3JlYXRlZF9hdDogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgU2V0dGluZ3MgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBTZXR0aW5ncyA9IHtcbiAgc2Nob29sX25hbWU6ICdTTUtOIDEgV29ub2dpcmknLFxufTtcblxuY29uc3QgU0NIRU1BX1ZFUlNJT04gPSAyOyAvLyBidW1wZWQ6IDE9anNvbiwgMj1wb3N0Z3Jlc1xuXG4vLyAtLS0tIEhlbHBlcnMgLS0tLVxuY29uc3QgTU9OVEhTX0lEID0gW1xuICAnSmFudWFyaScsICdGZWJydWFyaScsICdNYXJldCcsICdBcHJpbCcsICdNZWknLCAnSnVuaScsXG4gICdKdWxpJywgJ0FndXN0dXMnLCAnU2VwdGVtYmVyJywgJ09rdG9iZXInLCAnTm92ZW1iZXInLCAnRGVzZW1iZXInLFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEJpcnRoRGF0ZUlEKGlzbzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIGlmICghaXNvKSByZXR1cm4gJyc7XG4gIGNvbnN0IG0gPSAvXihcXGR7NH0pLShcXGR7Mn0pLShcXGR7Mn0pLy5leGVjKGlzbyk7XG4gIGlmICghbSkgcmV0dXJuIGlzbyA/PyAnJztcbiAgY29uc3QgWywgeSwgbW8sIGRdID0gbTtcbiAgY29uc3QgbW9udGggPSBNT05USFNfSURbcGFyc2VJbnQobW8sIDEwKSAtIDFdID8/IG1vO1xuICByZXR1cm4gYCR7cGFyc2VJbnQoZCwgMTApfSAke21vbnRofSAke3l9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vd0lzbygpOiBzdHJpbmcge1xuICByZXR1cm4gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xufVxuXG5mdW5jdGlvbiBpc29PZih2OiBEYXRlIHwgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIXYpIHJldHVybiBudWxsO1xuICBpZiAodiBpbnN0YW5jZW9mIERhdGUpIHJldHVybiB2LnRvSVNPU3RyaW5nKCk7XG4gIGNvbnN0IGQgPSBuZXcgRGF0ZSh2KTtcbiAgcmV0dXJuIE51bWJlci5pc05hTihkLmdldFRpbWUoKSkgPyBudWxsIDogZC50b0lTT1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcm93VG9TdHVkZW50KHI6IHNjaGVtYS5TdHVkZW50Um93KTogU3R1ZGVudCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHIuaWQsXG4gICAgbmlzbjogci5uaXNuLFxuICAgIG5hbWU6IHIubmFtZSxcbiAgICBiaXJ0aF9wbGFjZTogci5iaXJ0aF9wbGFjZSA/PyAnJyxcbiAgICBiaXJ0aF9kYXRlOiBTdHJpbmcoci5iaXJ0aF9kYXRlID8/ICcnKS5zbGljZSgwLCAxMCksXG4gICAgY2xhc3M6IHIuY2xhc3MgPz8gJycsXG4gICAgbWFqb3I6IHIubWFqb3IgPz8gJycsXG4gICAgc3RhdHVzX2dyYWR1YXRpb246IChOdW1iZXIoci5zdGF0dXNfZ3JhZHVhdGlvbikgPT09IDEgPyAxIDogMCkgYXMgMCB8IDEsXG4gICAgdmlld2VkX2F0OiBpc29PZihyLnZpZXdlZF9hdCksXG4gICAgY3JlYXRlZF9hdDogaXNvT2Yoci5jcmVhdGVkX2F0KSA/PyB1bmRlZmluZWQsXG4gICAgdXBkYXRlZF9hdDogaXNvT2Yoci51cGRhdGVkX2F0KSA/PyB1bmRlZmluZWQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWNvcmF0ZVN0dWRlbnQoczogU3R1ZGVudCk6IFN0dWRlbnQge1xuICBjb25zdCBmb3JtYXR0ZWQgPSBmb3JtYXRCaXJ0aERhdGVJRChzLmJpcnRoX2RhdGUpO1xuICByZXR1cm4ge1xuICAgIC4uLnMsXG4gICAgc3RhdHVzX2dyYWR1YXRpb246IHR5cGVvZiBzLnN0YXR1c19ncmFkdWF0aW9uID09PSAnYm9vbGVhbidcbiAgICAgID8gKHMuc3RhdHVzX2dyYWR1YXRpb24gPyAxIDogMClcbiAgICAgIDogKE51bWJlcihzLnN0YXR1c19ncmFkdWF0aW9uKSA9PT0gMSA/IDEgOiAwKSxcbiAgICBmb3JtYXR0ZWRfYmlydGhfZGF0ZTogZm9ybWF0dGVkLFxuICAgIGlubGluZV9iaXJ0aDogcy5iaXJ0aF9wbGFjZSA/IGAke3MuYmlydGhfcGxhY2V9LCAke2Zvcm1hdHRlZH1gIDogZm9ybWF0dGVkLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcm93VG9HYWxsZXJ5KHI6IHNjaGVtYS5HYWxsZXJ5Um93KTogR2FsbGVyeUl0ZW0ge1xuICByZXR1cm4ge1xuICAgIGlkOiByLmlkLFxuICAgIGltYWdlX3BhdGg6IHIuaW1hZ2VfcGF0aCxcbiAgICB0aXRsZTogci50aXRsZSA/PyAnJyxcbiAgICBjcmVhdGVkX2F0OiBpc29PZihyLmNyZWF0ZWRfYXQpID8/IG5vd0lzbygpLFxuICB9O1xufVxuXG4vLyAtLS0tIFNldHRpbmdzIEtWIChrZXkvdmFsdWUgdGFibGUpIC0tLS1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRBbGxTZXR0aW5ncygpOiBQcm9taXNlPFNldHRpbmdzPiB7XG4gIGNvbnN0IHJvd3MgPSBhd2FpdCBkYi5zZWxlY3QoKS5mcm9tKHNjaGVtYS5zZXR0aW5ncyk7XG4gIGNvbnN0IG91dDogU2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MgfTtcbiAgZm9yIChjb25zdCByIG9mIHJvd3MpIG91dFtyLmtleV0gPSByLnZhbHVlID8/ICcnO1xuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0U2V0dGluZyhrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBkYi5leGVjdXRlKHNxbGBcbiAgICBJTlNFUlQgSU5UTyBzZXR0aW5ncyAoa2V5LCB2YWx1ZSwgdXBkYXRlZF9hdClcbiAgICBWQUxVRVMgKCR7a2V5fSwgJHt2YWx1ZX0sIE5PVygpKVxuICAgIE9OIENPTkZMSUNUIChrZXkpIERPIFVQREFURVxuICAgICAgU0VUIHZhbHVlID0gRVhDTFVERUQudmFsdWUsIHVwZGF0ZWRfYXQgPSBOT1coKVxuICBgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFNldHRpbmdzKHBhdGNoOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG4gIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHBhdGNoKSkge1xuICAgIGF3YWl0IHNldFNldHRpbmcoaywgdik7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNldHRpbmcoa2V5OiBzdHJpbmcsIGZhbGxiYWNrID0gJycpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCByb3cgPSBhd2FpdCBkYi5zZWxlY3QoKS5mcm9tKHNjaGVtYS5zZXR0aW5ncykud2hlcmUoZXEoc2NoZW1hLnNldHRpbmdzLmtleSwga2V5KSkubGltaXQoMSk7XG4gIHJldHVybiByb3dbMF0/LnZhbHVlID8/IGZhbGxiYWNrO1xufVxuXG4vLyAtLS0tIEhlYWx0aCAmIG1pZ3JhdGlvbiAtLS0tXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGluZygpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGxhdGVuY3lfbXM6IG51bWJlcjsgc2VydmVyX3ZlcnNpb24/OiBzdHJpbmc7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgY29uc3QgdDAgPSBEYXRlLm5vdygpO1xuICB0cnkge1xuICAgIGNvbnN0IHIgPSBhd2FpdCBwb29sLnF1ZXJ5PHsgdmVyc2lvbjogc3RyaW5nIH0+KCdTRUxFQ1QgdmVyc2lvbigpIEFTIHZlcnNpb24nKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgbGF0ZW5jeV9tczogRGF0ZS5ub3coKSAtIHQwLCBzZXJ2ZXJfdmVyc2lvbjogci5yb3dzWzBdPy52ZXJzaW9uIH07XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgbGF0ZW5jeV9tczogRGF0ZS5ub3coKSAtIHQwLCBlcnJvcjogZT8ubWVzc2FnZSA/PyBTdHJpbmcoZSkgfTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY291bnRzKCk6IFByb21pc2U8eyBzdHVkZW50czogbnVtYmVyOyBnYWxsZXJpZXM6IG51bWJlcjsgaW1wb3J0X2FyY2hpdmVzOiBudW1iZXIgfT4ge1xuICBjb25zdCBbeyBjOiBzIH1dID0gKGF3YWl0IHBvb2wucXVlcnk8eyBjOiBzdHJpbmcgfT4oJ1NFTEVDVCBDT1VOVCgqKTo6dGV4dCBBUyBjIEZST00gc3R1ZGVudHMnKSkucm93cztcbiAgY29uc3QgW3sgYzogZyB9XSA9IChhd2FpdCBwb29sLnF1ZXJ5PHsgYzogc3RyaW5nIH0+KCdTRUxFQ1QgQ09VTlQoKik6OnRleHQgQVMgYyBGUk9NIGdhbGxlcmllcycpKS5yb3dzO1xuICBjb25zdCBbeyBjOiBhIH1dID0gKGF3YWl0IHBvb2wucXVlcnk8eyBjOiBzdHJpbmcgfT4oJ1NFTEVDVCBDT1VOVCgqKTo6dGV4dCBBUyBjIEZST00gaW1wb3J0X2FyY2hpdmVzJykpLnJvd3M7XG4gIHJldHVybiB7IHN0dWRlbnRzOiBOdW1iZXIocyksIGdhbGxlcmllczogTnVtYmVyKGcpLCBpbXBvcnRfYXJjaGl2ZXM6IE51bWJlcihhKSB9O1xufVxuXG4vKipcbiAqIElkZW1wb3RlbnQgc2V0dXA6IGVuc3VyZXMgdGhlIGZvdXIgdGFibGVzIGV4aXN0IGFuZCBzZWVkcyB0aGUgZGVmYXVsdFxuICogYHNjaG9vbF9uYW1lYCBzZXR0aW5nLiBUaGUgYWN0dWFsIENSRUFURSBUQUJMRSBzdGF0ZW1lbnRzIGxpdmUgaW4gdGhpc1xuICogZnVuY3Rpb24gc28gdGhlIFNQQSdzIFwiRm9yY2UgTWlncmF0ZVwiIGJ1dHRvbiBjYW4gcmVjb3ZlciBmcm9tIGEgd2lwZWQgREIuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtaWdyYXRlKCk6IFByb21pc2U8eyBjcmVhdGVkOiBib29sZWFuOyBzY2hlbWFfdmVyc2lvbjogbnVtYmVyOyBjb3VudHM6IHsgc3R1ZGVudHM6IG51bWJlcjsgZ2FsbGVyaWVzOiBudW1iZXI7IGltcG9ydF9hcmNoaXZlczogbnVtYmVyIH0gfT4ge1xuICBjb25zdCBkZGwgPSBgXG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc3R1ZGVudHMgKFxuICAgICAgaWQgU0VSSUFMIFBSSU1BUlkgS0VZLFxuICAgICAgbmlzbiBWQVJDSEFSKDMyKSBOT1QgTlVMTCxcbiAgICAgIG5hbWUgVEVYVCBOT1QgTlVMTCxcbiAgICAgIGJpcnRoX3BsYWNlIFRFWFQgTk9UIE5VTEwgREVGQVVMVCAnJyxcbiAgICAgIGJpcnRoX2RhdGUgVkFSQ0hBUigxMCkgTk9UIE5VTEwsXG4gICAgICBjbGFzcyBWQVJDSEFSKDY0KSBOT1QgTlVMTCBERUZBVUxUICcnLFxuICAgICAgbWFqb3IgVkFSQ0hBUigxMjgpIE5PVCBOVUxMIERFRkFVTFQgJycsXG4gICAgICBzdGF0dXNfZ3JhZHVhdGlvbiBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMSxcbiAgICAgIHZpZXdlZF9hdCBUSU1FU1RBTVBUWixcbiAgICAgIGNyZWF0ZWRfYXQgVElNRVNUQU1QVFogTk9UIE5VTEwgREVGQVVMVCBOT1coKSxcbiAgICAgIHVwZGF0ZWRfYXQgVElNRVNUQU1QVFogTk9UIE5VTEwgREVGQVVMVCBOT1coKVxuICAgICk7XG4gICAgQ1JFQVRFIFVOSVFVRSBJTkRFWCBJRiBOT1QgRVhJU1RTIHN0dWRlbnRzX25pc25fdXggT04gc3R1ZGVudHMobmlzbik7XG4gICAgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgc3R1ZGVudHNfY2xhc3NfaWR4IE9OIHN0dWRlbnRzKGNsYXNzKTtcbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzZXR0aW5ncyAoXG4gICAgICBrZXkgVkFSQ0hBUig2NCkgUFJJTUFSWSBLRVksXG4gICAgICB2YWx1ZSBURVhUIE5PVCBOVUxMIERFRkFVTFQgJycsXG4gICAgICB1cGRhdGVkX2F0IFRJTUVTVEFNUFRaIE5PVCBOVUxMIERFRkFVTFQgTk9XKClcbiAgICApO1xuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGdhbGxlcmllcyAoXG4gICAgICBpZCBTRVJJQUwgUFJJTUFSWSBLRVksXG4gICAgICBpbWFnZV9wYXRoIFRFWFQgTk9UIE5VTEwsXG4gICAgICB0aXRsZSBWQVJDSEFSKDIwMCkgTk9UIE5VTEwgREVGQVVMVCAnJyxcbiAgICAgIGNyZWF0ZWRfYXQgVElNRVNUQU1QVFogTk9UIE5VTEwgREVGQVVMVCBOT1coKVxuICAgICk7XG4gICAgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgaW1wb3J0X2FyY2hpdmVzIChcbiAgICAgIGlkIFNFUklBTCBQUklNQVJZIEtFWSxcbiAgICAgIGZpbGVuYW1lIFRFWFQgTk9UIE5VTEwsXG4gICAgICBpbXBvcnRlZCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgICAgIGZhaWxlZCBJTlRFR0VSIE5PVCBOVUxMIERFRkFVTFQgMCxcbiAgICAgIHRvdGFsX2FmdGVyIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICAgICAgZXJyb3JzIEpTT05CIE5PVCBOVUxMIERFRkFVTFQgJ1tdJzo6anNvbmIsXG4gICAgICBzbmFwc2hvdCBKU09OQiBOT1QgTlVMTCBERUZBVUxUICdbXSc6Ompzb25iLFxuICAgICAgY3JlYXRlZF9hdCBUSU1FU1RBTVBUWiBOT1QgTlVMTCBERUZBVUxUIE5PVygpXG4gICAgKTtcbiAgYDtcbiAgYXdhaXQgcG9vbC5xdWVyeShkZGwpO1xuICAvLyBTZWVkIGRlZmF1bHQgc2V0dGluZ3MgaWYgZW1wdHlcbiAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoREVGQVVMVF9TRVRUSU5HUykpIHtcbiAgICBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgJ0lOU0VSVCBJTlRPIHNldHRpbmdzIChrZXksIHZhbHVlKSBWQUxVRVMgKCQxLCAkMikgT04gQ09ORkxJQ1QgKGtleSkgRE8gTk9USElORycsXG4gICAgICBbaywgdl0sXG4gICAgKTtcbiAgfVxuICBjb25zdCBjID0gYXdhaXQgY291bnRzKCk7XG4gIHJldHVybiB7IGNyZWF0ZWQ6IGZhbHNlLCBzY2hlbWFfdmVyc2lvbjogU0NIRU1BX1ZFUlNJT04sIGNvdW50czogYyB9O1xufVxuXG4vKipcbiAqIE9uZS1zaG90IGltcG9ydGVyIGZvciB0aGUgbGVnYWN5IHNlcnZlci9kYXRhLmpzb24gZmlsZS4gQ29waWVzIHRoZSBKU09OXG4gKiBjb250ZW50cyBpbnRvIFBvc3RncmVTUUwgd2l0aCBJTlNFUlQgLi4uIE9OIENPTkZMSUNUIERPIE5PVEhJTkcgKGlkZW1wb3RlbnQpLFxuICogdGhlbiByZW5hbWVzIHRoZSBKU09OIGZpbGUgdG8gLm1pZ3JhdGVkIHNvIGl0IGNhbm5vdCBiZSByZS1pbXBvcnRlZC5cbiAqXG4gKiBSZXR1cm5zIHsgbWlncmF0ZWQ6IGZhbHNlIH0gaWYgbm8gZGF0YS5qc29uIGV4aXN0cywgb3IgZGV0YWlscyBhYm91dCBob3dcbiAqIG1hbnkgcm93cyBvZiBlYWNoIGtpbmQgd2VyZSB0cmFuc2ZlcnJlZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGltcG9ydExlZ2FjeUpzb25JZlByZXNlbnQoKTogUHJvbWlzZTx7XG4gIG1pZ3JhdGVkOiBib29sZWFuO1xuICByZWFzb24/OiBzdHJpbmc7XG4gIGluc2VydGVkPzogeyBzdHVkZW50czogbnVtYmVyOyBnYWxsZXJpZXM6IG51bWJlcjsgc2V0dGluZ3M6IG51bWJlcjsgaW1wb3J0X2FyY2hpdmVzOiBudW1iZXIgfTtcbn0+IHtcbiAgY29uc3QgZGF0YUZpbGUgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgJ3NlcnZlcicsICdkYXRhLmpzb24nKTtcbiAgaWYgKCFmcy5leGlzdHNTeW5jKGRhdGFGaWxlKSkgcmV0dXJuIHsgbWlncmF0ZWQ6IGZhbHNlLCByZWFzb246ICdubyBkYXRhLmpzb24nIH07XG5cbiAgbGV0IHBhcnNlZDogYW55O1xuICB0cnkge1xuICAgIHBhcnNlZCA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKGRhdGFGaWxlLCAndXRmLTgnKSk7XG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIHJldHVybiB7IG1pZ3JhdGVkOiBmYWxzZSwgcmVhc29uOiBgZGF0YS5qc29uIGlzIG5vdCB2YWxpZCBKU09OOiAke2U/Lm1lc3NhZ2V9YCB9O1xuICB9XG5cbiAgY29uc3QgaW5zZXJ0ZWQgPSB7IHN0dWRlbnRzOiAwLCBnYWxsZXJpZXM6IDAsIHNldHRpbmdzOiAwLCBpbXBvcnRfYXJjaGl2ZXM6IDAgfTtcblxuICAvLyBTZXR0aW5ncyAoS1YgdXBzZXJ0KVxuICBjb25zdCBzT2JqID0gKHBhcnNlZD8uc2V0dGluZ3MgPz8ge30pIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhzT2JqKSkge1xuICAgIGlmICh2ID09PSBudWxsIHx8IHYgPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgYXdhaXQgcG9vbC5xdWVyeShcbiAgICAgIGBJTlNFUlQgSU5UTyBzZXR0aW5ncyAoa2V5LCB2YWx1ZSkgVkFMVUVTICgkMSwgJDIpXG4gICAgICAgT04gQ09ORkxJQ1QgKGtleSkgRE8gVVBEQVRFIFNFVCB2YWx1ZSA9IEVYQ0xVREVELnZhbHVlLCB1cGRhdGVkX2F0ID0gTk9XKClgLFxuICAgICAgW2ssIFN0cmluZyh2KV0sXG4gICAgKTtcbiAgICBpbnNlcnRlZC5zZXR0aW5ncysrO1xuICB9XG5cbiAgLy8gU3R1ZGVudHNcbiAgZm9yIChjb25zdCBzIG9mIHBhcnNlZD8uc3R1ZGVudHMgPz8gW10pIHtcbiAgICBjb25zdCByID0gYXdhaXQgcG9vbC5xdWVyeShcbiAgICAgIGBJTlNFUlQgSU5UTyBzdHVkZW50c1xuICAgICAgICAobmlzbiwgbmFtZSwgYmlydGhfcGxhY2UsIGJpcnRoX2RhdGUsIGNsYXNzLCBtYWpvciwgc3RhdHVzX2dyYWR1YXRpb24sIHZpZXdlZF9hdCwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdClcbiAgICAgICBWQUxVRVMgKCQxLCQyLCQzLCQ0LCQ1LCQ2LCQ3LCQ4LCBDT0FMRVNDRSgkOTo6dGltZXN0YW1wdHosIE5PVygpKSwgQ09BTEVTQ0UoJDEwOjp0aW1lc3RhbXB0eiwgTk9XKCkpKVxuICAgICAgIE9OIENPTkZMSUNUIChuaXNuKSBETyBOT1RISU5HYCxcbiAgICAgIFtcbiAgICAgICAgU3RyaW5nKHMubmlzbiA/PyAnJykudHJpbSgpLFxuICAgICAgICBTdHJpbmcocy5uYW1lID8/ICcnKS50cmltKCksXG4gICAgICAgIFN0cmluZyhzLmJpcnRoX3BsYWNlID8/ICcnKSxcbiAgICAgICAgU3RyaW5nKHMuYmlydGhfZGF0ZSA/PyAnJykuc2xpY2UoMCwgMTApLFxuICAgICAgICBTdHJpbmcocy5jbGFzcyA/PyAnJyksXG4gICAgICAgIFN0cmluZyhzLm1ham9yID8/ICcnKSxcbiAgICAgICAgTnVtYmVyKHMuc3RhdHVzX2dyYWR1YXRpb24pID09PSAxIHx8IHMuc3RhdHVzX2dyYWR1YXRpb24gPT09IHRydWUgPyAxIDogMCxcbiAgICAgICAgcy52aWV3ZWRfYXQgPz8gbnVsbCxcbiAgICAgICAgcy5jcmVhdGVkX2F0ID8/IG51bGwsXG4gICAgICAgIHMudXBkYXRlZF9hdCA/PyBudWxsLFxuICAgICAgXSxcbiAgICApO1xuICAgIGlmIChyLnJvd0NvdW50ICYmIHIucm93Q291bnQgPiAwKSBpbnNlcnRlZC5zdHVkZW50cysrO1xuICB9XG5cbiAgLy8gR2FsbGVyaWVzXG4gIGZvciAoY29uc3QgZyBvZiBwYXJzZWQ/LmdhbGxlcmllcyA/PyBbXSkge1xuICAgIGNvbnN0IHIgPSBhd2FpdCBwb29sLnF1ZXJ5KFxuICAgICAgYElOU0VSVCBJTlRPIGdhbGxlcmllcyAoaW1hZ2VfcGF0aCwgdGl0bGUsIGNyZWF0ZWRfYXQpXG4gICAgICAgVkFMVUVTICgkMSwkMiwgQ09BTEVTQ0UoJDM6OnRpbWVzdGFtcHR6LCBOT1coKSkpYCxcbiAgICAgIFtTdHJpbmcoZy5pbWFnZV9wYXRoID8/ICcnKSwgU3RyaW5nKGcudGl0bGUgPz8gJycpLCBnLmNyZWF0ZWRfYXQgPz8gbnVsbF0sXG4gICAgKTtcbiAgICBpZiAoci5yb3dDb3VudCAmJiByLnJvd0NvdW50ID4gMCkgaW5zZXJ0ZWQuZ2FsbGVyaWVzKys7XG4gIH1cblxuICAvLyBJbXBvcnQgYXJjaGl2ZXNcbiAgZm9yIChjb25zdCBhIG9mIHBhcnNlZD8uaW1wb3J0X2FyY2hpdmVzID8/IFtdKSB7XG4gICAgY29uc3QgciA9IGF3YWl0IHBvb2wucXVlcnkoXG4gICAgICBgSU5TRVJUIElOVE8gaW1wb3J0X2FyY2hpdmVzIChmaWxlbmFtZSwgaW1wb3J0ZWQsIGZhaWxlZCwgdG90YWxfYWZ0ZXIsIGVycm9ycywgc25hcHNob3QsIGNyZWF0ZWRfYXQpXG4gICAgICAgVkFMVUVTICgkMSwkMiwkMywkNCwkNTo6anNvbmIsJDY6Ompzb25iLCBDT0FMRVNDRSgkNzo6dGltZXN0YW1wdHosIE5PVygpKSlgLFxuICAgICAgW1xuICAgICAgICBTdHJpbmcoYS5maWxlbmFtZSA/PyAnJyksXG4gICAgICAgIE51bWJlcihhLmltcG9ydGVkID8/IDApLFxuICAgICAgICBOdW1iZXIoYS5mYWlsZWQgPz8gMCksXG4gICAgICAgIE51bWJlcihhLnRvdGFsX2FmdGVyID8/IDApLFxuICAgICAgICBKU09OLnN0cmluZ2lmeShhLmVycm9ycyA/PyBbXSksXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KGEuc25hcHNob3QgPz8gW10pLFxuICAgICAgICBhLmNyZWF0ZWRfYXQgPz8gbnVsbCxcbiAgICAgIF0sXG4gICAgKTtcbiAgICBpZiAoci5yb3dDb3VudCAmJiByLnJvd0NvdW50ID4gMCkgaW5zZXJ0ZWQuaW1wb3J0X2FyY2hpdmVzKys7XG4gIH1cblxuICAvLyBQYXJrIHRoZSBsZWdhY3kgZmlsZSBzbyBpdCBjYW5ub3QgYmUgcmUtaW1wb3J0ZWQgYW5kIHdvbid0IGNvbmZ1c2UgYW55b25lLlxuICBjb25zdCBhcmNoaXZlZFBhdGggPSBgJHtkYXRhRmlsZX0ubWlncmF0ZWQtJHtEYXRlLm5vdygpfS5iYWtgO1xuICB0cnkge1xuICAgIGZzLnJlbmFtZVN5bmMoZGF0YUZpbGUsIGFyY2hpdmVkUGF0aCk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIElmIHJlbmFtZSBmYWlscywgYXQgbGVhc3Qgb3ZlcndyaXRlIHdpdGggYSBtYXJrZXJcbiAgICBmcy53cml0ZUZpbGVTeW5jKGRhdGFGaWxlLCBgTUlHUkFURURfVE9fUE9TVEdSRVNfJHtub3dJc28oKX1cXG5gKTtcbiAgfVxuXG4gIHJldHVybiB7IG1pZ3JhdGVkOiB0cnVlLCBpbnNlcnRlZCB9O1xufVxuIiwgImltcG9ydCB7IHBnVGFibGUsIHNlcmlhbCwgdGV4dCwgaW50ZWdlciwgdGltZXN0YW1wLCBqc29uYiwgYm9vbGVhbiwgdmFyY2hhciwgaW5kZXgsIHVuaXF1ZUluZGV4IH0gZnJvbSAnZHJpenpsZS1vcm0vcGctY29yZSc7XG5cbmV4cG9ydCBjb25zdCBzdHVkZW50cyA9IHBnVGFibGUoXG4gICdzdHVkZW50cycsXG4gIHtcbiAgICBpZDogc2VyaWFsKCdpZCcpLnByaW1hcnlLZXkoKSxcbiAgICBuaXNuOiB2YXJjaGFyKCduaXNuJywgeyBsZW5ndGg6IDMyIH0pLm5vdE51bGwoKSxcbiAgICBuYW1lOiB0ZXh0KCduYW1lJykubm90TnVsbCgpLFxuICAgIGJpcnRoX3BsYWNlOiB0ZXh0KCdiaXJ0aF9wbGFjZScpLmRlZmF1bHQoJycpLm5vdE51bGwoKSxcbiAgICBiaXJ0aF9kYXRlOiB2YXJjaGFyKCdiaXJ0aF9kYXRlJywgeyBsZW5ndGg6IDEwIH0pLm5vdE51bGwoKSxcbiAgICBjbGFzczogdmFyY2hhcignY2xhc3MnLCB7IGxlbmd0aDogNjQgfSkuZGVmYXVsdCgnJykubm90TnVsbCgpLFxuICAgIG1ham9yOiB2YXJjaGFyKCdtYWpvcicsIHsgbGVuZ3RoOiAxMjggfSkuZGVmYXVsdCgnJykubm90TnVsbCgpLFxuICAgIHN0YXR1c19ncmFkdWF0aW9uOiBpbnRlZ2VyKCdzdGF0dXNfZ3JhZHVhdGlvbicpLmRlZmF1bHQoMSkubm90TnVsbCgpLFxuICAgIHZpZXdlZF9hdDogdGltZXN0YW1wKCd2aWV3ZWRfYXQnLCB7IHdpdGhUaW1lem9uZTogdHJ1ZSB9KSxcbiAgICBjcmVhdGVkX2F0OiB0aW1lc3RhbXAoJ2NyZWF0ZWRfYXQnLCB7IHdpdGhUaW1lem9uZTogdHJ1ZSB9KS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxuICAgIHVwZGF0ZWRfYXQ6IHRpbWVzdGFtcCgndXBkYXRlZF9hdCcsIHsgd2l0aFRpbWV6b25lOiB0cnVlIH0pLmRlZmF1bHROb3coKS5ub3ROdWxsKCksXG4gIH0sXG4gICh0KSA9PiAoe1xuICAgIG5pc25VeDogdW5pcXVlSW5kZXgoJ3N0dWRlbnRzX25pc25fdXgnKS5vbih0Lm5pc24pLFxuICAgIGNsYXNzSWR4OiBpbmRleCgnc3R1ZGVudHNfY2xhc3NfaWR4Jykub24odC5jbGFzcyksXG4gIH0pLFxuKTtcblxuZXhwb3J0IGNvbnN0IHNldHRpbmdzID0gcGdUYWJsZSgnc2V0dGluZ3MnLCB7XG4gIGtleTogdmFyY2hhcigna2V5JywgeyBsZW5ndGg6IDY0IH0pLnByaW1hcnlLZXkoKSxcbiAgdmFsdWU6IHRleHQoJ3ZhbHVlJykuZGVmYXVsdCgnJykubm90TnVsbCgpLFxuICB1cGRhdGVkX2F0OiB0aW1lc3RhbXAoJ3VwZGF0ZWRfYXQnLCB7IHdpdGhUaW1lem9uZTogdHJ1ZSB9KS5kZWZhdWx0Tm93KCkubm90TnVsbCgpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBnYWxsZXJpZXMgPSBwZ1RhYmxlKCdnYWxsZXJpZXMnLCB7XG4gIGlkOiBzZXJpYWwoJ2lkJykucHJpbWFyeUtleSgpLFxuICBpbWFnZV9wYXRoOiB0ZXh0KCdpbWFnZV9wYXRoJykubm90TnVsbCgpLFxuICB0aXRsZTogdmFyY2hhcigndGl0bGUnLCB7IGxlbmd0aDogMjAwIH0pLmRlZmF1bHQoJycpLm5vdE51bGwoKSxcbiAgY3JlYXRlZF9hdDogdGltZXN0YW1wKCdjcmVhdGVkX2F0JywgeyB3aXRoVGltZXpvbmU6IHRydWUgfSkuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgaW1wb3J0QXJjaGl2ZXMgPSBwZ1RhYmxlKCdpbXBvcnRfYXJjaGl2ZXMnLCB7XG4gIGlkOiBzZXJpYWwoJ2lkJykucHJpbWFyeUtleSgpLFxuICBmaWxlbmFtZTogdGV4dCgnZmlsZW5hbWUnKS5ub3ROdWxsKCksXG4gIGltcG9ydGVkOiBpbnRlZ2VyKCdpbXBvcnRlZCcpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICBmYWlsZWQ6IGludGVnZXIoJ2ZhaWxlZCcpLmRlZmF1bHQoMCkubm90TnVsbCgpLFxuICB0b3RhbF9hZnRlcjogaW50ZWdlcigndG90YWxfYWZ0ZXInKS5kZWZhdWx0KDApLm5vdE51bGwoKSxcbiAgZXJyb3JzOiBqc29uYignZXJyb3JzJykuJHR5cGU8c3RyaW5nW10+KCkuZGVmYXVsdChbXSkubm90TnVsbCgpLFxuICBzbmFwc2hvdDoganNvbmIoJ3NuYXBzaG90JykuJHR5cGU8dW5rbm93bltdPigpLmRlZmF1bHQoW10pLm5vdE51bGwoKSxcbiAgY3JlYXRlZF9hdDogdGltZXN0YW1wKCdjcmVhdGVkX2F0JywgeyB3aXRoVGltZXpvbmU6IHRydWUgfSkuZGVmYXVsdE5vdygpLm5vdE51bGwoKSxcbn0pO1xuXG5leHBvcnQgdHlwZSBTdHVkZW50Um93ID0gdHlwZW9mIHN0dWRlbnRzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIEdhbGxlcnlSb3cgPSB0eXBlb2YgZ2FsbGVyaWVzLiRpbmZlclNlbGVjdDtcbmV4cG9ydCB0eXBlIFNldHRpbmdSb3cgPSB0eXBlb2Ygc2V0dGluZ3MuJGluZmVyU2VsZWN0O1xuZXhwb3J0IHR5cGUgSW1wb3J0QXJjaGl2ZVJvdyA9IHR5cGVvZiBpbXBvcnRBcmNoaXZlcy4kaW5mZXJTZWxlY3Q7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7O0FBQUEsT0FBTztBQUNQLE9BQU9BLGNBQWE7QUFDcEIsT0FBTyxVQUFVO0FBQ2pCLE9BQU9DLFdBQVU7QUFDakIsT0FBT0MsU0FBUTs7O0FDSmYsT0FBTyxhQUEyRDtBQUNsRSxPQUFPLFlBQVk7QUFDbkIsT0FBT0MsV0FBVTtBQUNqQixPQUFPQyxTQUFRO0FBQ2YsT0FBTyxZQUFZO0FBQ25CLFlBQVksVUFBVTtBQUN0QixTQUFjLE1BQUFDLEtBQUksT0FBTyxJQUFJLEtBQUssS0FBSyxNQUFNLGVBQWU7OztBQ041RCxPQUFPO0FBQ1AsT0FBTyxRQUFRO0FBQ2YsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sUUFBUTtBQUNmLFNBQVMsZUFBb0M7QUFDN0MsU0FBUyxLQUFLLFVBQVU7OztBQ0x4QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVMsU0FBUyxRQUFRLE1BQU0sU0FBUyxXQUFXLE9BQWdCLFNBQVMsT0FBTyxtQkFBbUI7QUFFaEcsSUFBTSxXQUFXO0FBQUEsRUFDdEI7QUFBQSxFQUNBO0FBQUEsSUFDRSxJQUFJLE9BQU8sSUFBSSxFQUFFLFdBQVc7QUFBQSxJQUM1QixNQUFNLFFBQVEsUUFBUSxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsUUFBUTtBQUFBLElBQzlDLE1BQU0sS0FBSyxNQUFNLEVBQUUsUUFBUTtBQUFBLElBQzNCLGFBQWEsS0FBSyxhQUFhLEVBQUUsUUFBUSxFQUFFLEVBQUUsUUFBUTtBQUFBLElBQ3JELFlBQVksUUFBUSxjQUFjLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxRQUFRO0FBQUEsSUFDMUQsT0FBTyxRQUFRLFNBQVMsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFLFFBQVE7QUFBQSxJQUM1RCxPQUFPLFFBQVEsU0FBUyxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUUsUUFBUTtBQUFBLElBQzdELG1CQUFtQixRQUFRLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVE7QUFBQSxJQUNuRSxXQUFXLFVBQVUsYUFBYSxFQUFFLGNBQWMsS0FBSyxDQUFDO0FBQUEsSUFDeEQsWUFBWSxVQUFVLGNBQWMsRUFBRSxjQUFjLEtBQUssQ0FBQyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsSUFDakYsWUFBWSxVQUFVLGNBQWMsRUFBRSxjQUFjLEtBQUssQ0FBQyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQUEsRUFDbkY7QUFBQSxFQUNBLENBQUMsT0FBTztBQUFBLElBQ04sUUFBUSxZQUFZLGtCQUFrQixFQUFFLEdBQUcsRUFBRSxJQUFJO0FBQUEsSUFDakQsVUFBVSxNQUFNLG9CQUFvQixFQUFFLEdBQUcsRUFBRSxLQUFLO0FBQUEsRUFDbEQ7QUFDRjtBQUVPLElBQU0sV0FBVyxRQUFRLFlBQVk7QUFBQSxFQUMxQyxLQUFLLFFBQVEsT0FBTyxFQUFFLFFBQVEsR0FBRyxDQUFDLEVBQUUsV0FBVztBQUFBLEVBQy9DLE9BQU8sS0FBSyxPQUFPLEVBQUUsUUFBUSxFQUFFLEVBQUUsUUFBUTtBQUFBLEVBQ3pDLFlBQVksVUFBVSxjQUFjLEVBQUUsY0FBYyxLQUFLLENBQUMsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUNuRixDQUFDO0FBRU0sSUFBTSxZQUFZLFFBQVEsYUFBYTtBQUFBLEVBQzVDLElBQUksT0FBTyxJQUFJLEVBQUUsV0FBVztBQUFBLEVBQzVCLFlBQVksS0FBSyxZQUFZLEVBQUUsUUFBUTtBQUFBLEVBQ3ZDLE9BQU8sUUFBUSxTQUFTLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxRQUFRO0FBQUEsRUFDN0QsWUFBWSxVQUFVLGNBQWMsRUFBRSxjQUFjLEtBQUssQ0FBQyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQ25GLENBQUM7QUFFTSxJQUFNLGlCQUFpQixRQUFRLG1CQUFtQjtBQUFBLEVBQ3ZELElBQUksT0FBTyxJQUFJLEVBQUUsV0FBVztBQUFBLEVBQzVCLFVBQVUsS0FBSyxVQUFVLEVBQUUsUUFBUTtBQUFBLEVBQ25DLFVBQVUsUUFBUSxVQUFVLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLEVBQ2pELFFBQVEsUUFBUSxRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLEVBQzdDLGFBQWEsUUFBUSxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUTtBQUFBLEVBQ3ZELFFBQVEsTUFBTSxRQUFRLEVBQUUsTUFBZ0IsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUFFLFFBQVE7QUFBQSxFQUM5RCxVQUFVLE1BQU0sVUFBVSxFQUFFLE1BQWlCLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxRQUFRO0FBQUEsRUFDbkUsWUFBWSxVQUFVLGNBQWMsRUFBRSxjQUFjLEtBQUssQ0FBQyxFQUFFLFdBQVcsRUFBRSxRQUFRO0FBQ25GLENBQUM7OztBRHJDRCxJQUFNLEVBQUUsS0FBSyxJQUFJO0FBRWpCLElBQUksQ0FBQyxRQUFRLElBQUksY0FBYztBQUM3QixRQUFNLElBQUksTUFBTSxrREFBa0Q7QUFDcEU7QUFFTyxJQUFNLE9BQU8sSUFBSSxLQUFLO0FBQUEsRUFDM0Isa0JBQWtCLFFBQVEsSUFBSTtBQUFBLEVBQzlCLEtBQUs7QUFBQSxFQUNMLG1CQUFtQjtBQUFBLEVBQ25CLHlCQUF5QjtBQUMzQixDQUFDO0FBRU0sSUFBTSxLQUFvQyxRQUFRLE1BQU0sRUFBRSx1QkFBTyxDQUFDO0FBeUN6RSxJQUFNLG1CQUE2QjtBQUFBLEVBQ2pDLGFBQWE7QUFDZjtBQUVBLElBQU0saUJBQWlCO0FBR3ZCLElBQU0sWUFBWTtBQUFBLEVBQ2hCO0FBQUEsRUFBVztBQUFBLEVBQVk7QUFBQSxFQUFTO0FBQUEsRUFBUztBQUFBLEVBQU87QUFBQSxFQUNoRDtBQUFBLEVBQVE7QUFBQSxFQUFXO0FBQUEsRUFBYTtBQUFBLEVBQVc7QUFBQSxFQUFZO0FBQ3pEO0FBRU8sU0FBUyxrQkFBa0IsS0FBd0M7QUFDeEUsTUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixRQUFNLElBQUksMkJBQTJCLEtBQUssR0FBRztBQUM3QyxNQUFJLENBQUMsRUFBRyxRQUFPLE9BQU87QUFDdEIsUUFBTSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSTtBQUNyQixRQUFNLFFBQVEsVUFBVSxTQUFTLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSztBQUNqRCxTQUFPLEdBQUcsU0FBUyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDO0FBQ3pDO0FBRU8sU0FBUyxTQUFpQjtBQUMvQixVQUFPLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQ2hDO0FBRUEsU0FBUyxNQUFNLEdBQW9EO0FBQ2pFLE1BQUksQ0FBQyxFQUFHLFFBQU87QUFDZixNQUFJLGFBQWEsS0FBTSxRQUFPLEVBQUUsWUFBWTtBQUM1QyxRQUFNLElBQUksSUFBSSxLQUFLLENBQUM7QUFDcEIsU0FBTyxPQUFPLE1BQU0sRUFBRSxRQUFRLENBQUMsSUFBSSxPQUFPLEVBQUUsWUFBWTtBQUMxRDtBQUVPLFNBQVMsYUFBYSxHQUErQjtBQUMxRCxTQUFPO0FBQUEsSUFDTCxJQUFJLEVBQUU7QUFBQSxJQUNOLE1BQU0sRUFBRTtBQUFBLElBQ1IsTUFBTSxFQUFFO0FBQUEsSUFDUixhQUFhLEVBQUUsZUFBZTtBQUFBLElBQzlCLFlBQVksT0FBTyxFQUFFLGNBQWMsRUFBRSxFQUFFLE1BQU0sR0FBRyxFQUFFO0FBQUEsSUFDbEQsT0FBTyxFQUFFLFNBQVM7QUFBQSxJQUNsQixPQUFPLEVBQUUsU0FBUztBQUFBLElBQ2xCLG1CQUFvQixPQUFPLEVBQUUsaUJBQWlCLE1BQU0sSUFBSSxJQUFJO0FBQUEsSUFDNUQsV0FBVyxNQUFNLEVBQUUsU0FBUztBQUFBLElBQzVCLFlBQVksTUFBTSxFQUFFLFVBQVUsS0FBSztBQUFBLElBQ25DLFlBQVksTUFBTSxFQUFFLFVBQVUsS0FBSztBQUFBLEVBQ3JDO0FBQ0Y7QUFFTyxTQUFTLGdCQUFnQixHQUFxQjtBQUNuRCxRQUFNLFlBQVksa0JBQWtCLEVBQUUsVUFBVTtBQUNoRCxTQUFPO0FBQUEsSUFDTCxHQUFHO0FBQUEsSUFDSCxtQkFBbUIsT0FBTyxFQUFFLHNCQUFzQixZQUM3QyxFQUFFLG9CQUFvQixJQUFJLElBQzFCLE9BQU8sRUFBRSxpQkFBaUIsTUFBTSxJQUFJLElBQUk7QUFBQSxJQUM3QyxzQkFBc0I7QUFBQSxJQUN0QixjQUFjLEVBQUUsY0FBYyxHQUFHLEVBQUUsV0FBVyxLQUFLLFNBQVMsS0FBSztBQUFBLEVBQ25FO0FBQ0Y7QUFZQSxlQUFzQixpQkFBb0M7QUFDeEQsUUFBTSxPQUFPLE1BQU0sR0FBRyxPQUFPLEVBQUUsS0FBWSxRQUFRO0FBQ25ELFFBQU0sTUFBZ0IsRUFBRSxHQUFHLGlCQUFpQjtBQUM1QyxhQUFXLEtBQUssS0FBTSxLQUFJLEVBQUUsR0FBRyxJQUFJLEVBQUUsU0FBUztBQUM5QyxTQUFPO0FBQ1Q7QUFFQSxlQUFzQixXQUFXLEtBQWEsT0FBOEI7QUFDMUUsUUFBTSxHQUFHLFFBQVE7QUFBQTtBQUFBLGNBRUwsR0FBRyxLQUFLLEtBQUs7QUFBQTtBQUFBO0FBQUEsR0FHeEI7QUFDSDtBQUVBLGVBQXNCLFlBQVksT0FBOEM7QUFDOUUsYUFBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDMUMsVUFBTSxXQUFXLEdBQUcsQ0FBQztBQUFBLEVBQ3ZCO0FBQ0Y7QUFFQSxlQUFzQixXQUFXLEtBQWEsV0FBVyxJQUFxQjtBQUM1RSxRQUFNLE1BQU0sTUFBTSxHQUFHLE9BQU8sRUFBRSxLQUFZLFFBQVEsRUFBRSxNQUFNLEdBQVUsU0FBUyxLQUFLLEdBQUcsQ0FBQyxFQUFFLE1BQU0sQ0FBQztBQUMvRixTQUFPLElBQUksQ0FBQyxHQUFHLFNBQVM7QUFDMUI7QUFHQSxlQUFzQixPQUE4RjtBQUNsSCxRQUFNLEtBQUssS0FBSyxJQUFJO0FBQ3BCLE1BQUk7QUFDRixVQUFNLElBQUksTUFBTSxLQUFLLE1BQTJCLDZCQUE2QjtBQUM3RSxXQUFPLEVBQUUsSUFBSSxNQUFNLFlBQVksS0FBSyxJQUFJLElBQUksSUFBSSxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsR0FBRyxRQUFRO0FBQUEsRUFDckYsU0FBUyxHQUFRO0FBQ2YsV0FBTyxFQUFFLElBQUksT0FBTyxZQUFZLEtBQUssSUFBSSxJQUFJLElBQUksT0FBTyxHQUFHLFdBQVcsT0FBTyxDQUFDLEVBQUU7QUFBQSxFQUNsRjtBQUNGO0FBRUEsZUFBc0IsU0FBb0Y7QUFDeEcsUUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxNQUFNLEtBQUssTUFBcUIsMENBQTBDLEdBQUc7QUFDakcsUUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxNQUFNLEtBQUssTUFBcUIsMkNBQTJDLEdBQUc7QUFDbEcsUUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxNQUFNLEtBQUssTUFBcUIsaURBQWlELEdBQUc7QUFDeEcsU0FBTyxFQUFFLFVBQVUsT0FBTyxDQUFDLEdBQUcsV0FBVyxPQUFPLENBQUMsR0FBRyxpQkFBaUIsT0FBTyxDQUFDLEVBQUU7QUFDakY7QUFPQSxlQUFzQixVQUEySTtBQUMvSixRQUFNLE1BQU07QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQXNDWixRQUFNLEtBQUssTUFBTSxHQUFHO0FBRXBCLGFBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxPQUFPLFFBQVEsZ0JBQWdCLEdBQUc7QUFDckQsVUFBTSxLQUFLO0FBQUEsTUFDVDtBQUFBLE1BQ0EsQ0FBQyxHQUFHLENBQUM7QUFBQSxJQUNQO0FBQUEsRUFDRjtBQUNBLFFBQU0sSUFBSSxNQUFNLE9BQU87QUFDdkIsU0FBTyxFQUFFLFNBQVMsT0FBTyxnQkFBZ0IsZ0JBQWdCLFFBQVEsRUFBRTtBQUNyRTtBQVVBLGVBQXNCLDRCQUluQjtBQUNELFFBQU0sV0FBVyxLQUFLLFFBQVEsUUFBUSxJQUFJLEdBQUcsVUFBVSxXQUFXO0FBQ2xFLE1BQUksQ0FBQyxHQUFHLFdBQVcsUUFBUSxFQUFHLFFBQU8sRUFBRSxVQUFVLE9BQU8sUUFBUSxlQUFlO0FBRS9FLE1BQUk7QUFDSixNQUFJO0FBQ0YsYUFBUyxLQUFLLE1BQU0sR0FBRyxhQUFhLFVBQVUsT0FBTyxDQUFDO0FBQUEsRUFDeEQsU0FBUyxHQUFRO0FBQ2YsV0FBTyxFQUFFLFVBQVUsT0FBTyxRQUFRLGdDQUFnQyxHQUFHLE9BQU8sR0FBRztBQUFBLEVBQ2pGO0FBRUEsUUFBTSxXQUFXLEVBQUUsVUFBVSxHQUFHLFdBQVcsR0FBRyxVQUFVLEdBQUcsaUJBQWlCLEVBQUU7QUFHOUUsUUFBTSxPQUFRLFFBQVEsWUFBWSxDQUFDO0FBQ25DLGFBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxPQUFPLFFBQVEsSUFBSSxHQUFHO0FBQ3pDLFFBQUksTUFBTSxRQUFRLE1BQU0sT0FBVztBQUNuQyxVQUFNLEtBQUs7QUFBQSxNQUNUO0FBQUE7QUFBQSxNQUVBLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQztBQUFBLElBQ2Y7QUFDQSxhQUFTO0FBQUEsRUFDWDtBQUdBLGFBQVcsS0FBSyxRQUFRLFlBQVksQ0FBQyxHQUFHO0FBQ3RDLFVBQU0sSUFBSSxNQUFNLEtBQUs7QUFBQSxNQUNuQjtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSUE7QUFBQSxRQUNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxLQUFLO0FBQUEsUUFDMUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxFQUFFLEtBQUs7QUFBQSxRQUMxQixPQUFPLEVBQUUsZUFBZSxFQUFFO0FBQUEsUUFDMUIsT0FBTyxFQUFFLGNBQWMsRUFBRSxFQUFFLE1BQU0sR0FBRyxFQUFFO0FBQUEsUUFDdEMsT0FBTyxFQUFFLFNBQVMsRUFBRTtBQUFBLFFBQ3BCLE9BQU8sRUFBRSxTQUFTLEVBQUU7QUFBQSxRQUNwQixPQUFPLEVBQUUsaUJBQWlCLE1BQU0sS0FBSyxFQUFFLHNCQUFzQixPQUFPLElBQUk7QUFBQSxRQUN4RSxFQUFFLGFBQWE7QUFBQSxRQUNmLEVBQUUsY0FBYztBQUFBLFFBQ2hCLEVBQUUsY0FBYztBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUNBLFFBQUksRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFHLFVBQVM7QUFBQSxFQUM3QztBQUdBLGFBQVcsS0FBSyxRQUFRLGFBQWEsQ0FBQyxHQUFHO0FBQ3ZDLFVBQU0sSUFBSSxNQUFNLEtBQUs7QUFBQSxNQUNuQjtBQUFBO0FBQUEsTUFFQSxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsR0FBRyxPQUFPLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxjQUFjLElBQUk7QUFBQSxJQUMxRTtBQUNBLFFBQUksRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFHLFVBQVM7QUFBQSxFQUM3QztBQUdBLGFBQVcsS0FBSyxRQUFRLG1CQUFtQixDQUFDLEdBQUc7QUFDN0MsVUFBTSxJQUFJLE1BQU0sS0FBSztBQUFBLE1BQ25CO0FBQUE7QUFBQSxNQUVBO0FBQUEsUUFDRSxPQUFPLEVBQUUsWUFBWSxFQUFFO0FBQUEsUUFDdkIsT0FBTyxFQUFFLFlBQVksQ0FBQztBQUFBLFFBQ3RCLE9BQU8sRUFBRSxVQUFVLENBQUM7QUFBQSxRQUNwQixPQUFPLEVBQUUsZUFBZSxDQUFDO0FBQUEsUUFDekIsS0FBSyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFBQSxRQUM3QixLQUFLLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUFBLFFBQy9CLEVBQUUsY0FBYztBQUFBLE1BQ2xCO0FBQUEsSUFDRjtBQUNBLFFBQUksRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFHLFVBQVM7QUFBQSxFQUM3QztBQUdBLFFBQU0sZUFBZSxHQUFHLFFBQVEsYUFBYSxLQUFLLElBQUksQ0FBQztBQUN2RCxNQUFJO0FBQ0YsT0FBRyxXQUFXLFVBQVUsWUFBWTtBQUFBLEVBQ3RDLFFBQVE7QUFFTixPQUFHLGNBQWMsVUFBVSx3QkFBd0IsT0FBTyxDQUFDO0FBQUEsQ0FBSTtBQUFBLEVBQ2pFO0FBRUEsU0FBTyxFQUFFLFVBQVUsTUFBTSxTQUFTO0FBQ3BDOzs7QURoVEEsSUFBTSxhQUFhO0FBQ25CLElBQU0sYUFBYTtBQUVuQixJQUFNLHVCQUF1QjtBQUFBLEVBQzNCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRjtBQUVBLElBQU0sY0FBY0MsTUFBSyxRQUFRLFFBQVEsSUFBSSxHQUFHLFVBQVUsU0FBUztBQUVuRSxTQUFTLFVBQVUsR0FBVztBQUM1QixNQUFJLENBQUNDLElBQUcsV0FBVyxDQUFDLEVBQUcsQ0FBQUEsSUFBRyxVQUFVLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUM1RDtBQUVBLFVBQVUsV0FBVztBQUNyQixVQUFVRCxNQUFLLEtBQUssYUFBYSxVQUFVLENBQUM7QUFDNUMsVUFBVUEsTUFBSyxLQUFLLGFBQWEsV0FBVyxDQUFDO0FBQzdDLFVBQVVBLE1BQUssS0FBSyxhQUFhLFdBQVcsQ0FBQztBQUU3QyxJQUFNLFVBQVUsT0FBTyxZQUFZO0FBQUEsRUFDakMsYUFBYSxDQUFDLE1BQU0sTUFBTSxPQUFPO0FBQy9CLFFBQUksTUFBTTtBQUNWLFFBQUksS0FBSyxjQUFjLE9BQVEsT0FBTTtBQUFBLGFBQzVCLEtBQUssY0FBYyxrQkFBbUIsT0FBTTtBQUFBLGFBQzVDLEtBQUssY0FBYyxRQUFTLE9BQU07QUFDM0MsT0FBRyxNQUFNQSxNQUFLLEtBQUssYUFBYSxHQUFHLENBQUM7QUFBQSxFQUN0QztBQUFBLEVBQ0EsVUFBVSxDQUFDLE1BQU0sTUFBTSxPQUFPO0FBQzVCLFVBQU0sV0FBVyxLQUFLLGFBQ25CLFFBQVEsWUFBWSxFQUFFLEVBQ3RCLFFBQVEsb0JBQW9CLEdBQUcsRUFDL0IsTUFBTSxHQUFHLEVBQUUsS0FBSztBQUNuQixVQUFNLE9BQU9BLE1BQUssUUFBUSxLQUFLLFlBQVksS0FBSyxRQUFRLFlBQVk7QUFDcEUsVUFBTSxLQUFLLE9BQU8sWUFBWSxDQUFDLEVBQUUsU0FBUyxLQUFLO0FBQy9DLE9BQUcsTUFBTSxHQUFHLFFBQVEsSUFBSSxFQUFFLEdBQUcsR0FBRyxFQUFFO0FBQUEsRUFDcEM7QUFDRixDQUFDO0FBRUQsSUFBTSxnQkFBZ0IsT0FBTyxFQUFFLFNBQVMsUUFBUSxFQUFFLFVBQVUsS0FBSyxPQUFPLEtBQUssRUFBRSxDQUFDO0FBQ2hGLElBQU0sY0FBYyxPQUFPLEVBQUUsU0FBUyxPQUFPLGNBQWMsR0FBRyxRQUFRLEVBQUUsVUFBVSxLQUFLLE9BQU8sS0FBSyxFQUFFLENBQUM7QUFJdEcsSUFBTSxXQUFXLG9CQUFJLElBQXFCO0FBQzFDLFNBQVMsVUFBVSxLQUE2QjtBQUM5QyxRQUFNLElBQUksSUFBSSxPQUFPLGVBQWUsS0FBSyxJQUFJLE9BQU8sZUFBZSxLQUFLO0FBQ3hFLFFBQU0sSUFBSSxrQkFBa0IsS0FBSyxDQUFDO0FBQ2xDLE1BQUksRUFBRyxRQUFPLEVBQUUsQ0FBQyxFQUFFLEtBQUs7QUFDeEIsUUFBTSxJQUFLLElBQUksT0FBTyxlQUFlLEtBQUssSUFBSSxNQUFNO0FBQ3BELFNBQU8sSUFBSSxPQUFPLENBQUMsSUFBSTtBQUN6QjtBQUdBLElBQU0sS0FBSyxDQUFJLE1BQVUsYUFBc0IsRUFBRSxTQUFTLE1BQU0sR0FBSSxTQUFTLFNBQVksRUFBRSxLQUFLLElBQUksQ0FBQyxHQUFJLEdBQUksVUFBVSxFQUFFLFFBQVEsSUFBSSxDQUFDLEVBQUc7QUFFekksU0FBUyxlQUFlLEtBQWMsU0FBNEM7QUFDaEYsTUFBSSxDQUFDLFFBQVMsUUFBTztBQUNyQixNQUFJLG1CQUFtQixLQUFLLE9BQU8sRUFBRyxRQUFPO0FBQzdDLE1BQUksUUFBUSxXQUFXLE9BQU8sRUFBRyxRQUFPO0FBQ3hDLFFBQU0sU0FBUyxHQUFHLElBQUksUUFBUSxNQUFNLElBQUksSUFBSSxNQUFNLENBQUM7QUFDbkQsU0FBTyxHQUFHLE1BQU0sWUFBWSxRQUFRLFFBQVEsUUFBUSxFQUFFLEVBQUUsUUFBUSxjQUFjLEVBQUUsQ0FBQztBQUNuRjtBQUVBLFNBQVMscUJBQXFCLE1BQWMsTUFBZ0Q7QUFDMUYsTUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFNLFFBQU8sRUFBRSxLQUFLLElBQUksUUFBUSxNQUFNO0FBQ3BELFFBQU0sT0FBTSxvQkFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxHQUFFLFlBQVk7QUFDdkQsUUFBTSxTQUFTLElBQUksS0FBSyxHQUFHLEVBQUUsUUFBUSxLQUFLLEtBQUssSUFBSTtBQUNuRCxTQUFPLEVBQUUsS0FBSyxPQUFPO0FBQ3ZCO0FBR0EsU0FBUyxHQUFHLElBQW1EO0FBQzdELFNBQU8sQ0FBQyxLQUFjLFFBQWtCO0FBQ3RDLE9BQUcsS0FBSyxHQUFHLEVBQUUsTUFBTSxDQUFDLFFBQVE7QUFDMUIsY0FBUSxNQUFNLGVBQWUsSUFBSSxRQUFRLElBQUksTUFBTSxHQUFHO0FBQ3RELFVBQUksQ0FBQyxJQUFJLGFBQWE7QUFDcEIsWUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFNBQVMsb0JBQW9CLEtBQUssV0FBVyxXQUFXLENBQUM7QUFBQSxNQUNsRztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUdPLFNBQVMsaUJBQXlCO0FBQ3ZDLFFBQU0sSUFBSSxRQUFRLE9BQU87QUFDekIsSUFBRSxJQUFJLFFBQVEsS0FBSyxFQUFFLE9BQU8sT0FBTyxDQUFDLENBQUM7QUFDckMsSUFBRSxJQUFJLFFBQVEsV0FBVyxFQUFFLFVBQVUsTUFBTSxPQUFPLE9BQU8sQ0FBQyxDQUFDO0FBRzNELEdBQUMsWUFBWTtBQUNYLFFBQUk7QUFDRixZQUFNLFFBQVE7QUFDZCxZQUFNLE1BQU0sTUFBTSwwQkFBMEI7QUFDNUMsVUFBSSxJQUFJLFVBQVU7QUFDaEIsZ0JBQVEsSUFBSSwwREFBMEQsSUFBSSxRQUFRO0FBQUEsTUFDcEY7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUNWLGNBQVEsTUFBTSwyQkFBMkIsQ0FBQztBQUFBLElBQzVDO0FBQUEsRUFDRixHQUFHO0FBR0gsSUFBRSxJQUFJLGdCQUFnQixHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQzNDLFVBQU0sSUFBSSxNQUFNLGVBQWU7QUFDL0IsVUFBTSxFQUFFLEtBQUssT0FBTyxJQUFJLHFCQUFxQixFQUFFLHFCQUFxQixJQUFJLEVBQUUscUJBQXFCLEVBQUU7QUFDakcsUUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNWLFVBQVUsRUFBRSxZQUFZO0FBQUEsTUFDeEIsYUFBYSxFQUFFLGVBQWU7QUFBQSxNQUM5QixhQUFhLEVBQUUsZUFBZTtBQUFBLE1BQzlCLGdCQUFnQixFQUFFLGtCQUFrQjtBQUFBLE1BQ3BDLGFBQWEsZUFBZSxLQUFLLEVBQUUsV0FBVztBQUFBLE1BQzlDLGdCQUFnQixFQUFFLGtCQUFrQjtBQUFBLE1BQ3BDLGlCQUFpQixlQUFlLEtBQUssRUFBRSxlQUFlO0FBQUEsTUFDdEQsb0JBQW9CLEVBQUUsc0JBQXNCO0FBQUEsTUFDNUMsdUJBQXVCO0FBQUEsTUFDdkIscUJBQXFCO0FBQUEsTUFDckIsa0JBQWtCLEVBQUUscUJBQXFCO0FBQUEsTUFDekMsZ0JBQWdCLEVBQUUsbUJBQW1CO0FBQUEsSUFDdkMsQ0FBQyxDQUFDO0FBQUEsRUFDSixDQUFDLENBQUM7QUFFRixJQUFFLElBQUksY0FBYyxHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQ3pDLFVBQU0sT0FBTyxNQUFNLEdBQUcsT0FBTyxFQUFFLEtBQUssZUFBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLGVBQU8sVUFBVSxFQUFFLENBQUM7QUFDdkYsVUFBTSxRQUFRLEtBQUssSUFBSSxDQUFDLE9BQU87QUFBQSxNQUM3QixJQUFJLEVBQUU7QUFBQSxNQUNOLFlBQVksZUFBZSxLQUFLLEVBQUUsVUFBVTtBQUFBLE1BQzVDLE9BQU8sRUFBRSxTQUFTO0FBQUEsTUFDbEIsWUFBWSxFQUFFLFlBQVksWUFBWSxLQUFLLE9BQU87QUFBQSxJQUNwRCxFQUFFO0FBQ0YsUUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBQUEsRUFDcEIsQ0FBQyxDQUFDO0FBRUYsSUFBRSxLQUFLLGlCQUFpQixHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQzdDLFVBQU0sSUFBSSxNQUFNLGVBQWU7QUFDL0IsVUFBTSxFQUFFLE9BQU8sSUFBSSxxQkFBcUIsRUFBRSxxQkFBcUIsSUFBSSxFQUFFLHFCQUFxQixFQUFFO0FBQzVGLFFBQUksRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsQ0FBQyxRQUFRO0FBQ3pELGFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLO0FBQUEsUUFDMUIsU0FBUztBQUFBLFFBQ1QsU0FBUyxvREFBb0QsRUFBRSxpQkFBaUI7QUFBQSxNQUNsRixDQUFDO0FBQUEsSUFDSDtBQUNBLFVBQU0sRUFBRSxNQUFNLFdBQVcsSUFBSSxJQUFJLFFBQVEsQ0FBQztBQUMxQyxRQUFJLENBQUMsUUFBUSxDQUFDLFlBQVk7QUFDeEIsYUFBTyxJQUFJLE9BQU8sR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLE9BQU8sU0FBUyxzQ0FBc0MsQ0FBQztBQUFBLElBQ2hHO0FBQ0EsVUFBTSxLQUFLLE9BQU8sVUFBVSxFQUFFLE1BQU0sR0FBRyxFQUFFO0FBQ3pDLFVBQU0sU0FBUyxNQUFNLEdBQUcsT0FBTyxFQUFFLEtBQUssZUFBTyxRQUFRLEVBQ2xELE1BQU0sSUFBSUUsSUFBRyxlQUFPLFNBQVMsTUFBTSxPQUFPLElBQUksQ0FBQyxHQUFHQSxJQUFHLGVBQU8sU0FBUyxZQUFZLEVBQUUsQ0FBQyxDQUFDLEVBQ3JGLE1BQU0sQ0FBQyxHQUFHLENBQUM7QUFDZCxRQUFJLENBQUMsT0FBTztBQUNWLGFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFNBQVMsZ0RBQWdELENBQUM7QUFBQSxJQUMxRztBQUNBLFVBQU0sR0FBRyxPQUFPLGVBQU8sUUFBUSxFQUM1QixJQUFJLEVBQUUsV0FBVyxvQkFBSSxLQUFLLEVBQUUsQ0FBQyxFQUM3QixNQUFNQSxJQUFHLGVBQU8sU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO0FBQ3pDLFVBQU0sU0FBUyxNQUFNLEdBQUcsT0FBTyxFQUFFLEtBQUssZUFBTyxRQUFRLEVBQUUsTUFBTUEsSUFBRyxlQUFPLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUM7QUFDMUcsUUFBSSxLQUFLLEdBQUcsZ0JBQWdCLGFBQWEsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ25ELENBQUMsQ0FBQztBQUdGLElBQUUsS0FBSyxzQkFBc0IsQ0FBQyxLQUFLLFFBQVE7QUFDekMsVUFBTSxFQUFFLFVBQVUsU0FBUyxJQUFJLElBQUksUUFBUSxDQUFDO0FBQzVDLFFBQUksQ0FBQyxZQUFZLENBQUMsVUFBVTtBQUMxQixhQUFPLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxFQUFFLFNBQVMsT0FBTyxTQUFTLHFDQUFxQyxDQUFDO0FBQUEsSUFDL0Y7QUFDQSxVQUFNLE9BQU8sT0FBTyxRQUFRLEVBQUUsS0FBSztBQUNuQyxVQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzVCLFFBQUksUUFBUSxTQUFTLGNBQWMsS0FBSyxXQUFXLFdBQVc7QUFDOUQsUUFBSSxPQUFPO0FBQ1QsVUFBSTtBQUNGLGdCQUFRLE9BQU8sZ0JBQWdCLE9BQU8sS0FBSyxJQUFJLEdBQUcsT0FBTyxLQUFLLFVBQVUsQ0FBQztBQUFBLE1BQzNFLFFBQVE7QUFDTixnQkFBUSxTQUFTO0FBQUEsTUFDbkI7QUFBQSxJQUNGO0FBQ0EsUUFBSSxDQUFDLE9BQU87QUFDVixhQUFPLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxFQUFFLFNBQVMsT0FBTyxTQUFTLGdDQUFnQyxDQUFDO0FBQUEsSUFDMUY7QUFDQSxVQUFNLFFBQVEsT0FBTyxZQUFZLEVBQUUsRUFBRSxTQUFTLEtBQUs7QUFDbkQsYUFBUyxJQUFJLE9BQU87QUFBQSxNQUNsQixVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxXQUFXLE9BQU87QUFBQSxJQUNwQixDQUFDO0FBQ0QsUUFBSSxLQUFLLEdBQUcsRUFBRSxVQUFVLFlBQVksTUFBTSxrQkFBa0IsT0FBTyxVQUFVLHlCQUF5QixDQUFDLENBQUM7QUFBQSxFQUMxRyxDQUFDO0FBRUQsSUFBRSxLQUFLLHVCQUF1QixDQUFDLEtBQUssUUFBUTtBQUMxQyxVQUFNLElBQUksVUFBVSxHQUFHO0FBQ3ZCLFFBQUksRUFBRyxVQUFTLE9BQU8sQ0FBQztBQUN4QixRQUFJLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDZixDQUFDO0FBRUQsSUFBRSxJQUFJLG1CQUFtQixDQUFDLEtBQUssUUFBUTtBQUNyQyxVQUFNLElBQUksVUFBVSxHQUFHO0FBQ3ZCLFVBQU0sT0FBTyxJQUFJLFNBQVMsSUFBSSxDQUFDLElBQUk7QUFDbkMsUUFBSSxDQUFDLEtBQU0sUUFBTyxJQUFJLE9BQU8sR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLE9BQU8sU0FBUyxlQUFlLENBQUM7QUFDbEYsUUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNWLFVBQVUsS0FBSztBQUFBLE1BQ2YsTUFBTSxLQUFLO0FBQUEsTUFDWCxXQUFXLEtBQUs7QUFBQSxNQUNoQixXQUFXLEtBQUs7QUFBQSxJQUNsQixDQUFDLENBQUM7QUFBQSxFQUNKLENBQUM7QUFHRCxJQUFFLElBQUksZ0JBQWdCLEdBQUcsT0FBTyxNQUFNLFFBQVE7QUFDNUMsVUFBTSxXQUFXLE1BQU0sS0FBSyxNQUFxQix1Q0FBdUM7QUFDeEYsVUFBTSxXQUFXLE1BQU0sS0FBSyxNQUFxQixtRUFBbUU7QUFDcEgsVUFBTSxhQUFhLE1BQU0sS0FBSyxNQUFxQixtRUFBbUU7QUFDdEgsVUFBTSxRQUFRLE9BQU8sU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ3ZDLFVBQU0sUUFBUSxPQUFPLFNBQVMsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUN2QyxRQUFJLEtBQUssR0FBRyxFQUFFLE9BQU8sT0FBTyxZQUFZLFFBQVEsT0FBTyxTQUFTLE9BQU8sV0FBVyxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDakcsQ0FBQyxDQUFDO0FBRUYsSUFBRSxJQUFJLG1CQUFtQixHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQzlDLFVBQU0sU0FBUyxPQUFPLElBQUksTUFBTSxVQUFVLEVBQUUsRUFBRSxLQUFLO0FBQ25ELFVBQU0sVUFBVTtBQUNoQixVQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsU0FBUyxPQUFPLElBQUksTUFBTSxRQUFRLEdBQUcsR0FBRyxFQUFFLEtBQUssQ0FBQztBQUV6RSxRQUFJLFFBQVE7QUFDWixRQUFJLFFBQVE7QUFDVixZQUFNLElBQUksSUFBSSxNQUFNO0FBQ3BCLGNBQVE7QUFBQSxRQUNOLE1BQU0sZUFBTyxTQUFTLE1BQU0sQ0FBQztBQUFBLFFBQzdCLE1BQU0sZUFBTyxTQUFTLE1BQU0sQ0FBQztBQUFBLFFBQzdCLE1BQU0sZUFBTyxTQUFTLE9BQU8sQ0FBQztBQUFBLFFBQzlCLE1BQU0sZUFBTyxTQUFTLE9BQU8sQ0FBQztBQUFBLE1BQ2hDO0FBQUEsSUFDRjtBQUVBLFVBQU0sV0FBVyxRQUNiLE1BQU0sS0FBSztBQUFBLE1BQ1Q7QUFBQSxNQUNBLENBQUMsSUFBSSxNQUFNLEdBQUc7QUFBQSxJQUNoQixJQUNBLE1BQU0sS0FBSyxNQUFxQix1Q0FBdUM7QUFDM0UsVUFBTSxRQUFRLE9BQU8sU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ3ZDLFVBQU0sWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUssUUFBUSxPQUFPLENBQUM7QUFDeEQsVUFBTSxNQUFNLEtBQUssSUFBSSxNQUFNLFNBQVM7QUFFcEMsVUFBTSxRQUFRLEdBQUcsT0FBTyxFQUFFLEtBQUssZUFBTyxRQUFRLEVBQzNDLFFBQVEsSUFBSSxlQUFPLFNBQVMsS0FBSyxHQUFHLElBQUksZUFBTyxTQUFTLElBQUksQ0FBQyxFQUM3RCxNQUFNLE9BQU8sRUFBRSxRQUFRLE1BQU0sS0FBSyxPQUFPO0FBQzVDLFVBQU0sT0FBTyxRQUFRLE1BQU0sTUFBTSxNQUFNLEtBQUssSUFBSSxNQUFNO0FBRXRELFFBQUksS0FBSyxHQUFHO0FBQUEsTUFDVixNQUFNLEtBQUssSUFBSSxDQUFDQyxPQUFNLGdCQUFnQixhQUFhQSxFQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3RELGNBQWM7QUFBQSxNQUNkO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFDVjtBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSixDQUFDLENBQUM7QUFFRixJQUFFLEtBQUssNkJBQTZCLEdBQUcsT0FBTyxLQUFLLFFBQVE7QUFDekQsVUFBTSxLQUFLLE9BQU8sSUFBSSxPQUFPLEVBQUU7QUFDL0IsVUFBTSxVQUFVLENBQUMsUUFBUSxlQUFlLGNBQWMsU0FBUyxTQUFTLG1CQUFtQjtBQUMzRixVQUFNLFFBQTZCLENBQUM7QUFDcEMsZUFBVyxLQUFLLFNBQVM7QUFDdkIsVUFBSSxLQUFLLElBQUksS0FBTSxPQUFNLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQztBQUFBLElBQzFDO0FBQ0EsUUFBSSx1QkFBdUIsT0FBTztBQUNoQyxZQUFNLG9CQUFxQixNQUFNLHNCQUFzQixRQUFRLE1BQU0sc0JBQXNCLEtBQUssTUFBTSxzQkFBc0IsTUFBTyxJQUFJO0FBQUEsSUFDekk7QUFDQSxRQUFJLGdCQUFnQixPQUFPO0FBQ3pCLFlBQU0sYUFBYSxPQUFPLE1BQU0sY0FBYyxFQUFFLEVBQUUsTUFBTSxHQUFHLEVBQUU7QUFBQSxJQUMvRDtBQUNBLFFBQUksT0FBTyxLQUFLLEtBQUssRUFBRSxXQUFXLEdBQUc7QUFDbkMsYUFBTyxJQUFJLE9BQU8sR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLE9BQU8sU0FBUywrQkFBK0IsQ0FBQztBQUFBLElBQ3pGO0FBQ0EsVUFBTSxhQUFhLG9CQUFJLEtBQUs7QUFDNUIsVUFBTSxVQUFVLE1BQU0sR0FBRyxPQUFPLGVBQU8sUUFBUSxFQUFFLElBQUksS0FBSyxFQUFFLE1BQU1ELElBQUcsZUFBTyxTQUFTLElBQUksRUFBRSxDQUFDLEVBQUUsVUFBVTtBQUN4RyxRQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3hCLGFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFNBQVMseUJBQXlCLENBQUM7QUFBQSxJQUNuRjtBQUNBLFFBQUksS0FBSyxFQUFFLFNBQVMsTUFBTSxTQUFTLGtDQUFrQyxTQUFTLGdCQUFnQixhQUFhLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQUEsRUFDM0gsQ0FBQyxDQUFDO0FBR0YsSUFBRSxJQUFJLG1CQUFtQixHQUFHLE9BQU8sTUFBTSxRQUFRO0FBQy9DLFVBQU0sSUFBSSxNQUFNLGVBQWU7QUFDL0IsUUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNWLG1CQUFtQixFQUFFLHFCQUFxQjtBQUFBLE1BQzFDLG1CQUFtQixFQUFFLHFCQUFxQjtBQUFBLE1BQzFDLGtCQUFrQixFQUFFLHFCQUFxQjtBQUFBLE1BQ3pDLGdCQUFnQixFQUFFLG1CQUFtQjtBQUFBLE1BQ3JDLFVBQVUsRUFBRSxZQUFZO0FBQUEsTUFDeEIsYUFBYSxFQUFFLGVBQWU7QUFBQSxNQUM5QixhQUFhLEVBQUUsZUFBZTtBQUFBLE1BQzlCLGdCQUFnQixFQUFFLGtCQUFrQjtBQUFBLE1BQ3BDLGdCQUFnQixFQUFFLGtCQUFrQjtBQUFBLE1BQ3BDLGFBQWEsRUFBRSxlQUFlO0FBQUEsTUFDOUIsaUJBQWlCLEVBQUUsbUJBQW1CO0FBQUEsTUFDdEMsb0JBQW9CLEVBQUUsc0JBQXNCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBQUEsRUFDSixDQUFDLENBQUM7QUFFRixJQUFFO0FBQUEsSUFBSztBQUFBLElBQ0wsY0FBYyxPQUFPLENBQUMsRUFBRSxNQUFNLFFBQVEsVUFBVSxFQUFFLEdBQUcsRUFBRSxNQUFNLG1CQUFtQixVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQUEsSUFDOUYsR0FBRyxPQUFPLEtBQUssUUFBUTtBQUNyQixZQUFNLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFDMUIsVUFBSSxLQUFLLHdCQUF3QixDQUFDLEtBQUssb0JBQW9CO0FBQ3pELGFBQUsscUJBQXFCLEtBQUs7QUFBQSxNQUNqQztBQUNBLFVBQUksc0JBQXNCLE1BQU07QUFDOUIsY0FBTSxJQUFJLEtBQUs7QUFDZixhQUFLLG1CQUFvQixNQUFNLFFBQVEsTUFBTSxLQUFLLE1BQU0sT0FBTyxNQUFNLFNBQVUsTUFBTTtBQUFBLE1BQ3ZGO0FBQ0EsVUFBSSxvQkFBb0IsTUFBTTtBQUM1QixjQUFNLElBQUksS0FBSztBQUNmLGFBQUssaUJBQWtCLE1BQU0sUUFBUSxNQUFNLEtBQUssTUFBTSxPQUFPLE1BQU0sU0FBVSxNQUFNO0FBQUEsTUFDckY7QUFDQSxZQUFNLFFBQWdDLENBQUM7QUFDdkMsaUJBQVcsS0FBSyxzQkFBc0I7QUFDcEMsWUFBSSxNQUFNLGlCQUFpQixNQUFNLGtCQUFtQjtBQUNwRCxZQUFJLEtBQUssS0FBTSxPQUFNLENBQUMsSUFBSSxPQUFPLEtBQUssQ0FBQyxLQUFLLEVBQUU7QUFBQSxNQUNoRDtBQUVBLFlBQU0sUUFBUyxJQUFJLFNBQW1ELENBQUM7QUFDdkUsWUFBTSxPQUFPLE1BQU0sT0FBTyxDQUFDO0FBQzNCLFVBQUksTUFBTTtBQUNSLGNBQU0sTUFBTUYsTUFBSyxTQUFTLGFBQWEsS0FBSyxJQUFJLEVBQUUsUUFBUSxPQUFPLEdBQUc7QUFDcEUsY0FBTSxNQUFNLE1BQU0sV0FBVyxhQUFhO0FBQzFDLFlBQUksT0FBTyxDQUFDLGtCQUFrQixLQUFLLEdBQUcsR0FBRztBQUN2QyxnQkFBTSxVQUFVQSxNQUFLLEtBQUssYUFBYSxJQUFJLFFBQVEsY0FBYyxFQUFFLENBQUM7QUFDcEUsY0FBSUMsSUFBRyxXQUFXLE9BQU8sR0FBRztBQUFFLGdCQUFJO0FBQUUsY0FBQUEsSUFBRyxXQUFXLE9BQU87QUFBQSxZQUFHLFFBQVE7QUFBQSxZQUFDO0FBQUEsVUFBRTtBQUFBLFFBQ3pFO0FBQ0EsY0FBTSxjQUFjO0FBQUEsTUFDdEI7QUFDQSxZQUFNLFFBQVEsTUFBTSxrQkFBa0IsQ0FBQztBQUN2QyxVQUFJLE9BQU87QUFDVCxjQUFNLE1BQU1ELE1BQUssU0FBUyxhQUFhLE1BQU0sSUFBSSxFQUFFLFFBQVEsT0FBTyxHQUFHO0FBQ3JFLGNBQU0sTUFBTSxNQUFNLFdBQVcsaUJBQWlCO0FBQzlDLFlBQUksT0FBTyxDQUFDLGtCQUFrQixLQUFLLEdBQUcsR0FBRztBQUN2QyxnQkFBTSxVQUFVQSxNQUFLLEtBQUssYUFBYSxJQUFJLFFBQVEsY0FBYyxFQUFFLENBQUM7QUFDcEUsY0FBSUMsSUFBRyxXQUFXLE9BQU8sR0FBRztBQUFFLGdCQUFJO0FBQUUsY0FBQUEsSUFBRyxXQUFXLE9BQU87QUFBQSxZQUFHLFFBQVE7QUFBQSxZQUFDO0FBQUEsVUFBRTtBQUFBLFFBQ3pFO0FBQ0EsY0FBTSxrQkFBa0I7QUFBQSxNQUMxQjtBQUVBLFlBQU0sWUFBWSxLQUFLO0FBQ3ZCLFVBQUksS0FBSyxHQUFHLFFBQVcsZ0NBQWdDLENBQUM7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDSDtBQUdBLElBQUUsS0FBSyxpQkFBaUIsWUFBWSxPQUFPLE1BQU0sR0FBRyxHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQ3pFLFFBQUksQ0FBQyxJQUFJLEtBQU0sUUFBTyxJQUFJLE9BQU8sR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLE9BQU8sU0FBUyw4QkFBOEIsQ0FBQztBQUNyRyxVQUFNLEtBQVUsVUFBSyxJQUFJLEtBQUssUUFBUSxFQUFFLE1BQU0sVUFBVSxXQUFXLEtBQUssQ0FBQztBQUN6RSxVQUFNLFlBQVksR0FBRyxXQUFXLEtBQUssQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLFNBQVMsT0FBTyxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUM7QUFDakcsUUFBSSxDQUFDLFdBQVc7QUFDZCxhQUFPLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxFQUFFLFNBQVMsT0FBTyxTQUFTLDBDQUEwQyxDQUFDO0FBQUEsSUFDcEc7QUFDQSxVQUFNLE9BQVksV0FBTSxjQUFtQyxHQUFHLE9BQU8sU0FBUyxHQUFHLEVBQUUsUUFBUSxJQUFJLEtBQUssTUFBTSxDQUFDO0FBRTNHLFFBQUksV0FBVztBQUNmLFFBQUksU0FBUztBQUNiLFVBQU0sU0FBbUIsQ0FBQztBQUUxQixVQUFNLE9BQU8sQ0FBQyxNQUFjLEVBQUUsWUFBWSxFQUFFLFFBQVEsWUFBWSxFQUFFO0FBQ2xFLFVBQU0sT0FBTyxDQUFDLEtBQTBCLFVBQXlCO0FBQy9ELGlCQUFXLEtBQUssT0FBTyxLQUFLLEdBQUcsR0FBRztBQUNoQyxZQUFJLE1BQU0sU0FBUyxLQUFLLENBQUMsQ0FBQyxFQUFHLFFBQU8sSUFBSSxDQUFDO0FBQUEsTUFDM0M7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUNBLFVBQU0sWUFBWSxDQUFDLE1BQTBCO0FBQzNDLFVBQUksQ0FBQyxFQUFHLFFBQU87QUFDZixVQUFJLGFBQWEsS0FBTSxRQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sR0FBRyxFQUFFO0FBQ3pELFlBQU0sTUFBTSxPQUFPLENBQUMsRUFBRSxLQUFLO0FBQzNCLFlBQU0sTUFBTSwyQkFBMkIsS0FBSyxHQUFHO0FBQy9DLFVBQUksSUFBSyxRQUFPLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO0FBQzdDLFlBQU0sTUFBTSw0Q0FBNEMsS0FBSyxHQUFHO0FBQ2hFLFVBQUksS0FBSztBQUNQLGNBQU0sQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQUk7QUFDcEIsY0FBTSxLQUFLLEVBQUUsV0FBVyxJQUFJLEtBQUssQ0FBQyxLQUFLO0FBQ3ZDLGVBQU8sR0FBRyxHQUFHLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUMzRTtBQUNBLFlBQU0sU0FBUyxJQUFJLEtBQUssR0FBRztBQUMzQixVQUFJLENBQUMsT0FBTyxNQUFNLE9BQU8sUUFBUSxDQUFDLEVBQUcsUUFBTyxPQUFPLFlBQVksRUFBRSxNQUFNLEdBQUcsRUFBRTtBQUM1RSxhQUFPO0FBQUEsSUFDVDtBQUNBLFVBQU0sY0FBYyxDQUFDLE1BQWtCO0FBQ3JDLFlBQU0sSUFBSSxPQUFPLEtBQUssRUFBRSxFQUFFLEtBQUssRUFBRSxZQUFZO0FBQzdDLFVBQUksQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUFLLE1BQU0sR0FBRyxFQUFFLFNBQVMsQ0FBQyxFQUFHLFFBQU87QUFDL0QsVUFBSSxDQUFDLEtBQUssU0FBUyxlQUFlLFNBQVMsTUFBTSxLQUFLLElBQUksRUFBRSxTQUFTLENBQUMsRUFBRyxRQUFPO0FBQ2hGLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxZQUFZLE1BQU0sS0FBSyxNQUFxQix1Q0FBdUM7QUFDekYsVUFBTSxjQUFjLE9BQU8sVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBRTlDLFVBQU0sU0FBUyxNQUFNLEtBQUssUUFBUTtBQUNsQyxRQUFJO0FBQ0YsWUFBTSxPQUFPLE1BQU0sT0FBTztBQUMxQixlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssUUFBUSxLQUFLO0FBQ3BDLGNBQU0sTUFBTSxLQUFLLENBQUM7QUFDbEIsWUFBSTtBQUNGLGdCQUFNLE9BQU8sT0FBTyxLQUFLLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSztBQUNwRCxnQkFBTSxPQUFPLE9BQU8sS0FBSyxLQUFLLENBQUMsUUFBUSxRQUFRLGFBQWEsYUFBYSxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUs7QUFDeEYsZ0JBQU0sYUFBYSxPQUFPLEtBQUssS0FBSyxDQUFDLGNBQWMsZUFBZSxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSztBQUN6RixnQkFBTSxZQUFZLFVBQVUsS0FBSyxLQUFLLENBQUMsYUFBYSxnQkFBZ0IsVUFBVSxDQUFDLENBQUM7QUFDaEYsZ0JBQU0sUUFBUSxPQUFPLEtBQUssS0FBSyxDQUFDLFNBQVMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUs7QUFDL0QsZ0JBQU0sUUFBUSxPQUFPLEtBQUssS0FBSyxDQUFDLFNBQVMsV0FBVyxZQUFZLENBQUMsS0FBSyxFQUFFLEVBQUUsS0FBSztBQUMvRSxnQkFBTSxTQUFTLFlBQVksS0FBSyxLQUFLLENBQUMsb0JBQW9CLFVBQVUsYUFBYSxtQkFBbUIsT0FBTyxDQUFDLENBQUM7QUFFN0csY0FBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsV0FBVztBQUNoQztBQUNBLG1CQUFPLEtBQUssU0FBUyxJQUFJLENBQUMsbUNBQW1DO0FBQzdEO0FBQUEsVUFDRjtBQUNBLGdCQUFNLE9BQU87QUFBQSxZQUNYO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxZQVdBLENBQUMsTUFBTSxNQUFNLFlBQVksV0FBVyxPQUFPLE9BQU8sTUFBTTtBQUFBLFVBQzFEO0FBQ0E7QUFBQSxRQUNGLFNBQVMsS0FBVTtBQUNqQjtBQUNBLGlCQUFPLEtBQUssU0FBUyxJQUFJLENBQUMsS0FBSyxLQUFLLFdBQVcsT0FBTyxHQUFHO0FBQUEsUUFDM0Q7QUFBQSxNQUNGO0FBQ0EsWUFBTSxPQUFPLE1BQU0sUUFBUTtBQUFBLElBQzdCLFNBQVMsS0FBVTtBQUNqQixZQUFNLE9BQU8sTUFBTSxVQUFVO0FBQzdCLFlBQU07QUFBQSxJQUNSLFVBQUU7QUFDQSxhQUFPLFFBQVE7QUFBQSxJQUNqQjtBQUdBLFVBQU0sU0FBUyxNQUFNLEdBQUcsT0FBTyxFQUFFLEtBQUssZUFBTyxRQUFRO0FBQ3JELFVBQU0sV0FBVyxPQUFPLElBQUksWUFBWTtBQUN4QyxVQUFNLEtBQUs7QUFBQSxNQUNUO0FBQUE7QUFBQSxNQUVBO0FBQUEsUUFDRSxJQUFJLEtBQUs7QUFBQSxRQUNUO0FBQUEsUUFBVTtBQUFBLFFBQ1YsU0FBUztBQUFBLFFBQ1QsS0FBSyxVQUFVLE9BQU8sTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUFBLFFBQ2xDLEtBQUssVUFBVSxRQUFRO0FBQUEsTUFDekI7QUFBQSxJQUNGO0FBRUEsVUFBTSxLQUFLO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFFQSxRQUFJLEtBQUs7QUFBQSxNQUNQLFNBQVM7QUFBQSxNQUNULFNBQVMsbUJBQW1CLFFBQVEsb0JBQW9CLE1BQU07QUFBQSxNQUM5RCxNQUFNLEVBQUUsVUFBVSxRQUFRLFFBQVEsT0FBTyxNQUFNLEdBQUcsRUFBRSxFQUFFO0FBQUEsTUFDdEQsT0FBTztBQUFBLFFBQ0w7QUFBQSxRQUFVO0FBQUEsUUFDVixRQUFRLE9BQU8sTUFBTSxHQUFHLEVBQUU7QUFBQSxRQUMxQixPQUFPLFNBQVM7QUFBQSxRQUNoQixrQkFBa0IsT0FBTztBQUFBLFFBQ3pCLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0gsQ0FBQyxDQUFDO0FBRUYsSUFBRSxLQUFLLDhCQUE4QixHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQzFELFVBQU0sS0FBSyxJQUFJLE9BQU8sS0FBSyxPQUFPLElBQUksT0FBTyxFQUFFLElBQUk7QUFDbkQsUUFBSTtBQUNKLFFBQUksT0FBTyxNQUFNO0FBQ2YsZUFBUyxNQUFNLEtBQUssTUFBTSxvR0FBb0csQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNwSSxPQUFPO0FBQ0wsZUFBUyxNQUFNLEtBQUssTUFBTSxzRkFBc0Y7QUFBQSxJQUNsSDtBQUNBLFFBQUksS0FBSyxHQUFHLEVBQUUsT0FBTyxPQUFPLFlBQVksRUFBRSxHQUFHLHFCQUFxQixDQUFDO0FBQUEsRUFDckUsQ0FBQyxDQUFDO0FBRUYsSUFBRSxLQUFLLHlCQUF5QixHQUFHLE9BQU8sTUFBTSxRQUFRO0FBQ3RELFVBQU0sV0FBVyxNQUFNLEtBQUssTUFBcUIsdUNBQXVDLEdBQUcsS0FBSyxDQUFDLEVBQUU7QUFDbkcsVUFBTSxXQUFXLE1BQU0sS0FBSyxNQUFxQiw4Q0FBOEMsR0FBRyxLQUFLLENBQUMsRUFBRTtBQUMxRyxVQUFNLEtBQUssTUFBTSwwQ0FBMEM7QUFDM0QsVUFBTSxLQUFLLE1BQU0saURBQWlEO0FBQ2xFLFFBQUksS0FBSztBQUFBLE1BQ1AsU0FBUztBQUFBLE1BQ1QsU0FBUyxzQkFBc0IsT0FBTztBQUFBLE1BQ3RDLE1BQU0sRUFBRSxTQUFTLE9BQU8sT0FBTyxHQUFHLGtCQUFrQixPQUFPLE9BQU8sRUFBRTtBQUFBLElBQ3RFLENBQUM7QUFBQSxFQUNILENBQUMsQ0FBQztBQUVGLElBQUUsS0FBSywrQkFBK0IsR0FBRyxPQUFPLEtBQUssUUFBUTtBQUMzRCxVQUFNLE1BQWdCLE1BQU0sUUFBUSxJQUFJLE1BQU0sR0FBRyxJQUFJLElBQUksS0FBSyxJQUFJLElBQUksTUFBTSxFQUFFLE9BQU8sT0FBTyxRQUFRLElBQUksQ0FBQztBQUN6RyxRQUFJLElBQUksV0FBVyxFQUFHLFFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFNBQVMsbUNBQW1DLENBQUM7QUFDakgsVUFBTSxLQUFLLE1BQU0sR0FBRyxPQUFPLGVBQU8sUUFBUSxFQUFFLE1BQU0sUUFBUSxlQUFPLFNBQVMsSUFBSSxHQUFHLENBQUM7QUFDbEYsVUFBTSxVQUFXLEdBQVcsWUFBWSxJQUFJO0FBQzVDLFFBQUksS0FBSyxFQUFFLFNBQVMsTUFBTSxTQUFTLHNCQUFzQixPQUFPLFdBQVcsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQUEsRUFDaEcsQ0FBQyxDQUFDO0FBRUYsSUFBRSxLQUFLLCtCQUErQixHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQzNELFVBQU0sTUFBZ0IsTUFBTSxRQUFRLElBQUksTUFBTSxHQUFHLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxNQUFNLEVBQUUsT0FBTyxPQUFPLFFBQVEsSUFBSSxDQUFDO0FBQ3pHLFVBQU0sU0FBVSxJQUFJLE1BQU0sV0FBVyxLQUFLLElBQUksTUFBTSxXQUFXLE9BQU8sSUFBSSxNQUFNLFdBQVcsT0FBUSxJQUFJO0FBQ3ZHLFFBQUksSUFBSSxXQUFXLEVBQUcsUUFBTyxJQUFJLE9BQU8sR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLE9BQU8sU0FBUyxtQ0FBbUMsQ0FBQztBQUNqSCxVQUFNLEtBQUssTUFBTSxLQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUNBLENBQUMsUUFBUSxHQUFHO0FBQUEsSUFDZDtBQUNBLFVBQU0sVUFBVSxHQUFHLFlBQVk7QUFDL0IsUUFBSSxLQUFLLEVBQUUsU0FBUyxNQUFNLFNBQVMsMkJBQTJCLE9BQU8sV0FBVyxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFBQSxFQUNyRyxDQUFDLENBQUM7QUFHRixJQUFFLEtBQUssb0JBQW9CLGNBQWMsT0FBTyxPQUFPLEdBQUcsR0FBRyxPQUFPLEtBQUssUUFBUTtBQUMvRSxVQUFNLE9BQU8sTUFBTSxLQUFLLE1BQXFCLHdDQUF3QyxHQUFHLEtBQUssQ0FBQyxFQUFFO0FBQ2hHLFFBQUksT0FBTyxHQUFHLEtBQUssSUFBSTtBQUNyQixVQUFJLElBQUksTUFBTSxRQUFRQSxJQUFHLFdBQVcsSUFBSSxLQUFLLElBQUksR0FBRztBQUFFLFlBQUk7QUFBRSxVQUFBQSxJQUFHLFdBQVcsSUFBSSxLQUFLLElBQUk7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFDO0FBQUEsTUFBRTtBQUNyRyxhQUFPLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSztBQUFBLFFBQzFCLFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNIO0FBQ0EsUUFBSSxDQUFDLElBQUksS0FBTSxRQUFPLElBQUksT0FBTyxHQUFHLEVBQUUsS0FBSyxFQUFFLFNBQVMsT0FBTyxTQUFTLCtCQUErQixDQUFDO0FBQ3RHLFVBQU0sTUFBTUQsTUFBSyxTQUFTLGFBQWEsSUFBSSxLQUFLLElBQUksRUFBRSxRQUFRLE9BQU8sR0FBRztBQUN4RSxVQUFNLFFBQVEsT0FBTyxJQUFJLE1BQU0sU0FBUyxJQUFJLE1BQU0sV0FBVyxFQUFFLEVBQUUsTUFBTSxHQUFHLEdBQUc7QUFDN0UsVUFBTSxXQUFXLE1BQU0sR0FBRyxPQUFPLGVBQU8sU0FBUyxFQUM5QyxPQUFPLEVBQUUsWUFBWSxLQUFLLE1BQU0sQ0FBQyxFQUNqQyxVQUFVO0FBQ2IsVUFBTSxPQUFPLFNBQVMsQ0FBQztBQUN2QixRQUFJLEtBQUs7QUFBQSxNQUNQLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxRQUNKLElBQUksS0FBSztBQUFBLFFBQ1QsWUFBWSxlQUFlLEtBQUssS0FBSyxVQUFVO0FBQUEsUUFDL0MsT0FBTyxLQUFLO0FBQUEsUUFDWixZQUFZLEtBQUssWUFBWSxZQUFZLEtBQUssT0FBTztBQUFBLE1BQ3ZEO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDSCxDQUFDLENBQUM7QUFFRixJQUFFLE9BQU8sOEJBQThCLEdBQUcsT0FBTyxLQUFLLFFBQVE7QUFDNUQsVUFBTSxLQUFLLE9BQU8sSUFBSSxPQUFPLEVBQUU7QUFDL0IsVUFBTSxRQUFRLE1BQU0sR0FBRyxPQUFPLEVBQUUsS0FBSyxlQUFPLFNBQVMsRUFBRSxNQUFNRSxJQUFHLGVBQU8sVUFBVSxJQUFJLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQztBQUNqRyxRQUFJLE1BQU0sV0FBVyxFQUFHLFFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFNBQVMsd0JBQXdCLENBQUM7QUFDeEcsVUFBTSxJQUFJLE1BQU0sQ0FBQztBQUNqQixRQUFJLEVBQUUsY0FBYyxDQUFDLG1CQUFtQixLQUFLLEVBQUUsVUFBVSxHQUFHO0FBQzFELFlBQU0sS0FBS0YsTUFBSyxLQUFLLGFBQWEsRUFBRSxXQUFXLFFBQVEsY0FBYyxFQUFFLENBQUM7QUFDeEUsVUFBSUMsSUFBRyxXQUFXLEVBQUUsR0FBRztBQUFFLFlBQUk7QUFBRSxVQUFBQSxJQUFHLFdBQVcsRUFBRTtBQUFBLFFBQUcsUUFBUTtBQUFBLFFBQUM7QUFBQSxNQUFFO0FBQUEsSUFDL0Q7QUFDQSxVQUFNLEdBQUcsT0FBTyxlQUFPLFNBQVMsRUFBRSxNQUFNQyxJQUFHLGVBQU8sVUFBVSxJQUFJLEVBQUUsQ0FBQztBQUNuRSxRQUFJLEtBQUssRUFBRSxTQUFTLE1BQU0sU0FBUyx1QkFBdUIsQ0FBQztBQUFBLEVBQzdELENBQUMsQ0FBQztBQUVGLElBQUUsS0FBSywwQkFBMEIsR0FBRyxPQUFPLE1BQU0sUUFBUTtBQUN2RCxVQUFNLE1BQU0sTUFBTSxHQUFHLE9BQU8sRUFBRSxLQUFLLGVBQU8sU0FBUztBQUNuRCxlQUFXLEtBQUssS0FBSztBQUNuQixVQUFJLEVBQUUsY0FBYyxDQUFDLG1CQUFtQixLQUFLLEVBQUUsVUFBVSxHQUFHO0FBQzFELGNBQU0sS0FBS0YsTUFBSyxLQUFLLGFBQWEsRUFBRSxXQUFXLFFBQVEsY0FBYyxFQUFFLENBQUM7QUFDeEUsWUFBSUMsSUFBRyxXQUFXLEVBQUUsR0FBRztBQUFFLGNBQUk7QUFBRSxZQUFBQSxJQUFHLFdBQVcsRUFBRTtBQUFBLFVBQUcsUUFBUTtBQUFBLFVBQUM7QUFBQSxRQUFFO0FBQUEsTUFDL0Q7QUFBQSxJQUNGO0FBQ0EsVUFBTSxLQUFLLE1BQU0sMkNBQTJDO0FBQzVELFFBQUksS0FBSyxFQUFFLFNBQVMsTUFBTSxTQUFTLG1DQUFtQyxDQUFDO0FBQUEsRUFDekUsQ0FBQyxDQUFDO0FBR0YsSUFBRSxJQUFJLGtCQUFrQixHQUFHLE9BQU8sS0FBSyxRQUFRO0FBQzdDLFVBQU0sSUFBSSxNQUFNLEtBQUs7QUFDckIsVUFBTSxJQUFJLEVBQUUsS0FBSyxNQUFNLE9BQU8sSUFBSSxFQUFFLFVBQVUsR0FBRyxXQUFXLEdBQUcsaUJBQWlCLEVBQUU7QUFDbEYsUUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNWLFNBQVMsUUFBUSxJQUFJLFdBQVcsR0FBRyxJQUFJLFFBQVEsTUFBTSxJQUFJLElBQUksTUFBTSxDQUFDO0FBQUEsTUFDcEUsS0FBSyxRQUFRLElBQUksWUFBWTtBQUFBLE1BQzdCLFNBQVM7QUFBQSxNQUNULFVBQVU7QUFBQSxNQUNWLGlCQUFpQixFQUFFLEtBQUssY0FBYztBQUFBLE1BQ3RDLHFCQUFxQixFQUFFO0FBQUEsTUFDdkIsa0JBQWtCLEVBQUUsa0JBQWtCO0FBQUEsTUFDdEMsZ0JBQWdCLEVBQUUsU0FBUztBQUFBLE1BQzNCLFNBQVMsUUFBUTtBQUFBLE1BQ2pCLE1BQU0sT0FBTztBQUFBLE1BQ2IsVUFBVSxFQUFFO0FBQUEsTUFDWixXQUFXLEVBQUU7QUFBQSxNQUNiLGlCQUFpQixFQUFFO0FBQUEsTUFDbkIsZ0JBQWdCO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBQUEsRUFDSixDQUFDLENBQUM7QUFFRixJQUFFLElBQUksaUJBQWlCLEdBQUcsT0FBTyxLQUFLLFFBQVE7QUFDNUMsVUFBTSxXQUFXLFFBQVEsSUFBSSxnQkFBZ0I7QUFDN0MsVUFBTSxRQUFRLE9BQVEsSUFBSSxNQUFNLFNBQVMsSUFBSSxNQUFNLFNBQVUsRUFBRTtBQUMvRCxVQUFNLE9BQU8sT0FBTyxJQUFJLFFBQVEsaUJBQWlCLEVBQUU7QUFDbkQsVUFBTSxTQUFTLEtBQUssV0FBVyxTQUFTLElBQUksS0FBSyxNQUFNLENBQUMsSUFBSTtBQUM1RCxVQUFNLFlBQVksQ0FBQyxDQUFDLFVBQVUsU0FBUyxJQUFJLE1BQU07QUFFakQsUUFBSSxhQUFhO0FBQ2pCLFFBQUksVUFBVTtBQUNaLFVBQUk7QUFDRixxQkFBYSxDQUFDLENBQUMsU0FDVixNQUFNLFdBQVcsU0FBUyxVQUMxQixPQUFPLGdCQUFnQixPQUFPLEtBQUssS0FBSyxHQUFHLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFBQSxNQUN2RSxRQUFRO0FBQUUscUJBQWE7QUFBQSxNQUFPO0FBQUEsSUFDaEM7QUFDQSxRQUFJLENBQUMsY0FBYyxVQUFXLGNBQWE7QUFDM0MsUUFBSSxDQUFDLGNBQWMsU0FBUyxVQUFVLFdBQVksY0FBYTtBQUUvRCxRQUFJLENBQUMsWUFBWTtBQUNmLGFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLO0FBQUEsUUFDMUIsU0FBUztBQUFBLFFBQ1QsU0FBUyxXQUNMLDBGQUNBO0FBQUEsTUFDTixDQUFDO0FBQUEsSUFDSDtBQUNBLFVBQU0sU0FBUyxNQUFNLFFBQVE7QUFDN0IsVUFBTSxTQUFTLE1BQU0sMEJBQTBCO0FBQy9DLFFBQUksS0FBSztBQUFBLE1BQ1AsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsU0FBUyxRQUFRLElBQUksV0FBVyxHQUFHLElBQUksUUFBUSxNQUFNLElBQUksSUFBSSxNQUFNLENBQUM7QUFBQSxNQUNwRSxPQUFPO0FBQUEsUUFDTCxTQUFTLEVBQUUsSUFBSSxNQUFNLFFBQVEsK0JBQStCO0FBQUEsUUFDNUQsUUFBUSxFQUFFLElBQUksTUFBTSxRQUFRLGtCQUFrQixPQUFPLGNBQWMsR0FBRztBQUFBLFFBQ3RFLFFBQVEsRUFBRSxJQUFJLE1BQU0sUUFBUSxLQUFLLFVBQVUsT0FBTyxNQUFNLEVBQUU7QUFBQSxRQUMxRCxhQUFhLE9BQU8sV0FDaEIsRUFBRSxJQUFJLE1BQU0sUUFBUSw0QkFBNEIsS0FBSyxVQUFVLE9BQU8sUUFBUSxDQUFDLEdBQUcsSUFDbEYsRUFBRSxJQUFJLE1BQU0sUUFBUSxPQUFPLFVBQVUsaUJBQWlCO0FBQUEsTUFDNUQ7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNILENBQUMsQ0FBQztBQUdGLElBQUUsS0FBSyxxQkFBcUIsR0FBRyxPQUFPLEtBQUssUUFBUTtBQUtqRCxVQUFNLFFBQVEsVUFBVSxHQUFHLEtBQUs7QUFDaEMsVUFBTSxjQUFjLFFBQVEsSUFBSSxnQkFBZ0I7QUFDaEQsUUFBSSxhQUFhO0FBRWpCLFFBQUksYUFBYTtBQUNmLFVBQUk7QUFDRixxQkFBYSxDQUFDLENBQUMsU0FBUyxNQUFNLFdBQVcsWUFBWSxVQUNuRCxPQUFPLGdCQUFnQixPQUFPLEtBQUssS0FBSyxHQUFHLE9BQU8sS0FBSyxXQUFXLENBQUM7QUFBQSxNQUN2RSxRQUFRO0FBQUUscUJBQWE7QUFBQSxNQUFPO0FBQUEsSUFDaEM7QUFDQSxRQUFJLENBQUMsY0FBYyxTQUFTLFNBQVMsSUFBSSxLQUFLLEVBQUcsY0FBYTtBQUM5RCxRQUFJLENBQUMsY0FBYyxVQUFVLFdBQVksY0FBYTtBQUV0RCxRQUFJLENBQUMsWUFBWTtBQUNmLGFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxPQUFPLFNBQVMsa0RBQWtELENBQUM7QUFBQSxJQUM1RztBQUdBLGFBQVMsVUFBVSxLQUFzQjtBQUN2QyxVQUFJLFFBQVEsUUFBUSxRQUFRLE9BQVcsUUFBTztBQUM5QyxVQUFJLE9BQU8sUUFBUSxVQUFXLFFBQU8sTUFBTSxTQUFTO0FBQ3BELFVBQUksT0FBTyxRQUFRLFNBQVUsUUFBTyxPQUFPLFNBQVMsR0FBRyxJQUFJLE9BQU8sR0FBRyxJQUFJO0FBQ3pFLFVBQUksZUFBZSxNQUFNO0FBQ3ZCLGVBQU8sT0FBTyxNQUFNLElBQUksUUFBUSxDQUFDLElBQUksU0FBUyxJQUFJLElBQUksWUFBWSxDQUFDO0FBQUEsTUFDckU7QUFDQSxVQUFJLE9BQU8sUUFBUSxVQUFVO0FBRTNCLGNBQU0sSUFBSSxLQUFLLFVBQVUsR0FBRyxFQUFFLFFBQVEsTUFBTSxJQUFJO0FBQ2hELGVBQU8sSUFBSSxDQUFDO0FBQUEsTUFDZDtBQUVBLGFBQU8sSUFBSSxPQUFPLEdBQUcsRUFBRSxRQUFRLE1BQU0sSUFBSSxDQUFDO0FBQUEsSUFDNUM7QUFHQSxtQkFBZSxVQUNiLFdBQ0EsU0FDQSxZQUFzQixDQUFDLEdBQ0o7QUFDbkIsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLEtBQUssTUFBTSxpQkFBaUIsU0FBUyxhQUFhLE9BQU8sRUFBRTtBQUNsRixVQUFJLEtBQUssV0FBVyxFQUFHLFFBQU8sQ0FBQyxrQkFBa0IsU0FBUyxHQUFHO0FBRTdELFlBQU0sT0FBTyxPQUFPLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDaEMsWUFBTSxRQUFrQixDQUFDO0FBQ3pCLFlBQU0sUUFBUTtBQUVkLGVBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLEtBQUssT0FBTztBQUMzQyxjQUFNLFFBQVEsS0FBSyxNQUFNLEdBQUcsSUFBSSxLQUFLO0FBQ3JDLGNBQU0sVUFBVSxLQUFLLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHLEVBQUUsS0FBSyxJQUFJO0FBQ25ELGNBQU0sZUFBZSxNQUFNLElBQUksQ0FBQyxRQUFRO0FBQ3RDLGdCQUFNLE9BQU8sS0FBSyxJQUFJLENBQUMsTUFBTTtBQUMzQixrQkFBTSxJQUFLLElBQWdDLENBQUM7QUFDNUMsZ0JBQUksVUFBVSxTQUFTLENBQUMsS0FBSyxNQUFNLFFBQVEsTUFBTSxRQUFXO0FBQzFELG9CQUFNLElBQUksS0FBSyxVQUFVLENBQUMsRUFBRSxRQUFRLE1BQU0sSUFBSTtBQUM5QyxxQkFBTyxJQUFJLENBQUM7QUFBQSxZQUNkO0FBQ0EsbUJBQU8sVUFBVSxDQUFDO0FBQUEsVUFDcEIsQ0FBQztBQUNELGlCQUFPLE1BQU0sS0FBSyxLQUFLLElBQUksQ0FBQztBQUFBLFFBQzlCLENBQUM7QUFDRCxjQUFNLEtBQUssZ0JBQWdCLFNBQVMsTUFBTSxPQUFPLFVBQVU7QUFDM0QsY0FBTSxLQUFLLGFBQWEsS0FBSyxLQUFLLElBQUksR0FBRztBQUFBLE1BQzNDO0FBQ0EsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLEtBQUssb0JBQUksS0FBSztBQUNwQixVQUFNLFFBQVEsR0FBRyxZQUFZLEVBQUUsUUFBUSxTQUFTLEdBQUcsRUFBRSxNQUFNLEdBQUcsRUFBRTtBQUNoRSxVQUFNLFdBQVcsYUFBYSxLQUFLO0FBRW5DLFVBQU0sUUFBa0IsQ0FBQztBQUV6QixVQUFNLEtBQUssaUVBQWlFO0FBQzVFLFVBQU0sS0FBSyw0REFBdUQ7QUFDbEUsVUFBTSxLQUFLLG1CQUFtQixHQUFHLFlBQVksQ0FBQyxFQUFFO0FBQ2hELFVBQU0sS0FBSyw0REFBNEQ7QUFDdkUsVUFBTSxLQUFLLGdFQUFnRTtBQUMzRSxVQUFNLEtBQUssd0NBQXdDLFFBQVEsRUFBRTtBQUM3RCxVQUFNLEtBQUssaUVBQWlFO0FBQzVFLFVBQU0sS0FBSyxFQUFFO0FBQ2IsVUFBTSxLQUFLLCtCQUErQjtBQUMxQyxVQUFNLEtBQUssdUNBQXVDO0FBQ2xELFVBQU0sS0FBSyxFQUFFO0FBRWIsVUFBTSxTQUFnRjtBQUFBLE1BQ3BGLEVBQUUsTUFBTSxZQUFtQixPQUFPLFVBQVcsT0FBTyxDQUFDLEdBQStCLEtBQUssa0JBQWtCO0FBQUEsTUFDM0csRUFBRSxNQUFNLFlBQW1CLE9BQU8sV0FBVyxPQUFPLENBQUMsRUFBRTtBQUFBLE1BQ3ZELEVBQUUsTUFBTSxhQUFtQixPQUFPLFVBQVcsT0FBTyxDQUFDLEdBQStCLEtBQUssbUJBQW1CO0FBQUEsTUFDNUcsRUFBRSxNQUFNLG1CQUFtQixPQUFPLFVBQVcsT0FBTyxDQUFDLFVBQVUsVUFBVSxHQUFXLEtBQUsseUJBQXlCO0FBQUEsSUFDcEg7QUFFQSxlQUFXLEtBQUssUUFBUTtBQUN0QixZQUFNLEtBQUssaUVBQWlFO0FBQzVFLFlBQU0sS0FBSyxhQUFhLEVBQUUsSUFBSSxFQUFFO0FBQ2hDLFlBQU0sS0FBSyxpRUFBaUU7QUFDNUUsWUFBTSxLQUFLLG1CQUFtQixFQUFFLElBQUksNkJBQTZCO0FBQ2pFLFlBQU0sWUFBWSxNQUFNLFVBQVUsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUs7QUFDMUQsWUFBTSxLQUFLLEdBQUcsU0FBUztBQUN2QixVQUFJLEVBQUUsS0FBSztBQUNULGNBQU0sS0FBSyxrQkFBa0IsRUFBRSxHQUFHLHFDQUFxQyxFQUFFLElBQUksZ0JBQWdCO0FBQUEsTUFDL0Y7QUFDQSxZQUFNLEtBQUssRUFBRTtBQUFBLElBQ2Y7QUFFQSxVQUFNLEtBQUssaUVBQWlFO0FBQzVFLFVBQU0sS0FBSyxrQkFBa0I7QUFDN0IsVUFBTSxLQUFLLGlFQUFpRTtBQUU1RSxVQUFNRyxPQUFNLE1BQU0sS0FBSyxJQUFJO0FBQzNCLFVBQU0sTUFBTSxPQUFPLEtBQUtBLE1BQUssTUFBTTtBQUVuQyxRQUFJLFVBQVUsZ0JBQWdCLGdDQUFnQztBQUM5RCxRQUFJLFVBQVUsdUJBQXVCLHlCQUF5QixRQUFRLEdBQUc7QUFDekUsUUFBSSxVQUFVLGtCQUFrQixJQUFJLFVBQVU7QUFDOUMsUUFBSSxLQUFLLEdBQUc7QUFBQSxFQUNkLENBQUMsQ0FBQztBQUdGLElBQUUsSUFBSSxDQUFDLE1BQU0sUUFBUSxJQUFJLE9BQU8sR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLE9BQU8sU0FBUyw0QkFBNEIsQ0FBQyxDQUFDO0FBRW5HLFNBQU87QUFDVDs7O0FEMXhCQSxJQUFNLE9BQU8sT0FBTyxRQUFRLElBQUksUUFBUSxHQUFJO0FBQzVDLElBQU0sT0FBTztBQUNiLElBQU0sUUFBUSxRQUFRLElBQUksYUFBYTtBQUt2QyxJQUFNLFVBQVVDLE1BQUssUUFBUSxRQUFRLElBQUksR0FBRyxNQUFNO0FBQ2xELElBQU0sV0FBV0EsTUFBSyxLQUFLLFNBQVMsWUFBWTtBQUVoRCxTQUFTLGVBQWU7QUFDdEIsTUFBSTtBQUNGLFFBQUksQ0FBQ0MsSUFBRyxXQUFXLE9BQU8sRUFBRyxDQUFBQSxJQUFHLFVBQVUsU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDeEUsUUFBUTtBQUFBLEVBQW9CO0FBQzlCO0FBRUEsU0FBUyxTQUFTLE9BQXlCLFNBQWlCLFFBQWtCO0FBQzVFLGVBQWE7QUFDYixRQUFNLE1BQUssb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFDbEMsUUFBTSxRQUFRLFNBQ1YsVUFBVSxrQkFBa0IsUUFDeEIsR0FBRyxPQUFPLE9BQU87QUFBQSxJQUFPLE9BQU8sU0FBUyxFQUFFLEtBQzFDLE9BQU8sTUFBTSxLQUNqQjtBQUNKLFFBQU0sT0FBTyxJQUFJLEVBQUUsTUFBTSxLQUFLLEtBQUssT0FBTyxHQUFHLEtBQUs7QUFBQTtBQUNsRCxNQUFJO0FBQUUsSUFBQUEsSUFBRyxlQUFlLFVBQVUsSUFBSTtBQUFBLEVBQUcsUUFBUTtBQUFBLEVBQW9CO0FBQ3JFLE1BQUksVUFBVSxRQUFTLFNBQVEsTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUFBLE1BQzlDLFNBQVEsS0FBSyxLQUFLLFFBQVEsQ0FBQztBQUNsQztBQUVBLFFBQVEsR0FBRyxxQkFBcUIsQ0FBQyxRQUFRO0FBQ3ZDLFdBQVMsU0FBUywrQ0FBMEMsR0FBRztBQUMvRCxVQUFRLEtBQUssQ0FBQztBQUNoQixDQUFDO0FBRUQsUUFBUSxHQUFHLHNCQUFzQixDQUFDLFdBQVc7QUFDM0MsV0FBUyxTQUFTLCtCQUErQixNQUFNO0FBQ3pELENBQUM7QUFJRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsSUFBSSxjQUFjO0FBQ3ZDLFFBQU0sTUFDSjtBQUVGLFdBQVMsUUFBUSxHQUFHO0FBQ3BCLFVBQVEsS0FBSyw4QkFBb0IsS0FBSyxJQUFJO0FBQzVDO0FBR0EsZUFBZSxRQUFRO0FBQ3JCLFFBQU0sTUFBTUMsU0FBUTtBQUlwQixRQUFNLGFBQWFGLE1BQUssUUFBUSxRQUFRLElBQUksR0FBRyxVQUFVLFNBQVM7QUFDbEUsTUFBSSxDQUFDQyxJQUFHLFdBQVcsVUFBVSxFQUFHLENBQUFBLElBQUcsVUFBVSxZQUFZLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDNUUsTUFBSSxJQUFJLFlBQVlDLFNBQVEsT0FBTyxZQUFZLEVBQUUsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUdoRSxNQUFJLElBQUksUUFBUSxlQUFlLENBQUM7QUFFaEMsUUFBTSxhQUFhLEtBQUssYUFBYSxHQUFHO0FBRXhDLE1BQUksT0FBTztBQUVULFVBQU0sRUFBRSxjQUFjLGlCQUFpQixJQUFJLE1BQU0sT0FBTyxNQUFNO0FBQzlELFVBQU0sT0FBTyxNQUFNLGlCQUFpQjtBQUFBLE1BQ2xDLFFBQVE7QUFBQSxRQUNOLGdCQUFnQjtBQUFBLFFBQ2hCLEtBQUssRUFBRSxRQUFRLFdBQVc7QUFBQSxRQUMxQixjQUFjO0FBQUEsTUFDaEI7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLElBQUksS0FBSyxXQUFXO0FBQUEsRUFDMUIsT0FBTztBQUdMLFVBQU0sYUFBYUYsTUFBSyxRQUFRLFFBQVEsSUFBSSxHQUFHLFFBQVEsUUFBUTtBQUMvRCxRQUFJLENBQUNDLElBQUcsV0FBVyxVQUFVLEdBQUc7QUFDOUIsZUFBUyxTQUFTLDRCQUE0QixVQUFVLDhCQUE4QjtBQUN0RixZQUFNLElBQUksTUFBTSxtREFBbUQ7QUFBQSxJQUNyRTtBQUNBLFFBQUksSUFBSUMsU0FBUSxPQUFPLFlBQVksRUFBRSxRQUFRLEtBQUssQ0FBQyxDQUFDO0FBR3BELFFBQUksSUFBSSxLQUFLLENBQUMsTUFBTSxRQUFRLElBQUksU0FBU0YsTUFBSyxLQUFLLFlBQVksWUFBWSxDQUFDLENBQUM7QUFBQSxFQUMvRTtBQUVBLGFBQVcsT0FBTyxNQUFNLE1BQU0sTUFBTTtBQUNsQyxVQUFNLFNBQVMsUUFBUSxJQUFJLFdBQVcsVUFBVSxJQUFJLElBQUksSUFBSTtBQUM1RCxZQUFRLElBQUksNEJBQTRCLElBQUksSUFBSSxJQUFJLGFBQWEsTUFBTSxHQUFHO0FBQzFFLGFBQVMsUUFBUSw4QkFBeUIsSUFBSSxRQUFRLFFBQVEsSUFBSSxZQUFZLGFBQWEsRUFBRTtBQUFBLEVBQy9GLENBQUM7QUFDSDtBQUVBLE1BQU0sRUFBRSxNQUFNLENBQUMsUUFBUTtBQUNyQixXQUFTLFNBQVMsdUJBQXVCLEdBQUc7QUFDNUMsVUFBUSxLQUFLLENBQUM7QUFDaEIsQ0FBQzsiLAogICJuYW1lcyI6IFsiZXhwcmVzcyIsICJwYXRoIiwgImZzIiwgInBhdGgiLCAiZnMiLCAiZXEiLCAicGF0aCIsICJmcyIsICJlcSIsICJyIiwgInNxbCIsICJwYXRoIiwgImZzIiwgImV4cHJlc3MiXQp9Cg==
