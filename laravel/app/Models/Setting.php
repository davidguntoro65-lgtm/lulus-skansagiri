<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 *
 * Setting model — key/value store
 *
 * The settings table is intentionally a single (key, value) row design so it
 * stays portable across hosting environments (Replit ↔ shared cPanel ↔ custom
 * domain) without requiring schema migrations every time a new option ships.
 *
 * The `$fillable` array therefore lists the **column names** of the table
 * (`key`, `value`). Logical setting names (announcement_date, principal_photo,
 * principal_name, motivation_message, school_logo, …) are stored as the value
 * of `key` and are governed by the {@see Setting::ALLOWED_KEYS} whitelist
 * below — used by AdminController::updateSettings() to reject unknown keys
 * before they reach the database.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Setting extends Model
{
    protected $fillable = [
        'key',
        'value',
    ];

    /**
     * Whitelist of setting keys this app understands.
     *
     * Anything outside this list is rejected by the admin save endpoint to
     * stop random / malicious key writes from polluting the table.
     *
     * Add new logical fields here when extending the portal.
     */
    public const ALLOWED_KEYS = [
        // Schedule
        'announcement_date',
        'announcement_time',
        'maintenance_mode',
        // School identity
        'headline',               // Realwork Mode — admin-editable landing headline
        'school_name',
        'school_npsn',
        'school_address',
        'school_logo',
        // Principal / motivational message
        'principal_name',
        'principal_photo',
        'principal_motivation',   // legacy alias accepted by the API
        'motivation_message',
    ];

    /**
     * Resolve a stored relative path (e.g. "principal/foto.jpg") into a fully
     * qualified URL using the **active** filesystem disk. This is the single
     * choke-point that makes asset URLs portable across domains — when the
     * site is deployed under https://kelulusan.smkn1wonogiri.sch.id the URL
     * automatically becomes https://kelulusan.smkn1wonogiri.sch.id/storage/…
     * with zero code changes.
     */
    public static function publicUrl(?string $path): ?string
    {
        if (!$path) return null;
        // Already absolute? Pass through untouched.
        if (preg_match('#^(https?:)?//#i', $path) || str_starts_with($path, 'data:')) {
            return $path;
        }
        return Storage::disk('public')->url(ltrim($path, '/'));
    }
}
