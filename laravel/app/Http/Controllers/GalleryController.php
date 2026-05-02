<?php
/**
 * @license
 * Developed by: TIM IT Skansagiri
 * Powered by: Dave_Exe
 *
 * Gallery CRUD — feeds the public landing-page marquee
 * ("Momen & Kegiatan SKANSAGIRI"). Each upload is normalised to **exactly**
 * 600x400 (3:2) via Intervention Image so the marquee on the SPA never has
 * to deal with mixed aspect ratios.
 *
 * Public:
 *   GET  /api/galleries           → list (newest first)
 *
 * Admin (under /api/admin/galleries):
 *   POST   /                      → upload + crop + insert
 *   DELETE /{id}                  → remove file + row
 *   POST   /clear                 → wipe all
 *
 * The matching React layer (src/App.tsx → "Galeri Sekolah" panel inside
 * the Pengaturan tab) calls these endpoints via `apiCall()` and falls back
 * to the localStorage `galleryStore` when the backend is unreachable, so the
 * UI works identically whether or not Laravel is wired up.
 */

namespace App\Http\Controllers;

use App\Models\Gallery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Laravel\Facades\Image;

class GalleryController extends Controller
{
    /** Hard cap aligned with the localStore fallback. */
    private const MAX_ITEMS = 30;

    /** Public — list every gallery item, newest first. */
    public function index(): JsonResponse
    {
        $items = Gallery::orderByDesc('id')
            ->get()
            ->map(fn (Gallery $g) => [
                'id'         => $g->id,
                'image_path' => Storage::disk('public')->url($g->image_path),
                'title'      => (string) $g->title,
                'created_at' => optional($g->created_at)->toIso8601String(),
            ]);

        return response()->json([
            'success' => true,
            'data'    => $items,
        ]);
    }

    /** Admin — accept a single image, crop to 600x400, persist. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'], // 8 MB
            'title' => ['nullable', 'string', 'max:120'],
        ]);

        if (Gallery::count() >= self::MAX_ITEMS) {
            return response()->json([
                'success' => false,
                'message' => 'Galeri sudah mencapai batas maksimal '.self::MAX_ITEMS.' foto. Hapus salah satu sebelum mengunggah baru.',
            ], 422);
        }

        // Intervention Image v3: scale-to-fill + center-crop to exactly 600x400.
        // `cover()` is the v3 equivalent of v2's `fit()` and guarantees
        // identical dimensions for every uploaded photo.
        $img = Image::read($validated['image'])
            ->cover(600, 400)
            ->toJpeg(82);

        $filename = 'galleries/'.uniqid('gal_', true).'.jpg';
        Storage::disk('public')->put($filename, (string) $img);

        $gallery = Gallery::create([
            'image_path' => $filename,
            'title'      => $validated['title'] ?? null,
            'sort_order' => 0,
        ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'         => $gallery->id,
                'image_path' => Storage::disk('public')->url($gallery->image_path),
                'title'      => (string) $gallery->title,
                'created_at' => $gallery->created_at?->toIso8601String(),
            ],
            'message' => 'Foto galeri berhasil diunggah.',
        ]);
    }

    /** Admin — remove a single photo + its file from public disk. */
    public function destroy(int $id): JsonResponse
    {
        $row = Gallery::find($id);
        if (! $row) {
            return response()->json(['success' => false, 'message' => 'Foto tidak ditemukan.'], 404);
        }

        if ($row->image_path && Storage::disk('public')->exists($row->image_path)) {
            Storage::disk('public')->delete($row->image_path);
        }
        $row->delete();

        return response()->json(['success' => true, 'message' => 'Foto galeri dihapus.']);
    }

    /** Admin — wipe every gallery photo (used by "Hapus Semua Foto"). */
    public function clear(): JsonResponse
    {
        $rows = Gallery::all();
        foreach ($rows as $row) {
            if ($row->image_path && Storage::disk('public')->exists($row->image_path)) {
                Storage::disk('public')->delete($row->image_path);
            }
        }
        Gallery::query()->delete();

        return response()->json(['success' => true, 'message' => 'Semua foto galeri telah dihapus.']);
    }
}
