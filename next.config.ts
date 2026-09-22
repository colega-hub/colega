import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Basic production hardening (deployment prep, not a redesign): clickjacking, MIME-sniffing,
// referrer leakage, and unused browser-permission defaults. Deliberately NOT a Content-Security-
// Policy — a real CSP here needs to account for Next.js's own inline bootstrap scripts, Framer
// Motion, and Supabase's REST/Auth endpoints, and getting that wrong silently breaks the site
// rather than failing loudly; it needs its own dedicated pass with the app actually running
// against it, not a guess bundled into this deployment-prep pass.
//
// HTTPS itself needs no header here — Netlify terminates TLS and redirects http -> https for
// every site automatically. Strict-Transport-Security below reinforces that for returning
// visitors; deliberately no `preload` (that's a one-way submission to browsers' built-in preload
// lists, not something to opt into as a side effect of a deployment-prep pass).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
