import { API_ROUTES, DEFAULT_BACKEND_URL } from "@/constants/api";
import { createApiClient } from "@/lib/api-client";
import { isTauriRuntime } from "@/lib/tauri/platform";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthTokens } from "@/types/auth";

function resolveBaseUrl(): string {
  // Tauri sidecar always binds to 7777 (src-tauri/src/lib.rs:18). The
  // useBackendUrl() hook can override this asynchronously for components
  // that need the dynamic value, but the singleton is fine with the static
  // hardcoded port for early bootstrap.
  if (isTauriRuntime()) return "http://localhost:7777";
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BACKEND_URL;
}

/**
 * Singleton API client. Auth handlers read/write the auth store, so any
 * 401 anywhere in the app triggers exactly one refresh and updates the
 * session in place.
 */
export const apiClient = createApiClient(resolveBaseUrl(), {
  getToken: () => useAuthStore.getState().accessToken,
  refreshToken: async () => {
    const refresh = useAuthStore.getState().refreshToken;
    if (!refresh) return null;
    try {
      const { data } = await apiClient.post<AuthTokens>(
        API_ROUTES.auth.refresh,
        { refreshToken: refresh },
        { skipAuth: true },
      );
      useAuthStore.getState().setTokens(data);
      return data.accessToken;
    } catch {
      return null;
    }
  },
  onAuthFailure: () => useAuthStore.getState().clear(),
});
