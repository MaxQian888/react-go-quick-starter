# Local Run Matrix

Use this file when the task is to start, build, or smoke-test the project locally.

## Prerequisites

- Node.js 20+ is documented for local use. GitHub Actions currently uses Node 22.x.
- `pnpm` is the package manager used by the repo scripts.
- Go must satisfy `src-go/go.mod`, which currently declares `go 1.25.0`.
- Rust must satisfy `src-tauri/Cargo.toml`, which currently declares `rust-version = "1.77.2"`.
- Docker Compose is the expected way to bring up Postgres and Redis for backend-backed local work.

## Web-Only Local Development

1. Run `pnpm install`.
2. Run `pnpm dev`.
3. Open `http://localhost:3000`.

Notes:

- The web app reads `NEXT_PUBLIC_API_URL` from `.env.local`, then falls back to `http://localhost:7777`.
- Use `.env.example` as the starting point: `cp .env.example .env.local` and adjust as needed.

## Backend-Only Local Development

**Via pnpm scripts (recommended):**
1. Run `pnpm services:up` to start Postgres and Redis and wait for healthy.
2. Copy `.env.example` to `.env.local` and adjust values if needed.
3. Run `pnpm dev:go` — loads env from root `.env.local` / `.env`, maps `BACKEND_PORT` → `PORT` for Go.

**Direct Go (fallback):**
1. Run `docker compose up -d`.
2. Copy `src-go/.env.example` to `src-go/.env` and adjust values if needed.
3. Run `cd src-go && go run ./cmd/server`.

Notes:

- The default backend port is `7777`.
- The backend health surfaces are registered under `/health` and `/api/v1/health`.
- `ALLOW_ORIGINS` in `.env.example` includes `http://localhost:3000`, `tauri://localhost`, and `http://localhost:1420` (Tauri dev window).

## Desktop Development

Preferred path:

1. Ensure frontend dependencies are installed.
2. Ensure the Go toolchain and Rust toolchain are available.
3. Run `pnpm tauri:dev`.

What this does:

1. Runs `node scripts/services.js ensure` — starts Postgres and Redis if not already healthy.
2. Runs `pnpm build:backend:dev` (`node scripts/build-backend.js --current-only`) — compiles the Go sidecar for the current host platform and writes it to `src-tauri/binaries/`.
3. Runs `pnpm tauri dev`.
4. `src-tauri/tauri.conf.json` starts the frontend dev server via `beforeDevCommand: "pnpm dev"`.
5. `src-tauri/src/lib.rs` spawns the Go sidecar named `server` on port `7777`.

Windows note:

- `scripts/build-backend.js` is a cross-platform Node.js script — no bash, WSL, or Git Bash required. It works natively on Windows.

## Production-Oriented Local Builds

- Static web assets: `pnpm build`
- Desktop bundle: `pnpm tauri:build`
- Go binary fallback check: `cd src-go && go build ./cmd/server`

Notes:

- `next.config.ts` sets `output: "export"`, so `pnpm build` writes static assets into `out/`.
- `src-tauri/tauri.conf.json` points `frontendDist` at `../out`.
- `src-tauri/tauri.conf.json` uses `beforeBuildCommand: "pnpm build:backend && pnpm build"`.
