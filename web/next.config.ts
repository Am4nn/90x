import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Automatic memoization; replaces hand-written useMemo/useCallback.
  reactCompiler: true,

  // No client cache for dynamic pages (the default, 0): every tab is fetched fresh.
  // A tap still answers at once (the shell shows the tab's skeleton itself), and a cached
  // Feed would hand back a card already answered on a quick Feed → Today → Feed hop.

  // Sign-in lives on the landing page now. Old links, bookmarks and an installed app's
  // saved page land there; the query string (?error=callback) is passed through.
  redirects: () => Promise.resolve([{ source: "/sign-in", destination: "/", permanent: false }]),

  // Response headers on every route. Deliberately the boring ones: there is no
  // script-src here because the App Router emits inline bootstrap scripts, so a
  // real policy needs a per-request nonce, and a nonce forces every page to render
  // per request (the landing page and /try are static). The CSP carries only the
  // directives that cost nothing and never touch scripts:
  //   - frame-ancestors 'none': the whole app is one-click actions behind a session cookie;
  //   - object-src 'none': no plugin content (<object>, <embed>), which the app never uses;
  //   - base-uri 'self': an injected <base> cannot point relative script URLs at another host;
  //   - form-action 'self': a form can only post here. Every form and server action posts to this
  //     origin and redirects only within it; Google sign-in is a script navigation
  //     (signInWithOAuth), not a form post, so it is not affected.
  //
  // The break-in HTTP sweep (web/scripts/break-in/http.ts) asserts these exact
  // strings on a real response, so a header that never matches the route fails
  // CI rather than silently serving nothing.
  headers: () =>
    Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
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
