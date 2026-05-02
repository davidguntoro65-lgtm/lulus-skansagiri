<?php
/**
 * @license
 * Developed by: TIM IT SKANSAGIRI
 * Powered by: Joben Enterprise
 *
 * Dynamic CORS — accepts requests from any domain the portal is installed on.
 *
 * Why `allowed_origins => ['*']` is safe here:
 *   • This portal exposes only **read-only public endpoints** (countdown,
 *     school identity) plus admin endpoints which must be protected by
 *     authentication / a network-level rule on the host (cPanel htaccess /
 *     Cloudflare Access / etc.). It does NOT use cookie-based sessions, so
 *     CSRF leakage from a foreign origin is not a concern.
 *   • Setting a fixed allowed origin would defeat the whole "drop-in on any
 *     domain" goal — the operator would have to edit a config every time the
 *     portal is migrated to a new domain.
 *
 * If you later add cookie auth, switch to `allowed_origins_patterns` with a
 * regex that matches your owned domains and set `supports_credentials` true.
 */

return [
    'paths'                    => ['api/*', 'storage/*'],
    'allowed_methods'          => ['*'],
    'allowed_origins'          => ['*'],
    'allowed_origins_patterns' => [],
    'allowed_headers'          => ['*'],
    'exposed_headers'          => [],
    'max_age'                  => 86400,
    'supports_credentials'     => false,
];
