<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 *
 * "Klik-Sekali" Deploy / Setup endpoint.
 *
 * Why this exists:
 *   On shared cPanel hosting, the operator does NOT have easy access to a
 *   real terminal to run `php artisan storage:link` and `php artisan migrate`.
 *   This controller exposes those two operations behind a single token-guarded
 *   HTTP endpoint so a fresh deployment can be initialised by simply visiting:
 *
 *       https://<your-domain>/api/deploy/setup?token=<DEPLOY_TOKEN>
 *
 *   The token is read from `DEPLOY_TOKEN` in `.env`. If the variable is not
 *   set, the endpoint refuses to run — meaning a forgotten production deploy
 *   cannot be triggered by a random visitor.
 *
 * What it does, in order:
 *   0. chmod 0775 on storage/ + bootstrap/cache/    — best-effort permission
 *                                         fix so subsequent cache writes and
 *                                         uploaded files succeed on shared
 *                                         hosts that ship with 0755 defaults
 *   1. `php artisan migrate --force`   — apply any pending DB migrations
 *   2. `php artisan storage:link`      — create the public/storage symlink so
 *                                         uploaded logos / principal photos
 *                                         are served at /storage/...
 *   3. `php artisan optimize:clear`    — single-call nuke of config + route +
 *                                         view + event + compiled cache
 *                                         (faster than calling each clear
 *                                         command individually; recommended
 *                                         after every redeploy)
 *   4. `php artisan config:clear`      — safety-net follow-ups in case
 *      `php artisan route:clear`         optimize:clear is partially blocked
 *      `php artisan view:clear`          on the host
 *      `php artisan cache:clear`
 */

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class DeployController extends Controller
{
    public function setup(Request $request)
    {
        $expected = env('DEPLOY_TOKEN');

        if (empty($expected)) {
            return response()->json([
                'success' => false,
                'message' => 'DEPLOY_TOKEN belum di-set di file .env. ' .
                             'Tambahkan baris: DEPLOY_TOKEN=rahasia-anda lalu coba lagi.',
            ], 503);
        }

        $given = $request->query('token') ?? $request->input('token');

        if (!is_string($given) || !hash_equals($expected, $given)) {
            return response()->json([
                'success' => false,
                'message' => 'Token tidak valid.',
            ], 401);
        }

        $report = [];

        // ----------------------------------------------------------------
        // 0. Best-effort permission fix BEFORE anything else.
        //    On many shared hosts (cPanel, Cloudways) `storage/` and
        //    `bootstrap/cache/` ship with 0755 which silently breaks file
        //    uploads + cache writes. We try to chmod them to 0775 so all
        //    subsequent steps (especially `optimize:clear`) succeed.
        //    This is best-effort: we never fail the deploy if chmod is
        //    blocked by the hosting environment.
        // ----------------------------------------------------------------
        $permTargets = [
            storage_path(),
            base_path('bootstrap/cache'),
        ];
        $permReport = [];
        foreach ($permTargets as $path) {
            $shortLabel = str_replace(base_path() . DIRECTORY_SEPARATOR, '', $path);
            try {
                if (!is_dir($path)) {
                    $permReport[$shortLabel] = 'directory not found';
                    continue;
                }
                @chmod($path, 0775);
                // Walk the tree so nested cache files inherit the new mode.
                $iter = new \RecursiveIteratorIterator(
                    new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
                    \RecursiveIteratorIterator::SELF_FIRST,
                );
                foreach ($iter as $item) {
                    @chmod($item->getPathname(), $item->isDir() ? 0775 : 0664);
                }
                $permReport[$shortLabel] = is_writable($path) ? 'writable (0775)' : 'still not writable';
            } catch (\Throwable $e) {
                $permReport[$shortLabel] = 'chmod failed: ' . $e->getMessage();
            }
        }
        $report['permissions'] = [
            'ok'     => collect($permReport)->every(fn ($s) => str_contains((string) $s, 'writable')),
            'output' => $permReport,
        ];

        // ----------------------------------------------------------------
        // Artisan steps — order matters:
        //   1. migrate     → schema first
        //   2. storage:link→ public symlink for uploaded images
        //   3. optimize:clear → nukes config/route/view/event cache in one
        //      call (faster + more thorough than running them separately)
        //   4. config/route/view clear → safety net in case `optimize:clear`
        //      partially failed on a host that disables some sub-commands
        // ----------------------------------------------------------------
        $steps = [
            'migrate'        => ['migrate',        ['--force' => true]],
            'storage:link'   => ['storage:link',   []],
            'optimize:clear' => ['optimize:clear', []],
            'config:clear'   => ['config:clear',   []],
            'route:clear'    => ['route:clear',    []],
            'view:clear'     => ['view:clear',     []],
            'cache:clear'    => ['cache:clear',    []],
        ];

        foreach ($steps as $label => [$cmd, $args]) {
            try {
                $code   = Artisan::call($cmd, $args);
                $output = trim(Artisan::output());
                $report[$label] = [
                    'ok'     => $code === 0,
                    'output' => $output ?: 'OK',
                ];
            } catch (\Throwable $e) {
                $report[$label] = [
                    'ok'     => false,
                    'output' => $e->getMessage(),
                ];
            }
        }

        $allOk = collect($report)->every(fn ($r) => $r['ok'] === true);

        return response()->json([
            'success' => $allOk,
            'message' => $allOk
                ? 'Setup selesai. Aplikasi siap digunakan di domain ini.'
                : 'Setup selesai dengan beberapa peringatan — periksa detail di bawah.',
            'app_url' => config('app.url'),
            'steps'   => $report,
        ], $allOk ? 200 : 207);
    }

    /**
     * Lightweight health-check — handy for confirming a fresh deploy is alive
     * before running the heavier setup endpoint above.
     */
    public function health()
    {
        return response()->json([
            'success'     => true,
            'app_url'     => config('app.url'),
            'environment' => app()->environment(),
            'php'         => PHP_VERSION,
            'laravel'     => app()->version(),
            'time'        => now()->toIso8601String(),
        ]);
    }
}
