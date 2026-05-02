<?php
/**
 * @license
 * Developed by: TIM IT Skansagiri
 * Powered by: Dave_Exe
 *
 * Schema for the public landing-page "Momen & Kegiatan SKANSAGIRI" marquee.
 * Every uploaded image is processed by Intervention Image's `fit(600, 400)`
 * helper inside the controller so every row stores a perfectly uniform
 * 600x400 (3:2) JPEG — the marquee on the SPA never has to deal with mixed
 * aspect ratios.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('galleries', function (Blueprint $table) {
            $table->id();
            $table->string('image_path');                  // storage/app/public/...
            $table->string('title')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('sort_order');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('galleries');
    }
};
