# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a clean toolchain baseline — Prettier formatting, Tailwind config, Tauri security/stability, full shadcn/ui component library, and accurate documentation.

**Architecture:** Tooling changes only; no logic changes. Prettier runs as a formatter (not linter); Tailwind config adds container + keyframe extensions to complement the existing CSS-variable theme in `globals.css`; Tauri sidecar gets a background health-check goroutine and graceful-shutdown hook.

**Tech Stack:** Prettier 3, prettier-plugin-tailwindcss, eslint-config-prettier, Tailwind CSS v4, Tauri 2 (Rust), shadcn/ui

---

## File Map

| Action | Path |
|--------|------|
| Create | `.prettierrc` |
| Create | `tailwind.config.ts` |
| Modify | `package.json` — add format scripts + devDeps |
| Modify | `eslint.config.mjs` — add prettier flat config |
| Modify | `src-tauri/tauri.conf.json` — CSP policy |
| Modify | `src-tauri/src/lib.rs` — health check + graceful shutdown |
| Modify | `AGENTS.md` — fix stale test runner section |
| Auto-generate | `components/ui/*` — from shadcn CLI |

---

## Task 1: Install Prettier and configure formatting

**Files:**
- Create: `.prettierrc`
- Modify: `package.json`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Install Prettier packages**

```bash
pnpm add -D prettier prettier-plugin-tailwindcss eslint-config-prettier
```

Expected output: packages added to `devDependencies`, lockfile updated.

- [ ] **Step 2: Create `.prettierrc`**

Create file `.prettierrc` at the project root:

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "es5",
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Add format scripts to `package.json`**

In `package.json`, add to the `"scripts"` object (after `"lint"`):

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 4: Create `.prettierignore`**

Create `.prettierignore` at the project root:

```
.next
out
coverage
src-tauri/target
node_modules
pnpm-lock.yaml
*.md
```

- [ ] **Step 5: Update `eslint.config.mjs` to disable formatting rules**

Replace the contents of `eslint.config.mjs` with:

```js
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "src-tauri/target/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
```

- [ ] **Step 6: Verify Prettier works**

```bash
pnpm format:check
```

Expected: some files flagged as needing formatting (that's fine — we'll fix in Task 7).

- [ ] **Step 7: Commit**

```bash
git add .prettierrc .prettierignore eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore: add Prettier with tailwindcss plugin and eslint-config-prettier"
```

---

## Task 2: Add Tailwind config for container and keyframe extensions

**Files:**
- Create: `tailwind.config.ts`
- Modify: `app/globals.css` — add accordion keyframes

**Note:** This project uses Tailwind v4 which is primarily CSS-configured via `@theme inline` in `globals.css`. The `tailwind.config.ts` is added for container centering plugin compatibility with shadcn/ui components. Keyframes go in `globals.css` as `@keyframes` blocks.

- [ ] **Step 1: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Add accordion keyframes to `app/globals.css`**

Append at the end of `app/globals.css` (before the closing, after the `@layer base` block):

```css
@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}

@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}
```

