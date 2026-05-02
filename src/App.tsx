/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, GraduationCap, CheckCircle, XCircle, FileText, User, Calendar, BookOpen, Building2, LayoutDashboard, Database, Settings, LogOut, ArrowRight, TrendingUp, Download, Lock, ShieldCheck, Activity, Sparkles, Quote, AlertTriangle, Info, Megaphone, ServerCog, RefreshCw, HardDrive, Archive, FileSpreadsheet, RotateCcw, Trash2, Shield, Save, Heart, Wifi, History, Share2, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import * as XLSX from 'xlsx';
import {
  apiCall,
  studentStore,
  settingsStore,
  archiveStore,
  galleryStore,
  audit as auditLog,
  localStoreFootprint,
  clearAllLocal,
  exportLocalSnapshot,
  type ImportArchive,
  type AuditEntry,
  type GalleryItem,
} from './lib/localStore';

// Mock Data + Admin Stats
const MOCK_STATS = {
  total: 450,
  lulus: 442,
  tidakLulus: 8,
  checked: 312
};

const CHART_DATA = [
  { name: 'Lulus', value: MOCK_STATS.lulus, color: '#10b981' },
  { name: 'Belum Lulus', value: MOCK_STATS.tidakLulus, color: '#ef4444' },
];

const ID_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Format an ISO date (YYYY-MM-DD) as "26 Mei 2008". */
const formatBirthDate = (iso?: string | null): string => {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${ID_MONTHS[m - 1] ?? m} ${y}`;
};

/**
 * Resolve a stored asset path into a fully-qualified URL that works on **any**
 * domain the app is deployed to (Replit, cPanel, custom domain, …).
 *
 * Backend may return either:
 *   • an absolute URL  → `https://example.com/storage/branding/logo.png`
 *     (e.g. when the API uses `Storage::disk('public')->url(...)` /
 *     `asset('storage/...')`).
 *   • a raw relative path → `branding/logo.png`
 *   • a data URL preview  → `data:image/png;base64,…`
 *
 * In all cases this returns something the browser can render without manual
 * domain configuration.
 */
const resolveAssetUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  // Already absolute (http, https, protocol-relative) or inline data URL → use as-is
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  // Already rooted at /storage → use as-is
  if (value.startsWith('/storage/')) return value;
  // Otherwise treat as relative storage path → prepend /storage/
  return `/storage/${value.replace(/^\/+/, '')}`;
};

/** "Wonogiri, 26 Mei 2008" */
const formatInlineBirth = (place?: string | null, iso?: string | null): string => {
  const p = (place ?? '').trim();
  const dateStr = iso ? formatBirthDate(iso) : '';
  if (!p && !dateStr) return '-';
  if (!p) return dateStr;
  if (!dateStr) return p;
  return `${p}, ${dateStr}`;
};

/**
 * Generate the official student-import .xlsx template and trigger a download.
 *
 * Schema follows the StudentImport rules in laravel/app/Imports/StudentImport.php.
 * The 2 sample rows demonstrate the supported date formats:
 *   - YYYY-MM-DD          ("2008-05-26")
 *   - DD/MM/YYYY          ("20/08/2008")
 * The Carbon-based importer also accepts Excel serial numbers automatically
 * if the cell is formatted as a real date in Excel.
 */
const TEMPLATE_HEADERS = [
  'nisn',
  'name',
  'birth_place',
  'birth_date',
  'class',
  'major',
  'status',
] as const;

const TEMPLATE_SAMPLE_ROWS = [
  {
    nisn: '1234567890',
    name: 'Ahmad Saeful',
    birth_place: 'Wonogiri',
    birth_date: '2008-05-26',
    class: 'XII RPL 1',
    major: 'Rekayasa Perangkat Lunak',
    status: 1,
  },
  {
    nisn: '0987654321',
    name: 'Siti Rahmawati',
    birth_place: 'Sukoharjo',
    birth_date: '20/08/2008',
    class: 'XII TKJ 2',
    major: 'Teknik Komputer & Jaringan',
    status: 0,
  },
];

