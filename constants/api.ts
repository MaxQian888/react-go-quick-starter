/**
 * Backend HTTP routes. Keep grouped by domain so we can swap base paths or
 * versions in one place when the Go API evolves.
 */
export const API_ROUTES = {
  auth: {
    login: "/api/v1/auth/login",
    register: "/api/v1/auth/register",
    refresh: "/api/v1/auth/refresh",
    logout: "/api/v1/auth/logout",
    me: "/api/v1/users/me",
  },
  health: "/api/v1/health",
  ws: "/api/v1/ws",
} as const;

export const DEFAULT_BACKEND_URL = "http://localhost:7777";
