import express, { type Request, type Response, type Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { sql, eq, ilike, or, and, asc, desc, inArray } from 'drizzle-orm';
import {
  pool,
  db,
  schema,
  migrate,
  importLegacyJsonIfPresent,
  ping,
  counts,
  getAllSettings,
  setSettings,
  setSetting,
  getSetting,
  decorateStudent,
  rowToStudent,
  rowToGallery,
  nowIso,
  type Student,
  type GalleryItem,
} from './db.js';

const ADMIN_USER = 'jobenapp';
const ADMIN_PASS = '081460081343';

const ALLOWED_SETTING_KEYS = [
  'announcement_date',
  'announcement_time',
  'maintenance_mode',
  'show_unduh_skl',
  'headline',
  'school_name',
  'school_npsn',
  'school_address',
  'principal_name',
  'school_logo',
  'principal_photo',
  'motivation_message',
] as const;

const UPLOAD_ROOT = path.resolve(process.cwd(), 'server', 'uploads');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

ensureDir(UPLOAD_ROOT);
ensureDir(path.join(UPLOAD_ROOT, 'branding'));
ensureDir(path.join(UPLOAD_ROOT, 'principal'));
ensureDir(path.join(UPLOAD_ROOT, 'galleries'));

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let sub = 'misc';
    if (file.fieldname === 'logo') sub = 'branding';
    else if (file.fieldname === 'principal_photo') sub = 'principal';
    else if (file.fieldname === 'image') sub = 'galleries';
    cb(null, path.join(UPLOAD_ROOT, sub));
  },
  filename: (_req, file, cb) => {
    const safeBase = file.originalname
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 60) || 'file';
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, `${safeBase}_${id}${ext}`);
  },
});

const uploadGeneral = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ----- Sessions (in-memory) -----
type Session = { username: string; role: string; read_only: boolean; issued_at: string };
const sessions = new Map<string, Session>();
function readToken(req: Request): string | null {
  const h = req.header('authorization') || req.header('Authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (m) return m[1].trim();
  const t = (req.header('x-admin-token') || req.query.token) as string | undefined;
  return t ? String(t) : null;
}

// ---- helpers ----
const ok = <T>(data?: T, message?: string) => ({ success: true, ...(data !== undefined ? { data } : {}), ...(message ? { message } : {}) });

function publicAssetUrl(req: Request, relPath: string | null | undefined): string {
  if (!relPath) return '';
  if (/^(https?:)?\/\//i.test(relPath)) return relPath;
  if (relPath.startsWith('data:')) return relPath;
  const origin = `${req.protocol}://${req.get('host')}`;
  return `${origin}/uploads/${relPath.replace(/^\/+/, '').replace(/^uploads\//, '')}`;
}

function isAnnouncementActive(date: string, time: string): { iso: string; active: boolean } {
  if (!date || !time) return { iso: '', active: false };
  const iso = new Date(`${date}T${time}:00`).toISOString();
  const active = new Date(iso).getTime() <= Date.now();
  return { iso, active };
}

// Wrap async route handlers so thrown errors return 500 JSON instead of hanging
function aw(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error('[api error]', req.method, req.path, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Server error: ' + (err?.message ?? 'unknown') });
      }
    });
  };
}