- [ ] **Step 3: Verify no build errors**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "chore: add tailwind.config.ts for container centering and accordion keyframes"
```

---

## Task 3: Fix Tauri Content Security Policy

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update `tauri.conf.json` CSP**

In `src-tauri/tauri.conf.json`, replace:

```json
"security": {
  "csp": null
}
```

with:

```json
"security": {
  "csp": "default-src 'self'; connect-src ipc: http://localhost:7777 ws://localhost:7777; img-src 'self' data: asset: https://asset.localhost; style-src 'self' 'unsafe-inline'; script-src 'self'"
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "require('./src-tauri/tauri.conf.json'); console.log('valid JSON')"
```

Expected: `valid JSON`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix(tauri): set minimal CSP policy instead of null"
```

---

## Task 4: Tauri sidecar health check and graceful shutdown

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Replace `src-tauri/src/lib.rs` with health-check + shutdown version**

```rust
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;

struct BackendState {
    url: Mutex<String>,
}

#[tauri::command]
fn get_backend_url(state: State<BackendState>) -> String {
    state.url.lock().unwrap().clone()
}

fn spawn_sidecar(app: &AppHandle, port: u16) -> Option<tauri_plugin_shell::process::CommandChild> {
    let shell = app.shell();
    let port_arg = port.to_string();
    let cmd = match shell.sidecar("server") {
        Ok(c) => c,
        Err(e) => {
            log::warn!("server sidecar not available: {e}. Running without backend.");
            return None;
        }
    };
    match cmd.args(["--port", &port_arg]).spawn() {
        Ok((mut rx, child)) => {
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log::info!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            log::warn!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(err) => {
                            log::error!("[server] error: {err}");
                        }
                        CommandEvent::Terminated(status) => {
                            log::info!("[server] terminated: {status:?}");
                            break;
                        }
                        _ => {}
                    }
                }
            });
            Some(child)
        }
        Err(e) => {
            log::warn!("Could not spawn Go sidecar: {e}. Running without backend.");
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    const BACKEND_PORT: u16 = 7777;

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState {
            url: Mutex::new(format!("http://localhost:{BACKEND_PORT}")),
        })
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let child_arc: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>> =
                Arc::new(Mutex::new(spawn_sidecar(&app_handle, BACKEND_PORT)));

            // Health-check loop: GET /health every 5s; restart after 3 consecutive failures.
            let health_url = format!("http://localhost:{BACKEND_PORT}/health");
            let child_for_health = Arc::clone(&child_arc);
            let app_for_health = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut failures: u8 = 0;
                loop {
                    tauri::async_runtime::spawn(tokio::time::sleep(
                        std::time::Duration::from_secs(5),
                    ))
                    .await
                    .ok();

                    let ok = reqwest::get(&health_url)
                        .await
                        .map(|r| r.status().is_success())
                        .unwrap_or(false);

                    if ok {
                        failures = 0;
                    } else {
                        failures += 1;
                        log::warn!("[health] sidecar check failed ({failures}/3)");
                        if failures >= 3 {
                            log::error!("[health] restarting sidecar");
                            // Kill old child if alive
                            if let Some(old) = child_for_health.lock().unwrap().take() {
                                let _ = old.kill();
                            }
                            // Respawn
                            *child_for_health.lock().unwrap() =
                                spawn_sidecar(&app_for_health, BACKEND_PORT);
                            failures = 0;
                        }
                    }
                }
            });

            // Graceful shutdown on window close
            let child_for_close = Arc::clone(&child_arc);
            app.on_window_event(move |_window, event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    if let Some(child) = child_for_close.lock().unwrap().take() {
                        log::info!("[shutdown] sending terminate to sidecar");
                        let _ = child.kill();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Add `reqwest` to `src-tauri/Cargo.toml`**

Open `src-tauri/Cargo.toml` and add to `[dependencies]`:

```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
tokio = { version = "1", features = ["time"] }
```

- [ ] **Step 3: Verify Rust compiles (no Tauri run needed)**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished` with 0 errors (warnings about unused are fine). Run from project root after.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat(tauri): add sidecar health-check loop and graceful shutdown on window close"
```

---

## Task 5: Register all shadcn/ui components

**Files:**
- Auto-generated: `components/ui/*.tsx` (many new files)

- [ ] **Step 1: Install form group**

```bash
pnpm dlx shadcn@latest add input textarea checkbox radio-group select switch label form
```

Answer `y` to any prompts about overwriting existing files.

- [ ] **Step 2: Install layout group**

```bash
pnpm dlx shadcn@latest add card separator sheet tabs accordion collapsible
```

- [ ] **Step 3: Install feedback group**

```bash
pnpm dlx shadcn@latest add dialog alert-dialog sonner tooltip popover badge alert skeleton
```

- [ ] **Step 4: Install navigation group**

```bash
pnpm dlx shadcn@latest add dropdown-menu navigation-menu breadcrumb pagination
```

- [ ] **Step 5: Install data group**

```bash
pnpm dlx shadcn@latest add table avatar progress scroll-area chart
```

- [ ] **Step 6: Verify TypeScript compiles with new components**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors. If shadcn generates components that import from not-yet-installed packages, run `pnpm install` first.

- [ ] **Step 7: Commit**

```bash
git add components/ui package.json pnpm-lock.yaml
git commit -m "feat: register full shadcn/ui component library (form, layout, feedback, nav, data)"
```

---

## Task 6: Fix stale AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Find and fix the stale section**

Open `AGENTS.md`. Find the section that says "No test runner configured yet" or similar. Replace it with:

```markdown
## Testing

This project uses Jest 30 with React Testing Library for frontend unit tests.

**Commands:**
- `pnpm test` — run all tests once
- `pnpm test:watch` — run in watch mode
- `pnpm test:coverage` — run with coverage report (output to `coverage/`)

**Coverage thresholds** (enforced in CI):
- Branches: 75%, Functions: 80%, Lines: 80%, Statements: 80%

**Test files** live alongside source in `__tests__/` or co-located as `*.test.tsx`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with accurate Jest test runner info"
```

---

## Task 7: Format all existing code and finalize Phase 1

**Files:**
- Modify: many (auto-formatted by Prettier)

- [ ] **Step 1: Run Prettier on entire codebase**

```bash
pnpm format
```

Expected: files updated with consistent formatting.

- [ ] **Step 2: Verify lint still passes**

```bash
pnpm lint
```

Expected: 0 errors (Prettier rules disabled in ESLint via `eslint-config-prettier`).

- [ ] **Step 3: Run tests to confirm nothing broken**

```bash
pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit formatted files**

```bash
git add -A
git commit -m "style: apply Prettier formatting to entire codebase"
```

---

**Phase 1 complete.** Proceed to `2026-04-26-phase2-backend-auth.md`.
