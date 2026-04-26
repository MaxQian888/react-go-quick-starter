# Template Improvements Design Spec

**Date:** 2026-04-26  
**Project:** react-go-quick-starter  
**Goal:** Elevate from a scaffolding skeleton to a feature-complete, batteries-included starter template

---

## Overview

The current template scores ~7.4/10. It has excellent CI/CD, documentation, and architecture, but lacks a complete auth flow, minimal UI components, placeholder pages, and low frontend test coverage. This spec defines the improvements needed to make it production-grade and immediately usable by teams.

**Implementation strategy: Foundation → Backend Auth → Frontend Pages → Tests**

Each layer is independently shippable and does not require rework from subsequent layers.

---

## Section 1: Foundation Layer

### 1.1 Code Formatting & Toolchain

**Prettier**
- Add `.prettierrc` with: `semi: false`, `singleQuote: true`, `printWidth: 100`, `tailwindcss` plugin (auto-sorts Tailwind classes)
- Add scripts to `package.json`: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`
- Add `eslint-config-prettier` to disable ESLint rules that conflict with Prettier
- Add `prettier-plugin-tailwindcss` as devDependency

**Tailwind Config**
- Add `tailwind.config.ts` extending the theme with:
  - `container` centering configuration
  - `borderRadius` values mapped to existing CSS variables (`--radius-sm`, `--radius-md`, etc.)
  - `keyframes` for `accordion-down` and `accordion-up` animations
- Must not redefine colors already declared as CSS variables in `globals.css` — reference them via `hsl(var(...))` pattern

### 1.2 Tauri Stability

**Content Security Policy**
- Set `security.csp` in `tauri.conf.json` to a minimal-permission policy:
  ```
  default-src 'self'; connect-src ipc: http://localhost:7777 ws://localhost:7777; img-src 'self' data: asset: https://asset.localhost; style-src 'self' 'unsafe-inline'
  ```
- Remove the current `null` value which disables all CSP protection

**Sidecar Auto-Restart** (`src-tauri/src/lib.rs`)
- After spawning the sidecar, start a background health-check loop: `GET /health` every 5 seconds
- If 3 consecutive checks fail, kill the existing process and re-spawn
- On `CloseRequested` window event: send SIGTERM to sidecar, wait up to 3 seconds, then force kill before allowing window close

### 1.3 shadcn/ui Component Registration

Register via `pnpm dlx shadcn@latest add`. No custom source modifications — install as-is.

**Form:** `input`, `textarea`, `checkbox`, `radio-group`, `select`, `switch`, `label`, `form` (react-hook-form integration)  
**Layout:** `card`, `separator`, `sheet`, `tabs`, `accordion`, `collapsible`  
**Feedback:** `dialog`, `alert-dialog`, `sonner` (toast), `tooltip`, `popover`, `badge`, `alert`, `skeleton`  
**Navigation:** `dropdown-menu`, `navigation-menu`, `breadcrumb`, `pagination`  
**Data:** `table`, `avatar`, `progress`, `scroll-area`, `chart` (recharts wrapper)

### 1.4 Documentation Fixes

- **`AGENTS.md`**: Remove the stale "No test runner configured yet" statement. Replace with accurate description of Jest setup, test commands (`pnpm test`, `pnpm test:coverage`), and coverage thresholds.
- **`CHANGELOG.md`**: Maintain 0.1.0 entry as-is. After all improvements are complete, add 0.2.0 entry documenting the full set of changes.

---

## Section 2: Backend Auth Extension

### 2.1 Database Migrations

**`002_create_refresh_tokens.up.sql`**
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```
Rationale: Current refresh tokens only live in Redis. Persisting to DB enables cross-device session management and "logout all devices" capability.

**`003_create_verification_tokens.up.sql`**
```sql
CREATE TABLE verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`004_add_users_auth_fields.up.sql`**
```sql
ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN totp_secret TEXT,
  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN oauth_provider TEXT,
  ADD COLUMN oauth_provider_id TEXT;

CREATE UNIQUE INDEX idx_users_oauth ON users(oauth_provider, oauth_provider_id)
  WHERE oauth_provider IS NOT NULL;
