/**
 * DTOs that mirror the Go backend's JSON contract for /api/v1/auth/*.
 * The shapes are intentionally narrow — only fields the frontend consumes.
 */

export type User = {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = LoginRequest & {
  name?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: User;
};

export type RefreshRequest = {
  refreshToken: string;
};
