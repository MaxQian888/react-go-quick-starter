import { API_ROUTES } from "@/constants/api";
import type { ApiErrorPayload, ApiResponse } from "@/types/api";

type RequestOptions = Omit<RequestInit, "method" | "body"> & {
  /** Skip auth handling: do not attach token, do not retry on 401. */
  skipAuth?: boolean;
};

/** Resolves the current access token (in-memory) for outbound requests. */
export type TokenGetter = () => string | null | undefined;

/** Returns a fresh access token after a 401, or null/undefined if refresh failed. */
export type TokenRefresher = () => Promise<string | null>;

export class ApiError extends Error implements ApiErrorPayload {
  readonly code?: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    this.status = payload.status;
    this.details = payload.details;
  }
}

type ClientHandlers = {
  /** Reads the in-memory access token. */
  getToken?: TokenGetter;
  /** Performs a refresh roundtrip. Concurrent 401s share one promise. */
  refreshToken?: TokenRefresher;
  /** Called when refresh fails. The auth store wires this to clear local state. */
  onAuthFailure?: () => void;
};

/**
 * Build a fetch-based API client bound to a base URL. Auth handling is
 * orthogonal: callers can provide a token getter/refresher to enable
 * Authorization injection and 401 retry, or omit them for a plain HTTP client.
 */
export function createApiClient(baseUrl: string, handlers: ClientHandlers = {}) {
  let inflightRefresh: Promise<string | null> | null = null;

  const refreshOnce = (): Promise<string | null> => {
    if (!handlers.refreshToken) return Promise.resolve(null);
    if (!inflightRefresh) {
      inflightRefresh = handlers.refreshToken().finally(() => {
        inflightRefresh = null;
      });
    }
    return inflightRefresh;
  };

  const request = async <T>(
    path: string,
    init: RequestInit,
    opts: RequestOptions = {},
  ): Promise<ApiResponse<T>> => {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const token = !opts.skipAuth ? handlers.getToken?.() : null;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let res = await fetch(url, { ...init, headers });

    // Retry once with a refreshed token. Skip if the failed call was the
    // refresh endpoint itself, or the caller opted out of auth handling.
    if (
      res.status === 401 &&
      !opts.skipAuth &&
      path !== API_ROUTES.auth.refresh &&
      handlers.refreshToken
    ) {
      const next = await refreshOnce();
      if (next) {
        headers.set("Authorization", `Bearer ${next}`);
        res = await fetch(url, { ...init, headers });
      } else {
        handlers.onAuthFailure?.();
      }
    }

    const body = await safeJson(res);

    if (!res.ok) {
      throw new ApiError({
        code: typeof body?.code === "string" ? body.code : undefined,
        message: typeof body?.message === "string" ? body.message : `HTTP ${res.status}`,
        details: body?.details,
        status: res.status,
      });
    }

    return { data: body as T, status: res.status };
  };

  return {
    request,

    get<T>(path: string, opts?: RequestOptions) {
      return request<T>(path, { method: "GET", ...opts }, opts);
    },

    post<T>(path: string, body: unknown, opts?: RequestOptions) {
      return request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}), ...opts }, opts);
    },

    put<T>(path: string, body: unknown, opts?: RequestOptions) {
      return request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}), ...opts }, opts);
    },

    delete<T>(path: string, opts?: RequestOptions) {
      return request<T>(path, { method: "DELETE", ...opts }, opts);
    },

    /** Build a WebSocket URL (http→ws / https→wss) and optionally append a token. */
    wsUrl(path: string, token?: string): string {
      const ws = baseUrl.replace(/^http/, "ws").replace(/\/$/, "");
      return token ? `${ws}${path}?token=${token}` : `${ws}${path}`;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
