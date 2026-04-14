# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React + Tauri desktop application starter: Next.js 16 (React 19) + Tauri 2.9 + TypeScript + Tailwind CSS v4 + shadcn/ui + Zustand.

**Dual Runtime Model:**

- **Web mode** (`pnpm dev`): Next.js dev server at <http://localhost:3000>
- **Desktop mode** (`pnpm tauri dev`): Tauri wraps Next.js in a native window

## Development Commands

```bash
# Frontend
pnpm dev              # Start Next.js dev server
pnpm build            # Build for production (outputs to out/)
pnpm lint             # Run ESLint
pnpm lint --fix       # Auto-fix ESLint issues

# Testing
pnpm test             # Run Jest tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report

# Type checking
pnpm exec tsc --noEmit

# Desktop (Tauri)
# NOTE: Use pnpm tauri:dev / pnpm tauri:build (in Go Backend Commands section)
# for full development — they auto-start Docker services and compile the sidecar.
# The raw commands below bypass service orchestration:
pnpm tauri dev        # Dev mode with hot reload (no auto-services)
pnpm tauri build      # Build desktop installer
pnpm tauri info       # Check Tauri environment

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
cd src-go && go run ./cmd/server   # requires services running + src-go/.env
cd src-go && go build ./cmd/server # build binary
cd src-go && go test ./...         # run all tests

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
| `BACKEND_PORT` | `7777` | Go backend port (standalone dev only) |
| `POSTGRES_URL` | `postgres://dev:dev@localhost:5432/appdb?sslmode=disable` | |
| `REDIS_URL` | `redis://localhost:6379` | |
| `JWT_SECRET` | — | Required in production (min 32 chars) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:7777` | Must match `BACKEND_PORT` |

## Architecture

### Frontend Structure

- `app/` - Next.js App Router (layout.tsx, page.tsx, globals.css)
- `components/ui/` - shadcn/ui components using Radix UI + class-variance-authority
- `lib/utils.ts` - `cn()` utility (clsx + tailwind-merge)
- `__tests__/` - Jest tests with React Testing Library

### Tauri Integration

- `src-tauri/` - Rust backend
  - `tauri.conf.json` - Config pointing `frontendDist` to `../out`
  - `beforeDevCommand`: runs `pnpm dev`
  - `beforeBuildCommand`: runs `pnpm build`

### Styling System

- **Tailwind v4** via PostCSS (`@tailwindcss/postcss`)
- CSS variables for theme colors (oklch color space) in `globals.css`
- Dark mode: class-based (apply `.dark` to parent element)
- Custom variant: `@custom-variant dark (&:is(.dark *))`

### Path Aliases

`@/components`, `@/lib`, `@/utils`, `@/ui`, `@/hooks` - all configured in tsconfig.json and components.json

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

## Critical Notes

- **Always use pnpm** (lockfile present)
- **Tauri production builds require static export**: Add `output: "export"` to `next.config.ts` for `pnpm tauri build` to work
- **Rust toolchain**: Requires v1.77.2+ for Tauri builds
- shadcn/ui configured with "new-york" style and RSC mode
