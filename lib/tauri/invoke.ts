import { isTauriRuntime } from "./platform";

/**
 * Typed wrapper around `@tauri-apps/api/core` invoke that:
 *  - throws a clear error in web mode rather than crashing on the missing global
 *  - dynamically imports the SDK so web-mode bundles don't pay the cost
 */
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`tauriInvoke("${cmd}") called outside Tauri runtime`);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Best-effort variant: returns null on failure or non-Tauri environments. */
export async function tryTauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (err) {
    console.warn(`tauriInvoke(${cmd}) failed:`, err);
    return null;
  }
}
