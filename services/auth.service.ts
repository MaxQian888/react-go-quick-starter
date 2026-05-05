import { API_ROUTES } from "@/constants/api";
import { apiClient } from "@/lib/api/instance";
import type { AuthResponse, LoginRequest, RegisterRequest, User } from "@/types/auth";

/**
 * Auth API surface. Each method returns parsed data and lets callers handle
 * `ApiError` via try/catch or via TanStack Query's onError.
 */
export const authService = {
  async login(req: LoginRequest): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>(API_ROUTES.auth.login, req, {
      skipAuth: true,
    });
    return data;
  },

  async register(req: RegisterRequest): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>(API_ROUTES.auth.register, req, {
      skipAuth: true,
    });
    return data;
  },

  async me(): Promise<User> {
    const { data } = await apiClient.get<User>(API_ROUTES.auth.me);
    return data;
  },

  async logout(): Promise<void> {
    // Best-effort: the server may have already revoked the token, in which
    // case the 401 retry path inside the client will fall through harmlessly.
    try {
      await apiClient.post(API_ROUTES.auth.logout, {});
    } catch {
      /* ignored on purpose */
    }
  },
};
