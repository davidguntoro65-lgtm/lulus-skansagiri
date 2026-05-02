/**
 * @license
 * Developed by: TIM IT Skansagiri
 * Powered by: Dave_Exe
 *
 * Self-contained client-side persistence layer.
 *
 * Why this exists:
 *   The portal ships with a reference Laravel backend (`laravel/`) but the
 *   project also runs as a pure-frontend SPA (Replit dev server, GitHub Pages,
 *   any static host). When the backend is not reachable, every admin operation
 *   (import, edit, save, reset, etc.) needs to keep working — otherwise demo /
 *   training scenarios would silently fail with "Terjadi kesalahan koneksi".
 *
 *   This module is a transparent fallback: each `apiCall` helper first tries
 *   the real API, and on any failure (network error, 4xx, 5xx, non-JSON HTML,
 *   …) it falls back to the localStorage-backed store defined here. The UI is
 *   unaware of the difference — every operation returns the same shape the
 *   real Laravel controllers produce.
 *
 * Storage namespace: everything is prefixed with `skansagiri.` to avoid
 * colliding with other apps on the same origin.
 */

const NS = 'skansagiri';
const K = {
  students:  `${NS}.students.v1`,
  settings:  `${NS}.settings.v1`,
  archives:  `${NS}.import_archives.v1`,
  audit:     `${NS}.audit_log.v1`,
  seeded:    `${NS}.seeded.v1`,
  gallery:   `${NS}.gallery.v1`,
};

export type Student = {
  id: number;
  nisn: string;
  name: string;
  birth_place: string;
  birth_date: string;            // YYYY-MM-DD
  class: string;
  major: string;
  status_graduation: 0 | 1;
  viewed_at: string | null;      // ISO timestamp when first opened by the public form
  created_at: string;
  updated_at: string;
};

export type Settings = {
  announcement_date: string;
  announcement_time: string;
  maintenance_mode: boolean;
  headline: string;                  // landing-page headline (dynamic, admin-editable)
  school_name: string;
  school_npsn: string;
  school_address: string;
  principal_name: string;
  school_logo: string | null;        // base64 data URL OR relative path
  principal_photo: string | null;    // base64 data URL OR relative path
  motivation_message: string;
};

export type ImportArchive = {
  id: number;
  filename: string;
  imported: number;
  failed: number;
  total_after: number;
  created_at: string;             // ISO
  errors: string[];
  /** Compact snapshot so a future "restore" can repopulate the table. */
  snapshot: Student[];
};

export type AuditEntry = {
  id: number;
  at: string;
  actor: 'admin' | 'public' | 'system';
  action: string;
  target?: string | number;
  meta?: Record<string, unknown>;
};

/**
 * Gallery photo — used by the public landing's "Momen & Kegiatan SKANSAGIRI"
 * marquee. Every image is processed client-side (canvas crop to exactly 600x400)
 * before being stored as a base64 data URL so the marquee keeps a perfectly
 * uniform aspect ratio without any backend image-processing dependency.
 */
export type GalleryItem = {
  id: number;
  /** base64 data URL OR a backend-served absolute/relative path. */
  image_path: string;
  title: string;
  created_at: string;
};

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — silently drop */
  }
}

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ *
 *  Audit log
 * ------------------------------------------------------------------ */

export const audit = {
  list(): AuditEntry[] {
    return readJSON<AuditEntry[]>(K.audit, []);
  },
  log(entry: Omit<AuditEntry, 'id' | 'at'>): AuditEntry {
    const all = audit.list();
    const next: AuditEntry = {
      id: (all[0]?.id ?? 0) + 1,
      at: nowIso(),
      ...entry,
    };
    // newest first, cap at 200 entries
    const trimmed = [next, ...all].slice(0, 200);
    writeJSON(K.audit, trimmed);
    return next;
  },
  clear(): void {
    writeJSON(K.audit, []);
  },
};

/* ------------------------------------------------------------------ *
 *  Settings
 * ------------------------------------------------------------------ */

/**
 * Realwork Mode — production defaults.
 *
 * Only the basic school identity (name) and an empty logo slot are kept.
 * Every other field starts blank so the admin must enter real, current data
 * from the Pengaturan tab before the portal is operational.
 */
