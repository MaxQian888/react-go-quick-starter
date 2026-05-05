/**
 * @jest-environment jsdom
 */
import { ACCESS_TOKEN_COOKIE, AUTH_STORAGE_KEY } from "@/constants/routes";
import type { AuthResponse } from "@/types/auth";

import { useAuthStore } from "./auth-store";

const RESP: AuthResponse = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  user: { id: "u_1", email: "test@example.com", createdAt: "2026-01-01T00:00:00Z" },
};

function reset() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    loaded: false,
  });
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0`;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

beforeEach(() => reset());

describe("useAuthStore", () => {
  it("setSession populates user, tokens, and the access cookie", () => {
    useAuthStore.getState().setSession(RESP);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(RESP.user);
    expect(state.accessToken).toBe(RESP.accessToken);
    expect(state.refreshToken).toBe(RESP.refreshToken);
    expect(document.cookie).toContain(`${ACCESS_TOKEN_COOKIE}=${RESP.accessToken}`);
  });

  it("setTokens rotates the access cookie without touching the user", () => {
    useAuthStore.getState().setSession(RESP);
    useAuthStore.getState().setTokens({ accessToken: "access-2", refreshToken: "refresh-2" });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("access-2");
    expect(state.refreshToken).toBe("refresh-2");
    expect(state.user).toEqual(RESP.user);
    expect(document.cookie).toContain(`${ACCESS_TOKEN_COOKIE}=access-2`);
  });

  it("clear wipes the session and the cookie", () => {
    useAuthStore.getState().setSession(RESP);
    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(document.cookie).not.toContain(`${ACCESS_TOKEN_COOKIE}=access-1`);
  });
});
