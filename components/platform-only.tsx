"use client";

import type { ReactNode } from "react";

import { useIsTauri } from "@/hooks/use-is-tauri";

type Props = {
  /** Render children only when the runtime matches. */
  on: "web" | "tauri";
  children: ReactNode;
  /** Optional fallback for the non-matching runtime. */
  fallback?: ReactNode;
};

export function PlatformOnly({ on, children, fallback = null }: Props) {
  const isTauri = useIsTauri();
  const matches = on === "tauri" ? isTauri : !isTauri;
  return <>{matches ? children : fallback}</>;
}
