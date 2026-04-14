# Dev Environment Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unified `.env` config, Docker service orchestration scripts, Go backend standalone runner, and upgrade all dependencies.

**Architecture:** New Node.js scripts (`scripts/load-env.js`, `scripts/services.js`, `scripts/dev-go.js`) handle environment loading and service orchestration. npm scripts expose clean developer-facing commands. `.env.example` files serve as onboarding templates tracked in git.

**Tech Stack:** Node.js (CJS scripts), Docker Compose, Go 1.25, pnpm, Jest (node environment for script tests)

**Spec:** `docs/superpowers/specs/2026-04-14-dev-env-enhancement-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `.gitignore` | Add negation rules so `.env.example` files are tracked |
| Create | `.env.example` | Root env template for all variables |
| Create | `src-go/.env.example` | Go-only env template for direct `go run` |
| Create | `scripts/load-env.js` | Parse `.env.local`/`.env` files (no deps) |
| Create | `scripts/load-env.test.ts` | Unit tests for load-env |
| Create | `scripts/services.js` | Docker Compose orchestration (up/down/ensure) |
| Create | `scripts/dev-go.js` | Spawn Go backend with env from root `.env.local` |
| Modify | `package.json` | Add 9 new scripts + `concurrently` devDep |
| Modify | `docker-compose.yml` | Upgrade postgres 16 → 17 |
| Run | `pnpm up --latest` | Upgrade all frontend deps |
| Run | `go get -u ./... && go mod tidy` | Upgrade all Go deps |
| Modify | `CLAUDE.md` | Document new commands |

---

## Task 1: Fix `.gitignore` so `.env.example` files are tracked

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read current `.gitignore`**

  Confirm line 38 contains `.env*` with no negation rules.

- [ ] **Step 2: Add negation rules**

  In `.gitignore`, replace:
  ```
  # env files (can opt-in for committing if needed)
  .env*
  ```
  With:
  ```
  # env files (can opt-in for committing if needed)
  .env*
  !.env.example
  !src-go/.env.example
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd "D:\Project\react-go-quick-starter"
  rtk git add .gitignore
  rtk git commit -m "chore: allow .env.example files to be tracked in git"
  ```

---

## Task 2: Create `.env.example` files

**Files:**
- Create: `.env.example`
- Create: `src-go/.env.example`

- [ ] **Step 1: Create root `.env.example`**

  Create `D:\Project\react-go-quick-starter\.env.example`:

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

- [ ] **Step 2: Create `src-go/.env.example`**

  Create `D:\Project\react-go-quick-starter\src-go\.env.example`:

  ```env
  # Go backend configuration — copy to src-go/.env for direct `go run ./cmd/server`
  # When using npm scripts (pnpm dev:go, pnpm dev:all), use root .env.local instead.

  PORT=7777
  POSTGRES_URL=postgres://dev:dev@localhost:5432/appdb?sslmode=disable
  REDIS_URL=redis://localhost:6379
  JWT_SECRET=dev-secret-change-me-in-production-at-least-32-chars
  JWT_ACCESS_TTL=15m
  JWT_REFRESH_TTL=168h
  ENV=development
  ALLOW_ORIGINS=http://localhost:3000,tauri://localhost,http://localhost:1420
  ```

- [ ] **Step 3: Commit**

  ```bash
  rtk git add .env.example src-go/.env.example
  rtk git commit -m "chore: add .env.example templates for root and Go backend"
  ```

---

## Task 3: Create `scripts/load-env.js` (TDD)

**Files:**
- Create: `scripts/load-env.js`
- Create: `scripts/load-env.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `D:\Project\react-go-quick-starter\scripts\load-env.test.ts`:

  ```typescript
  /** @jest-environment node */

  import * as fs from "node:fs";
  import * as path from "node:path";
  import * as os from "node:os";

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseEnvFile, loadEnv } = require("./load-env");

  describe("parseEnvFile", () => {
    test("parses simple key=value pairs", () => {
      expect(parseEnvFile("PORT=3000\nHOST=localhost")).toEqual({
        PORT: "3000",
        HOST: "localhost",
      });
    });

    test("skips blank lines", () => {
      expect(parseEnvFile("\n\nPORT=3000\n\n")).toEqual({ PORT: "3000" });
    });

    test("skips # comment lines", () => {
      expect(parseEnvFile("# comment\nPORT=3000")).toEqual({ PORT: "3000" });
    });

    test("strips double quotes from value", () => {
      expect(parseEnvFile('SECRET="my secret"')).toEqual({
        SECRET: "my secret",
      });
    });

    test("strips single quotes from value", () => {
      expect(parseEnvFile("SECRET='my secret'")).toEqual({
        SECRET: "my secret",
      });
    });

    test("strips inline comments separated by space-hash", () => {
      expect(parseEnvFile("PORT=3000 # Next.js port")).toEqual({
        PORT: "3000",
      });
    });

    test("does NOT strip # that appears inside a URL value", () => {
      // Bare # inside a value (no leading space) must be preserved
      expect(parseEnvFile("CALLBACK_URL=https://example.com/auth#done")).toEqual({
        CALLBACK_URL: "https://example.com/auth#done",
      });
    });

    test("handles values containing = sign (e.g. connection strings)", () => {
      expect(
        parseEnvFile(
          "POSTGRES_URL=postgres://user:pass@localhost:5432/db?sslmode=require",
        ),
      ).toEqual({
        POSTGRES_URL:
          "postgres://user:pass@localhost:5432/db?sslmode=require",
      });
    });

    test("handles empty value", () => {
      expect(parseEnvFile("EMPTY=")).toEqual({ EMPTY: "" });
    });

    test("ignores lines without equals sign", () => {
      expect(parseEnvFile("NOEQUALSSIGN\nPORT=3000")).toEqual({ PORT: "3000" });
    });
  });

  describe("loadEnv", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    test("returns empty object when no env files exist", () => {
      expect(loadEnv(tmpDir)).toEqual({});
    });

    test("loads .env when .env.local is absent", () => {
      fs.writeFileSync(path.join(tmpDir, ".env"), "PORT=3000");
      expect(loadEnv(tmpDir)).toEqual({ PORT: "3000" });
    });

    test("prefers .env.local over .env", () => {
      fs.writeFileSync(path.join(tmpDir, ".env"), "PORT=3000");
      fs.writeFileSync(path.join(tmpDir, ".env.local"), "PORT=4000");
      expect(loadEnv(tmpDir)).toEqual({ PORT: "4000" });
    });

    test("returns empty object when directory has other files but no env files", () => {
      fs.writeFileSync(path.join(tmpDir, "other.txt"), "hello");
      expect(loadEnv(tmpDir)).toEqual({});
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd "D:\Project\react-go-quick-starter"
  pnpm test scripts/load-env.test.ts --no-coverage 2>&1 | head -30
  ```

  Expected: FAIL — `Cannot find module './load-env'`

