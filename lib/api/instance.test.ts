/**
 * @jest-environment jsdom
 */
type ApiClientHandlers = {
  getToken?: () => string | null | undefined;
  refreshToken?: () => Promise<string | null>;
  onAuthFailure?: () => void;
};

let capturedBaseUrl: string | null = null;
let capturedHandlers: ApiClientHandlers = {};
const fakeApiClient = { post: jest.fn(), get: jest.fn() };

jest.mock("@/lib/api-client", () => {
  // ApiError is needed elsewhere in the codebase; preserve it for the import.
  class ApiError extends Error {}
  return {
    __esModule: true,
    ApiError,
    createApiClient: (baseUrl: string, handlers: ApiClientHandlers) => {
      capturedBaseUrl = baseUrl;
      capturedHandlers = handlers;
      return fakeApiClient;
    },
  };
});

const isTauriMock = jest.fn();
jest.mock("@/lib/tauri/platform", () => ({
  __esModule: true,
  isTauriRuntime: () => isTauriMock(),
}));

const storeState: {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: jest.Mock;
  clear: jest.Mock;
} = {
  accessToken: "a-1",
  refreshToken: "r-1",
  setTokens: jest.fn(),
  clear: jest.fn(),
};

jest.mock("@/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: { getState: () => storeState },
}));

beforeEach(() => {
  capturedBaseUrl = null;
  capturedHandlers = {};
  storeState.accessToken = "a-1";
  storeState.refreshToken = "r-1";
  storeState.setTokens.mockClear();
  storeState.clear.mockClear();
  fakeApiClient.post.mockReset();
  fakeApiClient.get.mockReset();
  isTauriMock.mockReset();
  jest.resetModules();
});

describe("lib/api/instance.ts", () => {
  it("uses the hardcoded sidecar URL when running inside Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    await import("./instance");
    expect(capturedBaseUrl).toBe("http://localhost:7777");
  });

  it("uses NEXT_PUBLIC_API_URL when set in web mode", async () => {
    isTauriMock.mockReturnValue(false);
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    await import("./instance");
    expect(capturedBaseUrl).toBe("https://api.example.com");
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("falls back to DEFAULT_BACKEND_URL when no env var is set", async () => {
    isTauriMock.mockReturnValue(false);
    delete process.env.NEXT_PUBLIC_API_URL;
    await import("./instance");
    expect(capturedBaseUrl).toBe("http://localhost:7777");
  });

  it("getToken delegates to the auth store snapshot", async () => {
    isTauriMock.mockReturnValue(false);
    await import("./instance");
    expect(capturedHandlers.getToken?.()).toBe("a-1");

    storeState.accessToken = null;
    expect(capturedHandlers.getToken?.()).toBeNull();
  });

  it("refreshToken returns null immediately when no refresh token is stored", async () => {
    isTauriMock.mockReturnValue(false);
    storeState.refreshToken = null;
    await import("./instance");

    await expect(capturedHandlers.refreshToken?.()).resolves.toBeNull();
    expect(fakeApiClient.post).not.toHaveBeenCalled();
  });

  it("refreshToken posts to /auth/refresh, persists new tokens, and returns the access token", async () => {
    isTauriMock.mockReturnValue(false);
    fakeApiClient.post.mockResolvedValue({ data: { accessToken: "a-2", refreshToken: "r-2" } });
    await import("./instance");

    const token = await capturedHandlers.refreshToken?.();
    expect(token).toBe("a-2");
    expect(fakeApiClient.post).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      { refreshToken: "r-1" },
      { skipAuth: true },
    );
    expect(storeState.setTokens).toHaveBeenCalledWith({ accessToken: "a-2", refreshToken: "r-2" });
  });

  it("refreshToken returns null when the refresh request rejects", async () => {
    isTauriMock.mockReturnValue(false);
    fakeApiClient.post.mockRejectedValue(new Error("network"));
    await import("./instance");

    await expect(capturedHandlers.refreshToken?.()).resolves.toBeNull();
    expect(storeState.setTokens).not.toHaveBeenCalled();
  });

  it("onAuthFailure clears the auth store", async () => {
    isTauriMock.mockReturnValue(false);
    await import("./instance");
    capturedHandlers.onAuthFailure?.();
    expect(storeState.clear).toHaveBeenCalledTimes(1);
  });
});