const downloadStudentTemplate = (): void => {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Data Siswa (the actual import sheet) ---
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS, {
    header: TEMPLATE_HEADERS as unknown as string[],
  });

  // Friendly column widths
  ws['!cols'] = [
    { wch: 14 }, // nisn
    { wch: 28 }, // name
    { wch: 18 }, // birth_place
    { wch: 14 }, // birth_date
    { wch: 14 }, // class
    { wch: 32 }, // major
    { wch: 8 },  // status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');

  // --- Sheet 2: Petunjuk (human-readable instructions) ---
  const instructions = [
    ['PETUNJUK PENGISIAN — Template Import Siswa SMKN 1 Wonogiri 2026'],
    [],
    ['Kolom Wajib', 'Keterangan'],
    ['nisn', 'Nomor Induk Siswa Nasional (10 digit, unik).'],
    ['name', 'Nama lengkap siswa (huruf kapital direkomendasikan).'],
    ['birth_place', 'Kota / Kabupaten kelahiran (contoh: Wonogiri).'],
    [
      'birth_date',
      'Format yang didukung: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, "26 Mei 2008", atau format tanggal Excel.',
    ],
    ['class', 'Kelas siswa (contoh: XII RPL 1).'],
    ['major', 'Konsentrasi Keahlian (contoh: Rekayasa Perangkat Lunak).'],
    ['status', '1 = LULUS, 0 = BELUM LULUS.'],
    [],
    ['Catatan:'],
    ['• Baris 1 (header) wajib persis seperti pada sheet "Data Siswa".'],
    ['• Data siswa baru dimulai dari baris 2.'],
    ['• Hapus baris contoh sebelum mengunggah file.'],
    ['• Disusun oleh TIM IT Skansagiri — Powered by Dave_Exe.'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  wsInfo['!cols'] = [{ wch: 18 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Petunjuk');

  XLSX.writeFile(wb, 'template_import_siswa_skansagiri_2026.xlsx', {
    bookType: 'xlsx',
  });
};

/**
 * Realwork Mode — type-only descriptor of a student result row.
 *
 * Replaces the previous MOCK_STUDENTS array (which held two fictional
 * records) with a pure TypeScript type. The shape is the same, so existing
 * `typeof MOCK_STUDENTS[0]` references remain compatible without shipping
 * any dummy data in the production bundle.
 */
type StudentResult = {
  id: number;
  nisn: string;
  name: string;
  birth_place: string;
  birth_date: string;
  class: string;
  major: string;
  status_graduation: boolean | 0 | 1;
  grades?: { subject: string; score: number }[];
};
const MOCK_STUDENTS: StudentResult[] = [];

/* ------------------------------------------------------------------ *
 *  Hardcoded Built-in Administrator (Read-Only — bypasses DB lookup)
 * ------------------------------------------------------------------
 *  These credentials are intentionally permanent. The login flow
 *  short-circuits any database / API user lookup when the username
 *  matches `ADMIN_USER` and the password matches `ADMIN_PASS`. The
 *  account cannot be edited or deleted from the UI.
 *
 *  When a Laravel backend is wired up, mirror this exact check at the
 *  top of the LoginController before falling through to the users
 *  table — so the same credential pair always works regardless of the
 *  database state.
 */
const ADMIN_USER = 'jobenapp';
const ADMIN_PASS = '081460081343';
const ADMIN_AUTH_KEY = 'skansagiri.adminAuth.v1';

/** Path constants — keep both the URL and the SPA view in sync. */
const ROUTE_PUBLIC = '/';
const ROUTE_LOGIN = '/panel-admin';
const ROUTE_DASHBOARD = '/panel-admin/dashboard';

function pathToView(pathname: string, isAuthed: boolean): 'public' | 'login' | 'admin' {
  if (pathname.startsWith(ROUTE_DASHBOARD)) return isAuthed ? 'admin' : 'login';
  if (pathname.startsWith(ROUTE_LOGIN)) return isAuthed ? 'admin' : 'login';
  return 'public';
}

function navigateTo(pathname: string) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== pathname) {
    window.history.pushState({}, '', pathname);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  // Authentication state — sessionStorage so closing the tab logs out.
  const [isAuthed, setIsAuthed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.sessionStorage.getItem(ADMIN_AUTH_KEY) === '1'; } catch { return false; }
  });

  const [view, setView] = useState<'public' | 'login' | 'admin'>(() => {
    if (typeof window === 'undefined') return 'public';
    const initialAuthed = (() => {
      try { return window.sessionStorage.getItem(ADMIN_AUTH_KEY) === '1'; } catch { return false; }
    })();
    return pathToView(window.location.pathname, initialAuthed);
  });

  // Login form state
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginShowPass, setLoginShowPass] = useState(false);

  // Keep the SPA view in sync with browser back/forward navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setView(pathToView(window.location.pathname, isAuthed));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [isAuthed]);

  const handleAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    // Tiny artificial delay so the user perceives the validation work.
    await new Promise((r) => setTimeout(r, 280));
    if (loginUser.trim() === ADMIN_USER && loginPass === ADMIN_PASS) {
      try { window.sessionStorage.setItem(ADMIN_AUTH_KEY, '1'); } catch { /* noop */ }
      auditLog.log({ actor: 'admin', action: 'login', meta: { user: ADMIN_USER } });
      setIsAuthed(true);
      setLoginUser('');
      setLoginPass('');
      setLoginBusy(false);
      navigateTo(ROUTE_DASHBOARD);
      return;
    }
    auditLog.log({ actor: 'admin', action: 'login.failed', meta: { user: loginUser.trim() || '(empty)' } });
    setLoginBusy(false);
    setLoginError('Username atau password salah. Akun bawaan bersifat permanen — hubungi pengembang jika lupa.');
  };

  const handleAdminLogout = () => {
    try { window.sessionStorage.removeItem(ADMIN_AUTH_KEY); } catch { /* noop */ }
    auditLog.log({ actor: 'admin', action: 'logout' });
    setIsAuthed(false);
    navigateTo(ROUTE_PUBLIC);
  };

  const [adminTab, setAdminTab] = useState<'overview' | 'students' | 'import' | 'settings' | 'maintenance'>('overview');

  // Banner shown across the admin app whenever a request fell back to localStorage.
  const [offlineMode, setOfflineMode] = useState(false);
  // Toast: { type, msg } — single-line ephemeral notifier replacing native alert()
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 3500);
  };

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [result, setResult] = useState<typeof MOCK_STUDENTS[0] | null>(null);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Admin Configuration State
  const [announcementDate, setAnnouncementDate] = useState("2026-05-15");
  const [announcementTime, setAnnouncementTime] = useState("16:00");
  const [schoolName, setSchoolName] = useState("SMKN 1 Wonogiri");
  const [schoolNpsn, setSchoolNpsn] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [principalName, setPrincipalName] = useState("");
  // Realwork Mode: editable landing headline. Empty = use the auto-built
  // fallback ("Portal Kelulusan Online <school_name> TA 2025/2026").
  const [headline, setHeadline] = useState("");
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Principal photo + motivational message (Manajemen Konten)
  const [principalPhoto, setPrincipalPhoto] = useState<string | null>(null);
  const [principalPhotoFile, setPrincipalPhotoFile] = useState<File | null>(null);
  const [principalPhotoPreview, setPrincipalPhotoPreview] = useState<string | null>(null);
  // Realwork Mode: starts empty so the landing page hides the "Sambutan
  // Kepala Sekolah" section until an admin enters a real message in the
  // Pengaturan tab. Conditional rendering downstream relies on this.
  const [motivationMessage, setMotivationMessage] = useState<string>("");

  // Gallery — landing-page "Momen & Kegiatan SKANSAGIRI" marquee.
  // The image_path on every row is either a base64 data URL (localStore
  // fallback) or an absolute /storage/... URL coming from the Laravel API.
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);

  // Public Identity State
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isReady, setIsReady] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [justOpened, setJustOpened] = useState(false);
  const prevReadyRef = React.useRef(false);

  // Integrity Pact (Pakta Integritas) State
  const INTEGRITY_PACT_KEY = 'skansagiri.integrityPact.agreed.v1';
  const [showIntegrityPact, setShowIntegrityPact] = useState(false);
  const [pactChecked, setPactChecked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const agreed = window.localStorage.getItem(INTEGRITY_PACT_KEY) === '1';
      if (!agreed) setShowIntegrityPact(true);
    } catch {
      setShowIntegrityPact(true);
    }
  }, []);


  // Lock body scroll while pact modal is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (showIntegrityPact) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showIntegrityPact]);

  const handleAcceptIntegrityPact = () => {
    if (!pactChecked) return;
    try {
      window.localStorage.setItem(INTEGRITY_PACT_KEY, '1');
    } catch {
      /* noop — modal will simply re-show next session */
    }
    setShowIntegrityPact(false);
  };

  // Fetch Public Info — falls back to local store when the API is unreachable.
  const fetchPublicInfo = async () => {
    const json = await apiCall<any>('/api/school-info', {}, () => {
      const s = settingsStore.get();
      const target = new Date(`${s.announcement_date}T${s.announcement_time}:00`).getTime();
      return {
        success: true,
        data: {
          headline: s.headline,
          school_name: s.school_name,
          school_npsn: s.school_npsn,
          school_address: s.school_address,
          school_logo: s.school_logo,
          principal_name: s.principal_name,
          principal_photo: s.principal_photo,
          motivation_message: s.motivation_message,
          maintenance_mode: s.maintenance_mode,
          announcement_datetime: new Date(target).toISOString(),
          announcement_active: !s.maintenance_mode && Date.now() >= target,
        },
      };
    });
    if (json._fromLocal) setOfflineMode(true);
    if (json.success && json.data) {
      setSchoolInfo(json.data);
      setMaintenanceMode(!!json.data.maintenance_mode);
      setShowUnduhSkl(!!json.data.show_unduh_skl);
      setIsReady(!!json.data.announcement_active);
      if (json.data.principal_photo) setPrincipalPhoto(json.data.principal_photo);
      if (typeof json.data.motivation_message === 'string' && json.data.motivation_message.trim() !== '') {
        setMotivationMessage(json.data.motivation_message);
      }
    }
    setIsBootstrapping(false);
  };

  /**
   * Fetch the gallery items (used by both the public landing marquee and the
   * admin "Galeri Sekolah" panel). Falls back to `galleryStore` when the
   * Laravel API is unreachable.
   */
  const fetchGallery = async () => {
    const json = await apiCall<GalleryItem[]>('/api/galleries', {}, () => ({
      success: true,
      data: galleryStore.list(),
    }));
    if (json.success && Array.isArray(json.data)) {
      setGalleryItems(json.data);
    }
  };

  // Countdown Interval Logic
  useEffect(() => {
    if (!schoolInfo?.announcement_datetime) return;

    const targetDate = new Date(schoolInfo.announcement_datetime).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance < 0) {
        setIsReady(true);
        clearInterval(interval);
        return;
      }

      setCountdown({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
      setIsReady(false);
    }, 1000);

    return () => clearInterval(interval);
  }, [schoolInfo]);

  // Fire a one-time celebratory pulse the instant the countdown unlocks the form
  useEffect(() => {
    if (isReady && !prevReadyRef.current) {
      setJustOpened(true);
      const t = setTimeout(() => setJustOpened(false), 2200);
      prevReadyRef.current = true;
      return () => clearTimeout(t);
    }
    prevReadyRef.current = isReady;
  }, [isReady]);

  useEffect(() => {
    fetchPublicInfo();
  }, []);

  useEffect(() => {
    if (result && result.status_graduation) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        // since particles fall down, start a bit higher than random
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
      
      return () => clearInterval(interval);
    }
  }, [result]);

  // Admin Data State
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [statsData, setStatsData] = useState(MOCK_STATS);
  const [isLoading, setIsLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [editStudent, setEditStudent] = useState<any | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [showUnduhSkl, setShowUnduhSkl] = useState(false);

  // Bulk-action selection for the Data Siswa table — tracked as an id Set
  // so checking and unchecking individual rows is O(1). The selection is
  // intentionally cleared whenever the underlying student list refreshes
  // (after a delete / bulk update / search) so stale ids never linger.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Maintenance tab state
  const [deployToken, setDeployToken] = useState<string>("");
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployResult, setDeployResult] = useState<any | null>(null);
  const [healthInfo, setHealthInfo] = useState<any | null>(null);
  const [archives, setArchives] = useState<ImportArchive[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [storageFootprint, setStorageFootprint] = useState<{ keys: { key: string; size: number }[]; totalKB: number }>({ keys: [], totalKB: 0 });

  // Reusable confirmation modal — replaces native window.confirm() across
  // every destructive action so the UX is on-brand, keyboard-accessible, and
  // (for "danger" actions) can require the operator to type a confirmation
  // phrase before the button activates.
  type ConfirmRequest = {
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    requirePhrase?: string;            // if set, user must type this exact text
    onConfirm: () => void | Promise<void>;
  };
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const askConfirm = (req: ConfirmRequest) => {
    setConfirmInput("");
    setConfirmBusy(false);
    setConfirmRequest(req);
  };
  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmRequest(null);
    setConfirmInput("");
  };
  const runConfirm = async () => {
    if (!confirmRequest) return;
    if (confirmRequest.requirePhrase && confirmInput !== confirmRequest.requirePhrase) return;
    try {
      setConfirmBusy(true);
      await confirmRequest.onConfirm();
    } finally {
      setConfirmBusy(false);
      setConfirmRequest(null);
      setConfirmInput("");
    }
  };

  // Import center state — drives feedback under the dropzone
  const [importStatus, setImportStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'busy'; filename: string }
    | { kind: 'done'; filename: string; imported: number; failed: number; errors: string[] }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  // Fetch Dashboard Stats — local-first stats so the chart always reflects truth.
  const fetchStats = async () => {
    const json = await apiCall<any>('/api/admin/stats', {}, () => ({
      success: true,
      data: studentStore.stats(),
    }));
    if (json._fromLocal) setOfflineMode(true);
    if (json.success && json.data) setStatsData(json.data);
  };

  // Fetch Students List — local-first paginated list.
  const fetchStudents = async (query = "") => {
    setIsLoading(true);
    const json = await apiCall<any>(`/api/admin/students?search=${encodeURIComponent(query)}`, {}, () => ({
      success: true,
      data: { data: studentStore.list(query) },
    }));
    if (json._fromLocal) setOfflineMode(true);
    if (json.success && json.data) {
      const list = Array.isArray(json.data?.data) ? json.data.data : (Array.isArray(json.data) ? json.data : []);
      setStudentsData(list);
      // Drop any selected ids that no longer appear in the refreshed list,
      // so a stale selection cannot bleed into a subsequent bulk action.
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const present = new Set(list.map((s: any) => s.id));
        const next = new Set<number>();
        prev.forEach((id) => { if (present.has(id)) next.add(id); });
        return next;
      });
    }
    setIsLoading(false);
  };

  // Settings — local-first.
  const fetchSettings = async () => {
    const json = await apiCall<any>('/api/admin/settings', {}, () => ({
      success: true,
      data: settingsStore.get(),
    }));
    if (json._fromLocal) setOfflineMode(true);
    if (json.success && json.data) {
      const d = json.data;
      if (d.announcement_date) setAnnouncementDate(d.announcement_date);
      if (d.announcement_time) setAnnouncementTime(d.announcement_time);
      setMaintenanceMode(!!d.maintenance_mode);
      setShowUnduhSkl(!!d.show_unduh_skl);
      if (d.school_name) setSchoolName(d.school_name);
      if (d.school_npsn) setSchoolNpsn(d.school_npsn);
      if (d.school_address) setSchoolAddress(d.school_address);
      if (d.principal_name) setPrincipalName(d.principal_name);
      if (typeof d.headline === 'string') setHeadline(d.headline);
      if (d.school_logo) setSchoolLogo(d.school_logo);
      if (d.principal_photo) setPrincipalPhoto(d.principal_photo);
      if (typeof d.motivation_message === 'string' && d.motivation_message.trim() !== '') {
        setMotivationMessage(d.motivation_message);
      }
    }
  };

  // Refresh derived maintenance-tab data
  const refreshMaintenancePanels = () => {
    setArchives(archiveStore.list());
    setAuditEntries(auditLog.list());
    setStorageFootprint(localStoreFootprint());
  };

  useEffect(() => {
    if (view === 'admin') {
      fetchStats();
      fetchStudents(adminSearch);
      fetchSettings();
      fetchGallery();
      refreshMaintenancePanels();
    }
  }, [view, adminSearch]);

  // Public landing — load gallery once on first render so the marquee is
  // ready by the time the user gets past the integrity pact modal.
  useEffect(() => {
    if (view === 'public') {
      fetchGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Handle Individual Update — apiCall, then localStore fallback.
  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;

    const json = await apiCall<any>(
      `/api/admin/students/${editStudent.id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editStudent),
      },
      () => {
        const updated = studentStore.update(editStudent.id, {
          status_graduation: editStudent.status_graduation ? 1 : 0,
        });
        return updated
          ? { success: true, data: updated, message: 'Status siswa diperbarui.' }
          : { success: false, message: 'Siswa tidak ditemukan di penyimpanan lokal.' };
      },
    );

    if (json.success) {
      showToast('success', json.message || 'Status siswa diperbarui.');
      setEditStudent(null);
      fetchStudents(adminSearch);
      fetchStats();
      refreshMaintenancePanels();
    } else {
      showToast('error', json.message || 'Gagal memperbarui siswa.');
    }
  };

  /** Read a File as a base64 data URL — used to persist images in localStorage. */
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result ?? ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });

  /**
   * Centralised pre-upload validator. Blocks anything > `maxMB` so we never
   * waste a server round-trip (or worse, hammer the canvas cropper) with a
   * 10 MB DSLR photo. Returns `true` when the file is OK, `false` otherwise
   * and emits an inline toast explaining what went wrong.
   */
  const validateImageFile = (file: File, maxMB = 2): boolean => {
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.');
      return false;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxMB) {
      showToast(
        'error',
        `Ukuran gambar ${sizeMB.toFixed(1)} MB melebihi batas ${maxMB} MB. ` +
          `Mohon kompres atau pilih foto yang lebih kecil agar proses unggah cepat.`,
      );
      return false;
    }
    // Soft warning band: 1.2 – 2 MB still passes but we let the admin know.
    if (sizeMB > 1.2) {
      showToast(
        'info',
        `Ukuran gambar ${sizeMB.toFixed(1)} MB. Proses unggah mungkin sedikit lebih lama.`,
      );
    }
    return true;
  };

  /**
   * Crop & resize an image File to **exactly** 600×400 (3:2) using a hidden
   * canvas with `object-fit: cover` semantics — same algorithm Intervention
   * Image's `cover()` / `fit()` runs server-side, so the localStore fallback
   * produces a marquee that's visually identical to the Laravel-backed one.
   * Returns a JPEG data URL (~80% quality) keeping each image well under
   * ~150 KB so the localStorage cap (5 MB) handles 30 photos comfortably.
   */
  const cropToGallerySize = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const TARGET_W = 600;
      const TARGET_H = 400;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = TARGET_W;
          canvas.height = TARGET_H;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            return reject(new Error('Canvas 2D context unavailable.'));
          }
          // White backdrop in case the source has transparency (PNG / WebP).
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, TARGET_W, TARGET_H);
          // Cover semantics — scale to fill, center-crop the overflow.
          const srcRatio = img.width / img.height;
          const dstRatio = TARGET_W / TARGET_H;
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          if (srcRatio > dstRatio) {
            // Source is wider → crop horizontal sides
            sw = Math.round(img.height * dstRatio);
            sx = Math.round((img.width - sw) / 2);
          } else if (srcRatio < dstRatio) {
            // Source is taller → crop top/bottom
            sh = Math.round(img.width / dstRatio);
            sy = Math.round((img.height - sh) / 2);
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Gambar tidak dapat dimuat.'));
      };
      img.src = url;
    });

  /** Admin — handle one or more photo uploads for the gallery marquee. */
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files: File[] = fileList ? Array.from(fileList) : [];
    if (e.target) e.target.value = '';
    if (!files.length) return;

    // Pre-flight: drop oversize / wrong-type files BEFORE we start any work
    // so the admin gets one clear "X file ditolak karena terlalu besar"
    // instead of N silent failures inside the upload loop.
    const valid: File[] = [];
    let rejected = 0;
    for (const file of files) {
      if (validateImageFile(file, 2)) valid.push(file);
      else rejected++;
    }
    if (!valid.length) {
      if (rejected) {
        showToast('error', `${rejected} file ditolak. Pastikan gambar < 2 MB.`);
      }
      return;
    }

    setGalleryUploading(true);
    let added = 0;
    let failed = rejected;

    for (const file of valid) {
      try {
        const dataUrl = await cropToGallerySize(file);
        const formData = new FormData();
        // Re-encode the cropped 600x400 JPEG back into a Blob so the Laravel
        // controller receives an already-normalised file (Intervention Image
        // will still re-cover() it as a final safety net).
        const blob = await (await fetch(dataUrl)).blob();
        formData.append('image', blob, file.name.replace(/\.[^.]+$/, '') + '.jpg');
        formData.append('title', file.name.replace(/\.[^.]+$/, ''));

        const json = await apiCall<GalleryItem>(
          '/api/admin/galleries',
          { method: 'POST', body: formData },
          () => {
            const created = galleryStore.add({
              image_path: dataUrl,
              title: file.name.replace(/\.[^.]+$/, ''),
            });
            return { success: true, data: created };
          },
        );

        if (json.success) {
          added++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    await fetchGallery();
    setGalleryUploading(false);

    if (added > 0) {
      showToast('success', `${added} foto galeri berhasil diunggah${failed ? ` (${failed} gagal)` : ''}.`);
    } else if (failed > 0) {
      showToast('error', `Gagal mengunggah ${failed} foto. Pastikan file berupa gambar valid.`);
    }
  };

  /** Admin — remove a single gallery photo. */
  const handleGalleryRemove = async (id: number) => {
    const json = await apiCall<{ id: number }>(
      `/api/admin/galleries/${id}`,
      { method: 'DELETE' },
      () => {
        galleryStore.remove(id);
        return { success: true, data: { id } };
      },
    );
    if (json.success) {
      await fetchGallery();
      showToast('success', 'Foto galeri dihapus.');
    } else {
      showToast('error', json.message || 'Gagal menghapus foto.');
    }
  };

  // Handle Excel Import — parse client-side via XLSX, archive snapshot, fall back to local store.
  const processImportFile = async (file: File) => {
    setImportStatus({ kind: 'busy', filename: file.name });
    setIsLoading(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('siswa')) ?? wb.SheetNames[0];
      if (!sheetName) throw new Error('File Excel tidak memiliki sheet apapun.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
        defval: '',
        raw: false,
      });

      // Try the real API first; on failure, fall back to local bulkUpsert.
      const formData = new FormData();
      formData.append('file', file);

      const json = await apiCall<any>(
        '/api/admin/import',
        { method: 'POST', body: formData },
        () => {
          const result = studentStore.bulkUpsert(rows as any);
          archiveStore.add({
            filename: file.name,
            imported: result.imported,
            failed: result.failed,
            total_after: result.snapshot.length,
            errors: result.errors,
            snapshot: result.snapshot,
          });
          return {
            success: true,
            data: { imported: result.imported, failed: result.failed, errors: result.errors },
            message: `${result.imported} siswa berhasil diproses${result.failed ? `, ${result.failed} gagal` : ''}.`,
          };
        },
      );

      if (json.success) {
        const d = json.data ?? {};
        setImportStatus({
          kind: 'done',
          filename: file.name,
          imported: Number(d.imported ?? rows.length),
          failed: Number(d.failed ?? 0),
          errors: Array.isArray(d.errors) ? d.errors : [],
        });
        showToast('success', json.message || 'Import selesai.');
        fetchStudents(adminSearch);
        fetchStats();
        refreshMaintenancePanels();
      } else {
        setImportStatus({ kind: 'error', message: json.message || 'Import gagal.' });
        showToast('error', json.message || 'Import gagal.');
      }
    } catch (err: any) {
      const message = err?.message || 'Gagal memproses file Excel.';
      setImportStatus({ kind: 'error', message });
      showToast('error', message);
    } finally {
      setIsLoading(false);
      setPendingImportFile(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    setImportStatus({ kind: 'idle' });
    e.target.value = ''; // allow re-selecting the same file
  };

  // Handle Settings Save
  const handleSaveSettings = async () => {
     setIsLoading(true);
     try {
       const formData = new FormData();
       formData.append('announcement_date', announcementDate);
       formData.append('announcement_time', announcementTime);
       formData.append('maintenance_mode', maintenanceMode ? '1' : '0');
       formData.append('show_unduh_skl', showUnduhSkl ? '1' : '0');
       formData.append('school_name', schoolName);
       formData.append('school_npsn', schoolNpsn);
       formData.append('school_address', schoolAddress);
       formData.append('principal_name', principalName);
       formData.append('headline', headline);

       if (logoFile) formData.append('logo', logoFile);
       if (principalPhotoFile) formData.append('principal_photo', principalPhotoFile);
       formData.append('motivation_message', motivationMessage);

       // Persist images as base64 dataURLs locally so they survive page reloads.
       const localPatch: any = {
         announcement_date: announcementDate,
         announcement_time: announcementTime,
         maintenance_mode: maintenanceMode,
         show_unduh_skl: showUnduhSkl,
         headline: headline,
         school_name: schoolName,
         school_npsn: schoolNpsn,
         school_address: schoolAddress,
         principal_name: principalName,
         motivation_message: motivationMessage,
       };
       if (logoFile) localPatch.school_logo = await fileToDataUrl(logoFile);
       if (principalPhotoFile) localPatch.principal_photo = await fileToDataUrl(principalPhotoFile);

       const json = await apiCall<any>(
         '/api/admin/settings',
         { method: 'POST', body: formData },
         () => {
           const next = settingsStore.patch(localPatch);
           return { success: true, data: next, message: 'Pengaturan disimpan secara lokal.' };
         },
       );

       if (json.success) {
         showToast('success', json.message || 'Pengaturan disimpan!');
         // After save, refresh state from authoritative source so previews + public hero update.
         if (json._fromLocal) {
           if (localPatch.school_logo) {
             setSchoolLogo(localPatch.school_logo);
             setLogoFile(null);
             setLogoPreview(null);
           }
           if (localPatch.principal_photo) {
             setPrincipalPhoto(localPatch.principal_photo);
             setPrincipalPhotoFile(null);
             setPrincipalPhotoPreview(null);
           }
         }
         fetchPublicInfo();
         fetchSettings();
         refreshMaintenancePanels();
       } else {
         showToast('error', json.message || 'Gagal menyimpan pengaturan.');
       }
     } catch (e: any) {
       showToast('error', e?.message || 'Gagal menyimpan pengaturan.');
     } finally {
       setIsLoading(false);
     }
  };

  const handleSearchClick = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setError("");
    setResult(null);

    if (maintenanceMode) {
      setTimeout(() => {
        setError("Sistem sedang dalam perawatan (Maintenance Mode). Silakan coba lagi nanti.");
        setIsSearching(false);
      }, 500);
      return;
    }

    apiCall<any>(
      '/api/check-status',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nisn: searchQuery, birth_date: birthDate }),
      },
      () => {
        const found = studentStore.findByCredentials(searchQuery, birthDate);
        return found
          ? { success: true, data: { ...found, status_graduation: !!found.status_graduation } }
          : { success: false, message: 'Data siswa tidak ditemukan. Periksa kembali NISN dan Tanggal Lahir.' };
      },
    )
      .then((json) => {
        if (json.success && json.data) {
          setResult(json.data);
        } else {
          setError(json.message || 'Data tidak ditemukan.');
        }
      })
      .finally(() => setIsSearching(false));
  };

  /* ------------------------------------------------------------------ *
   *  Share & Download — student result card
   * ------------------------------------------------------------------ */

  const handlePrintResult = () => {
    if (!result) return;
    showToast('info', 'Membuka dialog cetak — pilih "Save as PDF" untuk menyimpan SKL Digital.');
    setTimeout(() => window.print(), 250);
  };

  const handleShareWhatsApp = () => {
    if (!result) return;
    const schoolName = schoolInfo?.school_name || 'SMKN 1 Wonogiri';
    const status = result.status_graduation ? 'LULUS' : 'BELUM LULUS';
    const lines = [
      `*PENGUMUMAN KELULUSAN — ${schoolName}*`,
      `_Tahun Pelajaran 2025/2026_`,
      ``,
      `Nama   : ${result.name}`,
      `NISN   : ${result.nisn}`,
      `Kelas  : ${result.class || '-'}`,
      `Jurusan: ${result.major || '-'}`,
      `Status : *${status}*`,
      ``,
      `Cek pengumuman resmi di:`,
      window.location.origin,
      ``,
      `— Portal Kelulusan ${schoolName}`,
    ];
    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
    showToast('success', 'Membuka WhatsApp untuk membagikan hasil pengumuman.');
  };

  /* ------------------------------------------------------------------ *
   *  Reporting & Maintenance helpers
   * ------------------------------------------------------------------ */

  const handleExportReport = () => {
    const all = studentStore.list();
    const stats = studentStore.stats();
    const wb = XLSX.utils.book_new();

    const wsRows = all.map((s, i) => ({
      No: i + 1,
      NISN: s.nisn,
      Nama: s.name,
      'Tempat Lahir': s.birth_place,
      'Tanggal Lahir': s.birth_date,
      Kelas: s.class,
      'Konsentrasi Keahlian': s.major,
      Status: s.status_graduation ? 'LULUS' : 'BELUM LULUS',
      'Sudah Dicek': s.viewed_at ? 'Ya' : 'Tidak',
      'Diperbarui': s.updated_at,
    }));
    const ws = XLSX.utils.json_to_sheet(wsRows);
    ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');

    const summary = [
      ['LAPORAN KELULUSAN SMKN 1 WONOGIRI — TA 2025/2026'],
      ['Diekspor', new Date().toLocaleString('id-ID')],
      [],
      ['Metrik', 'Jumlah'],
      ['Total Siswa',     stats.total],
      ['Siswa Lulus',     stats.lulus],
      ['Belum Lulus',     stats.tidakLulus],
      ['Sudah Mengecek',  stats.checked],
      ['Passing Rate (%)', stats.total ? +((stats.lulus / stats.total) * 100).toFixed(2) : 0],
      [],
      ['Disusun oleh TIM IT Skansagiri — Powered by Dave_Exe.'],
    ];
    const wsSum = XLSX.utils.aoa_to_sheet(summary);
    wsSum['!cols'] = [{ wch: 28 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Ringkasan');

    XLSX.writeFile(wb, `laporan_kelulusan_skansagiri_${new Date().toISOString().slice(0,10)}.xlsx`);
    auditLog.log({ actor: 'admin', action: 'report.export', meta: { rows: all.length } });
    refreshMaintenancePanels();
    showToast('success', `Laporan diekspor (${all.length} siswa).`);
  };

  const handleHealthCheck = async () => {
    const local = {
      success: true,
      data: {
        app_url: typeof window !== 'undefined' ? window.location.origin : 'unknown',
        env: 'frontend-only',
        backend: 'unreachable',
        time: new Date().toISOString(),
        students_local: studentStore.list().length,
        storage_kb: localStoreFootprint().totalKB,
      },
    };
    const json = await apiCall<any>('/api/deploy/health', {}, () => local);
    setHealthInfo({ ...json.data, _fromLocal: !!json._fromLocal });
    showToast('info', json._fromLocal ? 'Backend tidak terdeteksi — info diambil dari lokal.' : 'Status server diperbarui.');
  };

  const handleRunSetup = async () => {
    if (!deployToken.trim()) {
      showToast('error', 'Masukkan DEPLOY_TOKEN terlebih dahulu.');
      return;
    }
    setDeployBusy(true);
    setDeployResult(null);
    try {
      const resp = await fetch(`/api/deploy/setup?token=${encodeURIComponent(deployToken.trim())}`);
      const ct = resp.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        throw new Error('Endpoint /api/deploy/setup tidak tersedia di lingkungan ini (frontend-only).');
      }
      const json = await resp.json();
      setDeployResult(json);
      showToast(json.success ? 'success' : 'error', json.message || (json.success ? 'Setup berhasil.' : 'Setup gagal.'));
    } catch (e: any) {
      setDeployResult({ success: false, message: e?.message || 'Tidak dapat menghubungi endpoint setup.' });
      showToast('error', e?.message || 'Setup gagal.');
    } finally {
      setDeployBusy(false);
    }
  };

  const handleResetIntegrityPact = () => {
    try {
      window.localStorage.removeItem(INTEGRITY_PACT_KEY);
      showToast('success', 'Pakta Integritas direset. Akan tampil pada kunjungan berikutnya.');
      auditLog.log({ actor: 'admin', action: 'integrity_pact.reset' });
      refreshMaintenancePanels();
    } catch {
      showToast('error', 'Gagal mereset Pakta Integritas.');
    }
  };

  const handleDownloadBackup = () => {
    const blob = new Blob([exportLocalSnapshot()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_skansagiri_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    auditLog.log({ actor: 'admin', action: 'backup.download' });
    refreshMaintenancePanels();
    showToast('success', 'Backup data lokal diunduh.');
  };

  const [dbBackupBusy, setDbBackupBusy] = useState(false);
  const handleDownloadDbBackup = async () => {
    setDbBackupBusy(true);
    try {
      const resp = await fetch('/api/deploy/backup-db', {
        method: 'POST',
        headers: { 'x-admin-token': ADMIN_PASS },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        showToast('error', j?.message ?? 'Gagal mengunduh backup database.');
        return;
      }
      const blob = await resp.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_db_${stamp}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      auditLog.log({ actor: 'admin', action: 'backup.db.download' });
      showToast('success', 'Backup database SQL berhasil diunduh.');
    } catch {
      showToast('error', 'Tidak dapat menghubungi server untuk backup database.');
    } finally {
      setDbBackupBusy(false);
    }
  };

  const handleClearAllLocal = () => {
    askConfirm({
      title: 'Hapus Semua Data Lokal',
      message: (
        <>
          Tindakan ini akan menghapus <strong>seluruh data siswa, pengaturan portal,
          arsip impor, dan riwayat audit</strong> dari penyimpanan browser ini.
          Operasi tidak dapat dibatalkan.
        </>
      ),
      confirmLabel: 'Hapus Semua Lokal',
      danger: true,
      requirePhrase: 'HAPUS SEMUA',
      onConfirm: () => {
        clearAllLocal();
        showToast('success', 'Semua data lokal telah dihapus.');
        fetchStats();
        fetchStudents();
        fetchSettings();
        refreshMaintenancePanels();
      },
    });
  };

  // Realwork: targeted purge of just the students table (+ import archives,
  // because a restore would re-introduce the rows). Settings, audit, and the
  // integrity pact are intentionally preserved so the operator does not lose
  // headline / school name configuration during the production handover.
  const handlePurgeStudents = () => {
    const currentTotal = statsData.total;
    askConfirm({
      title: 'Hapus Semua Data Siswa',
      message: (
        <>
          Saat ini terdapat <strong>{currentTotal} siswa</strong> di portal. Tindakan
          ini akan <strong>menghapus seluruh data siswa beserta arsip impor</strong>
          {' '}sehingga portal siap diisi data riil tahun ajaran 2025/2026.
          Pengaturan portal (nama sekolah, headline, dll.) tetap aman.
        </>
      ),
      confirmLabel: 'Hapus Semua Siswa',
      danger: true,
      requirePhrase: 'HAPUS SISWA',
      onConfirm: async () => {
        const result = await apiCall<{ removed: number; archives_removed: number }>(
          '/api/admin/students/purge',
          { method: 'POST' },
          () => {
            const r = studentStore.purgeAll();
            return { success: true, data: { removed: r.removed, archives_removed: r.archivesRemoved } };
          },
        );
        const removed = result?.data?.removed ?? 0;
        const archivesRemoved = result?.data?.archives_removed ?? 0;
        showToast(
          'success',
          `Berhasil menghapus ${removed} siswa${archivesRemoved ? ` dan ${archivesRemoved} arsip impor` : ''}.`,
        );
        fetchStats();
        fetchStudents();
        refreshMaintenancePanels();
      },
    });
  };

  // Bulk-action handlers used by the Data Siswa toolbar. Each one resolves
  // its action through `apiCall()` so a real Laravel backend can take over
  // transparently when the relevant endpoint is mounted; otherwise the
  // localStore methods act as the source of truth.
  const handleBulkDeleteStudents = () => {
    const ids: number[] = Array.from(selectedIds);
    if (ids.length === 0) return;
    askConfirm({
      title: 'Hapus Siswa Terpilih',
      message: (
        <>
          Anda akan menghapus <strong>{ids.length} siswa</strong> dari daftar.
          Tindakan ini permanen dan tidak dapat dibatalkan.
        </>
      ),
      confirmLabel: `Hapus ${ids.length} Siswa`,
      danger: true,
      requirePhrase: ids.length >= 10 ? 'HAPUS TERPILIH' : undefined,
      onConfirm: async () => {
        const result = await apiCall<{ removed: number }>(
          '/api/admin/students/bulk-delete',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          },
          () => ({ success: true, data: { removed: studentStore.bulkRemove(ids) } }),
        );
        const removed = result?.data?.removed ?? 0;
        showToast('success', `Berhasil menghapus ${removed} siswa.`);
        clearSelection();
        fetchStats();
        fetchStudents(adminSearch);
        refreshMaintenancePanels();
      },
    });
  };

  const handleBulkSetStatus = (status: 0 | 1) => {
    const ids: number[] = Array.from(selectedIds);
    if (ids.length === 0) return;
    const label = status === 1 ? 'LULUS' : 'BELUM LULUS';
    askConfirm({
      title: `Tandai ${ids.length} Siswa sebagai ${label}`,
      message: (
        <>
          Status kelulusan <strong>{ids.length} siswa</strong> akan diubah menjadi{' '}
          <strong className={status === 1 ? 'text-emerald-600' : 'text-rose-600'}>{label}</strong>.
          Anda masih bisa mengubahnya satu per satu lewat tombol edit.
        </>
      ),
      confirmLabel: `Tandai ${label}`,
      danger: status === 0,
      onConfirm: async () => {
        const result = await apiCall<{ updated: number }>(
          '/api/admin/students/bulk-status',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status }),
          },
          () => ({ success: true, data: { updated: studentStore.bulkSetStatus(ids, status) } }),
        );
        const updated = result?.data?.updated ?? 0;
        showToast('success', `Status diperbarui untuk ${updated} siswa.`);
        clearSelection();
        fetchStats();
        fetchStudents(adminSearch);
        refreshMaintenancePanels();
      },
    });
  };

  const handleRestoreArchive = (id: number) => {
    askConfirm({
      title: 'Pulihkan Arsip Impor',
      message: (
        <>
          Data siswa saat ini akan <strong>ditimpa</strong> dengan snapshot arsip
          ini. Pastikan Anda sudah men-download backup jika diperlukan.
        </>
      ),
      confirmLabel: 'Pulihkan Arsip',
      onConfirm: () => {
        if (archiveStore.restore(id)) {
          showToast('success', 'Arsip berhasil dipulihkan.');
          fetchStats();
          fetchStudents(adminSearch);
          refreshMaintenancePanels();
        } else {
          showToast('error', 'Arsip tidak ditemukan.');
        }
      },
    });
  };

  const handleDeleteArchive = (id: number) => {
    askConfirm({
      title: 'Hapus Arsip Impor',
      message: 'Arsip impor ini akan dihapus permanen dan tidak bisa dipulihkan.',
      confirmLabel: 'Hapus Arsip',
      danger: true,
      onConfirm: () => {
        archiveStore.remove(id);
        refreshMaintenancePanels();
        showToast('success', 'Arsip impor dihapus.');
      },
    });
  };

  const handleResetTracking = () => {
    askConfirm({
      title: 'Reset Riwayat Pengecekan',
      message: (
        <>
          Seluruh penanda <em>"sudah dilihat"</em> pada data siswa akan dihapus.
          Data identitas dan keputusan kelulusan tidak terpengaruh.
        </>
      ),
      confirmLabel: 'Reset Riwayat',
      onConfirm: async () => {
        await apiCall<any>('/api/admin/reset-tracking', { method: 'POST' }, () => {
          studentStore.resetTracking();
          return { success: true, message: 'Riwayat pengecekan dikosongkan.' };
        });
        fetchStudents(adminSearch);
        fetchStats();
        refreshMaintenancePanels();
        showToast('success', 'Riwayat pengecekan dikosongkan.');
      },
    });
  };

  if (view === 'login') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#EFF4FF] via-white to-[#F9FAFB] font-sans">
        {/* Top brand bar */}
        <div className="px-6 md:px-12 py-5 flex items-center justify-between">
          <button
            onClick={() => navigateTo(ROUTE_PUBLIC)}
            className="flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1D4ED8] flex items-center justify-center shadow-[0_8px_20px_-8px_rgba(29,78,216,0.55)] group-hover:scale-[1.04] transition-transform">
              <GraduationCap size={20} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1D4ED8]">SKANSAGIRI</p>
              <p className="text-sm font-extrabold text-[#111827] -mt-0.5">Portal Admin</p>
            </div>
          </button>
          <button
            onClick={() => navigateTo(ROUTE_PUBLIC)}
            className="text-[12px] font-semibold text-[#6B7280] hover:text-[#1D4ED8] flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#E5E7EB] hover:border-[#DBEAFE] hover:bg-[#EFF4FF] transition-colors"
          >
            <ArrowRight size={12} className="rotate-180" />
            Kembali ke halaman publik
          </button>
        </div>

        {/* Login card */}
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md bg-white rounded-3xl border border-[#E5E7EB] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] overflow-hidden"
          >
            <div className="bg-[#1D4ED8] text-white px-7 py-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <Shield size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-80">Akses Terbatas</p>
                <h1 className="text-lg font-extrabold tracking-tight">Login Panel Admin</h1>
              </div>
            </div>

            <form onSubmit={handleAdminLogin} className="p-7 space-y-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B7280] mb-2">
                  Username
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type="text"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    placeholder="Masukkan username admin"
                    className="quantum-input pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[#6B7280] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type={loginShowPass ? 'text' : 'password'}
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    className="quantum-input pl-10 pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setLoginShowPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8] hover:text-[#1E40AF] px-2 py-1 rounded-md hover:bg-[#EFF4FF] transition-colors"
                  >
                    {loginShowPass ? 'Sembunyi' : 'Tampil'}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[12px] font-medium"
                  >
                    <XCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loginBusy || !loginUser || !loginPass}
                className="quantum-button w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loginBusy ? (
                  <>
                    <Activity size={16} className="animate-spin" />
                    Memverifikasi…
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    Masuk Panel Admin
                  </>
                )}
              </button>

              <div className="pt-3 border-t border-[#E5E7EB] flex items-start gap-2 text-[11px] text-[#6B7280] leading-relaxed">
                <ShieldCheck size={14} className="text-[#1D4ED8] shrink-0 mt-0.5" />
                <p>
                  Kredensial admin bawaan bersifat <strong className="text-[#111827]">permanen &amp; read-only</strong>
                  {' '}dan tidak dapat diubah dari basis data. Hubungi pengembang sistem jika perlu reset.
                </p>
              </div>
            </form>
          </motion.div>
        </div>

        <footer className="px-6 md:px-12 py-6 text-center text-[11px] text-slate-400 font-medium">
          Created by: <span className="text-slate-500 font-semibold">TIM IT Skansagiri</span>
          <span className="mx-2 text-slate-300">|</span>
          Powered by: <span className="text-slate-500 font-semibold">Dave_Exe</span>
        </footer>
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="min-h-screen flex bg-slate-50 font-sans">
        {/* Sidebar */}
        <aside className="w-72 bg-[#111827] text-white flex flex-col no-print">
          <div className="p-7 border-b border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-[#1D4ED8] rounded-xl flex items-center justify-center shadow-[0_8px_20px_-8px_rgba(29,78,216,0.7)]">
                 <LayoutDashboard size={18} className="text-white" />
              </div>
              <h1 className="font-extrabold tracking-tight text-base">Portal Admin</h1>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">TIM IT Skansagiri</p>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <div 
              onClick={() => setAdminTab('overview')}
              className={`admin-sidebar-item ${adminTab === 'overview' ? 'admin-sidebar-item-active' : ''}`}
            >
              <TrendingUp size={20} />
              <span>Ringkasan Stat</span>
            </div>
            <div 
              onClick={() => setAdminTab('students')}
              className={`admin-sidebar-item ${adminTab === 'students' ? 'admin-sidebar-item-active' : ''}`}
            >
              <User size={20} />
              <span>Data Siswa</span>
            </div>
            <div 
              onClick={() => setAdminTab('import')}
              className={`admin-sidebar-item ${adminTab === 'import' ? 'admin-sidebar-item-active' : ''}`}
            >
              <Database size={20} />
              <span>Import Center</span>
            </div>
            <div 
              onClick={() => setAdminTab('settings')}
              className={`admin-sidebar-item ${adminTab === 'settings' ? 'admin-sidebar-item-active' : ''}`}
            >
              <Settings size={20} />
              <span>Pengaturan</span>
            </div>
            <div
              onClick={() => { setAdminTab('maintenance'); refreshMaintenancePanels(); handleHealthCheck(); }}
              className={`admin-sidebar-item ${adminTab === 'maintenance' ? 'admin-sidebar-item-active' : ''}`}
            >
              <ServerCog size={20} />
              <span>Setup &amp; Maintenance</span>
            </div>
          </nav>

          <div className="p-6 border-t border-white/5 space-y-4">
             <div className="p-3 bg-white/5 rounded-xl text-[10px] text-slate-400 font-medium">
               <p className="mb-1">Versi Sistem: 2.1.26</p>
               <p>Dave_Exe © 2026</p>
             </div>
             <div className="px-1 pb-1">
               <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80 mb-0.5">Akun Aktif</p>
               <p className="text-[12px] font-extrabold text-white tracking-tight">{ADMIN_USER}</p>
               <p className="text-[10px] text-slate-400 font-medium">Built-in &middot; Read-Only</p>
             </div>
             <button 
                onClick={handleAdminLogout}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-500/10 text-red-500 rounded-xl font-bold text-xs hover:bg-red-500/20 transition-all"
             >
               LOGOUT
               <LogOut size={16} />
             </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-10">
          <header className="flex justify-between items-center mb-10">
            <div>
               <h2 className="text-3xl font-black text-slate-800 tracking-tight capitalize">
                 {adminTab === 'overview' ? 'Dashboard Overview' :
                  adminTab === 'students' ? 'Manajemen Siswa' :
                  adminTab === 'import' ? 'Update Data Massal' :
                  adminTab === 'settings' ? 'Pengaturan Portal' : 'Setup & Maintenance'}
               </h2>
               <p className="text-slate-400 font-medium text-sm">Selamat datang, Admin SKANSAGIRI</p>
            </div>
            <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-slate-400">Status Server</p>
                  <p className={`text-xs font-bold flex items-center justify-end gap-1 ${offlineMode ? 'text-amber-500' : 'text-emerald-500'}`}>
                    <span className={`w-2 h-2 rounded-full animate-pulse ${offlineMode ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                    {offlineMode ? 'Mode Lokal' : 'Operational'}
                  </p>
               </div>
            </div>
          </header>

          {offlineMode && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
              <Wifi size={18} className="mt-0.5 flex-shrink-0" />
              <div className="text-[12px] leading-relaxed font-medium">
                <span className="font-bold">Backend tidak terdeteksi.</span> Semua aksi (input, edit, save, import, arsip, laporan) tetap berfungsi dan disimpan secara aman di penyimpanan browser (localStorage). Saat backend tersedia kembali, data dapat dikirim ulang melalui menu <em>Setup &amp; Maintenance</em>.
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {adminTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Siswa', value: statsData.total, icon: User, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'Siswa Lulus', value: statsData.lulus, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                    { label: 'Belum Lulus', value: statsData.tidakLulus, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-50' },
                    { label: 'Data Dicek', value: statsData.checked || 0, icon: Search, color: 'text-[#1D4ED8]', bg: 'bg-[#EFF4FF]' },
                  ].map((stat, i) => (
                    <motion.div 
                      key={i} 
                      whileHover={{ y: -5 }}
                      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5 transition-all"
                    >
                      <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shadow-inner`}>
                         <stat.icon size={28} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                        <p className="text-3xl font-black text-slate-800 tracking-tighter">{stat.value}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm h-[440px]">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="font-black text-slate-800 tracking-tight text-xl">Profil Kelulusan 2026</h3>
                      <div className="flex gap-4">
                         <div className="flex items-center gap-2">
                           <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                           <span className="text-[10px] font-black text-slate-400">LULUS</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
                           <span className="text-[10px] font-black text-slate-400">BELUM LULUS</span>
                         </div>
                      </div>
                    </div>
                    <div className="h-72 relative">
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie
                             data={[
                                { name: 'Lulus', value: statsData.lulus, color: '#10b981' },
                                { name: 'Belum Lulus', value: statsData.tidakLulus, color: '#ef4444' },
                             ]}
                             innerRadius={70}
                             outerRadius={120}
                             paddingAngle={8}
                             dataKey="value"
                             stroke="none"
                           >
                             {[
                                { name: 'Lulus', value: statsData.lulus, color: '#10b981' },
                                { name: 'Belum Lulus', value: statsData.tidakLulus, color: '#ef4444' },
                             ].map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={entry.color} />
                             ))}
                           </Pie>
                           <Tooltip 
                             contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '16px' }}
                             itemStyle={{ fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}
                           />
                         </PieChart>
                       </ResponsiveContainer>
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                          <p className="text-4xl font-black text-slate-800 tracking-tighter">98.2%</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Passing Rate</p>
                       </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4 bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <h3 className="font-black text-slate-800 tracking-tight text-xl mb-6">Waktu Pengumuman</h3>
                    <div className="space-y-6">
                       <div className="p-6 bg-slate-50 rounded-2xl border-2 border-slate-100">
                          <p className="text-[10px] font-bold uppercase text-[#1D4ED8] tracking-[0.2em] mb-4">Pengaturan Aktif</p>
                          <div className="space-y-4">
                             <div className="flex items-center gap-4 text-slate-700">
                                <Calendar size={18} className="text-slate-400" />
                                <span className="text-sm font-bold tracking-tight">{announcementDate}</span>
                             </div>
                             <div className="flex items-center gap-4 text-slate-700">
                                <Calendar size={18} className="text-slate-400 opacity-0" />
                                <span className="text-sm font-bold tracking-tight">{announcementTime} WIB</span>
                             </div>
                          </div>
                       </div>
                       <button 
                         onClick={() => setAdminTab('settings')}
                         className="w-full py-4 border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
                       >
                         Ubah Jadwal
                         <ArrowRight size={14} />
                       </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {adminTab === 'students' && (
              <motion.div 
                key="students"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">                    <div className="relative w-full md:w-96">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input 
                       type="text" 
                       placeholder="Cari Nama Siswa atau NISN..." 
                       className="w-full pl-14 pr-6 py-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:border-[#1D4ED8] focus:ring-4 focus:ring-[#1D4ED8]/10 transition-all outline-none text-sm font-medium text-[#111827] placeholder:text-[#9CA3AF]"
                       value={adminSearch}
                       onChange={(e) => setAdminSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleExportReport}
                      className="px-5 py-4 bg-[#1D4ED8] text-white rounded-2xl font-black text-[10px] tracking-widest uppercase hover:bg-[#1E40AF] transition-all border-b-4 border-[#1E3A8A] flex items-center gap-2 shadow-[0_8px_20px_-8px_rgba(29,78,216,0.6)]"
                    >
                      <FileSpreadsheet size={14} />
                      Ekspor Laporan
                    </button>
                    <button
                      onClick={handleResetTracking}
                      className="px-5 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] tracking-widest uppercase hover:bg-rose-100 transition-all border-b-4 border-rose-200 flex items-center gap-2"
                    >
                      <RotateCcw size={14} />
                      Reset Pengecekan
                    </button>
                  </div>
                </div>

                {/* Bulk-action toolbar — only renders when at least one row
                    is selected. Sticks to the top of the table so the actions
                    stay visible while scrolling through long rosters. */}
                <AnimatePresence>
                  {selectedIds.size > 0 && (
                    <motion.div
                      key="bulk-toolbar"
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      className="border-b border-[#DBEAFE] bg-gradient-to-r from-[#EFF4FF] to-white"
                    >
                      <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-xl bg-[#1D4ED8] text-white flex items-center justify-center text-[12px] font-black">
                            {selectedIds.size}
                          </span>
                          <div>
                            <p className="text-[13px] font-extrabold text-[#111827]">
                              {selectedIds.size} siswa dipilih
                            </p>
                            <button
                              type="button"
                              onClick={clearSelection}
                              className="text-[10px] font-bold uppercase tracking-widest text-[#1D4ED8] hover:underline"
                            >
                              Batalkan pilihan
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleBulkSetStatus(1)}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-b-4 border-emerald-800 flex items-center gap-2"
                          >
                            <CheckCircle size={14} />
                            Tandai Lulus
                          </button>
                          <button
                            onClick={() => handleBulkSetStatus(0)}
                            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-b-4 border-amber-700 flex items-center gap-2"
                          >
                            <XCircle size={14} />
                            Tandai Belum Lulus
                          </button>
                          <button
                            onClick={handleBulkDeleteStudents}
                            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-b-4 border-rose-800 flex items-center gap-2"
                          >
                            <Trash2 size={14} />
                            Hapus Terpilih
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="overflow-x-auto">
                   <table className="w-full">
                      <thead>
                         <tr>
                            <th className="admin-table-header pl-8 w-[44px]">
                              {studentsData.length > 0 && (
                                <input
                                  type="checkbox"
                                  aria-label="Pilih semua siswa di halaman ini"
                                  checked={selectedIds.size > 0 && studentsData.every((s) => selectedIds.has(s.id))}
                                  ref={(el) => {
                                    if (!el) return;
                                    const some = studentsData.some((s) => selectedIds.has(s.id));
                                    const all  = studentsData.every((s) => selectedIds.has(s.id));
                                    el.indeterminate = some && !all;
                                  }}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedIds(new Set(studentsData.map((s) => s.id)));
                                    } else {
                                      clearSelection();
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-2 border-slate-300 text-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/40 cursor-pointer"
                                />
                              )}
                            </th>
                            <th className="admin-table-header">NISN</th>
                            <th className="admin-table-header">Nama Lengkap</th>
                            <th className="admin-table-header">Kelas</th>
                            <th className="admin-table-header">Konsentrasi Keahlian</th>
                            <th className="admin-table-header text-center">Hasil</th>
                            <th className="admin-table-header text-right pr-8">Opsi</th>
                         </tr>
                      </thead>
                      <tbody>
                         {studentsData.length === 0 ? (
                           <tr>
                             <td colSpan={7} className="px-8 py-20 text-center">
                               <div className="flex flex-col items-center gap-3 text-slate-400">
                                 <User size={40} strokeWidth={1.5} />
                                 <p className="text-sm font-bold text-slate-500">Belum ada data siswa.</p>
                                 <p className="text-[11px] font-medium">
                                   {adminSearch
                                     ? `Tidak ada hasil untuk "${adminSearch}".`
                                     : 'Gunakan menu Import Center untuk mengunggah data dari Excel.'}
                                 </p>
                                 {!adminSearch && (
                                   <button
                                     onClick={() => setAdminTab('import')}
                                     className="mt-2 px-5 py-2.5 bg-[#1D4ED8] text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-[#1E40AF] transition-all"
                                   >
                                     Mulai Import
                                   </button>
                                 )}
                               </div>
                             </td>
                           </tr>
                         ) : (
                           studentsData.map((student) => {
                            const isChecked = selectedIds.has(student.id);
                            return (
                            <tr key={student.id} className={`admin-table-row group ${isChecked ? 'bg-[#EFF4FF]/60' : ''}`}>
                               <td className="pl-8 py-6">
                                 <input
                                   type="checkbox"
                                   aria-label={`Pilih ${student.name}`}
                                   checked={isChecked}
                                   onChange={() => toggleSelect(student.id)}
                                   className="w-4 h-4 rounded border-2 border-slate-300 text-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/40 cursor-pointer"
                                 />
                               </td>
                               <td className="px-4 py-6 font-mono text-xs font-bold text-slate-500">{student.nisn}</td>
                               <td className="px-6 py-6 transition-all group-hover:pl-8">
                                  <p className="font-black text-slate-800 text-sm tracking-tight uppercase">{student.name}</p>
                                  <p className="text-[10px] text-slate-400 font-medium mt-1 italic">
                                    {formatInlineBirth(student.birth_place, student.birth_date)}
                                  </p>
                               </td>
                               <td className="px-6 py-6">
                                  <span className="inline-flex px-3 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                                    {student.class}
                                  </span>
                               </td>
                               <td className="px-6 py-6 max-w-[220px]">
                                  <p className="text-[11px] font-bold text-slate-700 leading-snug">{student.major}</p>
                               </td>
                               <td className="px-6 py-6 text-center">
                                  <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter ${
                                    student.status_graduation ? 'bg-emerald-100/50 text-emerald-600' : 'bg-rose-100/50 text-rose-600'
                                  }`}>
                                    {student.status_graduation ? 'LULUS' : 'BELUM LULUS'}
                                  </span>
                               </td>
                               <td className="px-8 py-6 text-right">
                                 <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => setEditStudent(student)}
                                      className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                      title="Edit status kelulusan"
                                    >
                                       <Settings size={18} />
                                    </button>
                                    <button
                                      onClick={() => askConfirm({
                                        title: 'Hapus Siswa',
                                        message: (
                                          <>
                                            Hapus siswa <strong>{student.name}</strong> (NISN {student.nisn})
                                            secara permanen?
                                          </>
                                        ),
                                        confirmLabel: 'Hapus Siswa',
                                        danger: true,
                                        onConfirm: async () => {
                                          const result = await apiCall<{ removed: number }>(
                                            '/api/admin/students/bulk-delete',
                                            {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ ids: [student.id] }),
                                            },
                                            () => ({ success: true, data: { removed: studentStore.bulkRemove([student.id]) } }),
                                          );
                                          const removed = result?.data?.removed ?? 0;
                                          showToast(removed > 0 ? 'success' : 'error', removed > 0 ? `Siswa ${student.name} dihapus.` : 'Gagal menghapus siswa.');
                                          fetchStats();
                                          fetchStudents(adminSearch);
                                          refreshMaintenancePanels();
                                        },
                                      })}
                                      className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                      title="Hapus siswa"
                                    >
                                       <Trash2 size={18} />
                                    </button>
                                  </div>
                               </td>
                            </tr>
                           )})
                         )}
                      </tbody>

                   </table>
                </div>
              </motion.div>
            )}

            {adminTab === 'import' && (
              <motion.div
                key="import"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-3xl mx-auto space-y-8"
              >
                <div className="quantum-card p-10 sm:p-12 text-center relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-[#EFF4FF] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                   <div className="relative z-10">
                      <div className="w-20 h-20 bg-[#1D4ED8] text-white rounded-2xl flex items-center justify-center mx-auto mb-7 shadow-[0_16px_36px_-12px_rgba(29,78,216,0.55)]">
                         <Database size={36} />
                      </div>
                      <h3 className="text-3xl font-extrabold text-[#111827] tracking-tight mb-2">Update Data Siswa</h3>
                      <p className="text-[#6B7280] text-sm font-normal mb-10 max-w-sm mx-auto">Import data massal dari Excel untuk memperbarui status kelulusan siswa secara akurat.</p>

                      <div className={`border-2 border-dashed rounded-2xl p-12 mb-6 transition-all group cursor-pointer relative overflow-hidden ${
                         pendingImportFile ? 'border-[#1D4ED8] bg-[#EFF4FF]/40' : 'border-[#DBEAFE] bg-[#F9FAFB] hover:border-[#1D4ED8] hover:bg-[#EFF4FF]/30'
                      }`}>
                         <label className="cursor-pointer block">
                            <input type="file" className="hidden" onChange={handleImportFile} accept=".xlsx,.xls" />
                            <div className="relative z-10">
                               {pendingImportFile ? (
                                 <>
                                   <FileSpreadsheet size={44} className="mx-auto text-[#1D4ED8] mb-3" />
                                   <p className="text-base font-bold text-[#111827]">{pendingImportFile.name}</p>
                                   <p className="text-[11px] text-[#1D4ED8] font-bold mt-1.5">
                                     {(pendingImportFile.size / 1024).toFixed(1)} KB &middot; Klik untuk ganti file
                                   </p>
                                 </>
                               ) : (
                                 <>
                                   <FileText size={44} className="mx-auto text-[#9CA3AF] group-hover:text-[#1D4ED8] transition-all mb-3 group-hover:scale-110" />
                                   <p className="text-base font-bold text-[#111827] transition-colors">Pilih File Excel</p>
                                   <p className="text-[11px] text-[#6B7280] font-medium mt-1.5">Format: .xlsx, .xls (Maks: 10MB)</p>
                                 </>
                               )}
                            </div>
                         </label>
                      </div>

                      {/* Status feedback */}
                      {importStatus.kind === 'busy' && (
                        <div className="mb-6 p-4 rounded-2xl bg-[#EFF4FF] border border-[#DBEAFE] text-[#1E40AF] flex items-center gap-3">
                          <div className="w-4 h-4 border-2 border-[#1D4ED8]/30 border-t-[#1D4ED8] rounded-full animate-spin" />
                          <p className="text-[12px] font-bold">Memproses {importStatus.filename}…</p>
                        </div>
                      )}
                      {importStatus.kind === 'done' && (
                        <div className="mb-6 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-left">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle size={18} className="text-emerald-600" />
                            <p className="text-[12px] font-black uppercase tracking-widest text-emerald-700">Import Selesai</p>
                          </div>
                          <p className="text-[12px] text-emerald-800 font-medium">
                            <strong>{importStatus.imported}</strong> baris diproses
                            {importStatus.failed > 0 && <>, <strong>{importStatus.failed}</strong> gagal</>}
                            {' '}dari file <em>{importStatus.filename}</em>.
                          </p>
                          {importStatus.errors.length > 0 && (
                            <details className="mt-3">
                              <summary className="text-[11px] font-bold text-emerald-700 cursor-pointer">Lihat detail kesalahan</summary>
                              <ul className="mt-2 text-[11px] text-emerald-800 list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                                {importStatus.errors.slice(0, 20).map((err, i) => (<li key={i}>{err}</li>))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                      {importStatus.kind === 'error' && (
                        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3">
                          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
                          <p className="text-[12px] font-bold text-rose-700">{importStatus.message}</p>
                        </div>
                      )}

                      <div className="bg-[#F9FAFB] rounded-2xl p-7 mb-8 text-left border border-[#E5E7EB]">
                         <h4 className="text-xs font-bold text-[#111827] uppercase tracking-wider mb-4 flex items-center gap-2">
                           <Database size={14} className="text-[#1D4ED8]" />
                           Struktur Kolom Excel (Wajib)
                         </h4>
                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {['nisn', 'name', 'birth_place', 'birth_date', 'class', 'major', 'status'].map((col) => (
                               <div key={col} className="bg-white px-3 py-2 rounded-lg border border-[#E5E7EB]">
                                  <code className="text-[10px] font-bold text-[#1D4ED8]">{col}</code>
                               </div>
                            ))}
                         </div>
                         <p className="mt-4 text-[11px] text-[#6B7280] font-normal leading-relaxed">
                           * birth_place: Kota / Kabupaten kelahiran (mis. Wonogiri).<br/>
                           * birth_date: YYYY-MM-DD, DD/MM/YYYY, "26 Mei 2008" atau format Excel Date.<br/>
                           * major: Konsentrasi Keahlian (mis. Rekayasa Perangkat Lunak).<br/>
                           * status: 1 (Lulus), 0 (Belum Lulus).
                         </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <button
                           type="button"
                           onClick={() => pendingImportFile && processImportFile(pendingImportFile)}
                           disabled={!pendingImportFile || importStatus.kind === 'busy'}
                           className="quantum-button w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                         >
                           {importStatus.kind === 'busy' && (
                             <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                           )}
                           Mulai Proses Import
                         </button>
                         <button
                           type="button"
                           onClick={downloadStudentTemplate}
                           className="quantum-button-ghost w-full flex items-center justify-center gap-2"
                         >
                           <Download size={14} />
                           Download Template
                         </button>
                      </div>
                   </div>
                </div>

                {/* Archive section — list of past imports */}
                <div className="quantum-card p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                      <Archive size={22} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Arsip Import</h3>
                      <p className="text-[12px] text-[#6B7280] font-normal">Riwayat batch import — pulihkan snapshot kapan saja.</p>
                    </div>
                  </div>

                  {archives.length === 0 ? (
                    <div className="py-10 text-center text-[12px] text-[#9CA3AF] font-medium">
                      Belum ada arsip. Setiap import yang sukses akan tercatat otomatis di sini.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#E5E7EB]">
                      {archives.map((a) => (
                        <li key={a.id} className="py-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-[#F9FAFB] flex items-center justify-center text-[#1D4ED8] flex-shrink-0">
                            <FileSpreadsheet size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[#111827] truncate">{a.filename}</p>
                            <p className="text-[11px] text-[#6B7280] font-medium">
                              {new Date(a.created_at).toLocaleString('id-ID')} &middot;{' '}
                              <span className="text-emerald-600 font-bold">{a.imported} OK</span>
                              {a.failed > 0 && <> &middot; <span className="text-rose-600 font-bold">{a.failed} gagal</span></>}
                              {' '}&middot; total {a.total_after} siswa
                            </p>
                          </div>
                          <button
                            onClick={() => handleRestoreArchive(a.id)}
                            className="px-3 py-2 bg-[#EFF4FF] text-[#1D4ED8] text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#DBEAFE] transition-all flex items-center gap-1.5"
                            title="Pulihkan snapshot"
                          >
                            <RotateCcw size={12} />
                            Pulihkan
                          </button>
                          <button
                            onClick={() => handleDeleteArchive(a.id)}
                            className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                            title="Hapus arsip"
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}

            {adminTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-4xl"
              >
                <div className="quantum-card p-8 md:p-10 space-y-10">
                   {/* School Identity */}
                   <div className="grid lg:grid-cols-12 gap-10">
                      <div className="lg:col-span-4 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                              <Building2 size={22} />
                           </div>
                           <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Identitas Sekolah</h3>
                        </div>
                        
                        <div className="space-y-4">
                           <div className="relative group">
                              <div className="w-full h-48 bg-[#F9FAFB] border-2 border-dashed border-[#DBEAFE] rounded-2xl overflow-hidden flex flex-col items-center justify-center transition-all group-hover:border-[#1D4ED8] group-hover:bg-white relative">
                                 {(logoPreview || schoolLogo) ? (
                                    <img 
                                      src={logoPreview || resolveAssetUrl(schoolLogo) || ''} 
                                      className="w-full h-full object-contain p-4" 
                                      alt="Preview Logo" 
                                    />
                                 ) : (
                                    <>
                                       <FileText size={28} className="text-[#9CA3AF] mb-2" />
                                       <p className="text-[11px] font-semibold text-[#6B7280]">Logo Sekolah</p>
                                    </>
                                 )}
                                 <input 
                                    type="file" 
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => {
                                       const file = e.target.files?.[0];
                                       e.target.value = '';
                                       if (file && validateImageFile(file, 2)) {
                                          setLogoFile(file);
                                          setLogoPreview(URL.createObjectURL(file));
                                       }
                                    }}
                                 />
                              </div>
                              <p className="text-[11px] text-[#6B7280] font-medium mt-2 text-center">Klik untuk ganti logo</p>
                           </div>
                        </div>
                      </div>

                      <div className="lg:col-span-8 space-y-5">
                         <div className="grid sm:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                               <label className="text-[11px] font-semibold text-[#111827] px-1">Nama Sekolah</label>
                               <input 
                                 type="text"
                                 className="settings-input"
                                 value={schoolName}
                                 onChange={(e) => setSchoolName(e.target.value)}
                               />
                            </div>
                            <div className="space-y-1.5">
                               <label className="text-[11px] font-semibold text-[#111827] px-1">NPSN</label>
                               <input 
                                 type="text"
                                 className="settings-input"
                                 value={schoolNpsn}
                                 onChange={(e) => setSchoolNpsn(e.target.value)}
                               />
                            </div>
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-[#111827] px-1">Alamat Sekolah</label>
                            <textarea 
                              className="settings-input h-24 resize-none"
                              value={schoolAddress}
                              onChange={(e) => setSchoolAddress(e.target.value)}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-[#111827] px-1">Nama Kepala Sekolah</label>
                            <input 
                              type="text"
                              className="settings-input"
                              value={principalName}
                              onChange={(e) => setPrincipalName(e.target.value)}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-[#111827] px-1">
                              Headline Halaman Depan{' '}
                              <span className="font-normal text-[#6B7280]">(opsional)</span>
                            </label>
                            <input
                              type="text"
                              className="settings-input"
                              placeholder={`Portal Kelulusan Online ${schoolName || 'SMK Negeri 1 Wonogiri'} TA 2025/2026`}
                              value={headline}
                              onChange={(e) => setHeadline(e.target.value)}
                            />
                            <p className="text-[11px] text-[#6B7280] px-1">
                              Kosongkan untuk memakai teks default otomatis dari nama sekolah.
                            </p>
                         </div>
                      </div>
                   </div>

                   {/* Manajemen Konten — Kepala Sekolah & Motivasi */}
                   <div className="pt-10 border-t border-[#E5E7EB]">
                      <div className="flex items-center gap-3 mb-6">
                         <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                            <Quote size={22} />
                         </div>
                         <div>
                            <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Manajemen Konten</h3>
                            <p className="text-[12px] text-[#6B7280] font-normal">Foto Kepala Sekolah & Pesan Motivasi</p>
                         </div>
                      </div>

                      <div className="grid lg:grid-cols-12 gap-6">
                         {/* Foto Kepala Sekolah — thin elegant blue border */}
                         <div className="lg:col-span-4 module-card-blue">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1D4ED8] mb-3">Foto Kepala Sekolah</p>
                            <div className="relative group">
                               <div className="w-full aspect-[3/4] bg-[#F9FAFB] border border-[#DBEAFE] rounded-xl overflow-hidden flex flex-col items-center justify-center transition-all group-hover:border-[#1D4ED8] relative">
                                 {(principalPhotoPreview || principalPhoto) ? (
                                    <img
                                       src={principalPhotoPreview || resolveAssetUrl(principalPhoto) || ''}
                                       className="w-full h-full object-cover"
                                       alt="Foto Kepala Sekolah"
                                    />
                                 ) : (
                                    <>
                                       <User size={32} className="text-[#9CA3AF] mb-2" strokeWidth={1.5} />
                                       <p className="text-[11px] font-semibold text-[#6B7280]">Unggah Foto</p>
                                    </>
                                 )}
                                 <input
                                    type="file"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => {
                                       const file = e.target.files?.[0];
                                       e.target.value = '';
                                       if (file && validateImageFile(file, 2)) {
                                          setPrincipalPhotoFile(file);
                                          setPrincipalPhotoPreview(URL.createObjectURL(file));
                                       }
                                    }}
                                 />
                               </div>
                               <p className="text-[11px] text-[#6B7280] font-medium mt-2 text-center">Format JPG/PNG, rasio 3:4</p>
                            </div>
                         </div>

                         {/* Pesan Motivasi */}
                         <div className="lg:col-span-8 module-card-blue">
                            <div className="flex items-center justify-between mb-3">
                               <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1D4ED8]">Pesan Motivasi Kepala Sekolah</p>
                               <span className="text-[11px] font-medium text-[#6B7280]">{motivationMessage.length} karakter</span>
                            </div>
                            <textarea
                               className="settings-input h-44 resize-none leading-relaxed"
                               value={motivationMessage}
                               onChange={(e) => setMotivationMessage(e.target.value)}
                               placeholder="Tuliskan pesan motivasi atau sambutan yang akan ditampilkan kepada siswa di halaman utama..."
                            />
                            <p className="text-[11px] text-[#6B7280] font-normal mt-2">
                               Pesan ini akan tampil sebagai sambutan resmi di halaman publik.
                            </p>
                         </div>
                      </div>
                   </div>

                   {/* Galeri Sekolah — feeds the landing-page marquee */}
                   <div className="pt-10 border-t border-[#E5E7EB]">
                      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                         <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-[#0F172A] text-[#D4AF37] rounded-xl flex items-center justify-center">
                               <FileSpreadsheet size={22} />
                            </div>
                            <div>
                               <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Galeri Sekolah</h3>
                               <p className="text-[12px] text-[#6B7280] font-normal">
                                  Foto-foto kegiatan untuk marquee &ldquo;Momen &amp; Kegiatan SKANSAGIRI&rdquo; di halaman publik.
                               </p>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-[#6B7280] px-3 py-1.5 rounded-full bg-[#F9FAFB] border border-[#E5E7EB]">
                               {galleryItems.length} / 30 foto
                            </span>
                            <button
                               type="button"
                               onClick={() => galleryInputRef.current?.click()}
                               disabled={galleryUploading || galleryItems.length >= 30}
                               className="quantum-button px-4 py-2.5 text-[12px] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                               {galleryUploading ? (
                                  <>
                                     <RefreshCw size={14} className="animate-spin" />
                                     Mengunggah...
                                  </>
                               ) : (
                                  <>
                                     <Download size={14} className="rotate-180" />
                                     Unggah Foto
                                  </>
                               )}
                            </button>
                            <input
                               ref={galleryInputRef}
                               type="file"
                               accept="image/png,image/jpeg,image/webp"
                               multiple
                               className="hidden"
                               onChange={handleGalleryUpload}
                            />
                         </div>
                      </div>

                      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                         <p className="text-[11px] text-[#6B7280] font-medium mb-4 flex items-center gap-2">
                            <Info size={12} className="text-[#1D4ED8]" />
                            Setiap foto otomatis dipotong ke ukuran <strong className="text-[#111827]">600 × 400 px (rasio 3:2)</strong> agar marquee tampil presisi tanpa distorsi.
                         </p>

                         {galleryItems.length === 0 ? (
                            <div className="py-12 text-center">
                               <div className="inline-flex w-14 h-14 rounded-2xl bg-white border border-[#E5E7EB] items-center justify-center mb-3">
                                  <FileSpreadsheet size={24} className="text-[#9CA3AF]" />
                               </div>
                               <p className="text-sm font-bold text-[#111827] mb-1">Belum ada foto galeri</p>
                               <p className="text-[12px] text-[#6B7280] max-w-sm mx-auto">
                                  Unggah foto kegiatan sekolah — wisuda, perlombaan, kunjungan industri — untuk tampil di marquee halaman publik.
                               </p>
                            </div>
                         ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                               {galleryItems.map((item) => (
                                  <div key={item.id} className="relative group">
                                     <div className="aspect-[3/2] rounded-xl overflow-hidden border border-[#E5E7EB] bg-white">
                                        <img
                                           src={resolveAssetUrl(item.image_path) || item.image_path}
                                           alt={item.title || 'Foto galeri'}
                                           className="w-full h-full object-cover"
                                           loading="lazy"
                                        />
                                     </div>
                                     <button
                                        type="button"
                                        onClick={() => handleGalleryRemove(item.id)}
                                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg hover:bg-rose-700"
                                        title="Hapus foto"
                                        aria-label={`Hapus foto ${item.title || item.id}`}
                                     >
                                        <Trash2 size={14} />
                                     </button>
                                  </div>
                               ))}
                            </div>
                         )}
                      </div>
                   </div>

                   {/* Schedule */}
                   <div className="pt-10 border-t border-[#E5E7EB]">
                      <div className="flex items-center gap-3 mb-6">
                         <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                            <Calendar size={22} />
                         </div>
                         <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Jadwal & Preferensi</h3>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-5 mb-6">
                         <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-[#111827] px-1">Tanggal Rilis</label>
                            <input 
                              type="date"
                              className="settings-input"
                              value={announcementDate}
                              onChange={(e) => setAnnouncementDate(e.target.value)}
                            />
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-[#111827] px-1">Waktu (WIB)</label>
                            <input 
                              type="time"
                              className="settings-input"
                              value={announcementTime}
                              onChange={(e) => setAnnouncementTime(e.target.value)}
                            />
                         </div>
                      </div>
                       <div className="space-y-4">
                            <div className="flex items-center justify-between p-5 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB]">
                              <div className="flex items-center gap-4">
                                 <div className={`w-8 h-8 rounded-full ${maintenanceMode ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-200 text-slate-400'} flex items-center justify-center`}>
                                    {maintenanceMode ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                 </div>
                                 <div className="pr-4">
                                    <p className="text-sm font-bold text-[#111827]">Mode Perawatan (Maintenance)</p>
                                    <p className="text-[12px] font-normal text-[#6B7280]">Nonaktifkan fitur pencarian untuk sementara.</p>
                                 </div>
                              </div>
                              <div 
                                onClick={() => setMaintenanceMode(!maintenanceMode)}
                                className={`w-12 h-6 ${maintenanceMode ? 'bg-[#1D4ED8]' : 'bg-slate-200'} rounded-full p-1 cursor-pointer transition-all flex items-center`}
                              >
                                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-all ${maintenanceMode ? 'translate-x-6' : 'translate-x-0'}`}></div>
                              </div>
                           </div>

                           <div className="flex items-center justify-between p-5 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB]">
                              <div className="flex items-center gap-4">
                                 <div className={`w-8 h-8 rounded-full ${showUnduhSkl ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-200 text-slate-400'} flex items-center justify-center`}>
                                    {showUnduhSkl ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                 </div>
                                 <div className="pr-4">
                                    <p className="text-sm font-bold text-[#111827]">Tampilkan Tombol Unduh SKL (PDF)</p>
                                    <p className="text-[12px] font-normal text-[#6B7280]">Aktifkan agar siswa dapat mengunduh SKL setelah melihat hasil kelulusan.</p>
                                 </div>
                              </div>
                              <div
                                onClick={() => setShowUnduhSkl(!showUnduhSkl)}
                                className={`w-12 h-6 ${showUnduhSkl ? 'bg-[#1D4ED8]' : 'bg-slate-200'} rounded-full p-1 cursor-pointer transition-all flex items-center`}
                              >
                                 <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-all ${showUnduhSkl ? 'translate-x-6' : 'translate-x-0'}`}></div>
                              </div>
                           </div>
                      </div>
                   </div>

                   {/* Async save bar — disables itself + shows a clear progress
                        affordance so the admin never double-clicks. The label
                        switches between idle / saving / done states. */}
                   <button
                      onClick={handleSaveSettings}
                      disabled={isLoading}
                      aria-busy={isLoading}
                      className="quantum-button w-full flex items-center justify-center gap-3 disabled:opacity-80 disabled:cursor-progress transition-all"
                   >
                      {isLoading ? (
                         <>
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                            <span>Menyimpan, mohon tunggu...</span>
                         </>
                      ) : (
                         <>
                            <Save size={16} />
                            <span>Simpan Semua Perubahan</span>
                         </>
                      )}
                   </button>
                   {isLoading && (
                      <p className="text-[11px] text-center text-[#6B7280] mt-2 font-medium">
                         Sedang memproses gambar dan menyimpan ke server...
                      </p>
                   )}

                </div>
              </motion.div>
            )}

            {adminTab === 'maintenance' && (
              <motion.div
                key="maintenance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8 max-w-5xl"
              >
                {/* Health & Environment */}
                <div className="quantum-card p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                        <Activity size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Status &amp; Kesehatan Sistem</h3>
                        <p className="text-[12px] text-[#6B7280] font-normal">Monitor backend, domain aktif, dan kapasitas penyimpanan lokal.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleHealthCheck}
                      className="px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2 border-b-4 border-emerald-100"
                    >
                      <RefreshCw size={12} />
                      Refresh
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Domain Aktif</p>
                      <p className="text-[13px] font-bold text-[#111827] break-all">{healthInfo?.app_url || (typeof window !== 'undefined' ? window.location.origin : '-')}</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Status Backend</p>
                      <p className={`text-[13px] font-bold flex items-center gap-2 ${healthInfo?._fromLocal === false ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <span className={`w-2 h-2 rounded-full ${healthInfo?._fromLocal === false ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        {healthInfo?._fromLocal === false ? 'Online' : 'Tidak Terhubung (Mode Lokal)'}
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Data Siswa Lokal</p>
                      <p className="text-[13px] font-bold text-[#111827]">{statsData.total} siswa &middot; {statsData.lulus} lulus</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Penggunaan localStorage</p>
                      <p className="text-[13px] font-bold text-[#111827]">{storageFootprint.totalKB} KB &middot; {storageFootprint.keys.length} kunci</p>
                    </div>
                  </div>
                </div>

                {/* One-click setup */}
                <div className="quantum-card p-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                      <ServerCog size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Setup Otomatis Server</h3>
                      <p className="text-[12px] text-[#6B7280] font-normal">Jalankan migrasi, storage:link, dan clear cache dengan satu klik (tanpa Terminal).</p>
                    </div>
                  </div>

                  <div className="mt-6 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-[12px] leading-relaxed font-medium flex gap-3">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>Hanya untuk environment dengan backend Laravel.</strong> Tombol ini memanggil <code className="px-1 py-0.5 bg-white rounded font-mono text-[11px]">/api/deploy/setup?token=…</code>.
                      Pada Replit (frontend-only) endpoint ini akan menampilkan pesan tidak tersedia — itu wajar.
                      Pada cPanel, set <code className="font-mono text-[11px]">DEPLOY_TOKEN</code> di file <code className="font-mono text-[11px]">.env</code>, lalu masukkan token yang sama di sini.
                    </div>
                  </div>

                  <div className="mt-5 grid md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[#111827] px-1">DEPLOY_TOKEN</label>
                      <input
                        type="password"
                        className="settings-input"
                        placeholder="Masukkan deploy token…"
                        value={deployToken}
                        onChange={(e) => setDeployToken(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <button
                      onClick={handleRunSetup}
                      disabled={deployBusy || !deployToken.trim()}
                      className="quantum-button h-[50px] px-6 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deployBusy
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <ServerCog size={16} />}
                      Jalankan Setup
                    </button>
                  </div>

                  {deployResult && (
                    <div className={`mt-5 p-5 rounded-2xl border ${deployResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${deployResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {deployResult.success ? 'Setup Berhasil' : 'Setup Gagal'}
                      </p>
                      <p className={`text-[12px] font-medium ${deployResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>{deployResult.message}</p>
                      {deployResult.steps && (
                        <ul className="mt-3 space-y-1 text-[11px] font-mono text-slate-600">
                          {Object.entries(deployResult.steps).map(([k, v]: [string, any]) => (
                            <li key={k} className="flex gap-2">
                              <span className={v?.ok ? 'text-emerald-600' : 'text-rose-600'}>{v?.ok ? '✓' : '✗'}</span>
                              <span>{k}: {v?.message ?? (v?.ok ? 'OK' : 'failed')}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Data Lokal */}
                <div className="quantum-card p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                      <HardDrive size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Backup &amp; Data Lokal</h3>
                      <p className="text-[12px] text-[#6B7280] font-normal">Cadangkan, pulihkan, atau bersihkan data yang tersimpan di browser.</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <button
                      onClick={handleDownloadDbBackup}
                      disabled={dbBackupBusy}
                      className="p-5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-all text-left border border-emerald-200 disabled:opacity-60 disabled:cursor-wait"
                    >
                      <Database size={20} className="mb-2" />
                      <p className="text-[12px] font-black uppercase tracking-widest">
                        {dbBackupBusy ? 'Mengunduh…' : 'Backup DB SQL'}
                      </p>
                      <p className="text-[11px] font-medium mt-1 opacity-80">Dump PostgreSQL siap restore.</p>
                    </button>
                    <button
                      onClick={handleDownloadBackup}
                      className="p-5 rounded-2xl bg-[#EFF4FF] hover:bg-[#DBEAFE] text-[#1D4ED8] transition-all text-left border border-[#DBEAFE]"
                    >
                      <Download size={20} className="mb-2" />
                      <p className="text-[12px] font-black uppercase tracking-widest">Download Backup</p>
                      <p className="text-[11px] font-medium mt-1 opacity-80">JSON snapshot lengkap.</p>
                    </button>
                    <button
                      onClick={handleResetIntegrityPact}
                      className="p-5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-all text-left border border-amber-200"
                    >
                      <Shield size={20} className="mb-2" />
                      <p className="text-[12px] font-black uppercase tracking-widest">Reset Pakta Integritas</p>
                      <p className="text-[11px] font-medium mt-1 opacity-80">Tampilkan ulang modal persetujuan.</p>
                    </button>
                    <button
                      onClick={handleClearAllLocal}
                      className="p-5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition-all text-left border border-rose-200"
                    >
                      <Trash2 size={20} className="mb-2" />
                      <p className="text-[12px] font-black uppercase tracking-widest">Hapus Semua Lokal</p>
                      <p className="text-[11px] font-medium mt-1 opacity-80">Wipe siswa, pengaturan, arsip.</p>
                    </button>
                  </div>

                  {/* Zona Berbahaya — fokus pada penghapusan siswa saja
                      (pengaturan portal tetap aman, ideal untuk handover ke
                      data riil tahun ajaran 2025/2026). */}
                  <div className="mt-6 p-6 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-1">Zona Berbahaya</p>
                        <h4 className="text-base font-extrabold text-[#111827] tracking-tight">Hapus Semua Data Siswa</h4>
                        <p className="text-[12px] text-[#6B7280] font-medium mt-1.5 leading-relaxed">
                          Menghapus seluruh tabel siswa beserta arsip impor dalam satu klik.
                          Cocok dipakai sebelum mengunggah data riil <strong>{statsData.total > 0 ? `(saat ini ${statsData.total} siswa terdaftar)` : '(saat ini portal sudah kosong)'}</strong>.
                          Pengaturan portal, audit log, dan pakta integritas <strong>tidak ikut terhapus</strong>.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={handlePurgeStudents}
                            disabled={statsData.total === 0}
                            className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border-b-4 border-rose-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:border-rose-300"
                          >
                            <Trash2 size={14} />
                            Hapus Semua Siswa
                          </button>
                          <button
                            onClick={handleDownloadBackup}
                            className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border border-slate-200"
                          >
                            <Download size={14} />
                            Backup Dulu
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Rincian Penyimpanan</p>
                    {storageFootprint.keys.length === 0 ? (
                      <p className="text-[11px] text-slate-400 font-medium">Belum ada data tersimpan.</p>
                    ) : (
                      <ul className="text-[11px] text-slate-600 space-y-1 font-mono">
                        {storageFootprint.keys.map((k) => (
                          <li key={k.key} className="flex justify-between gap-4">
                            <span className="truncate">{k.key}</span>
                            <span className="text-slate-400 flex-shrink-0">{(k.size / 1024).toFixed(2)} KB</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Audit log */}
                <div className="quantum-card p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-[#EFF4FF] text-[#1D4ED8] rounded-xl flex items-center justify-center">
                        <History size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold text-[#111827] tracking-tight">Audit Log</h3>
                        <p className="text-[12px] text-[#6B7280] font-normal">200 aktivitas terakhir di portal admin.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => askConfirm({
                        title: 'Hapus Audit Log',
                        message: 'Riwayat aktivitas admin akan dikosongkan dan tidak bisa dipulihkan.',
                        confirmLabel: 'Hapus Log',
                        danger: true,
                        onConfirm: () => {
                          auditLog.clear();
                          refreshMaintenancePanels();
                          showToast('success', 'Audit log dikosongkan.');
                        },
                      })}
                      className="px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center gap-2"
                    >
                      <Trash2 size={12} />
                      Hapus Log
                    </button>
                  </div>

                  {auditEntries.length === 0 ? (
                    <p className="py-10 text-center text-[12px] text-slate-400 font-medium">Belum ada aktivitas tercatat.</p>
                  ) : (
                    <ul className="divide-y divide-[#E5E7EB] max-h-80 overflow-y-auto">
                      {auditEntries.map((e) => (
                        <li key={e.id} className="py-3 flex items-start gap-3 text-[12px]">
                          <span className={`mt-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${
                            e.actor === 'admin' ? 'bg-blue-100 text-blue-700' :
                            e.actor === 'public' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}>{e.actor}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[#111827]">{e.action}{e.target != null && <> &middot; <span className="font-mono text-slate-500">{String(e.target)}</span></>}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{new Date(e.at).toLocaleString('id-ID')}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Footer credit */}
                <div className="text-center text-[11px] text-slate-400 font-medium pt-4">
                  <p className="flex items-center justify-center gap-1.5">
                    Dibuat dengan <Heart size={11} className="text-rose-400 fill-rose-400" /> oleh <strong className="text-slate-600">TIM IT Skansagiri</strong> &middot; Powered by <strong className="text-slate-600">Dave_Exe</strong>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className={`fixed bottom-6 right-6 z-[110] px-5 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 max-w-sm ${
                  toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-600' :
                  toast.type === 'error'   ? 'bg-rose-500 text-white border-rose-600' :
                                             'bg-slate-800 text-white border-slate-900'
                }`}
              >
                {toast.type === 'success' ? <CheckCircle size={18} /> :
                 toast.type === 'error'   ? <AlertTriangle size={18} /> :
                                            <Info size={18} />}
                <p className="text-[12px] font-bold leading-snug">{toast.msg}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reusable Confirmation Modal — used by every destructive action so
              the operator gets a consistent, on-brand confirmation flow with
              optional "type-the-phrase" gating for high-stakes operations. */}
          <AnimatePresence>
            {confirmRequest && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-[#111827]/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
                onClick={closeConfirm}
              >
                <motion.div
                  initial={{ scale: 0.92, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.96, y: 10, opacity: 0 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-modal-title"
                >
                  <div className={`p-7 border-b border-slate-100 flex items-start gap-4 ${confirmRequest.danger ? 'bg-rose-50/60' : 'bg-[#EFF4FF]/60'}`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${confirmRequest.danger ? 'bg-rose-100 text-rose-600' : 'bg-[#DBEAFE] text-[#1D4ED8]'}`}>
                      {confirmRequest.danger ? <AlertTriangle size={22} /> : <Info size={22} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 id="confirm-modal-title" className="text-lg font-extrabold text-[#111827] tracking-tight leading-tight">
                        {confirmRequest.title}
                      </h3>
                      <p className="text-[12px] text-[#6B7280] font-medium mt-1">
                        Mohon pertimbangkan dengan saksama sebelum melanjutkan.
                      </p>
                    </div>
                  </div>
                  <div className="p-7 space-y-5">
                    <div className="text-[13px] text-[#374151] leading-relaxed font-medium">
                      {confirmRequest.message}
                    </div>
                    {confirmRequest.requirePhrase && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">
                          Ketik <code className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-mono text-[11px] font-black">{confirmRequest.requirePhrase}</code> untuk konfirmasi
                        </label>
                        <input
                          type="text"
                          autoFocus
                          autoComplete="off"
                          spellCheck={false}
                          value={confirmInput}
                          onChange={(e) => setConfirmInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && confirmInput === confirmRequest.requirePhrase && !confirmBusy) {
                              runConfirm();
                            }
                          }}
                          placeholder={confirmRequest.requirePhrase}
                          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-rose-500 focus:outline-none text-[13px] font-mono font-bold tracking-wide bg-white"
                        />
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={closeConfirm}
                        disabled={confirmBusy}
                        className="flex-1 px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {confirmRequest.cancelLabel ?? 'Batal'}
                      </button>
                      <button
                        type="button"
                        onClick={runConfirm}
                        disabled={
                          confirmBusy ||
                          (!!confirmRequest.requirePhrase && confirmInput !== confirmRequest.requirePhrase)
                        }
                        className={`flex-1 px-5 py-3 rounded-xl text-white text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                          confirmRequest.danger
                            ? 'bg-rose-600 hover:bg-rose-700 border-b-4 border-rose-800 disabled:border-rose-400'
                            : 'bg-[#1D4ED8] hover:bg-[#1E40AF] border-b-4 border-[#1E3A8A] disabled:border-blue-400'
                        }`}
                      >
                        {confirmBusy
                          ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : confirmRequest.danger ? <Trash2 size={14} /> : <CheckCircle size={14} />}
                        {confirmRequest.confirmLabel ?? 'Konfirmasi'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Edit Student Modal */}
          <AnimatePresence>
            {editStudent && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-[#111827]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              >
                <motion.div 
                   initial={{ scale: 0.9, y: 20 }}
                   animate={{ scale: 1, y: 0 }}
                   className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden"
                >
                   <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Edit Status Siswa</h3>
                      <button onClick={() => setEditStudent(null)} className="p-2 hover:bg-slate-50 rounded-full">
                        <XCircle size={24} className="text-slate-300" />
                      </button>
                   </div>
                   <form onSubmit={handleUpdateStudent} className="p-8 space-y-6">
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Identitas Siswa</p>
                         <p className="font-bold text-slate-800 text-lg">{editStudent.name}</p>
                         <p className="text-xs text-slate-500 font-mono">{editStudent.nisn}</p>
                      </div>

                      <div className="space-y-3">
                         <label className="text-[10px] font-black uppercase text-slate-500 px-1">Hasil Kelulusan</label>
                         <div className="grid grid-cols-2 gap-4">
                            <div 
                               onClick={() => setEditStudent({...editStudent, status_graduation: 1})}
                               className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-3 ${
                                 editStudent.status_graduation == 1 ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'
                               }`}
                            >
                               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${editStudent.status_graduation == 1 ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                                  {editStudent.status_graduation == 1 && <div className="w-2 h-2 bg-white rounded-full" />}
                               </div>
                               <span className={`font-black text-xs uppercase tracking-widest ${editStudent.status_graduation == 1 ? 'text-emerald-700' : 'text-slate-400'}`}>Lulus</span>
                            </div>
                            <div 
                               onClick={() => setEditStudent({...editStudent, status_graduation: 0})}
                               className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-3 ${
                                 editStudent.status_graduation == 0 ? 'border-rose-500 bg-rose-50' : 'border-slate-100'
                               }`}
                            >
                               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${editStudent.status_graduation == 0 ? 'border-rose-500 bg-rose-500' : 'border-slate-300'}`}>
                                  {editStudent.status_graduation == 0 && <div className="w-2 h-2 bg-white rounded-full" />}
                               </div>
                               <span className={`font-black text-xs uppercase tracking-widest ${editStudent.status_graduation == 0 ? 'text-rose-700' : 'text-slate-400'}`}>Belum Lulus</span>
                            </div>
                         </div>
                      </div>

                      <div className="pt-4 flex gap-4">
                         <button type="submit" className="quantum-button flex-1">Simpan Perubahan</button>
                         <button type="button" onClick={() => setEditStudent(null)} className="quantum-button-ghost px-6">Batal</button>
                      </div>
                   </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    );
  }

  // Initial loading skeleton — prevents blank-white flash while /api/school-info resolves
  if (isBootstrapping) {
    return (
      <div className="min-h-screen flex flex-col bg-white font-sans">
        <div className="bg-white border-b border-[#E5E7EB] px-6 md:px-12 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#EFF4FF] rounded-xl animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-40 bg-[#EFF4FF] rounded animate-pulse" />
              <div className="h-2 w-28 bg-[#F3F4F6] rounded animate-pulse" />
            </div>
          </div>
          <div className="h-7 w-28 bg-[#F3F4F6] rounded-full animate-pulse" />
        </div>
        <main className="flex-1 px-4 sm:px-6 md:px-12 py-10 md:py-16">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-5">
              <div className="h-7 w-56 bg-[#EFF4FF] rounded-full animate-pulse" />
              <div className="h-12 w-full bg-[#F3F4F6] rounded-xl animate-pulse" />
              <div className="h-12 w-5/6 bg-[#F3F4F6] rounded-xl animate-pulse" />
              <div className="h-12 w-2/3 bg-[#EFF4FF] rounded-xl animate-pulse" />
              <div className="h-4 w-full bg-[#F9FAFB] rounded animate-pulse mt-6" />
              <div className="h-4 w-11/12 bg-[#F9FAFB] rounded animate-pulse" />
            </div>
            <div className="quantum-card-floating p-9 space-y-5">
              <div className="h-12 w-12 bg-[#EFF4FF] rounded-2xl mx-auto animate-pulse" />
              <div className="h-6 w-3/4 bg-[#F3F4F6] rounded mx-auto animate-pulse" />
              <div className="h-4 w-1/2 bg-[#F9FAFB] rounded mx-auto animate-pulse" />
              <div className="grid grid-cols-4 gap-2.5 pt-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className="h-20 bg-[#F9FAFB] rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-12 w-full bg-[#EFF4FF] rounded-xl animate-pulse mt-4" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-12 text-[#6B7280]">
            <div className="w-3.5 h-3.5 border-2 border-[#DBEAFE] border-t-[#1D4ED8] rounded-full animate-spin" />
            <span className="text-[11px] font-semibold tracking-wide">Memuat data sekolah…</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      {/* Premium Helpdesk Navbar — Deep Navy */}
      <header className="premium-nav px-6 md:px-12 py-4 flex justify-between items-center no-print sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/10 ring-1 ring-white/15 rounded-xl flex items-center justify-center overflow-hidden">
             {schoolInfo?.school_logo ? (
                <img src={resolveAssetUrl(schoolInfo.school_logo) || ''} className="w-full h-full object-contain p-1.5" alt="Logo" />
             ) : (
                <GraduationCap size={22} className="text-white" strokeWidth={2.5} />
             )}
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-extrabold text-white tracking-tight">
              {schoolInfo?.school_name || "SMKN 1 Wonogiri"}
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-[0.18em] uppercase">Portal Kelulusan · TA 2025/2026</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10">
            <Calendar size={12} className="text-[#D4AF37]" />
            <p className="text-[11px] font-semibold text-slate-200">TA 2025 / 2026</p>
          </div>
          {/*
            Public navbar deliberately exposes NO admin entry point. The admin
            panel is reachable only by typing /panel-admin in the URL bar
            (stealth route preservation — security requirement).
          */}
        </div>
      </header>

      <main className="flex-1 premium-hero px-4 sm:px-6 md:px-12 py-12 md:py-20 relative">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10"
            >
              {/* LEFT: Hero text */}
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-7"
              >
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.05, ease: 'easeOut' }}
                  className="gold-pill"
                >
                  <Sparkles size={12} />
                  <span>Sistem Pengumuman Resmi · TA 2025/2026</span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="font-serif-display text-4xl sm:text-5xl lg:text-[58px] font-extrabold text-white leading-[1.08] tracking-tight"
                >
                  {schoolInfo?.headline
                    ? schoolInfo.headline
                    : `Portal Kelulusan Online ${schoolInfo?.school_name || 'SMK Negeri 1 Wonogiri'} TA 2025/2026`}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.25, ease: 'easeOut' }}
                  className="text-[17px] leading-relaxed text-slate-300 max-w-lg font-normal"
                >
                  Periksa status kelulusan Anda secara aman, cepat, dan akurat.
                  Cukup masukkan NISN dan tanggal lahir — hasil resmi tersedia
                  langsung dari basis data sekolah dengan enkripsi tingkat lembaga.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.4 }}
                  className="flex flex-wrap gap-2 pt-2"
                >
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-200">
                    <ShieldCheck size={12} className="text-[#D4AF37]" /> Data Terverifikasi
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-200">
                    <Lock size={12} className="text-[#D4AF37]" /> Enkripsi Lembaga
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-200">
                    <Activity size={12} className="text-[#D4AF37]" /> Realtime
                  </span>
                </motion.div>
              </motion.div>

              {/* RIGHT: Search / Countdown card */}
              <div className="relative">
                {/* Soft halo behind card */}
                <div className="absolute -inset-6 bg-gradient-to-tr from-[#DBEAFE]/60 via-white to-[#EFF4FF]/40 rounded-[32px] blur-2xl -z-10" />

                {/* One-time celebratory ring when countdown reaches zero */}
                <AnimatePresence>
                  {justOpened && (
                    <>
                      <motion.div
                        key="open-ring-1"
                        initial={{ opacity: 0.55, scale: 0.96 }}
                        animate={{ opacity: 0, scale: 1.18 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                        className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-[#1D4ED8] -z-10"
                        style={{ boxShadow: '0 0 0 6px rgba(29, 78, 216, 0.18), 0 0 60px 8px rgba(29, 78, 216, 0.30)' }}
                      />
                      <motion.div
                        key="open-ring-2"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 0, scale: 1.32 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.0, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="pointer-events-none absolute inset-0 rounded-2xl border border-[#60A5FA] -z-10"
                      />
                      <motion.div
                        key="open-glow"
                        initial={{ opacity: 0.6 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.4, ease: 'easeOut' }}
                        className="pointer-events-none absolute -inset-3 rounded-[28px] -z-10"
                        style={{ background: 'radial-gradient(ellipse at center, rgba(29,78,216,0.28) 0%, rgba(29,78,216,0) 70%)' }}
                      />
                    </>
                  )}
                </AnimatePresence>

                <motion.div
                  initial={{ opacity: 0, x: 32, y: 12 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: 0.85, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{
                    scale: 1.02,
                    boxShadow:
                      '0 2px 4px 0 rgba(17, 24, 39, 0.05), 0 32px 80px -20px rgba(29, 78, 216, 0.28), 0 12px 32px -12px rgba(17, 24, 39, 0.14)',
                    transition: { duration: 0.35, ease: 'easeOut' },
                  }}
                  className="quantum-card-floating p-7 sm:p-9"
                >
                  <AnimatePresence mode="wait" initial={false}>
                  {!isReady && !maintenanceMode ? (
                    <motion.div
                      key="countdown-state"
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.97, filter: 'blur(4px)' }}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      className="text-center"
                    >
                      <div className="inline-flex p-3 bg-[#EFF4FF] rounded-2xl text-[#1D4ED8] mb-5">
                        <Calendar size={28} />
                      </div>
                      <h2 className="text-2xl sm:text-[26px] font-extrabold text-[#111827] tracking-tight mb-1.5">Pengumuman Segera Dibuka</h2>
                      <p className="text-[#6B7280] text-sm mb-8">Silakan menunggu waktu rilis resmi.</p>

                      <div className="grid grid-cols-4 gap-2.5 sm:gap-3 mb-8">
                        {[
                          { label: 'HARI', value: countdown.days },
                          { label: 'JAM', value: countdown.hours },
                          { label: 'MENIT', value: countdown.minutes },
                          { label: 'DETIK', value: countdown.seconds },
                        ].map((item) => {
                          const padded = String(item.value).padStart(2, '0');
                          return (
                            <div
                              key={item.label}
                              className="quantum-countdown-box py-4 sm:py-5 px-1 flex flex-col items-center justify-center"
                            >
                              {/* Tick spark layer — three tiny white particles
                                  that rise + fade each time the digit value
                                  changes. Remounted via `key={padded}` so the
                                  CSS keyframes replay automatically. */}
                              <span
                                key={`spark-${padded}`}
                                className="quantum-spark-layer"
                                aria-hidden="true"
                              >
                                <span className="quantum-spark s1" />
                                <span className="quantum-spark s2" />
                                <span className="quantum-spark s3" />
                              </span>

                              {/* `key` on the digit forces a remount each tick so the
                                  blur-in keyframes replay — gives the elegant
                                  morphing effect the spec asks for. */}
                              <p
                                key={padded}
                                className="quantum-countdown-digit text-3xl sm:text-4xl leading-none"
                              >
                                {padded}
                              </p>
                              <p className="quantum-countdown-label text-[9px] mt-2">
                                {item.label}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Himbauan card — minimalist white below the gradient grid */}
                      <div className="px-4 py-3 bg-white rounded-xl border border-[#E5E7EB] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <p className="text-[11px] font-medium text-[#475569] leading-relaxed">
                          Formulir pencarian akan otomatis terbuka secara real-time
                          saat hitung mundur mencapai angka nol.
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="search-state"
                      initial={{ opacity: 0, y: 14, scale: 0.97, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                    >
                      <div className="mb-7">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1D4ED8] mb-1.5">Cek Hasil Kelulusan</p>
                        <h2 className="text-2xl font-extrabold text-[#111827] tracking-tight">Masukkan Data Anda</h2>
                        <p className="text-[#6B7280] text-sm mt-1.5">Pastikan NISN dan tanggal lahir sesuai kartu pelajar.</p>
                      </div>

                      <form onSubmit={handleSearchClick} className="space-y-4">
                        <div className={maintenanceMode ? 'opacity-50 pointer-events-none' : ''}>
                          <label htmlFor="search-input" className="block text-[11px] font-semibold text-[#111827] mb-1.5">
                            Nomor Induk Siswa Nasional
                          </label>
                          <div className="relative">
                            <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                            <input
                              type="text"
                              id="search-input"
                              className="quantum-input"
                              placeholder="00829180xx"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              required
                              disabled={maintenanceMode}
                            />
                          </div>
                        </div>

                        <div className={maintenanceMode ? 'opacity-50 pointer-events-none' : ''}>
                          <label htmlFor="birth-date" className="block text-[11px] font-semibold text-[#111827] mb-1.5">
                            Tanggal Lahir
                          </label>
                          <div className="relative">
                            <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                            <input
                              type="date"
                              id="birth-date"
                              className="quantum-input"
                              value={birthDate}
                              onChange={(e) => setBirthDate(e.target.value)}
                              required
                              disabled={maintenanceMode}
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSearching || maintenanceMode}
                          className="w-full quantum-button flex items-center justify-center gap-2.5 mt-2"
                        >
                          {isSearching ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Memproses...
                            </>
                          ) : (
                            <>
                              {maintenanceMode ? "Sistem Terkunci" : "Lihat Hasil Kelulusan"}
                              {!maintenanceMode && <ArrowRight size={16} />}
                            </>
                          )}
                        </button>

                        {/* Feature badges */}
                        <div className="flex flex-wrap gap-2 justify-center pt-3">
                          <span className="feature-badge">
                            <Lock size={10} /> AES-256 Enkripsi
                          </span>
                          <span className="feature-badge">
                            <ShieldCheck size={10} /> Data Valid
                          </span>
                          <span className="feature-badge">
                            <Activity size={10} /> 99.9% Uptime
                          </span>
                        </div>
                      </form>

                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-5 p-3.5 rounded-xl bg-red-50 text-red-700 border border-red-100 flex items-center gap-2.5 text-xs font-medium"
                        >
                          <XCircle size={14} />
                          {error}
                        </motion.div>
                      )}

                      {maintenanceMode && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-6 p-5 bg-[#EFF4FF] border border-[#DBEAFE] rounded-2xl text-center"
                        >
                          <Settings size={22} className="mx-auto mb-2 text-[#1D4ED8]" />
                          <p className="text-[11px] font-bold uppercase tracking-widest text-[#1D4ED8] mb-1.5">Maintenance Mode</p>
                          <p className="text-[11px] font-medium text-[#6B7280] leading-relaxed">Layanan sedang dalam pemeliharaan rutin oleh Tim IT Skansagiri.</p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </motion.div>
          ) : (
              <motion.div
                key="result-display"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-3xl mx-auto space-y-6"
              >
                {/* ----------------------------------------------------------
                    Official "Prestige" Result Card — Quantum Modern Blue
                    ---------------------------------------------------------- */}
                <div className="bg-white border border-[#0F172A]/20 rounded-2xl shadow-[0_24px_60px_-20px_rgba(15,23,42,0.22),0_8px_24px_-12px_rgba(15,23,42,0.10)] overflow-hidden relative font-serif-display">
                   {/* SKANSAGIRI watermark */}
                   <div className="watermark-text">SKANSAGIRI</div>

                   {/* Document header bar */}
                   <div className="bg-[#0F172A] text-white px-6 md:px-10 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 relative z-10 border-b border-[#D4AF37]/40">
                      <div className="flex items-center gap-3">
                        {schoolLogo ? (
                          <img
                            src={resolveAssetUrl(schoolLogo) || ''}
                            alt="Logo Sekolah"
                            className="w-9 h-9 object-contain bg-white rounded-md p-1"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-md bg-[#1D4ED8] text-white flex items-center justify-center">
                            <GraduationCap size={20} strokeWidth={2.5} />
                          </div>
                        )}
                        <div className="leading-tight">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-[#D4AF37]">
                            Surat Pengumuman Resmi
                          </p>
                          <p className="text-xs font-bold uppercase tracking-widest">
                            Hasil Kelulusan Siswa
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-300">
                        TP. 2025 / 2026
                      </span>
                   </div>

                   <div className="p-8 md:p-12 relative z-10">
                     {/* Header: identity + photo */}
                     <div className="flex flex-col md:flex-row justify-between gap-8 mb-10">
                        <div className="flex-1 space-y-5">
                           <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#1D4ED8] mb-1">
                                Nama Lengkap
                              </p>
                              <h3 className="font-display text-3xl md:text-4xl font-extrabold text-[#111827] leading-tight uppercase tracking-tight">
                                {result.name}
                              </h3>
                           </div>

                           <dl className="space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4">
                                 <dt className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400 sm:w-48 shrink-0">
                                   NISN
                                 </dt>
                                 <dd className="font-mono font-bold text-slate-700 tracking-tight text-base">
                                   {result.nisn}
                                 </dd>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4">
                                 <dt className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400 sm:w-48 shrink-0">
                                   Tempat, Tanggal Lahir
                                 </dt>
                                 <dd className="font-display font-bold text-slate-700 text-base">
                                   {formatInlineBirth(
                                     (result as any).birth_place,
                                     result.birth_date,
                                   )}
                                 </dd>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4">
                                 <dt className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400 sm:w-48 shrink-0">
                                   Kelas
                                 </dt>
                                 <dd className="font-display font-bold text-slate-700 text-base">
                                   {result.class}
                                 </dd>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4">
                                 <dt className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400 sm:w-48 shrink-0">
                                   Konsentrasi Keahlian
                                 </dt>
                                 <dd className="font-display font-bold text-slate-700 text-base">
                                   {result.major}
                                 </dd>
                              </div>
                           </dl>
                        </div>

                        <div className="w-28 h-36 bg-slate-50 border-2 border-slate-100 rounded-xl flex items-center justify-center text-slate-300 self-start">
                           <User size={48} strokeWidth={1} />
                        </div>
                     </div>

                     {/* Decision band with digital stamp on top of watermark */}
                     <div className={`relative overflow-hidden p-8 md:p-10 rounded-2xl border-4 shadow-inner ${
                        result.status_graduation
                          ? 'bg-emerald-50/60 border-emerald-500'
                          : 'bg-rose-50/60 border-rose-500'
                     }`}>
                        {/* Inner watermark for the decision band */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                          <span
                            className="font-display font-black text-[20vw] md:text-[14vw] text-slate-900 opacity-[0.04] -rotate-12"
                            style={{ letterSpacing: '-0.04em' }}
                          >
                            SKANSAGIRI
                          </span>
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                           <div className={`flex-1 text-center md:text-left ${
                             result.status_graduation ? 'text-emerald-800' : 'text-rose-800'
                           }`}>
                              <p className="text-[10px] font-black uppercase tracking-[0.32em] mb-3 opacity-80">
                                {result.status_graduation
                                  ? 'Pengumuman Resmi'
                                  : 'Status Kelulusan'}
                              </p>
                              <h4 className="font-display text-2xl md:text-3xl font-black uppercase leading-tight mb-3">
                                {result.status_graduation
                                  ? `Anda Dinyatakan LULUS dari ${schoolInfo?.school_name || 'SMKN 1 Wonogiri'}`
                                  : 'Anda Dinyatakan BELUM LULUS'}
                              </h4>
                              {!result.status_graduation && (
                                <p className="text-xs font-medium leading-relaxed opacity-90 max-w-md">
                                  Mohon maaf, silakan hubungi wali kelas atau admin sekolah
                                  untuk informasi lebih lanjut mengenai langkah berikutnya.
                                </p>
                              )}
                              <p className="text-[10px] font-bold opacity-60 uppercase tracking-[0.28em] mt-4">
                                {schoolInfo?.school_name || 'SMKN 1 Wonogiri'} • Mei 2026
                              </p>
                           </div>

                           {/* Official digital stamp */}
                           <div
                             className={`official-stamp shrink-0 ${
                               result.status_graduation ? '' : 'is-failed'
                             }`}
                             aria-label={result.status_graduation ? 'Stempel LULUS' : 'Stempel BELUM LULUS'}
                           >
                              <span className="stamp-eyebrow">
                                {result.status_graduation ? 'Pengumuman Resmi' : 'Status'}
                              </span>
                              <span className="stamp-headline">
                                {result.status_graduation ? 'LULUS' : 'TIDAK'}
                              </span>
                              <span className="stamp-meta">
                                SKANSAGIRI • 2026
                              </span>
                           </div>
                        </div>
                     </div>

                     <div className="mt-10 flex flex-col sm:flex-row gap-4 pt-8 border-t border-[#E5E7EB] items-center justify-between">
                        <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto order-2 sm:order-1 no-print">
                           {/* Unduh SKL button — visibility controlled by admin toggle (show_unduh_skl setting) */}
                           {showUnduhSkl && (
                             <button
                                onClick={handlePrintResult}
                                className="flex-1 sm:flex-none quantum-button px-5 flex items-center justify-center gap-2"
                                title="Cetak / Simpan sebagai PDF"
                             >
                                <Printer size={16} />
                                Unduh SKL (PDF)
                             </button>
                           )}
                           <button
                              onClick={handleShareWhatsApp}
                              className="flex-1 sm:flex-none px-5 py-3 rounded-xl font-bold text-[13px] bg-[#25D366] text-white hover:bg-[#1ebe57] transition-colors flex items-center justify-center gap-2 shadow-[0_8px_20px_-8px_rgba(37,211,102,0.5)]"
                              title="Bagikan hasil pengumuman via WhatsApp"
                           >
                              <Share2 size={16} />
                              Bagikan WhatsApp
                           </button>
                           <button
                             onClick={() => setResult(null)}
                             className="px-5 quantum-button-ghost"
                           >
                             Kembali
                           </button>
                        </div>

                        <p className="text-[10px] font-medium text-slate-400 tracking-wide order-1 sm:order-2">
                          Created by: <span className="text-slate-500">TIM IT Skansagiri</span>
                          <span className="mx-2 text-slate-300">|</span>
                          Powered by: <span className="text-[#1D4ED8] font-semibold">Dave_Exe</span>
                        </p>
                     </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      </main>

      {/* ============================================================
          Sambutan Kepala Sekolah — refactored per spec:
          • Single dynamic paragraph from settings (motivation_message)
          • Inter sans-serif, 16px, NO italic, carbon-black #1A1A1A
          • Minimalist white card, rounded photo frame
          • Oversized gold quote-mark accent in the top-left
          ============================================================ */}
      {motivationMessage && (
        <section className="px-4 sm:px-6 md:px-12 py-14 sm:py-16 bg-[#F9FAFB] border-t border-[#E5E7EB] no-print">
          <div className="max-w-4xl mx-auto">
            <div className="relative bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_2px_4px_rgba(15,23,42,0.04),0_12px_28px_-12px_rgba(15,23,42,0.10)] p-8 sm:p-10 overflow-hidden">
              {/* Big gold quote-mark — purely decorative accent, anchored
                  top-left so the actual paragraph still reads cleanly. */}
              <span
                aria-hidden="true"
                className="absolute top-2 left-4 sm:top-3 sm:left-6 select-none pointer-events-none font-serif-display font-extrabold leading-none text-[#D4AF37] opacity-90"
                style={{ fontSize: '110px' }}
              >
                &ldquo;
              </span>

              <div className="relative flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
                {/* Principal photo — circular precision frame with subtle
                    gold ring + soft shadow lift. */}
                <div className="shrink-0">
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#D4AF37]/30 to-[#1D4ED8]/15 blur-lg" />
                    <div className="relative w-full h-full rounded-full overflow-hidden ring-4 ring-white shadow-[0_8px_24px_-8px_rgba(15,23,42,0.25)] border border-[#E5E7EB] bg-white flex items-center justify-center">
                      {(principalPhotoPreview || principalPhoto) ? (
                        <img
                          src={principalPhotoPreview || resolveAssetUrl(principalPhoto) || ''}
                          alt={principalName || 'Kepala Sekolah'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User size={42} className="text-[#94A3B8]" strokeWidth={1.5} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left pt-2 sm:pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37] mb-3">
                    Sambutan Kepala Sekolah
                  </p>
                  {/* Single dynamic paragraph — Inter, 16px, normal (not italic),
                      carbon black for max contrast, relaxed leading for
                      comfortable reading. */}
                  <p
                    className="font-sans text-[#1A1A1A] font-normal not-italic"
                    style={{ fontSize: '16px', lineHeight: '1.7', fontFamily: 'var(--font-sans)' }}
                  >
                    {motivationMessage}
                  </p>
                  {principalName && (
                    <div className="mt-5 pt-4 border-t border-[#E5E7EB] inline-flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <p className="text-[14px] font-bold text-[#0F172A] tracking-tight">
                        {principalName}
                      </p>
                      <span className="hidden sm:inline text-[#CBD5E1]">•</span>
                      <p className="text-[12px] font-semibold text-[#6B7280] tracking-wide">
                        Kepala Sekolah
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------
          Premium Gallery — "Momen & Kegiatan SKANSAGIRI"
          Single-row infinite marquee, edge-faded, gold hover glow.
          Renders on the public landing only and acts as the elegant
          closer above the navy footer.
          ---------------------------------------------------------- */}
      {view === 'public' && (
        <section className="premium-countdown px-4 sm:px-6 md:px-12 py-14 sm:py-16 no-print">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-[#D4AF37]/30 mb-4">
                <Sparkles size={12} className="text-[#D4AF37]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">Galeri Kegiatan</span>
              </div>
              <h3 className="font-serif-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Momen &amp; Kegiatan <span className="text-[#D4AF37]">SKANSAGIRI</span>
              </h3>
              <p className="text-[13px] text-slate-400 max-w-xl mx-auto mt-3 font-medium">
                Cuplikan kegiatan, prestasi, dan momen kebanggaan keluarga besar SMKN 1 Wonogiri.
              </p>
            </div>

            {galleryItems.length === 0 ? (
              /* Elegant empty-state placeholder when admin hasn't uploaded yet */
              <div className="gallery-fade-mask">
                <div className="flex justify-center">
                  <div className="w-full max-w-3xl aspect-[3/1] rounded-2xl border border-[#D4AF37]/25 bg-white/[0.03] flex items-center justify-center text-center px-6">
                    <div>
                      <p className="font-serif-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        Gallery <span className="text-[#D4AF37]">SMKN 1 Wonogiri</span>
                      </p>
                      <p className="text-[12px] text-slate-400 mt-2 font-medium">
                        Foto kegiatan akan tampil di sini begitu admin mengunggahnya.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="gallery-fade-mask overflow-hidden">
                <div
                  className="gallery-track gap-5"
                  style={{
                    /* Slow, linear marquee — duration scales with item count
                       so adding more photos doesn't speed it up. */
                    animationDuration: `${Math.max(28, galleryItems.length * 6)}s`,
                  }}
                >
                  {/* Render the items twice back-to-back so the loop is seamless
                      when transform: translateX(-50%) wraps. */}
                  {[...galleryItems, ...galleryItems].map((item, i) => (
                    <div
                      key={`${item.id}-${i}`}
                      className="gallery-card shrink-0 w-[260px] sm:w-[300px] aspect-[3/2] rounded-xl overflow-hidden border border-white/10 bg-white/[0.04]"
                    >
                      <img
                        src={resolveAssetUrl(item.image_path) || item.image_path}
                        alt={item.title || 'Foto kegiatan SKANSAGIRI'}
                        className="w-full h-full object-cover block"
                        loading="lazy"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Integrity Pact Modal — gatekeeper before students access the form */}
      <AnimatePresence>
        {view === 'public' && showIntegrityPact && (
          <motion.div
            key="integrity-pact-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#0F172A]/55 backdrop-blur-md no-print"
            role="dialog"
            aria-modal="true"
            aria-labelledby="integrity-pact-title"
          >
            <motion.div
              key="integrity-pact-card"
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{
                type: 'spring',
                stiffness: 240,
                damping: 22,
                mass: 0.9,
              }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-[0_40px_120px_-20px_rgba(15,23,42,0.45)] overflow-hidden border border-[#E5E7EB] max-h-[90vh] flex flex-col"
            >
              {/* Header — Deep Navy */}
              <div className="bg-[#0F172A] px-6 sm:px-8 py-5 flex items-center gap-3 text-white border-b border-[#D4AF37]/30">
                <div className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
                  <Megaphone size={20} className="text-[#D4AF37]" strokeWidth={2.4} />
                </div>
                <div className="leading-tight">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">
                    Pakta Integritas Siswa
                  </p>
                  <h3
                    id="integrity-pact-title"
                    className="font-serif-display text-base sm:text-lg font-extrabold tracking-tight"
                  >
                    Informasi Penting &amp; Himbauan
                  </h3>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 sm:px-8 py-6 overflow-y-auto">
                <div className="text-center mb-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF4FF] border border-[#DBEAFE]">
                    <Info size={12} className="text-[#1D4ED8]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1D4ED8]">
                      Pengumuman Resmi
                    </span>
                  </div>
                  <h4 className="mt-3 text-[15px] sm:text-base font-extrabold text-[#111827] tracking-tight leading-snug">
                    PENGUMUMAN KELULUSAN<br />
                    SMK NEGERI 1 WONOGIRI<br />
                    TAHUN PELAJARAN 2025/2026
                  </h4>
                </div>

                <div className="rounded-xl border border-red-100 bg-red-50/60 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-red-600" strokeWidth={2.4} />
                    <p className="text-sm font-extrabold text-red-700 tracking-wide uppercase">
                      Himbauan Pasca Pengumuman
                    </p>
                  </div>
                  <ul className="space-y-2.5">
                    {[
                      'Dilarang melakukan corat-coret seragam atau fasilitas umum lainnya.',
                      'Dilarang melakukan konvoi kendaraan bermotor yang mengganggu ketertiban.',
                      'Dilarang berkumpul atau berkerumun yang berpotensi menimbulkan keributan.',
                      'Dilarang melakukan tindakan melanggar hukum atau norma sosial.',
                      'Menjaga nama baik almamater SMK Negeri 1 Wonogiri.',
                    ].map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-[#111827]">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer / Checkbox + CTA (sticky, always visible) */}
              <div className="px-6 sm:px-8 pt-4 pb-6 border-t border-[#F3F4F6] bg-white shrink-0">
                <label
                  htmlFor="integrity-pact-checkbox"
                  className={`flex gap-3 items-start p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    pactChecked
                      ? 'border-[#1D4ED8] bg-[#EFF4FF]'
                      : 'border-[#E5E7EB] bg-[#F9FAFB] hover:border-[#DBEAFE] hover:bg-[#EFF4FF]/50'
                  }`}
                >
                  <input
                    id="integrity-pact-checkbox"
                    type="checkbox"
                    checked={pactChecked}
                    onChange={(e) => setPactChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#1D4ED8] cursor-pointer shrink-0"
                  />
                  <span className="text-[12.5px] leading-relaxed text-[#111827] font-medium">
                    Dengan ini saya menyatakan telah membaca, memahami, dan siap
                    melaksanakan instruksi di atas secara sadar.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleAcceptIntegrityPact}
                  disabled={!pactChecked}
                  className={`w-full quantum-button flex items-center justify-center gap-2.5 mt-4 transition-all ${
                    !pactChecked ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <CheckCircle size={16} />
                  Saya Setuju &amp; Lanjutkan
                </button>
                {!pactChecked && (
                  <p className="text-[11px] text-center text-[#6B7280] font-medium mt-3">
                    Centang pernyataan di atas terlebih dahulu untuk melanjutkan.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Footer — Deep Navy */}
      <footer className="px-6 md:px-12 py-8 bg-[#0F172A] border-t border-[#D4AF37]/20 flex flex-col sm:flex-row justify-between items-center gap-4 no-print">
        <div className="flex items-center gap-4">
          <p className="text-xs font-semibold text-white">
            © 2026 {schoolInfo?.school_name || "SMKN 1 Wonogiri"}
          </p>
          {/*
            Public footer also omits the admin shortcut. The /panel-admin
            route remains active and reachable by direct URL entry only.
          */}
        </div>
        {/* Hardcoded footer credit — do not source from database */}
        <div className="flex flex-col items-end gap-0.5">
          <p className="text-[11px] text-slate-400 font-medium tracking-wide">
            Created by: <span className="text-slate-300 font-semibold">TIM IT Skansagiri</span>
          </p>
          <p
            className="text-[11px] text-[#D4AF37] font-bold tracking-wide"
          >Powered By : Dave_exe</p>
        </div>
      </footer>
    </div>
  );
}
