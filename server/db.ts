import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql, eq } from 'drizzle-orm';
import * as schema from './schema.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. PostgreSQL is required.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export { schema };

// ---- Backward-compatible types for the rest of the codebase ----
export type Student = {
  id: number;
  nisn: string;
  name: string;
  birth_place: string;
  birth_date: string;
  class: string;
  major: string;
  status_graduation: 0 | 1 | boolean;
  viewed_at: string | null;
  formatted_birth_date?: string;
  inline_birth?: string;
  created_at?: string;
  updated_at?: string;
};

export type GalleryItem = {
  id: number;
  image_path: string;
  title: string;
  created_at: string;
};

export type ImportArchive = {
  id: number;
  filename: string;
  imported: number;
  failed: number;
  total_after: number;
  errors: string[];
  snapshot: Student[];
  created_at: string;
};

export type Settings = Record<string, string>;

const DEFAULT_SETTINGS: Settings = {
  school_name: 'SMKN 1 Wonogiri',
};

const SCHEMA_VERSION = 2; // bumped: 1=json, 2=postgres

// ---- Helpers ----
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatBirthDateID(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso ?? '';
  const [, y, mo, d] = m;
  const month = MONTHS_ID[parseInt(mo, 10) - 1] ?? mo;
  return `${parseInt(d, 10)} ${month} ${y}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function isoOf(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function rowToStudent(r: schema.StudentRow): Student {
  return {
    id: r.id,
    nisn: r.nisn,
    name: r.name,
    birth_place: r.birth_place ?? '',
    birth_date: String(r.birth_date ?? '').slice(0, 10),
    class: r.class ?? '',
    major: r.major ?? '',
    status_graduation: (Number(r.status_graduation) === 1 ? 1 : 0) as 0 | 1,
    viewed_at: isoOf(r.viewed_at),
    created_at: isoOf(r.created_at) ?? undefined,
    updated_at: isoOf(r.updated_at) ?? undefined,
  };
}

export function decorateStudent(s: Student): Student {
  const formatted = formatBirthDateID(s.birth_date);
  return {
    ...s,
    status_graduation: typeof s.status_graduation === 'boolean'
      ? (s.status_graduation ? 1 : 0)
      : (Number(s.status_graduation) === 1 ? 1 : 0),
    formatted_birth_date: formatted,
    inline_birth: s.birth_place ? `${s.birth_place}, ${formatted}` : formatted,
  };
}

export function rowToGallery(r: schema.GalleryRow): GalleryItem {
  return {
    id: r.id,
    image_path: r.image_path,
    title: r.title ?? '',
    created_at: isoOf(r.created_at) ?? nowIso(),
  };
}

// ---- Settings KV (key/value table) ----
export async function getAllSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.settings);
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value ?? '';
  return out;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
  `);
}

export async function setSettings(patch: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(patch)) {
    await setSetting(k, v);
  }
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return row[0]?.value ?? fallback;
}

// ---- Health & migration ----
export async function ping(): Promise<{ ok: boolean; latency_ms: number; server_version?: string; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await pool.query<{ version: string }>('SELECT version() AS version');
    return { ok: true, latency_ms: Date.now() - t0, server_version: r.rows[0]?.version };
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: e?.message ?? String(e) };
  }
}

export async function counts(): Promise<{ students: number; galleries: number; import_archives: number }> {
  const [{ c: s }] = (await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM students')).rows;
  const [{ c: g }] = (await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM galleries')).rows;
  const [{ c: a }] = (await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM import_archives')).rows;
  return { students: Number(s), galleries: Number(g), import_archives: Number(a) };
}

/**
 * Idempotent setup: ensures the four tables exist and seeds the default
 * `school_name` setting. The actual CREATE TABLE statements live in this
 * function so the SPA's "Force Migrate" button can recover from a wiped DB.
 */
export async function migrate(): Promise<{ created: boolean; schema_version: number; counts: { students: number; galleries: number; import_archives: number } }> {
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
  // Seed default settings if empty
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [k, v],
    );
  }
  const c = await counts();
  return { created: false, schema_version: SCHEMA_VERSION, counts: c };
}

/**
 * One-shot importer for the legacy server/data.json file. Copies the JSON
 * contents into PostgreSQL with INSERT ... ON CONFLICT DO NOTHING (idempotent),
 * then renames the JSON file to .migrated so it cannot be re-imported.
 *
 * Returns { migrated: false } if no data.json exists, or details about how
 * many rows of each kind were transferred.
 */
export async function importLegacyJsonIfPresent(): Promise<{
  migrated: boolean;
  reason?: string;
  inserted?: { students: number; galleries: number; settings: number; import_archives: number };
}> {
  const dataFile = path.resolve(process.cwd(), 'server', 'data.json');
  if (!fs.existsSync(dataFile)) return { migrated: false, reason: 'no data.json' };

  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch (e: any) {
    return { migrated: false, reason: `data.json is not valid JSON: ${e?.message}` };
  }

  const inserted = { students: 0, galleries: 0, settings: 0, import_archives: 0 };

  // Settings (KV upsert)
  const sObj = (parsed?.settings ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(sObj)) {
    if (v === null || v === undefined) continue;
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [k, String(v)],
    );
    inserted.settings++;
  }

  // Students
  for (const s of parsed?.students ?? []) {
    const r = await pool.query(
      `INSERT INTO students
        (nisn, name, birth_place, birth_date, class, major, status_graduation, viewed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW()))
       ON CONFLICT (nisn) DO NOTHING`,
      [
        String(s.nisn ?? '').trim(),
        String(s.name ?? '').trim(),
        String(s.birth_place ?? ''),
        String(s.birth_date ?? '').slice(0, 10),
        String(s.class ?? ''),
        String(s.major ?? ''),
        Number(s.status_graduation) === 1 || s.status_graduation === true ? 1 : 0,
        s.viewed_at ?? null,
        s.created_at ?? null,
        s.updated_at ?? null,
      ],
    );
    if (r.rowCount && r.rowCount > 0) inserted.students++;
  }

  // Galleries
  for (const g of parsed?.galleries ?? []) {
    const r = await pool.query(
      `INSERT INTO galleries (image_path, title, created_at)
       VALUES ($1,$2, COALESCE($3::timestamptz, NOW()))`,
      [String(g.image_path ?? ''), String(g.title ?? ''), g.created_at ?? null],
    );
    if (r.rowCount && r.rowCount > 0) inserted.galleries++;
  }

  // Import archives
  for (const a of parsed?.import_archives ?? []) {
    const r = await pool.query(
      `INSERT INTO import_archives (filename, imported, failed, total_after, errors, snapshot, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb, COALESCE($7::timestamptz, NOW()))`,
      [
        String(a.filename ?? ''),
        Number(a.imported ?? 0),
        Number(a.failed ?? 0),
        Number(a.total_after ?? 0),
        JSON.stringify(a.errors ?? []),
        JSON.stringify(a.snapshot ?? []),
        a.created_at ?? null,
      ],
    );
    if (r.rowCount && r.rowCount > 0) inserted.import_archives++;
  }

  // Park the legacy file so it cannot be re-imported and won't confuse anyone.
  const archivedPath = `${dataFile}.migrated-${Date.now()}.bak`;
  try {
    fs.renameSync(dataFile, archivedPath);
  } catch {
    // If rename fails, at least overwrite with a marker
    fs.writeFileSync(dataFile, `MIGRATED_TO_POSTGRES_${nowIso()}\n`);
  }

  return { migrated: true, inserted };
}