const DEFAULT_SETTINGS: Settings = {
  announcement_date: '',
  announcement_time: '',
  maintenance_mode: false,
  headline: '',
  school_name: 'SMKN 1 Wonogiri',
  school_npsn: '',
  school_address: '',
  principal_name: '',
  school_logo: null,
  principal_photo: null,
  motivation_message: '',
};

export const settingsStore = {
  get(): Settings {
    return { ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(K.settings, {}) };
  },
  patch(patch: Partial<Settings>): Settings {
    const current = settingsStore.get();
    const next = { ...current, ...patch };
    writeJSON(K.settings, next);
    audit.log({ actor: 'admin', action: 'settings.update', meta: { keys: Object.keys(patch) } });
    return next;
  },
  reset(): Settings {
    writeJSON(K.settings, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  },
};

/* ------------------------------------------------------------------ *
 *  Students CRUD
 * ------------------------------------------------------------------ */

/**
 * Realwork Mode — no dummy seed.
 *
 * The students table starts empty in production. Real data is loaded by the
 * admin via the Import Center (Excel upload). Any pre-existing local seed
 * from earlier dev/demo runs is purged automatically on first boot below.
 */
const SEED_STUDENTS: Omit<Student, 'id' | 'viewed_at' | 'created_at' | 'updated_at'>[] = [];

function seedIfEmpty(): void {
  if (!isBrowser) return;
  // One-time purge: if the legacy seed flag is still set, wipe any leftover
  // dummy records from earlier builds so the live portal starts clean.
  const purgeFlag = `${NS}.realwork_purged.v1`;
  if (window.localStorage.getItem(purgeFlag) !== '1') {
    window.localStorage.removeItem(K.students);
    window.localStorage.removeItem(K.seeded);
    window.localStorage.setItem(purgeFlag, '1');
    audit.log({ actor: 'system', action: 'students.realwork_purge' });
  }
  // Mark as "seeded" so subsequent loads skip this block entirely.
  if (window.localStorage.getItem(K.seeded) !== '1') {
    window.localStorage.setItem(K.seeded, '1');
  }
}

export const studentStore = {
  list(search = ''): Student[] {
    seedIfEmpty();
    const all = readJSON<Student[]>(K.students, []);
    if (!search) return all;
    const q = search.trim().toLowerCase();
    return all.filter((s) =>
      s.nisn.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.class.toLowerCase().includes(q) ||
      s.major.toLowerCase().includes(q),
    );
  },

  findByCredentials(nisn: string, birth_date: string): Student | null {
    seedIfEmpty();
    const all = readJSON<Student[]>(K.students, []);
    const match = all.find(
      (s) => s.nisn.trim() === nisn.trim() && s.birth_date === birth_date,
    );
    if (!match) return null;
    // Mark as viewed (one-time)
    if (!match.viewed_at) {
      match.viewed_at = nowIso();
      const next = all.map((s) => (s.id === match.id ? match : s));
      writeJSON(K.students, next);
      audit.log({ actor: 'public', action: 'student.viewed', target: match.nisn });
    }
    return match;
  },

  update(id: number, patch: Partial<Student>): Student | null {
    seedIfEmpty();
    const all = readJSON<Student[]>(K.students, []);
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated: Student = {
      ...all[idx],
      ...patch,
      id: all[idx].id,
      status_graduation: ((patch.status_graduation ?? all[idx].status_graduation) ? 1 : 0) as 0 | 1,
      updated_at: nowIso(),
    };
    all[idx] = updated;
    writeJSON(K.students, all);
    audit.log({ actor: 'admin', action: 'student.update', target: updated.nisn });
    return updated;
  },

  remove(id: number): boolean {
    const all = readJSON<Student[]>(K.students, []);
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) return false;
    writeJSON(K.students, next);
    audit.log({ actor: 'admin', action: 'student.remove', target: id });
    return true;
  },

  /**
   * Bulk delete by IDs — used by the "Hapus Terpilih" action in the Data
   * Siswa tab. Returns the actual count of records removed (so the toast
   * can say "Berhasil menghapus 12 siswa." even when some IDs were already
   * gone). Safe to call with an empty array.
   */
  bulkRemove(ids: number[]): number {
    if (!ids?.length) return 0;
    const idSet = new Set(ids);
    const all = readJSON<Student[]>(K.students, []);
    const next = all.filter((s) => !idSet.has(s.id));
    const removed = all.length - next.length;
    if (removed > 0) {
      writeJSON(K.students, next);
      audit.log({
        actor: 'admin',
        action: 'student.bulk_remove',
        meta: { ids, removed },
      });
    }
    return removed;
  },

  /**
   * Bulk update of `status_graduation` for many students at once — used by
   * the "Tandai Lulus / Belum Lulus" buttons in the bulk-action toolbar.
   * Returns the count of records actually updated.
   */
  bulkSetStatus(ids: number[], status: 0 | 1): number {
    if (!ids?.length) return 0;
    const idSet = new Set(ids);
    const all = readJSON<Student[]>(K.students, []);
    let updated = 0;
    const next = all.map((s) => {
      if (!idSet.has(s.id)) return s;
      if (s.status_graduation === status) return s;
      updated++;
      return { ...s, status_graduation: status, updated_at: nowIso() } as Student;
    });
    if (updated > 0) {
      writeJSON(K.students, next);
      audit.log({
        actor: 'admin',
        action: 'student.bulk_set_status',
        meta: { ids, status, updated },
      });
    }
    return updated;
  },

  /**
   * Bulk upsert from an Excel import. Rows whose NISN already exists are
   * updated in-place; new NISNs are appended. Returns counts + a snapshot
   * suitable for stashing in the import archive.
   */
  bulkUpsert(rows: Array<Partial<Student> & { nisn?: string; name?: string }>): {
    imported: number;
    failed: number;
    errors: string[];
    snapshot: Student[];
  } {
    seedIfEmpty();
    const all = readJSON<Student[]>(K.students, []);
    const byNisn = new Map(all.map((s) => [s.nisn, s]));
    let nextId = (all.reduce((max, s) => Math.max(max, s.id), 0) || 0) + 1;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    rows.forEach((row, i) => {
      const nisn = String(row.nisn ?? '').trim();
      const name = String(row.name ?? '').trim();
      if (!nisn || !name) {
        failed++;
        errors.push(`Baris ${i + 2}: NISN / Nama wajib diisi.`);
        return;
      }
      const status = Number(row.status_graduation ?? (row as any).status ?? 0) ? 1 : 0;
      const existing = byNisn.get(nisn);
      if (existing) {
        const merged: Student = {
          ...existing,
          name,
          birth_place: String(row.birth_place ?? existing.birth_place ?? '').trim(),
          birth_date:  normaliseDate(row.birth_date) ?? existing.birth_date,
          class:       String(row.class ?? existing.class ?? '').trim(),
          major:       String(row.major ?? existing.major ?? '').trim(),
          status_graduation: status as 0 | 1,
          updated_at: nowIso(),
        };
        byNisn.set(nisn, merged);
      } else {
        const created: Student = {
          id: nextId++,
          nisn,
          name,
          birth_place: String(row.birth_place ?? '').trim(),
          birth_date:  normaliseDate(row.birth_date) ?? '',
          class:       String(row.class ?? '').trim(),
          major:       String(row.major ?? '').trim(),
          status_graduation: status as 0 | 1,
          viewed_at: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        byNisn.set(nisn, created);
      }
      imported++;
    });

    const snapshot = Array.from(byNisn.values());
    writeJSON(K.students, snapshot);
    audit.log({ actor: 'admin', action: 'students.import', meta: { imported, failed } });

    return { imported, failed, errors, snapshot };
  },

  resetTracking(id?: number): void {
    const all = readJSON<Student[]>(K.students, []);
    const next = all.map((s) =>
      id == null || s.id === id ? { ...s, viewed_at: null, updated_at: nowIso() } : s,
    );
    writeJSON(K.students, next);
    audit.log({ actor: 'admin', action: 'students.reset_tracking', target: id ?? 'all' });
  },

  stats(): { total: number; lulus: number; tidakLulus: number; checked: number } {
    const all = studentStore.list();
    return {
      total: all.length,
      lulus: all.filter((s) => s.status_graduation === 1).length,
      tidakLulus: all.filter((s) => s.status_graduation === 0).length,
      checked: all.filter((s) => s.viewed_at).length,
    };
  },

  clear(): void {
    writeJSON(K.students, []);
    if (isBrowser) window.localStorage.removeItem(K.seeded);
    audit.log({ actor: 'admin', action: 'students.clear' });
  },

  /**
   * Realwork-grade purge — wipes the students table, clears every import
   * archive snapshot (otherwise a "Restore" would re-introduce dummy rows),
   * and asserts the realwork purge flag so the seed-if-empty bootstrap can
   * never accidentally re-seed demo records on the next page load.
   *
   * Returns the count of records that were removed so the UI can surface a
   * concrete confirmation message ("Berhasil menghapus 124 siswa.").
   */
  purgeAll(): { removed: number; archivesRemoved: number } {
    const before = readJSON<Student[]>(K.students, []);
    const archivesBefore = readJSON<ImportArchive[]>(K.archives, []);
    writeJSON(K.students, []);
    writeJSON(K.archives, []);
    if (isBrowser) {
      window.localStorage.setItem(`${NS}.realwork_purged.v1`, '1');
      window.localStorage.setItem(K.seeded, '1');
    }
    audit.log({
      actor: 'admin',
      action: 'students.purge_all',
      meta: { removed: before.length, archives_removed: archivesBefore.length },
    });
    return { removed: before.length, archivesRemoved: archivesBefore.length };
  },
};

/* ------------------------------------------------------------------ *
 *  Import archives
 * ------------------------------------------------------------------ */

export const archiveStore = {
  list(): ImportArchive[] {
    return readJSON<ImportArchive[]>(K.archives, []);
  },
  add(entry: Omit<ImportArchive, 'id' | 'created_at'>): ImportArchive {
    const all = archiveStore.list();
    const next: ImportArchive = {
      ...entry,
      id: (all[0]?.id ?? 0) + 1,
      created_at: nowIso(),
    };
    // newest first, cap at 20 archives
    writeJSON(K.archives, [next, ...all].slice(0, 20));
    return next;
  },
  remove(id: number): void {
    writeJSON(K.archives, archiveStore.list().filter((a) => a.id !== id));
    audit.log({ actor: 'admin', action: 'archive.remove', target: id });
  },
  restore(id: number): boolean {
    const target = archiveStore.list().find((a) => a.id === id);
    if (!target) return false;
    writeJSON(K.students, target.snapshot);
    audit.log({ actor: 'admin', action: 'archive.restore', target: id });
    return true;
  },
  clearAll(): void {
    writeJSON(K.archives, []);
  },
};

/* ------------------------------------------------------------------ *
 *  Gallery — landing-page marquee photos
 * ------------------------------------------------------------------ */

/**
 * Realwork Mode: ships empty. The admin uploads real photos from
 * Pengaturan → Galeri Sekolah; the public landing then renders an empty-state
 * placeholder ("Gallery SMKN 1 Wonogiri") until at least one item exists.
 */
export const galleryStore = {
  list(): GalleryItem[] {
    return readJSON<GalleryItem[]>(K.gallery, []);
  },
  add(input: { image_path: string; title?: string }): GalleryItem {
    const all = galleryStore.list();
    const next: GalleryItem = {
      id: (all[0]?.id ?? 0) + 1,
      image_path: input.image_path,
      title: (input.title ?? '').trim(),
      created_at: nowIso(),
    };
    // Newest first, hard cap at 30 items (≈ 30 × ~120 KB JPEG = ~3.6 MB,
    // safely under the localStorage quota on every modern browser).
    writeJSON(K.gallery, [next, ...all].slice(0, 30));
    audit.log({ actor: 'admin', action: 'gallery.add', target: next.id });
    return next;
  },
  remove(id: number): void {
    writeJSON(K.gallery, galleryStore.list().filter((g) => g.id !== id));
    audit.log({ actor: 'admin', action: 'gallery.remove', target: id });
  },
  clear(): void {
    writeJSON(K.gallery, []);
    audit.log({ actor: 'admin', action: 'gallery.clear' });
  },
};

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

/**
 * Try to coerce whatever the Excel cell sent us into a strict YYYY-MM-DD.
 * Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, JS Date, Excel serial number,
 * and the long Indonesian form ("26 Mei 2008").
 */
function normaliseDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial: days since 1899-12-30
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const months = [
    'januari','februari','maret','april','mei','juni',
    'juli','agustus','september','oktober','november','desember',
  ];
  const long = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (long) {
    const [, d, mName, y] = long;
    const m = months.indexOf(mName.toLowerCase()) + 1;
    if (m > 0) return `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/* ------------------------------------------------------------------ *
 *  apiCall — the single entry point the UI uses
 * ------------------------------------------------------------------ */

/**
 * Resolve a URL against the **current window origin** so the SPA stays
 * domain-agnostic — the same build works on Replit, on any cPanel host, or
 * behind a custom domain without source edits. Absolute URLs (http://, https://,
 * //…) are returned unchanged so the helper never overrides explicit hosts.
 */
export function resolveApiUrl(path: string): string {
  if (/^(https?:)?\/\//i.test(path)) return path;
  if (!isBrowser) return path;
  const origin = window.location.origin.replace(/\/+$/, '');
  return origin + (path.startsWith('/') ? path : '/' + path);
}

/**
 * MODE ONLINE TOTAL — security/operational requirement.
 *
 * When `ONLINE_ONLY` is `true`, the localStorage fallback is **disabled**:
 * the SPA only accepts data from the backend API. If the API is unreachable
 * the call resolves to `{ success: false }` and the UI surfaces an error
 * instead of silently writing to localStorage. This is what makes the
 * "Status Backend" health card flip to **Terhubung (Online)** — the call to
 * `/api/deploy/health` now reaches the real Express backend, so
 * `_fromLocal === false` is the steady state.
 *
 * Flip this back to `false` if you ever want to re-enable the offline-first
 * cPanel fallback path that the original Realwork build shipped with.
 */
const ONLINE_ONLY = true;

export async function apiCall<T = any>(
  url: string,
  init: RequestInit = {},
  localFallback?: () => { success: boolean; data?: T; message?: string },
): Promise<{ success: boolean; data?: T; message?: string; _fromLocal?: boolean }> {
  try {
    const resp = await fetch(resolveApiUrl(url), init);
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) throw new Error('non-json');
    const json = await resp.json();
    if (!resp.ok) throw Object.assign(new Error('api'), { json });
    return { ...json, _fromLocal: false };
  } catch (err: any) {
    // If the API responded with a structured JSON error, surface that message
    // directly — this is a server-side validation/business error, NOT a
    // connectivity failure, so the backend is reachable (`_fromLocal: false`).
    if (err?.json) {
      return { ...(err.json as object), _fromLocal: false };
    }
    if (ONLINE_ONLY || !localFallback) {
      // True network failure — backend is unreachable. Mark `_fromLocal: true`
      // so the health card honestly reports "Tidak Terhubung" instead of
      // misleadingly showing "Online".
      return {
        success: false,
        message: 'Backend tidak dapat dihubungi. Pastikan server sedang berjalan.',
        _fromLocal: true,
      };
    }
    const local = localFallback();
    return { ...local, _fromLocal: true };
  }
}

/** Quick utility — figure out how much localStorage we're using (KB). */
export function localStoreFootprint(): { keys: { key: string; size: number }[]; totalKB: number } {
  if (!isBrowser) return { keys: [], totalKB: 0 };
  const keys: { key: string; size: number }[] = [];
  let total = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)!;
    if (!k.startsWith(NS)) continue;
    const v = window.localStorage.getItem(k) ?? '';
    const size = (k.length + v.length) * 2; // UTF-16
    keys.push({ key: k, size });
    total += size;
  }
  return { keys, totalKB: Math.round((total / 1024) * 10) / 10 };
}

/** Wipe every namespaced key — used by the "factory reset" button. */
export function clearAllLocal(): void {
  if (!isBrowser) return;
  const toDel: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)!;
    if (k.startsWith(NS)) toDel.push(k);
  }
  toDel.forEach((k) => window.localStorage.removeItem(k));
}

/** Export all local state as a single JSON blob (download / share / backup). */
export function exportLocalSnapshot(): string {
  return JSON.stringify(
    {
      exported_at: nowIso(),
      students: studentStore.list(),
      settings: settingsStore.get(),
      archives: archiveStore.list(),
      gallery: galleryStore.list(),
      audit: audit.list(),
    },
    null,
    2,
  );
}
