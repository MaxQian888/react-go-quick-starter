"use client";

import { useEffect, useState } from "react";

import { DEFAULT_BACKEND_URL } from "@/constants/api";
import { tryTauriInvoke } from "@/lib/tauri/invoke";
import { isTauriRuntime } from "@/lib/tauri/platform";

const WEB_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BACKEND_URL;

/**
 * Returns the base URL for the Go backend.
 *  - Web mode: `NEXT_PUBLIC_API_URL` (or the documented default).
 *  - Tauri desktop: asks the Rust layer via the `get_backend_url` command,
 *    which lets the sidecar pick a free port at runtime.
 */
export function useBackendUrl(): string {
  const [url, setUrl] = useState(WEB_URL);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let alive = true;
    tryTauriInvoke<string>("get_backend_url").then((next) => {
      if (alive && next) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return url;
}
