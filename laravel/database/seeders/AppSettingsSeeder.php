<?php

/**
 * Developed by: TIM IT SKANSAGIRI
 * Powered by:   Joben Enterprise
 *
 * Realwork Mode — production seeder.
 *
 * Only the bare-minimum identity (school name + academic year) and the
 * permanent attribution string are written. Every other field is left as
 * an empty string so the operator is forced to fill in real data through
 * the admin Pengaturan tab before the portal is operational.
 *
 * Re-run with:
 *   php artisan db:seed --class=AppSettingsSeeder --force
 */

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class AppSettingsSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            // --- Basic identity (the only non-empty defaults) ---
            'school_name'        => 'SMKN 1 Wonogiri',
            'academic_year'      => '2025/2026',
            'attribution'        => 'Created by: TIM IT SKANSAGIRI | Powered by: Joben Enterprise',

            // --- Cleared fields — must be filled in via the admin panel ---
            'headline'           => '',
            'school_npsn'        => '',
            'school_address'     => '',
            'principal_name'     => '',
            'announcement_date'  => '',
            'announcement_time'  => '',
            'maintenance_mode'   => '0',
            'school_logo'        => null,
            'principal_photo'    => null,
            'motivation_message' => '',
            'signature_path'     => '',
        ];

        foreach ($settings as $key => $value) {
            Setting::updateOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
