"use client";

import { useSyncExternalStore } from "react";

import { isTauriRuntime } from "@/lib/tauri/platform";

// useSyncExternalStore avoids the set-state-in-effect anti-pattern flagged by
// React 19.2's lint rules: SSR uses the server snapshot (always false), and
// the client paint flips to the true runtime value without an extra render.
const subscribe = () => () => {};
const getServerSnapshot = () => false;

/**
 * Returns whether the app is running inside Tauri. Stable across SSR (false)
 * and the first client paint (real value) — no hydration warning.
 */
export function useIsTauri(): boolean {
  return useSyncExternalStore(subscribe, isTauriRuntime, getServerSnapshot);
}
