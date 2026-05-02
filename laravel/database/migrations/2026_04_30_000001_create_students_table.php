<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Final official document schema for SMKN 1 Wonogiri 2026.
     * Mandatory columns: nisn, name, birth_place, birth_date, class,
     * major (Konsentrasi Keahlian), status_graduation.
     */
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table) {
            $table->id();
            $table->string('nisn')->unique();
            $table->string('name');
            $table->string('birth_place');
            $table->date('birth_date');
            $table->string('class');
            $table->string('major'); // Konsentrasi Keahlian
            $table->boolean('status_graduation')->default(false);
            $table->timestamps();

            $table->index('nisn');
            $table->index(['class', 'major']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
