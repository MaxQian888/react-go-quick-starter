/**
 * Centralized TanStack Query key factories. Co-locating keys with their domain
 * prevents drift between components and keeps invalidation easy to reason about.
 */
export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
} as const;