- [ ] **Step 3: Implement `scripts/load-env.js`**

  Create `D:\Project\react-go-quick-starter\scripts\load-env.js`:

  ```js
  /* eslint-disable @typescript-eslint/no-require-imports */
  "use strict";

  const fs = require("node:fs");
  const path = require("node:path");

  /**
   * Parse a .env file string and return key-value pairs.
   * - Skips blank lines and # comments.
   * - Strips surrounding single or double quotes from values.
   * - Strips trailing inline comments only when preceded by whitespace (" #"),
   *   so bare # inside URLs (e.g. https://example.com#anchor) is preserved.
   * - Splits on the FIRST = only, so values containing = are preserved
   *   (e.g. POSTGRES_URL=postgres://...?sslmode=require).
   */
  function parseEnvFile(content) {
    const result = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!key) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip trailing inline comment — ONLY when preceded by whitespace.
      // This preserves bare # inside URL fragments (no leading space).
      const commentMatch = value.match(/\s#.*/);
      if (commentMatch) value = value.slice(0, commentMatch.index).trim();
      // Strip matching surrounding quotes
      value = value.replace(/^(['"])(.*)\1$/, "$2");
      result[key] = value;
    }
    return result;
  }

  /**
   * Load environment variables from .env files in the given directory.
   * Priority order: .env.local > .env
   * Returns a plain object; does NOT mutate process.env.
   */
  function loadEnv(directory) {
    for (const filename of [".env.local", ".env"]) {
      const filePath = path.join(directory, filename);
      if (fs.existsSync(filePath)) {
        return parseEnvFile(fs.readFileSync(filePath, "utf8"));
      }
    }
    return {};
  }

  module.exports = { loadEnv, parseEnvFile };
  ```

