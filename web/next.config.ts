import type { NextConfig } from "next";
import { CONTENT_SECURITY_POLICY } from "./src/lib/csp";

const nextConfig: NextConfig = {
  // Automatic memoization; replaces hand-written useMemo/useCallback.
  reactCompiler: true,

  // No client cache for dynamic pages (the default, 0): every tab is fetched fresh.
  // A tap still answers at once (the shell shows the tab's skeleton itself), and a cached
  // Feed would hand back a card already answered on a quick Feed → Today → Feed hop.

  // Sign-in lives on the landing page now. Old links, bookmarks and an installed app's
  // saved page land there; the query string (?error=callback) is passed through.
  redirects: () => Promise.resolve([{ source: "/sign-in", destination: "/", permanent: false }]),

  // Response headers on every route. The CSP and why it holds what it does: src/lib/csp.ts.
  // The break-in HTTP sweep (web/scripts/break-in/http.ts) asserts these exact
  // strings on a real response, so a header that never matches the route fails
  // CI rather than silently serving nothing.
  headers: () =>
    Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app uses no camera, microphone or other device API, so deny all
          // of them rather than whitelist one it never opens.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          // Honoured over HTTPS only, so localhost is unaffected.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ]),
};

export default nextConfig;
