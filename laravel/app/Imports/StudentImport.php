<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 * SMKN 1 Wonogiri - Student Data Importer
 *
 * Required Excel columns (heading row, lowercase):
 *   nisn | name | birth_place | birth_date | class | major | status
 *
 * Supported birth_date formats (handled by parseBirthDate()):
 *   1. Excel serial number  — e.g. 39594          → 26/05/2008
 *   2. ISO                  — "2008-05-26", "2008/05/26"
 *   3. Indonesian numeric   — "26/05/2008", "26-05-2008", "26.05.2008"
 *   4. US numeric           — "05/26/2008"        (auto-detected vs Indo)
 *   5. Indonesian textual   — "26 Mei 2008", "3 Pebruari 2007"
 *   6. Carbon::parse fallback — anything else parseable.
 *
 * status accepts: 1/0, true/false, "lulus"/"tidak lulus", "ya"/"tidak".
 */

namespace App\Imports;

use App\Models\Student;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Concerns\ToModel;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithValidation;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

class StudentImport implements ToModel, WithHeadingRow, WithValidation
{
    /** Indonesian month token → numeric month. */
    private const ID_MONTH_LOOKUP = [
        'januari' => 1,  'jan' => 1,
        'februari' => 2, 'feb' => 2, 'pebruari' => 2,
        'maret' => 3,    'mar' => 3,
        'april' => 4,    'apr' => 4,
        'mei' => 5,
        'juni' => 6,     'jun' => 6,
        'juli' => 7,     'jul' => 7,
        'agustus' => 8,  'agt' => 8, 'agu' => 8, 'ags' => 8,
        'september' => 9, 'sep' => 9, 'sept' => 9,
        'oktober' => 10, 'okt' => 10, 'oct' => 10,
        'november' => 11, 'nov' => 11,
        'desember' => 12, 'des' => 12, 'dec' => 12,
    ];

    /** Counters exposed to the controller for richer feedback. */
    public int $imported = 0;
    public int $failed   = 0;
    /** @var array<int,string> */
    public array $errors = [];

    public function model(array $row)
    {
        $nisn = isset($row['nisn']) ? trim((string) $row['nisn']) : '';

        try {
            $birthDate = $this->parseBirthDate($row['birth_date'] ?? null);
            if ($birthDate === null) {
                throw new \RuntimeException(
                    'Format tanggal lahir tidak dikenali: "' . ($row['birth_date'] ?? '') . '"'
                );
            }

            $student = Student::updateOrCreate(
                ['nisn' => $nisn],
                [
                    'name'              => trim((string) ($row['name'] ?? '')),
                    'birth_place'       => trim((string) ($row['birth_place'] ?? '')),
                    'birth_date'        => $birthDate->format('Y-m-d'),
                    'class'             => trim((string) ($row['class'] ?? 'N/A')),
                    'major'             => trim((string) ($row['major'] ?? 'N/A')),
                    'status_graduation' => $this->parseStatus($row['status'] ?? null),
                ]
            );

            $this->imported++;
            return $student;
        } catch (\Throwable $e) {
            $this->failed++;
            $this->errors[] = "NISN {$nisn}: " . $e->getMessage();
            Log::error('Import error for NISN ' . $nisn . ': ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Robust birth-date parser.
     *
     * Order of attempts is important — we always try the unambiguous formats
     * (Excel serial, ISO YYYY-MM-DD) BEFORE the ambiguous DD/MM/YYYY vs
     * MM/DD/YYYY case so we never silently swap day and month.
     */
    public function parseBirthDate($raw): ?Carbon
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        // 1. Already a DateTime / Carbon instance
        if ($raw instanceof \DateTimeInterface) {
            return Carbon::instance($raw)->startOfDay();
        }

        // 2. Excel serial number (real numeric cell)
        if (is_numeric($raw)) {
            try {
                return Carbon::instance(ExcelDate::excelToDateTimeObject((float) $raw))->startOfDay();
            } catch (\Throwable $_) {
                // fall through to string parsing
            }
        }

        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        // 3. Strict ISO — YYYY-MM-DD or YYYY/MM/DD (unambiguous, try first)
        if (preg_match('/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/', $value, $m)) {
            return $this->safeCreate((int) $m[1], (int) $m[2], (int) $m[3]);
        }

        // 4. Day-first numeric — DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
        //    (Indonesian convention; what the import spec asks us to support)
        if (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/', $value, $m)) {
            $d    = (int) $m[1];
            $mo   = (int) $m[2];
            $year = (int) $m[3];
            if ($year < 100) {
                $year += $year >= 70 ? 1900 : 2000;
            }

            // If the first group is clearly > 12 it is the day, so this is DD/MM.
            // Otherwise we still treat it as DD/MM (Indonesian default).
            if ($d <= 31 && $mo <= 12) {
                return $this->safeCreate($year, $mo, $d);
            }
            // Fallback: maybe it was MM/DD/YYYY
            if ($mo <= 31 && $d <= 12) {
                return $this->safeCreate($year, $d, $mo);
            }
        }

        // 5. Indonesian textual — "26 Mei 2008"
        $normalised = preg_replace_callback(
            '/\b([A-Za-z]+)\b/u',
            function ($matches) {
                $token = mb_strtolower($matches[1]);
                return self::ID_MONTH_LOOKUP[$token] ?? $matches[1];
            },
            $value
        ) ?? $value;

        if (preg_match('/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/', $normalised, $m)) {
            return $this->safeCreate((int) $m[3], (int) $m[2], (int) $m[1]);
        }

        // 6. Final fallback — let Carbon try
        try {
            return Carbon::parse($normalised)->startOfDay();
        } catch (\Throwable $_) {
            return null;
        }
    }

    private function safeCreate(int $year, int $month, int $day): ?Carbon
    {
        if (!checkdate($month, $day, $year)) {
            return null;
        }
        return Carbon::create($year, $month, $day, 0, 0, 0);
    }

    private function parseStatus($raw): bool
    {
        if (is_bool($raw))    return $raw;
        if (is_numeric($raw)) return (int) $raw === 1;

        $token = mb_strtolower(trim((string) $raw));
        return in_array($token, ['1', 'true', 'lulus', 'l', 'yes', 'ya'], true);
    }

    public function rules(): array
    {
        return [
            'nisn'        => 'required',
            'name'        => 'required',
            'birth_place' => 'required',
            'birth_date'  => 'required',
            'class'       => 'required',
            'major'       => 'required',
            'status'      => 'required',
        ];
    }
}
