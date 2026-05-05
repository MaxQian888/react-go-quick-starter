"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ACCESS_TOKEN_COOKIE, AUTH_STORAGE_KEY } from "@/constants/routes";
import type { AuthResponse, AuthTokens, User } from "@/types/auth";

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** True after persist middleware has rehydrated (avoids client/server flash). */
  loaded: boolean;
  setSession: (resp: AuthResponse) => void;
  setTokens: (tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  clear: () => void;
};

const isBrowser = typeof window !== "undefined";

// Cookie mirror exists so the server-side middleware can see the access token.
// This is a session cookie (no `max-age`), set on every token rotation.
function writeAccessCookie(value: string | null) {
  if (!isBrowser) return;
  if (value === null) {
    document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    document.cookie = `${ACCESS_TOKEN_COOKIE}=${value}; path=/; samesite=lax`;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      loaded: false,
      setSession: (resp) => {
        writeAccessCookie(resp.accessToken);
        set({
          user: resp.user,
          accessToken: resp.accessToken,
          refreshToken: resp.refreshToken,
        });
      },
      setTokens: (tokens) => {
        writeAccessCookie(tokens.accessToken);
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      },
      setUser: (user) => set({ user }),
      clear: () => {
        writeAccessCookie(null);
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      // Tokens in localStorage are convenient but XSS-vulnerable. Production
      // deployments should swap to httpOnly cookies set by the Go backend
      // (the schema here keeps client code identical when that change lands).
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.accessToken) writeAccessCookie(state.accessToken);
          state.loaded = true;
        }
      },
    },
  ),
);