```

### 2.2 Email Service (`internal/mailer/`)

**Interface:**
```go
type Mailer interface {
    SendVerification(to, name, token string) error
    SendPasswordReset(to, name, token string) error
}
```

**Implementations:**
- `SMTPMailer`: Uses `net/smtp` for production sending
- `NoopMailer`: Logs to `slog` only — used in development when `APP_ENV=development` or `SMTP_HOST` is unset

**Templates** (`internal/mailer/templates/`): `verify_email.html`, `reset_password.html` — both plain text + HTML multipart

**New env vars** (added to `.env.example`):
```
SMTP_HOST=
SMTP_PORT=587
SMTP_FROM=noreply@example.com
SMTP_PASSWORD=
```

### 2.3 New API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|--------------|-------------|
| `POST` | `/api/v1/auth/send-verification` | Yes | Send email verification link |
| `POST` | `/api/v1/auth/verify-email` | No | Verify token, set `email_verified_at` |
| `POST` | `/api/v1/auth/forgot-password` | No | Send password reset email (rate-limited) |
| `POST` | `/api/v1/auth/reset-password` | No | Verify token + update password |
| `GET` | `/api/v1/auth/oauth/:provider` | No | Redirect to OAuth provider (github, google) |
| `GET` | `/api/v1/auth/oauth/:provider/callback` | No | OAuth callback, issue JWT |
| `POST` | `/api/v1/auth/totp/setup` | Yes | Generate TOTP secret + QR code URI |
| `POST` | `/api/v1/auth/totp/verify` | Yes | Verify TOTP code, enable 2FA |
| `POST` | `/api/v1/auth/totp/disable` | Yes | Disable 2FA (requires current password) |
| `POST` | `/api/v1/auth/login/totp-confirm` | No | Complete login with TOTP code (requires `session_token` from step 1) |
| `DELETE` | `/api/v1/auth/sessions` | Yes | Logout all devices (delete all refresh tokens) |

### 2.4 OAuth Implementation

**Library:** `golang.org/x/oauth2` with `oauth2/github` and `oauth2/google` sub-packages

**Flow:**
1. Frontend navigates to `/api/v1/auth/oauth/github`
2. Go handler generates state token → stores in Redis (TTL 10m) → redirects to provider
3. Provider redirects to callback with `code` + `state`
4. Go validates state from Redis (CSRF protection) → exchanges code for access token → fetches user profile
5. Looks up `users` table by `oauth_provider` + `oauth_provider_id`
6. New user: auto-register with `email_verified_at = NOW()` (OAuth implies verified email)
7. Existing user: update OAuth fields if needed
8. Issue JWT pair → redirect frontend to `/auth/callback?token=...`

**New env vars:**
```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OAUTH_REDIRECT_BASE_URL=http://localhost:7777
```

### 2.5 TOTP 2FA Implementation

**Library:** `github.com/pquerna/otp`

**Security:** `totp_secret` is AES-256-GCM encrypted before storing in DB. Encryption key derived from `JWT_SECRET` via HKDF.

**Modified login flow:**
1. Validate email + password (existing)
2. If `totp_enabled = true`: return `HTTP 202` with body `{"totp_required": true, "session_token": "<short-lived token>"}`
3. Frontend shows TOTP input → POST to `/api/v1/auth/login/totp-confirm` with `session_token` + `totp_code`
4. Validate TOTP → issue full JWT pair

**New endpoint:** `POST /api/v1/auth/login/totp-confirm`

### 2.6 Request Tracing & Logging

Add to Echo middleware chain (before route handlers):
- `RequestID` middleware: generates UUID v4, sets `X-Request-ID` request and response header
- Structured request logging via `slog`: logs `method`, `path`, `status`, `latency_ms`, `request_id`, `user_id` (if authenticated)

---

## Section 3: Frontend Pages

### 3.1 Route Structure

```
app/
├── (marketing)/
│   ├── layout.tsx          # Top nav + footer, no sidebar
│   └── page.tsx            # Landing page
├── (auth)/
│   ├── layout.tsx          # Centered card layout
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── verify-email/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── (dashboard)/
│   ├── layout.tsx          # Sidebar + topbar layout
│   ├── dashboard/page.tsx
│   └── settings/
│       ├── page.tsx        # Account settings
│       └── security/page.tsx  # Password + 2FA management
├── auth/
│   └── callback/page.tsx   # OAuth callback handler
├── error.tsx
├── not-found.tsx
└── loading.tsx
```

**Route Guard:** `middleware.ts` at root checks JWT cookie. Unauthenticated → redirect to `/login`. Authenticated visiting `/login` → redirect to `/dashboard`.

### 3.2 Landing Page (`(marketing)/page.tsx`)

Five sections top-to-bottom:

1. **Hero**: Headline + one-line value proposition + two CTAs ("Get Started" → `/register`, "View Docs" → GitHub)
2. **Tech Stack**: 6 icon cards (Next.js, Go, Tauri, TypeScript, PostgreSQL, Redis)
3. **Features**: 3-column grid — Auth System, Desktop App, Modern Toolchain, Test Suite, CI/CD, Docker Integration
4. **Code Preview**: Tabbed code block showing frontend / backend / Tauri sample snippets
5. **CTA Footer**: Centered "Get Started" button

**Behavior:** Header gains border + shadow on scroll. Nav includes dark/light theme toggle.

### 3.3 Auth Pages

**Login `/login`**
- Email + Password fields with react-hook-form + zod validation
- "Remember me" checkbox
- TOTP input field (conditionally rendered when API returns `totp_required: true`)
- OAuth buttons: GitHub, Google (custom inline SVG brand logos — lucide-react does not include brand icons)
- Links: Forgot password / Register

**Register `/register`**
- Name + Email + Password + Confirm Password fields
- Zod schema enforces: password min 8 chars, must contain uppercase + number
- On success: redirect to a "Check your email" static message page

**Verify Email `/verify-email?token=...`**
- Auto-calls verify API on page load using URL `token` param
- Success: show success state → auto-redirect to `/dashboard` after 2 seconds
- Failure: show error message + "Resend verification email" button

**Forgot Password / Reset Password**: Standard two-step flow, one simple form each.

### 3.4 Dashboard

**Layout**: Fixed left sidebar (collapsible, state persisted in Zustand + localStorage) + top bar with breadcrumb + user avatar dropdown (Profile, Settings, Logout).

**Dashboard main page**: 4 stat cards (hardcoded static demo data, not connected to real API) + activity Table (static rows) + one Chart (shadcn/ui chart wrapping recharts, static data).

**Settings page `/settings`**:
- Avatar display only (no upload — shows initials fallback via `Avatar` component) + Name / Email edit form
- Email verification status Badge (Verified ✓ / Unverified with "Resend" button)

**Security page `/settings/security`**:
- Change password form (current password + new + confirm)
- 2FA section: if disabled → "Enable TOTP" button → Dialog showing QR code + verification input; if enabled → "Disable" button with password confirmation
- "Logout all devices" button with confirmation dialog

### 3.5 Global State (Zustand)

```
stores/
├── auth.store.ts   # user object, isAuthenticated, accessToken, login(), logout(), refreshToken()
└── ui.store.ts     # sidebarOpen, theme (light/dark/system)
```

`auth.store.ts` initializes by calling `GET /api/v1/users/me` in the root layout. On 401, clears state and redirects to `/login`.

### 3.6 API Client (`lib/api.ts`)

Unified `fetch` wrapper that:
- Automatically attaches `Authorization: Bearer <token>` from auth store
- On 401 response: attempts one silent token refresh via `/api/v1/auth/refresh`, retries original request
- On second 401: clears auth state, redirects to `/login`
- Returns typed response objects; throws typed `ApiError` on failure

Exports: `authApi` (login, register, refresh, logout, OAuth, TOTP), `userApi` (getMe, updateProfile, changePassword)

---

## Section 4: Testing

### 4.1 Frontend Unit Tests (Jest + React Testing Library)

**Target: 80%+ coverage**

New test files:
```
__tests__/
├── components/
│   ├── ui/              # Key interaction tests per shadcn component
│   ├── auth/            # Login, Register, TOTP form behavior tests
│   └── dashboard/       # Sidebar, Topbar, StatCard tests
├── hooks/
│   └── use-backend-url.test.ts
├── lib/
│   ├── api.test.ts      # 401 silent refresh logic (fetch mock)
│   └── utils.test.ts    # cn() utility
├── stores/
│   ├── auth.store.test.ts
│   └── ui.store.test.ts
└── app/
    ├── page.test.tsx
    └── (auth)/login/page.test.tsx
