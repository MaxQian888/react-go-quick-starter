/**
 * Single source of truth for "are we running inside Tauri?". Other modules
 * (api-client base URL, native invokes, platform-only UI) read from here.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type Platform = "web" | "windows" | "macos" | "linux" | "ios" | "android" | "unknown";

/**
 * Resolve the host platform. In web mode this returns "web"; in Tauri mode it
 * inspects navigator.userAgent (cheap, sync) and falls back to "unknown".
 * For exact OS detection inside Tauri, prefer `@tauri-apps/plugin-os`.
 */
export function getPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  if (!isTauriRuntime()) return "web";

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  return "unknown";
}
