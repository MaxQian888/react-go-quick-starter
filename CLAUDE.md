# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React + Tauri desktop application starter: Next.js 16 (React 19) + Tauri 2.9 + TypeScript + Tailwind CSS v4 + shadcn/ui + Zustand + Go (Echo) backend.

**Dual Runtime Model:**

- **Web mode** (`pnpm dev`): Next.js dev server at <http://localhost:3000>
- **Desktop mode** (`pnpm tauri dev`): Tauri wraps Next.js in a native window; Go backend runs as a bundled sidecar binary on port 7777 (hardcoded in `src-tauri/src/lib.rs`)

## Development Commands

```bash
# Frontend
pnpm dev              # Start Next.js dev server
pnpm build            # Build for production (outputs to out/)
pnpm lint             # Run ESLint
pnpm lint --fix       # Auto-fix ESLint issues
pnpm exec tsc --noEmit  # Type checking

# Testing
pnpm test                          # Run all Jest tests
pnpm test -- --testPathPattern=foo # Run single test file matching "foo"
pnpm test:watch                    # Watch mode
pnpm test:coverage                 # Coverage report (thresholds: 60% branches/functions, 70% lines)

# Add shadcn/ui components
pnpm dlx shadcn@latest add <component-name>
```

## Go Backend Commands

```bash
# ── Docker Services ──────────────────────────────────────────────────────
pnpm services:up      # Start PostgreSQL + Redis (waits for healthy)
pnpm services:down    # Stop services
pnpm services:status  # Show container status
pnpm services:ensure  # Start services only if not already running (idempotent)

# ── Standalone Go Backend ─────────────────────────────────────────────────
pnpm dev:go           # Start Go backend (assumes services already running)
pnpm dev:backend      # ensure services + start Go backend
pnpm dev:all          # ensure services + Go backend + Next.js (full stack)

# ── Direct Go Commands (inside src-go/) ───────────────────────────────────
cd src-go && go run ./cmd/server       # requires services running + src-go/.env
cd src-go && go build ./cmd/server     # build binary
cd src-go && go test ./...             # run all tests
cd src-go && go test -run TestName ./internal/service  # run single named test

# ── Tauri Desktop (includes services + sidecar compilation) ──────────────
pnpm tauri:dev        # ensures services → compiles sidecar → launches Tauri
pnpm tauri:build      # full production build
```

### Environment Setup

```bash
cp .env.example .env.local          # root config (Next.js + scripts)
cp src-go/.env.example src-go/.env  # only needed for direct go run
```

### Backend Environment Variables (`.env.local` or `src-go/.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | Next.js dev server port |
| `BACKEND_PORT` | `7777` | Go backend port (standalone dev only; Tauri always uses 7777) |
| `POSTGRES_URL` | `postgres://dev:dev@localhost:5432/appdb?sslmode=disable` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `JWT_SECRET` | — | Required in production (min 32 chars) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:7777` | Must match `BACKEND_PORT` |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:7777` | Must match `BACKEND_PORT` |
| `ALLOW_ORIGINS` | `http://localhost:3000` | Include `tauri://localhost` for desktop builds |

## Architecture

### Frontend Structure

- `app/` - Next.js App Router (layout.tsx, page.tsx, globals.css)
- `components/ui/` - shadcn/ui components (Radix UI + class-variance-authority). **Do not place test files (`*.test.tsx`, `*.spec.tsx`) here** — these files are vendored from the shadcn registry and may be overwritten by `pnpm dlx shadcn@latest add`. Put component tests in `__tests__/` or co-located outside `components/ui/`.
- `lib/utils.ts` - `cn()` utility (clsx + tailwind-merge)
- `__tests__/` - Jest tests with React Testing Library

### Go Backend Structure (`src-go/`)

Layered architecture: handler → service → repository → database

