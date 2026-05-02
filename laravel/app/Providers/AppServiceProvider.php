<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI & Joben Enterprise
 *
 * AppServiceProvider — wires global helpers used by every request.
 *
 * Two responsibilities matter for this project:
 *
 * 1. **Storage symlink auto-fix** — On shared hosting (cPanel, Plesk) the
 *    operator often cannot run `php artisan storage:link` from the command
 *    line, which leaves `public/storage` missing and every uploaded image
 *    (school logo, principal photo, …) returns 404. We attempt to create
 *    the symlink ourselves on boot; if symlinks are forbidden by the host
 *    we fall back to a recursive copy so the assets are still reachable.
 *    A trail file at `storage/app/.symlink-status` records what happened
 *    so the operator can read it from the Setup & Maintenance panel.
 *
 * 2. **HTTPS enforcement under domain switches** — Many cPanel hosts proxy
 *    HTTPS via Cloudflare without forwarding the `X-Forwarded-Proto`
 *    header. We force the URL generator to honour `APP_URL`'s scheme so
 *    `asset()` and `Storage::url()` always emit absolute, scheme-correct
 *    URLs. Combined with `Setting::publicUrl()`, this gives the SPA
 *    a true Zero-Config multi-domain experience.
 */

namespace App\Providers;

use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // (1) Storage symlink — best-effort, never fails the request.
        $this->ensurePublicStorageLink();

        // (2) Force HTTPS scheme when APP_URL declares it (cPanel + Cloudflare).
        if (str_starts_with(config('app.url', ''), 'https://')) {
            URL::forceScheme('https');
        }
    }

    /**
     * Make sure `public/storage` resolves so uploaded media is reachable.
     *
     * Order of preference:
     *   1. If `public/storage` already exists → nothing to do.
     *   2. Try `symlink(storage/app/public, public/storage)`.
     *   3. If symlinks are disabled, recursively copy the directory.
     *
     * The outcome is written to `storage/app/.symlink-status` so the admin
     * panel can surface a human-readable note ("symlink", "copy", "skipped",
     * or "error: …").
     */
    protected function ensurePublicStorageLink(): void
    {
        $publicLink = public_path('storage');
        $target     = storage_path('app/public');
        $statusPath = storage_path('app/.symlink-status');

        $write = function (string $line) use ($statusPath): void {
            try { @file_put_contents($statusPath, $line . "\n"); } catch (\Throwable) {}
        };

        try {
            if (file_exists($publicLink) || is_link($publicLink)) {
                $write('skipped:exists ' . date('c'));
                return;
            }
            if (!is_dir($target)) {
                @mkdir($target, 0755, true);
            }
            // Try a real symlink first.
            if (@symlink($target, $publicLink)) {
                $write('symlink ' . date('c'));
                return;
            }
            // Fallback: recursive copy (writes are then mirrored manually,
            // but at least the existing assets are visible).
            $this->recursiveCopy($target, $publicLink);
            $write('copy ' . date('c'));
        } catch (\Throwable $e) {
            $write('error: ' . $e->getMessage() . ' @ ' . date('c'));
        }
    }

    protected function recursiveCopy(string $src, string $dst): void
    {
        if (!is_dir($src)) return;
        if (!is_dir($dst)) @mkdir($dst, 0755, true);
        foreach (scandir($src) ?: [] as $f) {
            if ($f === '.' || $f === '..') continue;
            $s = $src . DIRECTORY_SEPARATOR . $f;
            $d = $dst . DIRECTORY_SEPARATOR . $f;
            if (is_dir($s)) $this->recursiveCopy($s, $d);
            else @copy($s, $d);
        }
    }
}
