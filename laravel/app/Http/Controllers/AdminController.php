<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 * Admin Dashboard System
 */

namespace App\Http\Controllers;

use App\Models\Student;
use App\Models\Setting;
use Illuminate\Http\Request;
use Carbon\Carbon;

class AdminController extends Controller
{
    /**
     * Get All Students with Search
     */
    public function students(Request $request)
    {
        $query = Student::query();

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('nisn', 'like', "%{$search}%")
                  ->orWhere('class', 'like', "%{$search}%")
                  ->orWhere('major', 'like', "%{$search}%");
            });
        }

        // Accessors `formatted_birth_date` and `inline_birth` are auto-appended
        // by the Student model (see $appends), so the React frontend can render
        // "Wonogiri, 26 Mei 2008" without re-formatting.
        $students = $query->orderBy('class')
                          ->orderBy('name')
                          ->paginate(15);

        return response()->json([
            'success' => true,
            'data'    => $students,
        ]);
    }

    /**
     * Update Individual Student Status
     */
    public function updateStudent(Request $request, $id)
    {
        $request->validate([
            'name'              => 'required|string',
            'birth_place'       => 'required|string',
            'birth_date'        => 'required|date',
            'class'             => 'required|string',
            'major'             => 'required|string',
            'status_graduation' => 'required|boolean',
        ]);

        $student = Student::findOrFail($id);
        $student->update($request->only([
            'name', 'birth_place', 'birth_date', 'class', 'major', 'status_graduation',
        ]));

        return response()->json([
            'success' => true,
            'message' => 'Data siswa berhasil diperbarui',
            'student' => $student->fresh(),
        ]);
    }

    /**
     * Import Excel with Feedback
     */
    public function importExcel(Request $request)
    {
        $request->validate([
            'file' => 'required|mimes:xlsx,xls,csv,txt|max:10240', // 10 MB
        ]);

        try {
            $import = new \App\Imports\StudentImport;
            \Maatwebsite\Excel\Facades\Excel::import($import, $request->file('file'));

            return response()->json([
                'success' => true,
                'message' => sprintf(
                    'Import selesai. %d baris berhasil, %d baris gagal.',
                    $import->imported,
                    $import->failed
                ),
                'stats' => [
                    'imported'         => $import->imported,
                    'failed'           => $import->failed,
                    'errors'           => array_slice($import->errors, 0, 20),
                    'total'            => Student::count(),
                    'last_import_time' => now()->toDateTimeString(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal mengimport: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get Dashboard Stats
     */
    public function index()
    {
        $stats = [
            'total' => Student::count(),
            'lulus' => Student::where('status_graduation', true)->count(),
            'tidakLulus' => Student::where('status_graduation', false)->count(),
            'checked' => Student::whereNotNull('viewed_at')->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $stats
        ]);
    }

    /**
     * Get All Settings
     */
    public function getSettings()
    {
        $settings = Setting::all()->pluck('value', 'key');

        // Realwork Mode — return empty strings for unset fields so the React
        // layer can apply its own dynamic fallback (`settings?.headline || ...`)
        // and the conditional renderers (motivation section, principal photo)
        // hide cleanly when the admin has not entered real data yet.
        return response()->json([
            'success' => true,
            'data' => [
                'announcement_date'   => $settings['announcement_date']   ?? '',
                'announcement_time'   => $settings['announcement_time']   ?? '',
                'maintenance_mode'    => ($settings['maintenance_mode']   ?? '0') == '1',
                'headline'            => $settings['headline']            ?? '',
                'school_name'         => $settings['school_name']         ?? 'SMKN 1 Wonogiri',
                'school_npsn'         => $settings['school_npsn']         ?? '',
                'school_address'      => $settings['school_address']      ?? '',
                'principal_name'      => $settings['principal_name']      ?? '',
                'school_logo'         => $settings['school_logo']         ?? null,
                'principal_photo'     => $settings['principal_photo']     ?? null,
                'motivation_message'  => $settings['motivation_message']  ?? '',
            ]
        ]);
    }

    /**
     * Update Portal Settings
     *
     * Hardened against the common "Gagal menyimpan" failure modes:
     *   1. Validation errors now return the real Laravel message (HTTP 422)
     *      instead of a vague 500 so the React layer can surface what is wrong.
     *   2. The Setting table is a (key, value) store — the writer accepts only
     *      keys listed in {@see \App\Models\Setting::ALLOWED_KEYS} so a stray
     *      input from the form cannot blow up the unique-key constraint.
     *   3. Booleans are normalised before insert (HTML forms send "1"/"0"
     *      strings, not real booleans).
     *   4. File uploads are wrapped in a try/catch so a missing
     *      `php artisan storage:link` on cPanel returns a useful message.
     *   5. Both the alias `principal_motivation` and the canonical
     *      `motivation_message` are accepted, so existing forms keep working.
     */
    public function updateSettings(Request $request)
    {
        try {
            $validated = $request->validate([
                'announcement_date'    => 'nullable|date',
                'announcement_time'    => 'nullable|string',
                'headline'             => 'nullable|string|max:255',
                'school_name'          => 'nullable|string|max:255',
                'school_npsn'          => 'nullable|string|max:32',
                'school_address'       => 'nullable|string|max:500',
                'principal_name'       => 'nullable|string|max:255',
                'maintenance_mode'     => 'nullable',
                'motivation_message'   => 'nullable|string|max:2000',
                'principal_motivation' => 'nullable|string|max:2000', // alias
                'logo'                 => 'nullable|image|mimes:jpeg,png,jpg,svg|max:2048',
                'principal_photo'      => 'nullable|image|mimes:jpeg,png,jpg|max:4096',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validasi gagal: ' . collect($e->errors())->flatten()->first(),
                'errors'  => $e->errors(),
            ], 422);
        }

        // Accept the legacy alias `principal_motivation` as well
        if (array_key_exists('principal_motivation', $validated)) {
            $validated['motivation_message'] = $validated['principal_motivation'];
            unset($validated['principal_motivation']);
        }

        // Normalise booleans (forms POST "1"/"0", JSON sends true/false)
        if (array_key_exists('maintenance_mode', $validated)) {
            $validated['maintenance_mode'] = filter_var(
                $validated['maintenance_mode'],
                FILTER_VALIDATE_BOOLEAN
            ) ? '1' : '0';
        }

        try {
            // Persist scalar settings (whitelist enforced)
            foreach ($validated as $key => $value) {
                if (!in_array($key, Setting::ALLOWED_KEYS, true)) {
                    continue; // silently drop unknown keys
                }
                Setting::updateOrCreate(['key' => $key], ['value' => $value]);
            }

            $disk = \Illuminate\Support\Facades\Storage::disk('public');

            // Logo upload
            if ($request->hasFile('logo')) {
                $old = Setting::where('key', 'school_logo')->first();
                if ($old && $old->value) {
                    $disk->delete($old->value);
                }
                $path = $request->file('logo')->store('branding', 'public');
                Setting::updateOrCreate(['key' => 'school_logo'], ['value' => $path]);
            }

            // Principal photo upload
            if ($request->hasFile('principal_photo')) {
                $old = Setting::where('key', 'principal_photo')->first();
                if ($old && $old->value) {
                    $disk->delete($old->value);
                }
                $path = $request->file('principal_photo')->store('principal', 'public');
                Setting::updateOrCreate(['key' => 'principal_photo'], ['value' => $path]);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('updateSettings failed', [
                'message' => $e->getMessage(),
                'trace'   => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Gagal menyimpan pengaturan. ' .
                             'Pastikan folder storage & bootstrap/cache writable (chmod 775) ' .
                             'dan symlink "php artisan storage:link" sudah dibuat. ' .
                             'Detail: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Pengaturan berhasil diperbarui',
        ]);
    }

    /**
     * Reset Student View Status
     */
    public function resetTracking($id = null)
    {
        if ($id) {
            Student::where('id', $id)->update(['viewed_at' => null]);
        } else {
            Student::query()->update(['viewed_at' => null]);
        }

        return response()->json(['success' => true, 'message' => 'Tracking data reset']);
    }

    /**
     * Realwork — bulk delete a list of student ids selected via the
     * Data Siswa toolbar. Validates the payload, falls back gracefully
     * when nothing matches, and returns the count actually removed so
     * the frontend toast can be exact.
     */
    public function bulkDeleteStudents(Request $request)
    {
        $data = $request->validate([
            'ids'   => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        $removed = Student::whereIn('id', $data['ids'])->count();
        if ($removed > 0) {
            Student::whereIn('id', $data['ids'])->delete();
        }

        return response()->json([
            'success' => true,
            'message' => "Berhasil menghapus {$removed} siswa.",
            'data'    => ['removed' => $removed],
        ]);
    }

    /**
     * Realwork — bulk set `status_graduation` for a list of student ids
     * selected via the Data Siswa toolbar. Mirrors the local store's
     * bulkSetStatus() so frontend behaviour is identical online/offline.
     */
    public function bulkSetStatus(Request $request)
    {
        $data = $request->validate([
            'ids'    => 'required|array|min:1',
            'ids.*'  => 'integer',
            'status' => 'required|in:0,1',
        ]);

        $status  = (int) $data['status'];
        $updated = Student::whereIn('id', $data['ids'])
            ->where('status_graduation', '!=', $status)
            ->count();
        if ($updated > 0) {
            Student::whereIn('id', $data['ids'])->update([
                'status_graduation' => $status,
                'updated_at'        => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "Status diperbarui untuk {$updated} siswa.",
            'data'    => ['updated' => $updated],
        ]);
    }

    /**
     * Realwork — wipe the students table (and import_archives, since a
     * restore would re-introduce the rows). Settings, audit log, and the
     * integrity pact are preserved so the operator does not lose portal
     * configuration during the production handover. Returns the deleted
     * counts so the frontend can render an exact confirmation message.
     */
    public function purgeStudents()
    {
        $removed = Student::query()->count();
        Student::query()->delete();

        $archivesRemoved = 0;
        if (\Schema::hasTable('import_archives')) {
            $archivesRemoved = \DB::table('import_archives')->count();
            \DB::table('import_archives')->truncate();
        }

        return response()->json([
            'success' => true,
            'message' => "Berhasil menghapus {$removed} siswa.",
            'data' => [
                'removed' => $removed,
                'archives_removed' => $archivesRemoved,
            ],
        ]);
    }
}
