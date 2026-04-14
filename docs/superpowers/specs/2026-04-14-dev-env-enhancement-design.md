# Dev Environment Enhancement Design

**Date:** 2026-04-14
**Status:** Approved

## Overview

This document describes enhancements to the `react-go-quick-starter` development environment. The goals are:

1. Update all frontend (npm) and backend (Go) dependencies to latest versions.
2. Add complete Docker service orchestration so developers can start PostgreSQL and Redis with a single command.
3. Add Go backend standalone startup support with full environment variable injection.
4. Improve Tauri sidecar integration so Docker services are automatically checked and started before the desktop app launches.
5. Introduce a unified `.env` configuration system covering frontend startup parameters, backend settings, and orchestration options.

## Problem Statement

The current project has:
- No `.env.example` files for developer onboarding.
- No way to start Docker services from npm scripts.
- No orchestration to start everything (services + Go backend + Next.js) with one command.
- No frontend environment variable configuration (port, API URL, feature flags).
- Tauri `beforeDevCommand` does not ensure Docker services are running before the sidecar starts.

## Design

### Environment File Hierarchy

```
.env.example          ← root template (copy to .env.local) — TRACKED IN GIT
.env.local            ← local overrides, gitignored, read by Next.js + scripts
src-go/.env.example   ← Go-only template (for direct `go run` without npm scripts) — TRACKED IN GIT
src-go/.env           ← Go-only local overrides, gitignored
```

Next.js reads `.env.local` natively.
npm orchestration scripts read `.env.local` (then `.env`) via `scripts/load-env.js`.
`scripts/dev-go.js` maps `BACKEND_PORT` → `PORT` when spawning the Go process (avoiding conflict with Next.js `PORT`).

**`.gitignore` update required:** The root `.gitignore` contains `.env*` which would accidentally suppress `.env.example`. Add negation rules:

```
.env*
!.env.example
!src-go/.env.example
```

### Root `.env.example`

```env
# ── Ports ─────────────────────────────────────────────────────────────────
PORT=3000            # Next.js dev server port (read by Next.js automatically)
BACKEND_PORT=7777    # Go backend HTTP port (standalone dev only — see note below)

# NOTE: BACKEND_PORT only affects `pnpm dev:go` / `pnpm dev:all` (standalone mode).
# In Tauri desktop mode (`pnpm tauri:dev`), the sidecar always runs on port 7777
# (hardcoded in src-tauri/src/lib.rs). Do not change BACKEND_PORT for Tauri usage.

# ── Go Backend ────────────────────────────────────────────────────────────
POSTGRES_URL=postgres://dev:dev@localhost:5432/appdb?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-me-in-production-at-least-32-chars
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
ENV=development
# Update when you change PORT above
ALLOW_ORIGINS=http://localhost:3000,tauri://localhost,http://localhost:1420

# ── Frontend (NEXT_PUBLIC_ prefix = exposed to browser) ───────────────────
# IMPORTANT: Keep NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL in sync with BACKEND_PORT above
NEXT_PUBLIC_API_URL=http://localhost:7777
NEXT_PUBLIC_WS_URL=ws://localhost:7777
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_APP_NAME=React Go Starter
NEXT_PUBLIC_FEATURE_AUTH=true
```

### `src-go/.env.example`

Minimal file for developers who run Go directly without npm scripts.

```env
PORT=7777
POSTGRES_URL=postgres://dev:dev@localhost:5432/appdb?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-me-in-production-at-least-32-chars
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
ENV=development
ALLOW_ORIGINS=http://localhost:3000,tauri://localhost,http://localhost:1420
```

### New Scripts

#### `scripts/load-env.js`

Pure Node.js (no external deps) `.env` file parser. Loads `.env.local`, falling back to `.env`, from a given directory. Used by `services.js` and `dev-go.js`.

- Skips blank lines and `#` comments.
- Strips surrounding quotes from values.
- Does not override already-set `process.env` variables (environment wins).

#### `scripts/services.js`

Manages Docker Compose services. Pre-flight: runs `docker info` before any operation; exits with a clear human-readable error ("Docker is not running. Please start Docker Desktop and try again.") if Docker is unavailable.

