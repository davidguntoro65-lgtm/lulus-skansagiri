<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI & Joben Enterprise
 *
 * LoginController — gate-keeper for the admin panel.
 *
 * The school requires a **permanent built-in administrator** that cannot be
 * reset, edited, or deleted from the UI / database. We implement that by
 * short-circuiting the auth flow: when the submitted username matches the
 * hard-coded `ADMIN_USER`, we verify the password against the hard-coded
 * `ADMIN_PASS` directly and skip the `users` table lookup entirely.
 *
 * The mirror credentials live in `src/App.tsx` (`ADMIN_USER` / `ADMIN_PASS`)
 * so the SPA can authenticate itself even when the Laravel API is offline.
 *
 * Endpoints (registered in routes/api.php):
 *   POST /api/panel-admin/login    → check credentials, issue session token
 *   POST /api/panel-admin/logout   → invalidate session
 *   GET  /api/panel-admin/me       → return active admin metadata
 */

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class LoginController extends Controller
{
    /** Hard-coded built-in admin (read-only, cannot be edited from UI). */
    public const ADMIN_USER = 'jobenapp';
    public const ADMIN_PASS = '081460081343';

    /**
     * POST /api/panel-admin/login
     * Body: { username, password }
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => 'required|string|max:64',
            'password' => 'required|string|max:128',
        ]);

        $user = trim($data['username']);
        $pass = $data['password'];

        // 1) Built-in administrator — bypasses DB lookup.
        if ($user === self::ADMIN_USER && hash_equals(self::ADMIN_PASS, $pass)) {
            $token = Str::random(48);
            $request->session()->put('panel_admin', [
                'username'  => self::ADMIN_USER,
                'role'      => 'built_in_admin',
                'read_only' => true,
                'token'     => $token,
                'issued_at' => now()->toIso8601String(),
            ]);
            return response()->json([
                'success' => true,
                'data'    => [
                    'username' => self::ADMIN_USER,
                    'role'     => 'built_in_admin',
                    'token'    => $token,
                    'redirect' => '/panel-admin/dashboard',
                ],
            ]);
        }

        // 2) (Optional) fall through to a regular `users` table lookup here.
        //    Left commented because the school deployment uses the built-in
        //    account exclusively; uncomment when extra operators are needed.
        //
        // $row = \App\Models\User::where('username', $user)->first();
        // if ($row && Hash::check($pass, $row->password)) { … }

        return response()->json([
            'success' => false,
            'message' => 'Username atau password salah.',
        ], 401);
    }

    /** POST /api/panel-admin/logout */
    public function logout(Request $request): JsonResponse
    {
        $request->session()->forget('panel_admin');
        return response()->json(['success' => true]);
    }

    /** GET /api/panel-admin/me */
    public function me(Request $request): JsonResponse
    {
        $admin = $request->session()->get('panel_admin');
        if (!$admin) {
            return response()->json(['success' => false, 'message' => 'Belum login.'], 401);
        }
        return response()->json([
            'success' => true,
            'data'    => [
                'username'  => $admin['username'] ?? null,
                'role'      => $admin['role'] ?? null,
                'read_only' => (bool)($admin['read_only'] ?? true),
                'issued_at' => $admin['issued_at'] ?? null,
            ],
        ]);
    }
}
