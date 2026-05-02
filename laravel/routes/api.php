<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI & Joben Enterprise
 */

use App\Http\Controllers\AdminController;
use App\Http\Controllers\DeployController;
use App\Http\Controllers\GalleryController;
use App\Http\Controllers\GraduationController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\PublicController;
use Illuminate\Support\Facades\Route;

// Main Endpoint for Graduation Check
Route::post('/check-status', [GraduationController::class, 'checkStatus'])
    ->middleware('throttle:5,1');

// Public School Info
Route::get('/school-info',  [PublicController::class, 'schoolInfo']);

// Public Gallery — feeds the landing-page "Momen & Kegiatan SKANSAGIRI" marquee.
Route::get('/galleries',    [GalleryController::class, 'index']);

/*
|--------------------------------------------------------------------------
| Panel Admin (Login / Logout / Me)
|--------------------------------------------------------------------------
| The school requires a permanent built-in administrator that cannot be
| edited or deleted from the database. `LoginController::login()`
| short-circuits the auth flow when the username matches `jobenapp` and
| validates the password against the hard-coded constant. The matching
| credentials live in `src/App.tsx` so the SPA also works offline.
|
| Frontend hits these endpoints from the `/panel-admin` route.
*/
Route::prefix('panel-admin')->group(function () {
    Route::post('/login',  [LoginController::class, 'login'])->middleware('throttle:6,1');
    Route::post('/logout', [LoginController::class, 'logout']);
    Route::get('/me',      [LoginController::class, 'me']);
});

// Admin Panel Endpoints
Route::prefix('admin')->group(function () {
    Route::get('/stats', [AdminController::class, 'index']);
    Route::get('/settings', [AdminController::class, 'getSettings']);
    Route::get('/students', [AdminController::class, 'students']);
    Route::post('/students/{id}', [AdminController::class, 'updateStudent']);
    Route::post('/settings', [AdminController::class, 'updateSettings']);
    Route::post('/import', [AdminController::class, 'importExcel']);
    Route::post('/reset-tracking/{id?}', [AdminController::class, 'resetTracking']);
    // Realwork — purge entire students table (and import_archives) so the
    // operator can hand the portal over to a fresh batch of TA 2025/2026 data.
    Route::post('/students/purge', [AdminController::class, 'purgeStudents']);
    // Bulk-action endpoints used by the Data Siswa toolbar (multi-select).
    Route::post('/students/bulk-delete', [AdminController::class, 'bulkDeleteStudents']);
    Route::post('/students/bulk-status', [AdminController::class, 'bulkSetStatus']);

    // Gallery CRUD — every upload is normalised to 600x400 by Intervention
    // Image inside the controller, so the SPA marquee gets a perfectly
    // uniform aspect ratio for every row in the database.
    Route::prefix('galleries')->group(function () {
        Route::post('/',           [GalleryController::class, 'store']);
        Route::delete('/{id}',     [GalleryController::class, 'destroy']);
        Route::post('/clear',      [GalleryController::class, 'clear']);
    });
});

/*
|--------------------------------------------------------------------------
| One-click Deployment endpoints (cPanel-friendly)
|--------------------------------------------------------------------------
| These let the operator finish a fresh install without opening a terminal:
|   GET  /api/deploy/health                   → liveness + APP_URL check
|   GET  /api/deploy/setup?token=DEPLOY_TOKEN → run migrate + storage:link +
|                                                config/route clear in one go
| The setup endpoint is rate-limited so the token cannot be brute-forced.
*/
Route::get('/deploy/health', [DeployController::class, 'health']);
Route::match(['get', 'post'], '/deploy/setup', [DeployController::class, 'setup'])
    ->middleware('throttle:5,1');
