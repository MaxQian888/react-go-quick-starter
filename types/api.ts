/** Standard envelope returned by ApiClient.request(). */
export type ApiResponse<T> = {
  data: T;
  status: number;
};

/** Normalized error shape thrown by the API client. */
export type ApiErrorPayload = {
  code?: string;
  message: string;
  details?: unknown;
  status: number;
};