// ---- ROUTER ----
export function buildApiRouter(): Router {
  const r = express.Router();
  r.use(express.json({ limit: '10mb' }));
  r.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Boot-time setup: ensure tables exist + migrate legacy JSON if present.
  (async () => {
    try {
      await migrate();
      const res = await importLegacyJsonIfPresent();
      if (res.migrated) {
        console.log('[db] legacy server/data.json imported into PostgreSQL:', res.inserted);
      }
    } catch (e) {
      console.error('[db] boot setup failed:', e);
    }
  })();

  // -------- Public --------
  r.get('/school-info', aw(async (req, res) => {
    const s = await getAllSettings();
    const { iso, active } = isAnnouncementActive(s.announcement_date ?? '', s.announcement_time ?? '');
    res.json(ok({
      headline: s.headline ?? '',
      school_name: s.school_name ?? 'SMKN 1 Wonogiri',
      school_npsn: s.school_npsn ?? '',
      school_address: s.school_address ?? '',
      school_logo: publicAssetUrl(req, s.school_logo),
      principal_name: s.principal_name ?? '',
      principal_photo: publicAssetUrl(req, s.principal_photo),
      motivation_message: s.motivation_message ?? '',
      announcement_datetime: iso,
      announcement_active: active,
      maintenance_mode: s.maintenance_mode === '1',
      show_unduh_skl: s.show_unduh_skl === '1',
    }));
  }));

  r.get('/galleries', aw(async (req, res) => {
    const rows = await db.select().from(schema.galleries).orderBy(desc(schema.galleries.id));
    const items = rows.map((g) => ({
      id: g.id,
      image_path: publicAssetUrl(req, g.image_path),
      title: g.title ?? '',
      created_at: g.created_at?.toISOString() ?? nowIso(),
    }));
    res.json(ok(items));
  }));

  r.post('/check-status', aw(async (req, res) => {
    const s = await getAllSettings();
    const { active } = isAnnouncementActive(s.announcement_date ?? '', s.announcement_time ?? '');
    if (s.announcement_date && s.announcement_time && !active) {
      return res.status(403).json({
        success: false,
        message: `Sabar, pengumuman belum dibuka! Kembali lagi jam ${s.announcement_time} WIB.`,
      });
    }
    const { nisn, birth_date } = req.body ?? {};
    if (!nisn || !birth_date) {
      return res.status(422).json({ success: false, message: 'NISN dan tanggal lahir wajib diisi.' });
    }
    const bd = String(birth_date).slice(0, 10);
    const found = (await db.select().from(schema.students)
      .where(and(eq(schema.students.nisn, String(nisn)), eq(schema.students.birth_date, bd)))
      .limit(1))[0];
    if (!found) {
      return res.status(404).json({ success: false, message: 'Data NISN atau Tanggal Lahir tidak ditemukan.' });
    }
    await db.update(schema.students)
      .set({ viewed_at: new Date() })
      .where(eq(schema.students.id, found.id));
    const fresh = (await db.select().from(schema.students).where(eq(schema.students.id, found.id)).limit(1))[0];
    res.json(ok(decorateStudent(rowToStudent(fresh))));
  }));

  // -------- Panel admin auth --------
  r.post('/panel-admin/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(422).json({ success: false, message: 'Username dan password wajib diisi.' });
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
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
      username: ADMIN_USER,
      role: 'built_in_admin',
      read_only: true,
      issued_at: nowIso(),
    });
    res.json(ok({ username: ADMIN_USER, role: 'built_in_admin', token, redirect: '/panel-admin/dashboard' }));
  });

  r.post('/panel-admin/logout', (req, res) => {
    const t = readToken(req);
    if (t) sessions.delete(t);
    res.json(ok());
  });

  r.get('/panel-admin/me', (req, res) => {
    const t = readToken(req);
    const sess = t ? sessions.get(t) : null;
    if (!sess) return res.status(401).json({ success: false, message: 'Belum login.' });
    res.json(ok({
      username: sess.username,
      role: sess.role,
      read_only: sess.read_only,
      issued_at: sess.issued_at,
    }));
  });

  // -------- Admin: stats / students --------
  r.get('/admin/stats', aw(async (_req, res) => {
    const totalRow = await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM students');
    const lulusRow = await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM students WHERE status_graduation = 1');
    const checkedRow = await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM students WHERE viewed_at IS NOT NULL');
    const total = Number(totalRow.rows[0].c);
    const lulus = Number(lulusRow.rows[0].c);
    res.json(ok({ total, lulus, tidakLulus: total - lulus, checked: Number(checkedRow.rows[0].c) }));
  }));

  r.get('/admin/students', aw(async (req, res) => {
    const search = String(req.query.search ?? '').trim();
    const perPage = 15;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);

    let where = undefined as any;
    if (search) {
      const q = `%${search}%`;
      where = or(
        ilike(schema.students.name, q),
        ilike(schema.students.nisn, q),
        ilike(schema.students.class, q),
        ilike(schema.students.major, q),
      );
    }

    const totalRow = where
      ? await pool.query<{ c: string }>(
          `SELECT COUNT(*)::text c FROM students WHERE name ILIKE $1 OR nisn ILIKE $1 OR class ILIKE $1 OR major ILIKE $1`,
          [`%${search}%`],
        )
      : await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM students');
    const total = Number(totalRow.rows[0].c);
    const last_page = Math.max(1, Math.ceil(total / perPage));
    const cur = Math.min(page, last_page);

    const rowsQ = db.select().from(schema.students)
      .orderBy(asc(schema.students.class), asc(schema.students.name))
      .limit(perPage).offset((cur - 1) * perPage);
    const rows = where ? await rowsQ.where(where) : await rowsQ;

    res.json(ok({
      data: rows.map((r) => decorateStudent(rowToStudent(r))),
      current_page: cur,
      last_page,
      per_page: perPage,
      total,
    }));
  }));

  r.post('/admin/students/:id(\\d+)', aw(async (req, res) => {
    const id = Number(req.params.id);
    const allowed = ['name', 'birth_place', 'birth_date', 'class', 'major', 'status_graduation'] as const;
    const patch: Record<string, any> = {};
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k];
    }
    if ('status_graduation' in patch) {
      patch.status_graduation = (patch.status_graduation === true || patch.status_graduation === 1 || patch.status_graduation === '1') ? 1 : 0;
    }
    if ('birth_date' in patch) {
      patch.birth_date = String(patch.birth_date ?? '').slice(0, 10);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(422).json({ success: false, message: 'Tidak ada field yang diubah.' });
    }
    patch.updated_at = new Date();
    const updated = await db.update(schema.students).set(patch).where(eq(schema.students.id, id)).returning();
    if (updated.length === 0) {
      return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Data siswa berhasil diperbarui', student: decorateStudent(rowToStudent(updated[0])) });
  }));

  // -------- Admin: settings --------
  r.get('/admin/settings', aw(async (_req, res) => {
    const s = await getAllSettings();
    res.json(ok({
      announcement_date: s.announcement_date ?? '',
      announcement_time: s.announcement_time ?? '',
      maintenance_mode: s.maintenance_mode === '1',
      show_unduh_skl: s.show_unduh_skl === '1',
      headline: s.headline ?? '',
      school_name: s.school_name ?? 'SMKN 1 Wonogiri',
      school_npsn: s.school_npsn ?? '',
      school_address: s.school_address ?? '',
      principal_name: s.principal_name ?? '',
      school_logo: s.school_logo || null,
      principal_photo: s.principal_photo || null,
      motivation_message: s.motivation_message ?? '',
    }));
  }));

  r.post('/admin/settings',
    uploadGeneral.fields([{ name: 'logo', maxCount: 1 }, { name: 'principal_photo', maxCount: 1 }]),
    aw(async (req, res) => {
      const body = req.body ?? {};
      if (body.principal_motivation && !body.motivation_message) {
        body.motivation_message = body.principal_motivation;
      }
      if ('maintenance_mode' in body) {
        const v = body.maintenance_mode;
        body.maintenance_mode = (v === true || v === 1 || v === '1' || v === 'true') ? '1' : '0';
      }
      if ('show_unduh_skl' in body) {
        const v = body.show_unduh_skl;
        body.show_unduh_skl = (v === true || v === 1 || v === '1' || v === 'true') ? '1' : '0';
      }
      const patch: Record<string, string> = {};
      for (const k of ALLOWED_SETTING_KEYS) {
        if (k === 'school_logo' || k === 'principal_photo') continue;
        if (k in body) patch[k] = String(body[k] ?? '');
      }

      const files = (req.files as Record<string, Express.Multer.File[]>) ?? {};
      const logo = files.logo?.[0];
      if (logo) {
        const rel = path.relative(UPLOAD_ROOT, logo.path).replace(/\\/g, '/');
        const old = await getSetting('school_logo');
        if (old && !/^https?:|^data:/.test(old)) {
          const oldPath = path.join(UPLOAD_ROOT, old.replace(/^uploads\//, ''));
          if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch {} }
        }
        patch.school_logo = rel;
      }
      const photo = files.principal_photo?.[0];
      if (photo) {
        const rel = path.relative(UPLOAD_ROOT, photo.path).replace(/\\/g, '/');
        const old = await getSetting('principal_photo');
        if (old && !/^https?:|^data:/.test(old)) {
          const oldPath = path.join(UPLOAD_ROOT, old.replace(/^uploads\//, ''));
          if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch {} }
        }
        patch.principal_photo = rel;
      }

      await setSettings(patch);
      res.json(ok(undefined, 'Pengaturan berhasil diperbarui'));
    }),
  );

  // -------- Admin: import (Excel) --------
  r.post('/admin/import', uploadExcel.single('file'), aw(async (req, res) => {
    if (!req.file) return res.status(422).json({ success: false, message: 'File Excel tidak ditemukan.' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('siswa')) ?? wb.SheetNames[0];
    if (!sheetName) {
      return res.status(422).json({ success: false, message: 'File Excel tidak memiliki sheet apapun.' });
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: '', raw: false });

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    const norm = (k: string) => k.toLowerCase().replace(/[^a-z]+/g, '');
    const pick = (row: Record<string, any>, names: string[]): any => {
      for (const k of Object.keys(row)) {
        if (names.includes(norm(k))) return row[k];
      }
      return undefined;
    };
    const parseDate = (v: any): string | null => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const str = String(v).trim();
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(str);
      if (dmy) {
        const [, d, m, y] = dmy;
        const yy = y.length === 2 ? `20${y}` : y;
        return `${yy.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const parsed = new Date(str);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      return null;
    };
    const parseStatus = (v: any): 0 | 1 => {
      const s = String(v ?? '').trim().toLowerCase();
      if (['1', 'true', 'lulus', 'l', 'ya', 'y'].includes(s)) return 1;
      if (['0', 'false', 'tidak lulus', 'tidak', 'tl', 'n', 'no'].includes(s)) return 0;
      return 1;
    };

    const beforeRow = await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM students');
    const beforeCount = Number(beforeRow.rows[0].c);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const nisn = String(pick(row, ['nisn']) ?? '').trim();
          const name = String(pick(row, ['name', 'nama', 'namasiswa', 'namalengkap']) ?? '').trim();
          const birthPlace = String(pick(row, ['birthplace', 'tempatlahir', 'tempat']) ?? '').trim();
          const birthDate = parseDate(pick(row, ['birthdate', 'tanggallahir', 'tgllahir']));
          const klass = String(pick(row, ['class', 'kelas']) ?? '').trim();
          const major = String(pick(row, ['major', 'jurusan', 'kompetensi']) ?? '').trim();
          const status = parseStatus(pick(row, ['statusgraduation', 'status', 'kelulusan', 'statuskelulusan', 'lulus']));

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
            [nisn, name, birthPlace, birthDate, klass, major, status],
          );
          imported++;
        } catch (err: any) {
          failed++;
          errors.push(`Baris ${i + 2}: ${err?.message ?? 'gagal'}.`);
        }
      }
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Snapshot to import_archives
    const allNow = await db.select().from(schema.students);
    const snapshot = allNow.map(rowToStudent);
    await pool.query(
      `INSERT INTO import_archives (filename, imported, failed, total_after, errors, snapshot, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb, NOW())`,
      [
        req.file.originalname,
        imported, failed,
        snapshot.length,
        JSON.stringify(errors.slice(0, 50)),
        JSON.stringify(snapshot),
      ],
    );
    // Cap archives to last 10
    await pool.query(
      `DELETE FROM import_archives WHERE id NOT IN (SELECT id FROM import_archives ORDER BY id DESC LIMIT 10)`,
    );

    res.json({
      success: true,
      message: `Import selesai. ${imported} baris berhasil, ${failed} baris gagal.`,
      data: { imported, failed, errors: errors.slice(0, 20) },
      stats: {
        imported, failed,
        errors: errors.slice(0, 20),
        total: snapshot.length,
        last_import_time: nowIso(),
        before_count: beforeCount,
      },
    });
  }));

  r.post('/admin/reset-tracking/:id?', aw(async (req, res) => {
    const id = req.params.id ? Number(req.params.id) : null;
    let result;
    if (id !== null) {
      result = await pool.query('UPDATE students SET viewed_at = NULL, updated_at = NOW() WHERE id = $1 AND viewed_at IS NOT NULL', [id]);
    } else {
      result = await pool.query('UPDATE students SET viewed_at = NULL, updated_at = NOW() WHERE viewed_at IS NOT NULL');
    }
    res.json(ok({ reset: result.rowCount ?? 0 }, 'Tracking data reset'));
  }));

  r.post('/admin/students/purge', aw(async (_req, res) => {
    const beforeS = (await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM students')).rows[0].c;
    const beforeA = (await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM import_archives')).rows[0].c;
    await pool.query('TRUNCATE TABLE students RESTART IDENTITY');
    await pool.query('TRUNCATE TABLE import_archives RESTART IDENTITY');
    res.json({
      success: true,
      message: `Berhasil menghapus ${beforeS} siswa.`,
      data: { removed: Number(beforeS), archives_removed: Number(beforeA) },
    });
  }));

  r.post('/admin/students/bulk-delete', aw(async (req, res) => {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length === 0) return res.status(422).json({ success: false, message: 'Tidak ada id siswa yang dipilih.' });
    const r2 = await db.delete(schema.students).where(inArray(schema.students.id, ids));
    const removed = (r2 as any).rowCount ?? ids.length;
    res.json({ success: true, message: `Berhasil menghapus ${removed} siswa.`, data: { removed } });
  }));

  r.post('/admin/students/bulk-status', aw(async (req, res) => {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    const status = (req.body?.status === 1 || req.body?.status === '1' || req.body?.status === true) ? 1 : 0;
    if (ids.length === 0) return res.status(422).json({ success: false, message: 'Tidak ada id siswa yang dipilih.' });
    const r2 = await pool.query(
      `UPDATE students SET status_graduation = $1, updated_at = NOW() WHERE id = ANY($2::int[]) AND status_graduation <> $1`,
      [status, ids],
    );
    const updated = r2.rowCount ?? 0;
    res.json({ success: true, message: `Status diperbarui untuk ${updated} siswa.`, data: { updated } });
  }));

  // -------- Admin: galleries --------
  r.post('/admin/galleries', uploadGeneral.single('image'), aw(async (req, res) => {
    const cnt = (await pool.query<{ c: string }>('SELECT COUNT(*)::text c FROM galleries')).rows[0].c;
    if (Number(cnt) >= 30) {
      if (req.file?.path && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch {} }
      return res.status(422).json({
        success: false,
        message: 'Galeri sudah mencapai batas maksimal 30 foto. Hapus salah satu sebelum mengunggah baru.',
      });
    }
    if (!req.file) return res.status(422).json({ success: false, message: 'File gambar tidak ditemukan.' });
    const rel = path.relative(UPLOAD_ROOT, req.file.path).replace(/\\/g, '/');
    const title = String(req.body?.title ?? req.body?.caption ?? '').slice(0, 200);
    const inserted = await db.insert(schema.galleries)
      .values({ image_path: rel, title })
      .returning();
    const item = inserted[0];
    res.json({
      success: true,
      data: {
        id: item.id,
        image_path: publicAssetUrl(req, item.image_path),
        title: item.title,
        created_at: item.created_at?.toISOString() ?? nowIso(),
      },
      message: 'Foto galeri berhasil diunggah.',
    });
  }));

  r.delete('/admin/galleries/:id(\\d+)', aw(async (req, res) => {
    const id = Number(req.params.id);
    const found = await db.select().from(schema.galleries).where(eq(schema.galleries.id, id)).limit(1);
    if (found.length === 0) return res.status(404).json({ success: false, message: 'Foto tidak ditemukan.' });
    const g = found[0];
    if (g.image_path && !/^(https?:|data:)/.test(g.image_path)) {
      const fp = path.join(UPLOAD_ROOT, g.image_path.replace(/^uploads\//, ''));
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
    }
    await db.delete(schema.galleries).where(eq(schema.galleries.id, id));
    res.json({ success: true, message: 'Foto galeri dihapus.' });
  }));

  r.post('/admin/galleries/clear', aw(async (_req, res) => {
    const all = await db.select().from(schema.galleries);
    for (const g of all) {
      if (g.image_path && !/^(https?:|data:)/.test(g.image_path)) {
        const fp = path.join(UPLOAD_ROOT, g.image_path.replace(/^uploads\//, ''));
        if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} }
      }
    }
    await pool.query('TRUNCATE TABLE galleries RESTART IDENTITY');
    res.json({ success: true, message: 'Semua foto galeri telah dihapus.' });
  }));

  // -------- Deploy / Health --------
  r.get('/deploy/health', aw(async (req, res) => {
    const p = await ping();
    const c = p.ok ? await counts() : { students: 0, galleries: 0, import_archives: 0 };
    res.json(ok({
      app_url: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
      env: process.env.NODE_ENV ?? 'development',
      backend: 'node-express',
      database: 'postgres',
      database_status: p.ok ? 'connected' : 'disconnected',
      database_latency_ms: p.latency_ms,
      database_version: p.server_version ?? null,
      database_error: p.error ?? null,
      runtime: process.version,
      time: nowIso(),
      students: c.students,
      galleries: c.galleries,
      import_archives: c.import_archives,
      schema_version: 2,
    }));
  }));

  r.all('/deploy/setup', aw(async (req, res) => {
    const expected = process.env.DEPLOY_TOKEN || '';
    const given = String((req.query.token ?? req.body?.token) ?? '');
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const sessionOk = !!bearer && sessions.has(bearer);

    let authorized = false;
    if (expected) {
      try {
        authorized = !!given
          && given.length === expected.length
          && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
      } catch { authorized = false; }
    }
    if (!authorized && sessionOk) authorized = true;
    if (!authorized && given && given === ADMIN_PASS) authorized = true;

    if (!authorized) {
      return res.status(401).json({
        success: false,
        message: expected
          ? 'Token tidak valid. Masukkan DEPLOY_TOKEN yang benar atau login admin terlebih dahulu.'
          : 'Login admin terlebih dahulu, atau masukkan password admin sebagai token.',
      });
    }
    const result = await migrate();
    const legacy = await importLegacyJsonIfPresent();
    res.json({
      success: true,
      message: 'Setup selesai. Database PostgreSQL siap digunakan.',
      app_url: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
      steps: {
        migrate: { ok: true, output: 'Skema PostgreSQL up-to-date.' },
        schema: { ok: true, output: `schema_version=${result.schema_version}` },
        counts: { ok: true, output: JSON.stringify(result.counts) },
        legacy_json: legacy.migrated
          ? { ok: true, output: `Imported from data.json: ${JSON.stringify(legacy.inserted)}` }
          : { ok: true, output: legacy.reason ?? 'no legacy file' },
      },
    });
  }));

  // -------- Database Backup (SQL dump via pure Node.js) --------
  r.post('/deploy/backup-db', aw(async (req, res) => {
    // Accepts the same token as /deploy/setup:
    //   1. DEPLOY_TOKEN (env var) via Bearer or x-admin-token
    //   2. Active admin session token (Bearer)
    //   3. Admin password as fallback (for the built-in client)
    const given = readToken(req) ?? '';
    const deployToken = process.env.DEPLOY_TOKEN ?? '';
    let authorized = false;

    if (deployToken) {
      try {
        authorized = !!given && given.length === deployToken.length &&
          crypto.timingSafeEqual(Buffer.from(given), Buffer.from(deployToken));
      } catch { authorized = false; }
    }
    if (!authorized && given && sessions.has(given)) authorized = true;
    if (!authorized && given === ADMIN_PASS) authorized = true;

    if (!authorized) {
      return res.status(401).json({ success: false, message: 'Token tidak valid. Login admin terlebih dahulu.' });
    }

    // Helper: escape a JS value to a safe PostgreSQL literal.
    function pgLiteral(val: unknown): string {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
      if (val instanceof Date) {
        return Number.isNaN(val.getTime()) ? 'NULL' : `'${val.toISOString()}'`;
      }
      if (typeof val === 'object') {
        // JSONB columns — serialize then escape as a string literal cast to jsonb
        const j = JSON.stringify(val).replace(/'/g, "''");
        return `'${j}'::jsonb`;
      }
      // String — escape single quotes by doubling
      return `'${String(val).replace(/'/g, "''")}'`;
    }

    // Dump one table: returns SQL lines (no trailing newline on last line).
    async function dumpTable(
      tableName: string,
      orderBy: string,
      jsonbCols: string[] = [],
    ): Promise<string[]> {
      const { rows } = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`);
      if (rows.length === 0) return [`-- (no rows in ${tableName})`];

      const cols = Object.keys(rows[0]);
      const lines: string[] = [];
      const BATCH = 100;

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const colList = cols.map((c) => `"${c}"`).join(', ');
        const valueClauses = batch.map((row) => {
          const vals = cols.map((c) => {
            const v = (row as Record<string, unknown>)[c];
            if (jsonbCols.includes(c) && v !== null && v !== undefined) {
              const j = JSON.stringify(v).replace(/'/g, "''");
              return `'${j}'::jsonb`;
            }
            return pgLiteral(v);
          });
          return `  (${vals.join(', ')})`;
        });
        lines.push(`INSERT INTO "${tableName}" (${colList}) VALUES`);
        lines.push(valueClauses.join(',\n') + ';');
      }
      return lines;
    }

    const ts = new Date();
    const stamp = ts.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_db_${stamp}.sql`;

    const parts: string[] = [];

    parts.push(`-- ============================================================`);
    parts.push(`-- Portal Kelulusan SMKN 1 Wonogiri — Database Backup`);
    parts.push(`-- Generated  : ${ts.toISOString()}`);
    parts.push(`-- Generator  : Node.js pure-JS dump (no pg_dump required)`);
    parts.push(`-- Tables     : students, settings, galleries, import_archives`);
    parts.push(`-- Usage      : psql $DATABASE_URL < ${filename}`);
    parts.push(`-- ============================================================`);
    parts.push(``);
    parts.push(`SET client_encoding = 'UTF8';`);
    parts.push(`SET standard_conforming_strings = on;`);
    parts.push(``);

    const tables: Array<{ name: string; order: string; jsonb: string[]; seq?: string }> = [
      { name: 'students',        order: 'id ASC',  jsonb: [],                             seq: 'students_id_seq' },
      { name: 'settings',        order: 'key ASC', jsonb: [] },
      { name: 'galleries',       order: 'id ASC',  jsonb: [],                             seq: 'galleries_id_seq' },
      { name: 'import_archives', order: 'id ASC',  jsonb: ['errors', 'snapshot'],         seq: 'import_archives_id_seq' },
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

    const sql = parts.join('\n');
    const buf = Buffer.from(sql, 'utf8');

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.byteLength);
    res.send(buf);
  }));

  // 404 inside /api so the SPA fallback never catches these
  r.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' }));

  return r;
}
