# Go CI Integration Design

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Add Go backend CI support and integrate it with the existing frontend CI pipeline.

---

## Problem

The existing CI pipeline (`ci.yml`) only covers the frontend (Next.js). The Go backend in `src-go/` has no CI at all:

- No `go vet`, no lint, no build verification.
- No tests exist.
- `build-tauri.yml` directly runs `pnpm tauri build` without first compiling the Go sidecar binary, so Tauri installers would be missing the backend binary.

---

## Goals

1. Add a standalone `go-ci.yml` workflow with lint, unit tests, and integration tests.
2. Wire it into `ci.yml` (orchestrator), `build-tauri.yml`, and `release.yml`.
3. Fix the Go binary omission in `build-tauri.yml`.
4. Create minimal test file skeletons so CI has real content to run.

---

## Architecture

### New file: `.github/workflows/go-ci.yml`

Two jobs:

**`go-unit`** — runs on every PR and push:
- `actions/setup-go@v5` with Go version from `src-go/go.mod`
- Cache Go modules (`~/.cache/go`)
- `go vet ./...`
- `golangci-lint` via `golangci-lint-action@v6` (linters: `staticcheck`, `errcheck`, `gosimple`, `unused`, `govet`)
- `go test ./... -count=1` (unit tests only; integration tests are excluded by build tag)

**`go-integration`** — runs only on push to `master` or PR targeting `master`:
- Same Go setup + module cache
- `services:` block with `postgres:16-alpine` and `redis:7-alpine`, matching `docker-compose.yml`
- Health-check wait before tests run
- `go test ./... -tags integration -count=1 -v`
- Env vars: `TEST_POSTGRES_URL`, `TEST_REDIS_URL`

### Changes to `ci.yml`

Add `go-ci` as a parallel job alongside `quality` and `test`. Update `build-tauri` dependency:

```yaml
needs: [quality, test, go-ci]
```

### Changes to `build-tauri.yml`

Before the `Build Tauri app` step, add:

1. **Setup Go** — `actions/setup-go@v5`, version read from `src-go/go.mod`
2. **Build Go sidecar** — `bash scripts/build-backend.sh --current-only`

This ensures the platform-specific binary exists in `src-tauri/binaries/` before `pnpm tauri build` runs.

### Changes to `release.yml`

Add `go-ci` job (reusing `go-ci.yml` via `workflow_call`) in parallel with `quality` and `test`. Update `build-tauri` and `create-release` to depend on it.

---

## Test File Skeletons

### Unit tests (no build tag, no external dependencies)

- `src-go/internal/config/config_test.go`
  Tests: config loads defaults, env vars override defaults, production mode requires JWT_SECRET.

- `src-go/internal/handler/health_test.go`
  Tests: `GET /health` returns 200 with `{"status":"ok"}`, using a mock Echo context.

### Integration tests (`//go:build integration`)

- `src-go/pkg/database/postgres_integration_test.go`
  Tests: connects to `TEST_POSTGRES_URL`, pings successfully.

- `src-go/internal/repository/user_repo_integration_test.go`
  Tests: creates a user, reads it back, deletes it. Uses a real Postgres connection from `TEST_POSTGRES_URL`.

Integration tests skip themselves (via `t.Skip`) if `TEST_POSTGRES_URL` is empty, so they are safe to run locally without Docker.

---

## Data Flow

```
Push / PR
    │
    ├── quality (ESLint, TS check)  ─────────┐
    ├── test (Jest, Next.js build)  ─────────┤──► build-tauri
    └── go-ci                                │     (Go binary built first)
            ├── go-unit (always)    ─────────┘
            └── go-integration (master only)
```

---

## Error Handling

- `golangci-lint` failures block the PR merge.
- Integration test failures on `master` block `build-tauri`.
- If `TEST_POSTGRES_URL` is unset locally, integration tests self-skip with a clear message.

---

## Out of Scope

- Code coverage reporting for Go (no Codecov integration for Go).
- Cross-compiling Go for all platforms during unit CI (only current-platform binary in `build-tauri`).
- Adding new Go application features or refactoring existing handlers.
