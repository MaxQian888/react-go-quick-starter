# Architecture

This document captures the moving pieces of `react-go-quick-starter` and how
they fit together. It complements (and is the canonical source for) the
high-level summary in `README.md`.

## Runtime topology

```mermaid
flowchart LR
    subgraph User
        Browser[Browser / Tauri WebView]
    end

    subgraph Frontend [Next.js 16 — React 19]
        App[App Router pages]
        Stores[Zustand stores]
        Query[TanStack Query]
        ApiClient[lib/api-client + lib/api/instance]
    end

    subgraph Boundary [Server boundary]
        Proxy[proxy.ts<br/>route guard]
    end

    subgraph Backend [Go (Echo)]
        Echo[Echo router]
        Middleware[JWT / RBAC / metrics]
        Service[AuthService]
        UserRepo[(User repo)]
        RoleRepo[(Role repo)]
        Cache[(Cache repo)]
    end

    subgraph Data
        PG[(PostgreSQL)]
        Redis[(Redis)]
    end

    Browser -->|HTTP / WebSocket| Proxy
    Browser --> App
    App --> Stores
    App --> Query
    Query --> ApiClient
    ApiClient -->|Bearer JWT| Echo
    Echo --> Middleware
    Middleware --> Service
    Service --> UserRepo --> PG
    Service --> RoleRepo --> PG
    Service --> Cache --> Redis
```

## Deployment surfaces

The same codebase ships two distinct artifacts:

```mermaid
flowchart TB
    Source[/repo: src-go + Next.js + src-tauri/]

    subgraph Web [Web mode — pnpm build:web]
        WebStatic[.next/]
        WebProxy[proxy.ts route guard]
    end

    subgraph Desktop [Desktop mode — pnpm tauri:build]
        Static[out/ static export]
        Sidecar[binaries/server (Go binary)]
        Bundle[Tauri installers .msi/.dmg/.AppImage]
    end

    Source --> Web
    Source --> Desktop
```

Static export disables `proxy.ts` (the Next.js feature flag is unavailable in
SSG). The protected routes still gate access via the client-side guard in
`app/(protected)/layout.tsx`.

## Auth flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as Go API
    participant Redis

    User->>FE: POST /login (email, password)
    FE->>API: POST /api/v1/auth/login
    API->>API: bcrypt verify, look up roles
    API->>Redis: SET refresh:{userID} (TTL = JWT_REFRESH_TTL)
    API-->>FE: { accessToken, refreshToken, user }
    FE->>FE: auth-store.setSession() + cookie mirror
    Note right of FE: subsequent requests carry Authorization

    User->>FE: navigate /dashboard
    FE->>API: GET /api/v1/users/me
    API->>API: JWT verify, blacklist check
    API-->>FE: 200 user

    Note over FE,API: access token expires
    FE->>API: GET /api/v1/users/me
    API-->>FE: 401
    FE->>API: POST /api/v1/auth/refresh
    API->>Redis: GET refresh:{userID}
    API->>Redis: DEL refresh:{userID}
    API->>Redis: SET refresh:{userID} new
    API-->>FE: { accessToken, refreshToken }
    FE->>API: replay original request with new token
    API-->>FE: 200
```

## Key conventions

- **Path aliases**: `@/components/*`, `@/lib/*`, `@/services/*`, `@/types/*`,
  `@/utils/*`, `@/constants/*`, `@/hooks/*`, `@/stores/*`, `@/i18n/*`.
- **Singleton API client**: `lib/api/instance.ts` — wires auth-store handlers
  for token retrieval, refresh, and onAuthFailure clearing.
- **Refresh-token coalescing**: concurrent 401s share one refresh promise (see
  `lib/api-client.ts` `refreshOnce`). Prevents thundering-herd refresh storms.
- **Static export gate**: `next.config.ts` reads `NEXT_OUTPUT_EXPORT=true`.
  `pnpm build` and `pnpm tauri:build` set it; `pnpm dev` and `pnpm build:web`
  do not.
- **Tauri sidecar port**: hardcoded to `7777` in `src-tauri/src/lib.rs`.
  `BACKEND_PORT` env var is honored only in standalone Go mode.
- **JWT claims**: include `roles` and `perms` so middleware authorizes without
  a DB roundtrip. Refresh re-fetches them so privilege changes propagate
  within one access-token lifetime.
- **RBAC seed**: `roles` (`admin`, `user`), `permissions` (`users:read`,
  `users:write`, `admin:access`). Migrations idempotent — adding rows on
  rerun is safe.
