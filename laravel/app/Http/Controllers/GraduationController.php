<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 * Official Graduation System SMKN 1 Wonogiri 2026
 */

namespace App\Http\Controllers;

use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class GraduationController extends Controller
{
    /**
     * Check student graduation status.
     * Developed by: TIM IT SKANSAGIRI & Joben Enterprise
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function checkStatus(Request $request)
    {
        // 1. Check Announcement Time from Settings
        $settings = \App\Models\Setting::whereIn('key', ['announcement_date', 'announcement_time'])->get()->pluck('value', 'key');
        $date = $settings['announcement_date'] ?? '2026-05-15';
        $time = $settings['announcement_time'] ?? '16:00';
        $releaseTime = \Carbon\Carbon::parse("$date $time");

        if (now()->lessThan($releaseTime)) {
            return response()->json([
                'success' => false,
                'message' => 'Sabar, pengumuman belum dibuka! Kembali lagi jam ' . $time . ' WIB.'
            ], 403);
        }

        // Validation for NISN and Birth Date
        $validator = Validator::make($request->all(), [
            'nisn' => 'required|string|exists:students,nisn',
            'birth_date' => 'required|date_format:Y-m-d',
        ], [
            'nisn.exists' => 'Data tidak ditemukan.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        // Search match for both NISN and Birth Date
        $student = Student::where('nisn', $request->nisn)
            ->where('birth_date', $request->birth_date)
            ->first();

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Data NISN atau Tanggal Lahir tidak ditemukan.'
            ], 404);
        }

        // Mark as viewed
        $student->update(['viewed_at' => now()]);

        // Return student data exactly as React expects
        return response()->json([
            'success' => true,
            'data' => $student
        ]);
    }
}