```

**Principles:** Test behavior (user interaction → DOM change), not implementation. Use `userEvent` for form filling. Mock `fetch` at boundary, not internal functions.

**Updated coverage thresholds** (`jest.config.ts`):
```js
coverageThreshold: {
  global: { branches: 75, functions: 80, lines: 80, statements: 80 }
}
```

### 4.2 E2E Tests (Playwright)

**Config:** `playwright.config.ts` — `baseURL: http://localhost:3000`, 3 parallel workers, 2 retries on failure, screenshot on failure in CI.

```
e2e/
├── auth.spec.ts          # Register → verify email → login → logout full flow
├── oauth.spec.ts         # GitHub OAuth (mocked via playwright route intercept)
├── totp.spec.ts          # Enable 2FA → logout → login with TOTP
├── dashboard.spec.ts     # Authenticated access, stat cards, table render
├── settings.spec.ts      # Update username, change password, logout all devices
├── not-found.spec.ts     # 404 page verification
└── fixtures/
    └── auth.fixture.ts   # Logged-in storageState fixture for reuse
```

**CI integration:** New `playwright` job in `test.yml`. Starts `pnpm dev`, waits for port 3000, runs tests. Uploads HTML report + failure screenshots as artifacts.

**New scripts:**
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

### 4.3 Visual Regression Tests (Playwright Snapshots)

