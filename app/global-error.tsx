"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary that catches errors in the root layout itself.
 * Must define its own <html> / <body> because the layout is missing.
 * Keep dependencies minimal: i18n, theme provider, etc. may be the cause.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Application crashed</h1>
        <p style={{ maxWidth: "32rem", color: "#666" }}>
          A fatal error prevented the app from rendering. Please reload the page.
        </p>
        {error.digest ? (
          <p style={{ fontSize: "0.75rem", color: "#999" }}>digest: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            cursor: "pointer",
            padding: "0.5rem 1rem",
            border: "1px solid #ccc",
            borderRadius: "0.375rem",
            background: "transparent",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
