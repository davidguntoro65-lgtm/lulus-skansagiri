<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 *
 * Public-facing endpoints (school identity, countdown, branding).
 *
 * Multi-domain note:
 *   This controller never hard-codes a hostname. Every asset URL is built via
 *   {@see \App\Models\Setting::publicUrl()} which delegates to
 *   `Storage::disk('public')->url(...)` — that helper resolves to whatever
 *   `APP_URL` (in `.env`) points to, so deploying from Replit to a cPanel
 *   shared host or a custom domain only requires updating `.env` (and running
 *   the one-click setup at `/api/deploy/setup` to (re)create the storage
 *   symlink). No code changes required.
 */

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\Request;

class PublicController extends Controller
{
    /**
     * Get School Information for Frontend
     */
    public function schoolInfo()
    {
        $settings = Setting::all()->pluck('value', 'key');

        // Realwork Mode — empty defaults; the React layer applies its own
        // "Portal Kelulusan Online <school_name> TA 2025/2026" fallback when
        // `headline` is blank, and conditionally hides the principal /
        // motivation block when those fields are empty.
        $date = $settings['announcement_date'] ?? '';
        $time = $settings['announcement_time'] ?? '';
        $fullDatetime = trim($date . ' ' . $time);

        $announcementIso    = '';
        $announcementActive = false;
        if ($fullDatetime !== '') {
            try {
                $parsed             = \Carbon\Carbon::parse($fullDatetime);
                $announcementIso    = $parsed->toIso8601String();
                $announcementActive = $parsed->isPast();
            } catch (\Throwable $e) {
                /* leave defaults — invalid date in DB shouldn't 500 */
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'headline'              => $settings['headline']           ?? '',
                'school_name'           => $settings['school_name']        ?? 'SMKN 1 Wonogiri',
                'school_npsn'           => $settings['school_npsn']        ?? '',
                'school_address'        => $settings['school_address']     ?? '',
                'school_logo'           => Setting::publicUrl($settings['school_logo']     ?? null),
                'principal_name'        => $settings['principal_name']     ?? '',
                'principal_photo'       => Setting::publicUrl($settings['principal_photo'] ?? null),
                'motivation_message'    => $settings['motivation_message'] ?? '',
                'announcement_datetime' => $announcementIso,
                'announcement_active'   => $announcementActive,
                'maintenance_mode'      => ($settings['maintenance_mode']  ?? '0') == '1',
            ]
        ]);
    }

    private function isAnnouncementActive($settings)
    {
        $date = $settings['announcement_date'] ?? '';
        $time = $settings['announcement_time'] ?? '';
        if ($date === '' || $time === '') return false;

        try {
            $releaseDate = \Carbon\Carbon::parse("$date $time");
            return now()->greaterThanOrEqualTo($releaseDate);
        } catch (\Throwable $e) {
            return false;
        }
    }
}
