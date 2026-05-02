<?php
/**
 * @license
 * Developed by: TIM IT Skansagiri
 * Powered by: Dave_Exe
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Gallery extends Model
{
    protected $table = 'galleries';

    protected $fillable = [
        'image_path',
        'title',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];
}
