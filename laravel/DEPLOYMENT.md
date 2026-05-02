# Multi-Domain Deployment Guide

Portal Kelulusan SMKN 1 Wonogiri is built to be **portable** — the same codebase
runs unchanged on Replit, cPanel shared hosting, or a custom domain. There is no
hard-coded hostname anywhere in the source.

---

## How portability works

| Layer | Mechanism |
|---|---|
| **Frontend** (`src/App.tsx`) | All `fetch()` calls use **relative paths** (`/api/...`), so they automatically hit whatever origin the page was served from (`window.location.origin`). |
| **Backend** (`laravel/`)    | All asset URLs are built via `Storage::disk('public')->url(...)` (wrapped by `Setting::publicUrl()`), which reads `APP_URL` from `.env`. |
| **CORS** (`config/cors.php`) | `allowed_origins => ['*']` — the API will accept calls from any domain it is installed under. |
| **Image resolver** (`resolveAssetUrl()` in `App.tsx`) | Accepts both fully-qualified URLs from the backend **and** raw relative paths, so it cannot double-prefix `/storage/`. |

---

## Migrating from Replit → cPanel — step by step

1. **Upload** the contents of this repo to your cPanel file manager (typically into `~/public_html/kelulusan/`).
2. **Create the database** in cPanel → MySQL Databases.
3. **Copy `.env.example` → `.env`** and edit:
   - `APP_URL=https://kelulusan.smkn1wonogiri.sch.id`
   - `DB_*` credentials from cPanel
   - `DEPLOY_TOKEN=<long random string>`
4. **Set folder permissions** (cPanel → File Manager → Permissions, or via SSH):
   ```sh
   chmod -R 775 storage bootstrap/cache
   ```
5. **Generate APP_KEY** via cPanel terminal (one-time only):
   ```sh
   php artisan key:generate
   ```
   *(If you don't have terminal access, generate one locally with the same command and paste it into `.env`.)*
6. **Run the one-click setup** in your browser:
   ```
   https://kelulusan.smkn1wonogiri.sch.id/api/deploy/setup?token=<your DEPLOY_TOKEN>
   ```
   This single request now performs the full **portable boot sequence**:
   - **chmod 0775** on `storage/` + `bootstrap/cache/` (best-effort — fixes the
     "permission denied" you get on most shared hosts after upload)
   - applies all DB migrations (`php artisan migrate --force`)
   - creates the public storage symlink (`php artisan storage:link`)
   - **`php artisan optimize:clear`** — wipes every cached layer
     (config + route + view + events + compiled) so a fresh APP_URL,
     a new migration, or an updated controller takes effect immediately.
   - safety-net follow-ups: `config:clear`, `route:clear`, `view:clear`,
     `cache:clear` — guarantees no stale cache survives even if
     `optimize:clear` is partially blocked by the host.

   You should see a JSON response like:
   ```json
   {
     "success": true,
     "message": "Setup selesai.",
     "app_url": "https://...",
     "steps": {
       "permissions":    { "ok": true, "output": { "storage": "writable (0775)", "bootstrap/cache": "writable (0775)" } },
       "migrate":        { "ok": true, "output": "Nothing to migrate." },
       "storage:link":   { "ok": true, "output": "OK" },
       "optimize:clear": { "ok": true, "output": "..." }
     }
   }
   ```

That's it — the portal is live on the new domain. You can re-run the setup
endpoint any time you change `APP_URL` or push a new migration.

---

## Health check

Hit `/api/deploy/health` at any time to verify which `APP_URL` Laravel currently
believes it is serving. Useful sanity check after a `.env` change.

---

## Troubleshooting "Gagal Menyimpan"

If the admin **Pengaturan** save returns *"Gagal menyimpan"*, the hardened
`AdminController::updateSettings()` now returns a precise reason in the JSON
`message` field. The two most common causes on shared hosting:

1. **`storage/` not writable** → `chmod -R 775 storage bootstrap/cache`
2. **Symlink missing** → re-run `/api/deploy/setup?token=...`

The controller also accepts both `motivation_message` and the legacy alias
`principal_motivation`, and normalises `maintenance_mode` from form-encoded
strings, so the React form works without changes regardless of host.