```
e2e/visual/
├── landing.visual.spec.ts    # Landing page light + dark mode
├── login.visual.spec.ts      # Login page default + error state
├── dashboard.visual.spec.ts  # Full dashboard view
└── __snapshots__/            # Baseline screenshots (git-tracked)
```

**Strategy:** `maxDiffPixelRatio: 0.02` (2% tolerance). First run generates baselines. CI compares against baselines; failures upload diff images as artifacts. Uses Playwright built-in `toHaveScreenshot()` — no additional tooling required.

### 4.4 API Contract Tests (Go)

New file: `internal/handler/contract_test.go`

Uses `net/http/httptest` with real Echo router + miniredis + pgxmock. For each endpoint verifies:
- Correct HTTP status codes for happy path and common error cases
- Response JSON structure (field presence + type assertions)
- Unified error response format: `{"error": "message", "code": "ERROR_CODE"}`

**OpenAPI Spec:** Add `docs/openapi.yaml` (OpenAPI 3.1) documenting all endpoints. Contract tests reference this spec as the source of truth for response schemas.

### 4.5 Go Backend Coverage

Update `go-ci.yml`: add `-coverprofile=coverage.out` to test command + `go tool cover -func coverage.out` step that asserts overall coverage ≥ 80%.

---

## Non-Goals

The following are explicitly out of scope for this iteration:
- Storybook component documentation
- Lighthouse CI performance checks
- Native OS integration plugins (tray, notifications) beyond Tauri stability fixes
- Multi-tenancy or team/organization features
- Billing or payment integration
- Rate limiting per user (per-endpoint rate limiting already exists)

---

## Implementation Order

1. **Foundation** (Section 1) — Prettier, Tailwind config, CSP, sidecar stability, component registration, doc fixes
2. **Backend Auth** (Section 2) — DB migrations, mailer, OAuth, TOTP, new endpoints, request tracing
3. **Frontend Pages** (Section 3) — Route structure, landing page, auth pages, dashboard, Zustand stores, API client
4. **Tests** (Section 4) — Unit tests, Playwright E2E, visual regression, contract tests, coverage enforcement

---

## Version Target

All changes ship as `v0.2.0` in `CHANGELOG.md`.