Commands:

| Command | Behavior |
|---------|----------|
| `up` | `docker compose up -d`, then polls `docker inspect` until all target containers (`rg-starter-postgres`, `rg-starter-redis`) report `healthy`. Timeout: 60 s, poll every 2 s. |
| `down` | `docker compose down` |
| `ensure` | Calls `docker inspect` on both containers. If either returns non-zero (container absent) or returns a status other than `healthy` (container stopped, starting, or unhealthy), calls `up` unconditionally. `docker compose up -d` is idempotent for already-running services. |

Health check polling uses `docker inspect --format '{{.State.Health.Status}}'`. A non-zero exit from `docker inspect` (container does not exist) is treated identically to an unhealthy status — both trigger `up`.

#### `scripts/dev-go.js`

Starts the Go backend for standalone development:

1. Loads root `.env.local` / `.env`.
2. Merges with `process.env` (environment wins).
3. Maps `BACKEND_PORT` → `PORT` for the Go process.
4. Spawns `go run ./cmd/server` in `src-go/` with the merged env.
5. Forwards stdout/stderr; exits with the same code as the child.

### npm Script Changes

```json
"services:up":     "node scripts/services.js up",
"services:down":   "node scripts/services.js down",
"services:status": "docker compose ps",
"services:ensure": "node scripts/services.js ensure",
"dev:go":          "node scripts/dev-go.js",
"dev:backend":     "node scripts/services.js ensure && node scripts/dev-go.js",
"dev:all":         "node scripts/services.js ensure && concurrently --names \"go,next\" --prefix-colors \"cyan,green\" \"node scripts/dev-go.js\" \"next dev\"",
"tauri:dev":       "node scripts/services.js ensure && pnpm build:backend:dev && pnpm tauri dev",
"tauri:build":     "pnpm tauri build"
```

`concurrently` is added as a `devDependency`.

**Windows `&&` note:** The `&&` operator works in npm/pnpm scripts on Windows via the bundled shell. The existing `tauri:dev` script already uses this pattern without issues. If a future contributor encounters problems, `npm-run-all2` is the migration path.

### Tauri `beforeDevCommand`

No change required. `tauri:dev` (the npm script) now runs `services:ensure` before handing off to `pnpm tauri dev`. The `beforeDevCommand` inside `tauri.conf.json` remains `pnpm dev`.

### Dependency Updates

- **Frontend:** `pnpm up --latest` on all packages in `package.json`.
- **Go:** `go get -u ./...` followed by `go mod tidy` in `src-go/`.

### docker-compose.yml

- Upgrade `postgres:16-alpine` → `postgres:17-alpine`.
- No structural changes; the commented-out `server` service block remains as documentation.

## Developer Workflows

### Prerequisites

- Docker Desktop installed and running.
- Go 1.25+ installed (for `pnpm dev:go` / `pnpm dev:all`).
- Rust toolchain v1.77.2+ (for `pnpm tauri:dev`).

### First-time setup

```bash
cp .env.example .env.local          # configure as needed
cp src-go/.env.example src-go/.env  # only needed for direct go run
```

### Daily web development

```bash
pnpm dev:all       # starts Docker services + Go backend + Next.js
```

Or step by step:
```bash
pnpm services:up   # start Postgres + Redis
pnpm dev:backend   # start Go backend only
pnpm dev           # start Next.js only (separate terminal)
```

### Daily desktop development

```bash
pnpm tauri:dev     # ensures services → builds sidecar → launches Tauri
```

> **Note:** In Tauri desktop mode, `BACKEND_PORT` in `.env.local` has no effect.
> The sidecar always binds to port 7777 (hardcoded in `src-tauri/src/lib.rs`).

### Stopping services

```bash
pnpm services:down
```

## Out of Scope

- Making the Tauri sidecar port configurable (it is a Rust compile-time constant in `src-tauri/src/lib.rs`; `BACKEND_PORT` only affects standalone dev mode via npm scripts).
- Production Docker Compose configuration.
- CI/CD changes.