- `cmd/server/main.go` - Entry point; manual dependency injection (config → DB → repositories → services → handlers → Echo router)
- `internal/config/` - Viper-based config loading from env vars and `.env` file
- `internal/handler/` - HTTP request handlers (auth, health, WebSocket); all handlers receive injected services
- `internal/middleware/` - JWT validation middleware; checks token validity and Redis blacklist
- `internal/service/` - Business logic (AuthService: bcrypt hashing, JWT issuance, token refresh/revocation)
- `internal/model/` - Domain models, JWT Claims struct, request/response DTOs
- `internal/repository/` - Data access via pgx; UserRepository and CacheRepository interfaces
- `pkg/database/` - pgxpool and Redis client factory functions
- `migrations/` - SQL migration files embedded via `go:embed`; run automatically on startup via golang-migrate

### Authentication Flow

- Dual-token: short-lived access token (15 min) + long-lived refresh token (168 h, stored in Redis)
- Token blacklist in Redis — fail-open: if Redis is unavailable, protected routes still serve requests
- Rate limiting on auth endpoints (20 req/s, in-memory token bucket)
- JWT claims struct lives in `internal/model/`; algorithm is HS256

### Tauri Integration

- `src-tauri/` - Rust backend (Tauri 2.9)
  - `tauri.conf.json` - `frontendDist` points to `../out`; `beforeBuildCommand` builds both Go sidecar and Next.js
  - `src-tauri/src/lib.rs` - Spawns Go sidecar from `binaries/server` on port 7777
  - `externalBin: ["binaries/server"]` in tauri.conf.json bundles the compiled Go binary

### Styling System

- **Tailwind v4** via PostCSS (`@tailwindcss/postcss`)
- CSS variables for theme colors (oklch color space) in `globals.css`
- Dark mode: class-based (apply `.dark` to parent element)
- Custom variant: `@custom-variant dark (&:is(.dark *))`

### Path Aliases

`@/components`, `@/lib`, `@/utils`, `@/ui`, `@/hooks` — configured in tsconfig.json and components.json

## Testing

### Frontend (Jest + React Testing Library)

- Test files: `**/__tests__/**`, `**/*.test.tsx`, `**/*.spec.tsx`
- **Never place tests inside `components/ui/`** — those files are managed by the shadcn CLI and `pnpm dlx shadcn@latest add` will overwrite them. Put tests in `__tests__/` or alongside non-vendored components.
- CSS and image imports are mocked automatically
- Coverage thresholds: 60% branches/functions, 70% lines/statements
- JUnit XML output written to `test-results/` for CI

### Backend (Go)

- Unit tests use `pgxmock` (v4) for database and `miniredis` for Redis — no running services needed
- Integration tests (`*_integration_test.go`) require a real PostgreSQL instance; they run in CI only
- Linting config: `.golangci.yml` at `src-go/` root; run with `golangci-lint run` inside `src-go/`

## CI/CD (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `go-ci.yml` | PR + push | Go unit tests + lint; integration tests on master/develop only |
| `test.yml` | PR + push | Frontend tests + coverage |
| `build-tauri.yml` | PR + push | Multi-platform desktop builds (macOS, Windows, Linux) |
| `quality.yml` | PR + push | Code quality checks |
| `deploy.yml` | push to master | Production deployment |
| `release.yml` | tag | Automated release |

## Code Patterns

```tsx
// Always use cn() for conditional classes
import { cn } from "@/lib/utils"
cn("base-classes", condition && "conditional", className)

// Button composition with asChild
<Button asChild>
  <Link href="/path">Click me</Link>
</Button>
```

```go
// Repository interface pattern — depend on interfaces, not concrete types
type UserRepository interface {
    CreateUser(ctx context.Context, db DBTX, ...) (*model.User, error)
}

// Services receive interfaces, enabling easy mocking in tests
func NewAuthService(repo UserRepository, cache CacheRepository, cfg *config.Config) *AuthService
```

## Critical Notes

- **Always use pnpm** (lockfile present)
- **Tauri production builds require static export**: `output: "export"` in `next.config.ts` must be set before `pnpm tauri build`
- **Rust toolchain**: Requires v1.77.2+ for Tauri builds
- **Tauri port is hardcoded**: The sidecar always binds to 7777; `BACKEND_PORT` has no effect in Tauri mode
- **Graceful degradation**: The Go server starts even when PostgreSQL or Redis is unavailable; protected routes are fail-open when Redis is down
- shadcn/ui configured with "new-york" style and RSC mode
