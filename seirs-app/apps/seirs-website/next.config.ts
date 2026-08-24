import type { NextConfig } from "next";

/**
 * Vercel deploys this site as Next.js SSR (vercel.json points at .next
 * output). We used to have `output: 'export'` here but that:
 *   1. Broke dynamic runtime routes like /track/[code] where the code
 *      cannot be enumerated at build time.
 *   2. Silently disabled the ISR `revalidate = 60` in sitemap.ts.
 *   3. Contradicted the vercel.json output dir.
 *
 * eslint.ignoreDuringBuilds and typescript.ignoreBuildErrors were both true
 * here until 2026-08-23. They defeated the standing local-build-before-push
 * rule for this app: `next build` exited 0 with real type errors in the
 * tree, so nothing ever surfaced. That is how 72 lines of dead LangSwitcher,
 * a `meta` lookup on a type with no `meta` field, and a pile of unused
 * imports all survived. Both are off. If a build fails, fix the code.
 */
const nextConfig: NextConfig = {
  // Site-wide security headers. Applied to every response on Vercel.
  // Cheap, standards-track, and closes the most common vector attacks
  // (clickjacking, mime-sniffing, referrer leaks, cross-origin leaks).
  // CSP is intentionally NOT set here yet: adding it without auditing
  // every inline script / third-party embed first would break the site.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',         value: 'DENY' },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control',  value: 'on' },
          // HSTS: 1 year, include subdomains, allow browser preload list.
          // Safe to send in dev because browsers only enforce over HTTPS.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
