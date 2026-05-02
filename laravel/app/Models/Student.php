<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Student extends Model
{
    use HasFactory;

    protected $fillable = [
        'nisn',
        'name',
        'birth_place',
        'birth_date',
        'class',
        'major',          // Konsentrasi Keahlian
        'status_graduation',
    ];

    protected $casts = [
        'birth_date'        => 'date',
        'status_graduation' => 'boolean',
    ];

    /**
     * Always expose the formatted accessors when serializing for the API,
     * so the React frontend receives Indonesian month names and the inline
     * "Tempat, Tanggal Lahir" string out of the box.
     */
    protected $appends = [
        'formatted_birth_date',
        'inline_birth',
    ];

    /**
     * Indonesian month dictionary (1..12).
     */
    private const ID_MONTHS = [
        1 => 'Januari', 2 => 'Februari', 3 => 'Maret',
        4 => 'April',   5 => 'Mei',      6 => 'Juni',
        7 => 'Juli',    8 => 'Agustus',  9 => 'September',
        10 => 'Oktober', 11 => 'November', 12 => 'Desember',
    ];

    /**
     * Format birth_date as "26 Mei 2008".
     */
    public function getFormattedBirthDateAttribute(): ?string
    {
        if (!$this->birth_date) {
            return null;
        }

        $date  = $this->birth_date instanceof Carbon
            ? $this->birth_date
            : Carbon::parse($this->birth_date);

        $month = self::ID_MONTHS[(int) $date->format('n')] ?? $date->format('F');

        return sprintf('%d %s %d', (int) $date->format('j'), $month, (int) $date->format('Y'));
    }

    /**
     * Combine birth_place + formatted_birth_date.
     * Example: "Wonogiri, 26 Mei 2008".
     */
    public function getInlineBirthAttribute(): string
    {
        $place = trim((string) $this->birth_place);
        $date  = $this->getFormattedBirthDateAttribute();

        if ($place === '' && $date === null) {
            return '-';
        }
        if ($place === '') {
            return (string) $date;
        }
        if ($date === null) {
            return $place;
        }

        return "{$place}, {$date}";
    }

    /**
     * Get the grades associated with the student.
     */
    public function grades(): HasMany
    {
        return $this->hasMany(Grade::class);
    }
}
