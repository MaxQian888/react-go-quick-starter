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
.env.example          ← root template (copy to .env.local)
.env.local            ← local overrides, gitignored, read by Next.js + scripts
src-go/.env.example   ← Go-only template (for direct `go run` without npm scripts)
src-go/.env           ← Go-only local overrides, gitignored
```

Next.js reads `.env.local` natively.  
npm orchestration scripts read `.env.local` (then `.env`) via `scripts/load-env.js`.  
`scripts/dev-go.js` maps `BACKEND_PORT` → `PORT` when spawning the Go process (avoiding conflict with Next.js `PORT`).

### Root `.env.example`

```env
# ── Ports ─────────────────────────────────────────────────────────────────
PORT=3000            # Next.js dev server port (read by Next.js automatically)
BACKEND_PORT=7777    # Go backend HTTP port

# ── Go Backend ────────────────────────────────────────────────────────────
POSTGRES_URL=postgres://dev:dev@localhost:5432/appdb?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-me-in-production-at-least-32-chars
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
ENV=development
# Update this if you change PORT above
ALLOW_ORIGINS=http://localhost:3000,tauri://localhost,http://localhost:1420

# ── Frontend (NEXT_PUBLIC_ prefix = exposed to browser) ───────────────────
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

Manages Docker Compose services. Commands:

| Command | Behavior |
|---------|----------|
| `up` | `docker compose up -d`, then polls `docker inspect` until all target containers (`rg-starter-postgres`, `rg-starter-redis`) report `healthy`. Timeout: 60 s. |
| `down` | `docker compose down` |
| `ensure` | Checks if both containers are running and healthy. If either is not, runs `up`. Idempotent. |

Health check polling uses `docker inspect --format '{{.State.Health.Status}}'`. Polls every 2 s.

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

### Tauri `beforeDevCommand`

No change required. `tauri:dev` (the npm script) now runs `services:ensure` before handing off to `pnpm tauri dev`. The `beforeDevCommand` inside `tauri.conf.json` remains `pnpm dev`.

### Dependency Updates

- **Frontend:** `pnpm up --latest` on all packages in `package.json`.
- **Go:** `go get -u ./...` followed by `go mod tidy` in `src-go/`.

### docker-compose.yml

- Upgrade `postgres:16-alpine` → `postgres:17-alpine`.
- No structural changes; the commented-out `server` service block remains as documentation.

## Developer Workflows

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

### Stopping services

```bash
pnpm services:down
```

## Out of Scope

- Changing the Tauri sidecar port from its hardcoded `7777` (it is fixed by the Rust constant; `BACKEND_PORT` only affects standalone Go dev mode).
- Production Docker Compose configuration.
- CI/CD changes.
