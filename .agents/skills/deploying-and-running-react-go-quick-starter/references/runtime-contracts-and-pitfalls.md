# Runtime Contracts And Pitfalls

Use this file when a command path looks inconsistent, when a runtime fails to start, or when a deployment plan needs the repo-specific contracts instead of generic framework advice.

## Current Verified Command Behavior

- `pnpm build` succeeds and generates static export output in `out/`.
- `pnpm start` fails with: `Error: "next start" does not work with "output: export" configuration. Use "npx serve@latest out" instead.`
- `pnpm build:backend:dev` uses `scripts/build-backend.js --current-only` — a cross-platform Node.js script. Works on Windows without bash or WSL.
- `cd src-go && go build ./cmd/server` succeeds as a narrow backend build check.
- `docker compose config` resolves successfully (the top-level `version` field was removed from the compose file).

Re-check these if the repo changes.

## Port And URL Contract

- `hooks/use-backend-url.ts`
  - Browser mode uses `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7777"`.
  - Tauri mode calls the Rust command `get_backend_url`.
- `.env.example`
  - Documents `NEXT_PUBLIC_API_URL=http://localhost:7777` and `NEXT_PUBLIC_WS_URL=ws://localhost:7777`.
  - `ALLOW_ORIGINS=http://localhost:3000,tauri://localhost,http://localhost:1420`.
- `src-go/.env.example`
  - Mirrors the same port and ALLOW_ORIGINS defaults for direct `go run` use.
- `src-tauri/src/lib.rs`
  - Hardcodes the Tauri sidecar port as `7777`.

If the backend port changes, update all four surfaces together.

## Build Output Contract

- `next.config.ts`
  - Uses `output: "export"` and writes deployable assets into `out/`.
- `src-tauri/tauri.conf.json`
  - Uses `devUrl: "http://localhost:3000"`
  - Uses `frontendDist: "../out"`
  - Uses `beforeBuildCommand: "pnpm build:backend && pnpm build"`
  - Expects `externalBin: ["binaries/server"]`
- `scripts/build-backend.js`
  - Cross-platform Node.js script — no bash dependency.
  - Writes sidecar binaries into `src-tauri/binaries/`.
  - Names them `server-<target-triple>` with `.exe` on Windows.
  - `--current-only` flag builds only the host platform's binary.
  - Embeds version, commit, and build date via Go ldflags.

If the binary name or location changes, update the script and Tauri config together.

## Common Failure Modes

### Generic Next.js production advice

Symptom:

- Someone proposes `pnpm start` or `next start` after `pnpm build`

Reality:

- This repo uses static export, so production delivery is based on `out/`, not a Next.js Node server.

### Sidecar binary missing or misnamed

Symptom:

- The Tauri shell launches but the sidecar fails to start, or `pnpm build:backend:dev` exits with an unexpected error

Reality:

- `scripts/build-backend.js` is a cross-platform Node.js script — there is no bash dependency. If the build fails, check that `go` is on `PATH` and that `src-go/` compiles with `cd src-go && go build ./cmd/server`.
- Verify the output binary exists at `src-tauri/binaries/server-<host-triple>[.exe]` after the build.

### Desktop app starts without working backend

Symptom:

- The Tauri shell launches but API calls fail or the sidecar is missing

Reality:

- The sidecar binary contract is `binaries/server` plus target-specific suffixes, and the Rust layer expects port `7777`.

### Backend starts but frontend still cannot reach it

Symptom:

- Browser requests still point to the wrong API origin

Reality:

- Check `.env.local`, `NEXT_PUBLIC_API_URL`, and `hooks/use-backend-url.ts` before changing server code.
