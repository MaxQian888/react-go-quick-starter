/**
 * Centralized route paths. Both the server-side middleware and the client-side
 * navigation rely on these constants to stay in sync.
 */
export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/** Paths that anonymous visitors can reach without an access token. */
export const AUTH_PUBLIC_PATHS = [ROUTES.home, ROUTES.login, ROUTES.register] as const;

/** Cookie name used to mirror the access token for the server middleware. */
export const ACCESS_TOKEN_COOKIE = "rgs_access_token";

/** localStorage key used by the auth store. Persists user only, not tokens. */
export const AUTH_STORAGE_KEY = "react-go-starter:auth";