- [ ] **Step 4: Run tests and confirm they all pass**

  ```bash
  pnpm test scripts/load-env.test.ts --no-coverage
  ```

  Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  rtk git add scripts/load-env.js scripts/load-env.test.ts
  rtk git commit -m "feat: add load-env script utility with tests"
  ```

---

## Task 4: Create `scripts/services.js`

**Files:**
- Create: `scripts/services.js`

- [ ] **Step 1: Create the file**

  Create `D:\Project\react-go-quick-starter\scripts\services.js`:

  ```js
  #!/usr/bin/env node
  /* eslint-disable @typescript-eslint/no-require-imports */
  "use strict";

  const { execFileSync, spawnSync, execSync } = require("node:child_process");
  const path = require("node:path");

  const REPO_ROOT = path.resolve(__dirname, "..");
  const CONTAINERS = ["rg-starter-postgres", "rg-starter-redis"];
  const HEALTH_TIMEOUT_MS = 60_000;
  const HEALTH_POLL_MS = 2_000;

  /**
   * Synchronous sleep via execSync.
   * Works reliably on all platforms without Atomics/SharedArrayBuffer quirks.
   * On Windows uses `ping -n 2 127.0.0.1` (adds ~1s per call).
   * On Unix uses `sleep <seconds>`.
   */
  function sleep(ms) {
    const secs = Math.max(1, Math.round(ms / 1000));
    if (process.platform === "win32") {
      execSync(`ping -n ${secs + 1} 127.0.0.1 > nul`, { stdio: "ignore" });
    } else {
      execSync(`sleep ${secs}`, { stdio: "ignore" });
    }
  }

  /** Exit with a clear message if Docker is not available. */
  function requireDocker() {
    const result = spawnSync("docker", ["info"], { stdio: "ignore" });
    if (result.status !== 0) {
      console.error(
        "Error: Docker is not running. Please start Docker Desktop and try again.",
      );
      process.exit(1);
    }
  }

  /**
   * Returns the health status string for a container, or null if the
   * container does not exist (docker inspect exits non-zero).
   * Note: containers without a HEALTHCHECK directive return an empty string —
   * these are treated as not-healthy. Both postgres and redis in docker-compose.yml
   * define HEALTHCHECK so this project is not affected.
   */
  function getContainerHealth(name) {
    const result = spawnSync(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", name],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    if (result.status !== 0) return null; // container absent
    return result.stdout.trim(); // 'healthy' | 'unhealthy' | 'starting' | ''
  }

  /** Returns true when every target container reports 'healthy'. */
  function allHealthy() {
    return CONTAINERS.every((name) => getContainerHealth(name) === "healthy");
  }

  /**
   * Polls until all containers are healthy or the timeout is reached.
   * Exits the process with code 1 on timeout.
   */
  function waitForHealthy() {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    process.stdout.write("Waiting for services");
    while (Date.now() < deadline) {
      if (allHealthy()) {
        process.stdout.write("\n");
        return;
      }
      process.stdout.write(".");
      sleep(HEALTH_POLL_MS);
    }
    process.stdout.write("\n");
    console.error("Error: Timed out waiting for services to become healthy (60s).");
    process.exit(1);
  }

  function cmdUp() {
    requireDocker();
    console.log("Starting Docker services...");
    execFileSync("docker", ["compose", "up", "-d"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
    waitForHealthy();
    console.log("All services are healthy.");
  }

  function cmdDown() {
    requireDocker();
    execFileSync("docker", ["compose", "down"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  }

  /**
   * Checks if all containers are healthy; if not, runs cmdUp.
   * docker compose up -d is idempotent — it handles absent, stopped,
   * and already-running containers correctly without separate checks.
   */
  function cmdEnsure() {
    requireDocker();
    if (allHealthy()) {
      console.log("Services already running and healthy.");
      return;
    }
    console.log("Services not ready — starting...");
    cmdUp();
  }

  const COMMANDS = { up: cmdUp, down: cmdDown, ensure: cmdEnsure };

  function main(argv = process.argv.slice(2)) {
    const cmd = argv[0];
    if (!cmd || !(cmd in COMMANDS)) {
      console.error(
        `Usage: node scripts/services.js <${Object.keys(COMMANDS).join("|")}>`,
      );
      process.exit(1);
    }
    COMMANDS[cmd]();
  }

  if (require.main === module) {
    main();
  }

  module.exports = { getContainerHealth, allHealthy, CONTAINERS };
  ```

- [ ] **Step 2: Smoke-test the help output**

  ```bash
  node scripts/services.js 2>&1 || true
  ```

  Expected output contains: `Usage: node scripts/services.js <up|down|ensure>`

- [ ] **Step 3: Commit**

  ```bash
  rtk git add scripts/services.js
  rtk git commit -m "feat: add Docker service orchestration script"
  ```

---

## Task 5: Create `scripts/dev-go.js`

**Files:**
- Create: `scripts/dev-go.js`

- [ ] **Step 1: Create the file**

  Create `D:\Project\react-go-quick-starter\scripts\dev-go.js`:

  ```js
  #!/usr/bin/env node
  /* eslint-disable @typescript-eslint/no-require-imports */
  "use strict";

  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const { loadEnv } = require("./load-env");

  const REPO_ROOT = path.resolve(__dirname, "..");
  const GO_DIR = path.join(REPO_ROOT, "src-go");

  // Load env from root .env.local / .env (process.env wins over file values)
  const fileEnv = loadEnv(REPO_ROOT);
  const mergedEnv = { ...fileEnv, ...process.env };

  // Map BACKEND_PORT → PORT so Go reads the right port.
  // This avoids conflict with Next.js which also reads PORT.
  const goPort = mergedEnv.BACKEND_PORT || mergedEnv.PORT || "7777";
  const goEnv = { ...mergedEnv, PORT: goPort };

  console.log(`Starting Go backend on port ${goPort}...`);

  const result = spawnSync("go", ["run", "./cmd/server"], {
    cwd: GO_DIR,
    env: goEnv,
    stdio: "inherit",
  });

  process.exit(result.status ?? 1);
  ```

- [ ] **Step 2: Verify the file parses without errors**

  ```bash
  node -e "require('./scripts/dev-go.js')" 2>&1 | head -5 || true
  ```

  Expected: No syntax errors (it will attempt to run go and fail if Go is not in PATH, which is fine for this check).

- [ ] **Step 3: Commit**

  ```bash
  rtk git add scripts/dev-go.js
  rtk git commit -m "feat: add Go backend dev runner script with env injection"
  ```

---

## Task 6: Update `package.json` — scripts and `concurrently`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `concurrently` devDependency (pinned to v9)**

  ```bash
  cd "D:\Project\react-go-quick-starter"
  pnpm add -D concurrently@^9
  ```

  Verify `"concurrently": "^9.x.x"` appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Add new scripts to `package.json`**

  In `package.json`, replace the `"scripts"` block with:

  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "services:up": "node scripts/services.js up",
    "services:down": "node scripts/services.js down",
    "services:status": "docker compose ps",
    "services:ensure": "node scripts/services.js ensure",
    "dev:go": "node scripts/dev-go.js",
    "dev:backend": "node scripts/services.js ensure && node scripts/dev-go.js",
    "dev:all": "node scripts/services.js ensure && concurrently --names \"go,next\" --prefix-colors \"cyan,green\" \"node scripts/dev-go.js\" \"pnpm exec next dev\"",
    "build:backend": "node scripts/build-backend.js",
    "build:backend:dev": "node scripts/build-backend.js --current-only",
    "tauri:dev": "node scripts/services.js ensure && pnpm build:backend:dev && pnpm tauri dev",
    "tauri:build": "pnpm tauri build"
  },
  ```

- [ ] **Step 3: Verify scripts are valid**

  ```bash
  node -e "const p = require('./package.json'); console.log(Object.keys(p.scripts).join(', '))"
  ```

  Expected: All 18 script names printed without error.

- [ ] **Step 4: Run existing tests to confirm nothing is broken**

  ```bash
  pnpm test --no-coverage 2>&1 | tail -10
  ```

  Expected: All tests pass (including the new `load-env` tests).

- [ ] **Step 5: Commit**

  ```bash
  rtk git add package.json pnpm-lock.yaml
  rtk git commit -m "feat: add dev orchestration scripts and concurrently dependency"
  ```

---

## Task 7: Update `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Upgrade postgres image**

  In `docker-compose.yml`, change:
  ```yaml
      image: postgres:16-alpine
  ```
  To:
  ```yaml
      image: postgres:17-alpine
  ```

- [ ] **Step 2: Verify the file is valid YAML**

  ```bash
  docker compose config --quiet 2>&1 | head -5 || true
  ```

  Expected: No parse errors (warnings about unused variables are acceptable).

- [ ] **Step 3: Commit**

  ```bash
  rtk git add docker-compose.yml
  rtk git commit -m "chore: upgrade postgres image to 17-alpine"
  ```

---

## Task 8: Upgrade frontend dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Run upgrade**

  ```bash
  cd "D:\Project\react-go-quick-starter"
  pnpm up --latest
  ```

- [ ] **Step 2: Fix `eslint-config-next` version pin**

  `eslint-config-next` must match the installed `next` version. After upgrading, check if they differ:

  ```bash
  node -e "const p=require('./package.json'); console.log('next:', p.dependencies.next, 'eslint-config-next:', p.devDependencies['eslint-config-next'])"
  ```

  If `eslint-config-next` version does not match the major.minor of `next`, update it:

  ```bash
  pnpm add -D eslint-config-next@latest
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | head -20
  ```

  Expected: No errors. If errors appear, fix them before continuing.

- [ ] **Step 4: Run all tests**

  ```bash
  pnpm test --no-coverage 2>&1 | tail -15
  ```

  Expected: All tests pass.

- [ ] **Step 5: Commit**

  ```bash
  rtk git add package.json pnpm-lock.yaml
  rtk git commit -m "chore: upgrade all frontend dependencies to latest"
  ```

---

## Task 9: Upgrade Go dependencies

**Files:**
- Modify: `src-go/go.mod`
- Modify: `src-go/go.sum`

- [ ] **Step 1: Update all Go dependencies**

  ```bash
  cd "D:\Project\react-go-quick-starter\src-go"
  go get -u ./...
  go mod tidy
  ```

- [ ] **Step 2: Verify Go compiles**

  ```bash
  go build ./...
  ```

  Expected: No errors. If any package has a breaking change, fix the affected code.

- [ ] **Step 3: Run Go tests (unit only, no DB/Redis required)**

  ```bash
  go test ./... -short 2>&1 | tail -20
  ```

  Expected: Tests pass (integration tests may be skipped with `-short`).

- [ ] **Step 4: Commit**

  ```bash
  cd "D:\Project\react-go-quick-starter"
  rtk git add src-go/go.mod src-go/go.sum
  rtk git commit -m "chore: upgrade all Go dependencies to latest"
  ```

---

## Task 10: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new commands to the Go Backend Commands section**

  In `CLAUDE.md`, replace the existing `## Go Backend Commands` section with:

  ````markdown
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
  ````

- [ ] **Step 2: Commit**

  ```bash
  cd "D:\Project\react-go-quick-starter"
  rtk git add CLAUDE.md
  rtk git commit -m "docs: update CLAUDE.md with new dev commands and env setup"
  ```

---

## Verification Checklist

After all tasks are complete, verify the following manually:

- [ ] `node scripts/services.js` prints usage without Docker errors
- [ ] `pnpm test --no-coverage` — all tests pass including `load-env.test.ts`
- [ ] `pnpm exec tsc --noEmit` — zero TypeScript errors
- [ ] `cd src-go && go build ./...` — zero Go build errors
- [ ] `git log --oneline -10` — 10 clean commits visible
- [ ] `.env.example` and `src-go/.env.example` appear in `git status` as tracked files
