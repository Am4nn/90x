"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Replaces the root layout when it fails, so no theme or fonts: inline styles only.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#0a0c10",
          color: "#e6e9ef",
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
      >
        <title>90x</title>
        <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 16 }}>
          <strong style={{ fontSize: 22 }}>
            90<span style={{ color: "#67e8f9" }}>x</span>
          </strong>
          <div style={{ border: "1px solid rgba(248,113,113,.4)", borderRadius: 14, padding: 18, background: "#0f1218" }}>
            <div style={{ fontWeight: 600 }}>The app failed to load.</div>
            {error.digest && <div style={{ fontSize: 13, color: "#7d8594", marginTop: 4 }}>Reference {error.digest}</div>}
          </div>
          <button
            onClick={retry}
            style={{
              height: 44,
              borderRadius: 12,
              border: 0,
              background: "#67e8f9",
              color: "#0a0c10",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
