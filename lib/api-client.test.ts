import { ApiError, createApiClient } from "./api-client";

const BASE = "http://localhost:7777";

function mockFetchOnce(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe("createApiClient", () => {
  describe("verbs", () => {
    const api = createApiClient(BASE);

    it("GET sends method and parses body", async () => {
      global.fetch = mockFetchOnce(200, { id: 1 });

      const res = await api.get<{ id: number }>("/users");

      expect(fetch).toHaveBeenCalledWith(
        `${BASE}/users`,
        expect.objectContaining({ method: "GET" }),
      );
      expect(res).toEqual({ data: { id: 1 }, status: 200 });
    });

    it("POST stringifies body and sets Content-Type", async () => {
      global.fetch = mockFetchOnce(201, { id: 1 });

      await api.post("/users", { name: "Alice" });

      const [, init] = (fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ name: "Alice" }));
      expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    });

    it("PUT and DELETE send the right method", async () => {
      global.fetch = mockFetchOnce(200, {});
      await api.put("/users/1", { name: "Bob" });
      expect((fetch as jest.Mock).mock.calls[0][1].method).toBe("PUT");

      global.fetch = mockFetchOnce(200, {});
      await api.delete("/users/1");
      expect((fetch as jest.Mock).mock.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("auth handlers", () => {
    it("attaches Authorization when getToken returns a token", async () => {
      const api = createApiClient(BASE, { getToken: () => "tok123" });
      global.fetch = mockFetchOnce(200, {});

      await api.get("/me");

      const [, init] = (fetch as jest.Mock).mock.calls[0];
      expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok123");
    });

    it("skips Authorization when skipAuth is true", async () => {
      const api = createApiClient(BASE, { getToken: () => "tok" });
      global.fetch = mockFetchOnce(200, {});

      await api.get("/public", { skipAuth: true });

      const [, init] = (fetch as jest.Mock).mock.calls[0];
      expect((init.headers as Headers).get("Authorization")).toBeNull();
    });

    it("retries once with refreshed token on 401", async () => {
      const refreshToken = jest.fn().mockResolvedValue("fresh");
      let calls = 0;
      const fetchMock = jest.fn().mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve(""),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ ok: true })),
        });
      });
      global.fetch = fetchMock;

      const api = createApiClient(BASE, {
        getToken: () => "stale",
        refreshToken,
      });

      const res = await api.get<{ ok: boolean }>("/me");

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondCall = fetchMock.mock.calls[1][1];
      expect((secondCall.headers as Headers).get("Authorization")).toBe("Bearer fresh");
      expect(res.data).toEqual({ ok: true });
    });

    it("coalesces concurrent 401 retries into one refresh", async () => {
      const refreshToken = jest.fn().mockResolvedValue("fresh");
      const fetchMock = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
        const auth = (init.headers as Headers).get("Authorization");
        return Promise.resolve(
          auth === "Bearer fresh"
            ? { ok: true, status: 200, text: () => Promise.resolve("{}") }
            : { ok: false, status: 401, text: () => Promise.resolve("") },
        );
      });
      global.fetch = fetchMock;

      const api = createApiClient(BASE, {
        getToken: () => "stale",
        refreshToken,
      });

      await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);

      expect(refreshToken).toHaveBeenCalledTimes(1);
    });

    it("calls onAuthFailure when refresh returns null", async () => {
      const onAuthFailure = jest.fn();
      global.fetch = mockFetchOnce(401, {});

      const api = createApiClient(BASE, {
        getToken: () => "stale",
        refreshToken: () => Promise.resolve(null),
        onAuthFailure,
      });

      await expect(api.get("/me")).rejects.toThrow(ApiError);
      expect(onAuthFailure).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    const api = createApiClient(BASE);

    it("throws ApiError with server message", async () => {
      global.fetch = mockFetchOnce(401, { message: "unauthorized" });

      const err = await api.get("/secret").catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toBe("unauthorized");
      expect(err.status).toBe(401);
    });

    it("falls back to HTTP <status> when no message", async () => {
      global.fetch = mockFetchOnce(500, {});

      const err = await api.get("/fail").catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toBe("HTTP 500");
    });

    it("survives unparseable JSON bodies", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve("<html>bad gateway</html>"),
      });

      const err = await api.get("/bad").catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(502);
    });
  });

  describe("wsUrl", () => {
    const api = createApiClient(BASE);

    it("converts http to ws", () => {
      expect(api.wsUrl("/ws")).toBe("ws://localhost:7777/ws");
    });

    it("converts https to wss", () => {
      const secure = createApiClient("https://example.com");
      expect(secure.wsUrl("/ws")).toBe("wss://example.com/ws");
    });

    it("appends token as query param", () => {
      expect(api.wsUrl("/ws", "tok")).toBe("ws://localhost:7777/ws?token=tok");
    });
  });

  describe("base URL handling", () => {
    it("strips trailing slash", async () => {
      const api = createApiClient("http://localhost:7777/");
      global.fetch = mockFetchOnce(200, {});

      await api.get("/test");

      expect(fetch).toHaveBeenCalledWith("http://localhost:7777/test", expect.anything());
    });
  });
});
