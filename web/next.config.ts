import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Automatic memoization; replaces hand-written useMemo/useCallback.
  reactCompiler: true,

  // Response headers on every route. Deliberately the boring ones: there is no
  // full Content-Security-Policy here because the App Router emits inline
  // bootstrap scripts, so a real policy needs a per-request nonce, and a wrong
  // one blanks the page. `frame-ancestors` is the directive that costs nothing
  // to get right and matters most, because the whole app is one-click actions
  // behind a session cookie.
  //
  // The break-in HTTP sweep (web/scripts/break-in/http.ts) asserts these exact
  // strings on a real response, so a header that never matches the route fails
  // CI rather than silently serving nothing.
  headers: () =>
    Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
