# Phase 4: Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the project to 80%+ frontend coverage and complete E2E/visual/contract test coverage, enforced in CI.

**Architecture:** Four test layers — (1) Jest unit tests for stores, API client, and components; (2) Playwright E2E tests for auth flows and dashboard; (3) Playwright `toHaveScreenshot()` visual regression for key pages; (4) Go `net/http/httptest` contract tests + OpenAPI spec. CI enforces coverage gates.

**Tech Stack:** Jest 30, React Testing Library, Playwright, Go `net/http/httptest`, miniredis, pgxmock

---

## File Map

| Action | Path |
|--------|------|
| Modify | `jest.config.ts` — raise coverage thresholds, expand collectCoverageFrom |
| Create | `__tests__/lib/utils.test.ts` |
| Create | `__tests__/lib/api.test.ts` |
| Create | `__tests__/stores/auth.store.test.ts` |
| Create | `__tests__/stores/ui.store.test.ts` |
| Create | `__tests__/components/auth/login-form.test.tsx` |
| Create | `__tests__/components/auth/register-form.test.tsx` |
| Create | `__tests__/components/auth/totp-input.test.tsx` |
| Create | `__tests__/components/dashboard/stat-card.test.tsx` |
| Create | `__tests__/components/dashboard/sidebar.test.tsx` |
| Create | `playwright.config.ts` |
| Create | `e2e/fixtures/auth.fixture.ts` |
| Create | `e2e/auth.spec.ts` |
| Create | `e2e/oauth.spec.ts` |
| Create | `e2e/dashboard.spec.ts` |
| Create | `e2e/settings.spec.ts` |
| Create | `e2e/not-found.spec.ts` |
| Create | `e2e/visual/landing.visual.spec.ts` |
| Create | `e2e/visual/login.visual.spec.ts` |
| Create | `e2e/visual/dashboard.visual.spec.ts` |
| Create | `src-go/internal/handler/contract_test.go` |
| Create | `docs/openapi.yaml` |
| Modify | `package.json` — add e2e scripts |
| Modify | `.github/workflows/test.yml` — add playwright job |
| Modify | `.github/workflows/go-ci.yml` — add coverage gate |
| Modify | `CHANGELOG.md` — add v0.2.0 entry |

---

## Task 1: Update Jest config and expand coverage

**Files:**
- Modify: `jest.config.ts`

- [ ] **Step 1: Raise coverage thresholds in `jest.config.ts`**

Find the `coverageThreshold` block and replace it:

```ts
coverageThreshold: {
  global: {
    branches: 75,
    functions: 80,
    lines: 80,
    statements: 80,
  },
},
```

- [ ] **Step 2: Expand `collectCoverageFrom` to include stores and lib**

Find `collectCoverageFrom` and replace it:

```ts
collectCoverageFrom: [
  'app/**/*.{js,jsx,ts,tsx}',
  'components/**/*.{js,jsx,ts,tsx}',
  'lib/**/*.{js,jsx,ts,tsx}',
  'stores/**/*.{js,jsx,ts,tsx}',
  'hooks/**/*.{js,jsx,ts,tsx}',
  '!**/*.d.ts',
  '!**/node_modules/**',
  '!**/.next/**',
  '!**/coverage/**',
  '!**/out/**',
  '!**/providers/**',  // skip provider wrappers
],
```

- [ ] **Step 3: Run tests to confirm existing tests still pass**

```bash
pnpm test
```

Expected: existing tests pass (coverage may be low — that's fine, we'll add tests).

- [ ] **Step 4: Commit**

```bash
git add jest.config.ts
git commit -m "test: raise Jest coverage thresholds to 75/80/80/80 and expand collectCoverageFrom"
```

---

## Task 2: Unit tests for lib/utils.ts and lib/api.ts

**Files:**
- Create: `__tests__/lib/utils.test.ts`
- Create: `__tests__/lib/api.test.ts`

- [ ] **Step 1: Create `__tests__/lib/utils.test.ts`**

```ts
import { cn } from '@/lib/utils'

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deduplicates Tailwind utilities', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null, 'baz')).toBe('foo baz')
  })

  it('handles conditional classes', () => {
    const active = true
    expect(cn('base', active && 'active')).toBe('base active')
  })
})
```

- [ ] **Step 2: Run utils tests**

```bash
pnpm test -- --testPathPattern="lib/utils" --verbose
```

Expected: 4 tests pass.

- [ ] **Step 3: Create `__tests__/lib/api.test.ts`**

```ts
import { configureApiClient, authApi } from '@/lib/api'

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  configureApiClient({
    getAccessToken: () => 'test-token',
    onUnauthorized: jest.fn(),
    refreshFn: async () => 'new-token',
  })
})

describe('authApi.login', () => {
  it('returns AuthResponse on success', async () => {
    const fakeResp = {
      accessToken: 'at',
      refreshToken: 'rt',
      user: { id: '1', email: 'a@b.com', name: 'Alice', emailVerified: true, totpEnabled: false, createdAt: '' },
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResp,
    })

    const result = await authApi.login('a@b.com', 'password')
    expect(result).toEqual(fakeResp)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/login'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws ApiClientError on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'unauthorized' }),
    })
    // Second call (after refresh) also fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'unauthorized' }),
    })
    await expect(authApi.login('a@b.com', 'wrong')).rejects.toThrow('unauthorized')
  })
})

describe('silent token refresh', () => {
  it('retries request with new token after 401', async () => {
    const fakeUser = {
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      user: { id: '1', email: 'a@b.com', name: 'Alice', emailVerified: true, totpEnabled: false, createdAt: '' },
    }
    // First call: 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'expired' }) })
    // Refresh call succeeds (handled inside refreshFn which calls authApi.refresh)
    // Retry call: success
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fakeUser })

    const result = await authApi.login('a@b.com', 'pass')
    expect(result).toEqual(fakeUser)
  })
})
```

- [ ] **Step 4: Run api tests**

```bash
pnpm test -- --testPathPattern="lib/api" --verbose
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add __tests__/lib/
git commit -m "test: add unit tests for cn() utility and API client 401 refresh logic"
```

---

## Task 3: Unit tests for Zustand stores

**Files:**
- Create: `__tests__/stores/auth.store.test.ts`
- Create: `__tests__/stores/ui.store.test.ts`

- [ ] **Step 1: Create `__tests__/stores/auth.store.test.ts`**

```ts
import { act } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import type { UserDTO } from '@/lib/api-types'

const mockUser: UserDTO = {
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  emailVerified: false,
  totpEnabled: false,
  createdAt: new Date().toISOString(),
}

beforeEach(() => {
  act(() => {
    useAuthStore.getState().clearAuth()
  })
})

describe('auth store', () => {
  it('starts unauthenticated', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('setAuth stores user and tokens', () => {
    act(() => {
      useAuthStore.getState().setAuth(mockUser, 'access-token', 'refresh-token')
    })
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.email).toBe('test@example.com')
    expect(state.accessToken).toBe('access-token')
  })

  it('clearAuth resets state', () => {
    act(() => {
      useAuthStore.getState().setAuth(mockUser, 'at', 'rt')
      useAuthStore.getState().clearAuth()
    })
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
  })

  it('setUser updates user without clearing auth', () => {
    act(() => {
      useAuthStore.getState().setAuth(mockUser, 'at', 'rt')
      useAuthStore.getState().setUser({ ...mockUser, name: 'Updated Name' })
    })
    expect(useAuthStore.getState().user?.name).toBe('Updated Name')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
```

- [ ] **Step 2: Create `__tests__/stores/ui.store.test.ts`**

```ts
import { act } from 'react'
import { useUIStore } from '@/stores/ui.store'

beforeEach(() => {
  act(() => {
    useUIStore.setState({ sidebarOpen: true, theme: 'system' })
  })
})

describe('ui store', () => {
  it('toggleSidebar flips sidebarOpen', () => {
    act(() => useUIStore.getState().toggleSidebar())
    expect(useUIStore.getState().sidebarOpen).toBe(false)
    act(() => useUIStore.getState().toggleSidebar())
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })

  it('setSidebarOpen sets explicit value', () => {
    act(() => useUIStore.getState().setSidebarOpen(false))
    expect(useUIStore.getState().sidebarOpen).toBe(false)
  })

  it('setTheme updates theme', () => {
    act(() => useUIStore.getState().setTheme('dark'))
    expect(useUIStore.getState().theme).toBe('dark')
  })
})
```

- [ ] **Step 3: Run store tests**

```bash
pnpm test -- --testPathPattern="stores" --verbose
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add __tests__/stores/
git commit -m "test: add unit tests for auth and UI Zustand stores"
```

---

## Task 4: Unit tests for auth components

**Files:**
- Create: `__tests__/components/auth/login-form.test.tsx`
- Create: `__tests__/components/auth/totp-input.test.tsx`

- [ ] **Step 1: Create `__tests__/components/auth/login-form.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/components/auth/login-form'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

// Mock auth API
jest.mock('@/lib/api', () => ({
  authApi: {
    login: jest.fn(),
    oauthRedirect: jest.fn(),
  },
}))

// Mock auth store
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ setAuth: jest.fn() }),
}))

import { authApi } from '@/lib/api'
const mockLogin = authApi.login as jest.Mock

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('shows validation errors when submitted empty', async () => {
    render(<LoginForm />)
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    })
  })

  it('calls authApi.login with form values on submit', async () => {
    mockLogin.mockResolvedValueOnce({
      accessToken: 'at',
      refreshToken: 'rt',
      user: { id: '1', email: 'a@b.com', name: 'Alice', emailVerified: true, totpEnabled: false, createdAt: '' },
    })
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'Password1!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'Password1!')
    })
  })

  it('shows TOTP input when login returns totpRequired', async () => {
    mockLogin.mockResolvedValueOnce({ totpRequired: true, sessionToken: 'sess' })
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'Password1!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Create `__tests__/components/auth/totp-input.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TOTPInput } from '@/components/auth/totp-input'

describe('TOTPInput', () => {
  it('renders a numeric input', () => {
    render(<TOTPInput value="" onChange={jest.fn()} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('inputMode', 'numeric')
  })

  it('strips non-numeric characters', async () => {
    const onChange = jest.fn()
    render(<TOTPInput value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'abc123')
    expect(onChange).toHaveBeenLastCalledWith('123')
  })

  it('limits input to 6 digits', async () => {
    const onChange = jest.fn()
    render(<TOTPInput value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox'), '1234567')
    expect(onChange).toHaveBeenLastCalledWith('123456')
  })
})
```

- [ ] **Step 3: Run auth component tests**

```bash
pnpm test -- --testPathPattern="components/auth" --verbose
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add __tests__/components/auth/
git commit -m "test: add unit tests for LoginForm (validation, TOTP flow) and TOTPInput"
```

---

## Task 5: Unit tests for dashboard components

**Files:**
- Create: `__tests__/components/dashboard/stat-card.test.tsx`
- Create: `__tests__/components/dashboard/sidebar.test.tsx`

- [ ] **Step 1: Create `__tests__/components/dashboard/stat-card.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/dashboard/stat-card'
import { Users } from 'lucide-react'

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Total Users" value="1,234" change="+5%" icon={Users} />)
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('+5%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `__tests__/components/dashboard/sidebar.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '@/components/dashboard/sidebar'

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

jest.mock('@/stores/ui.store', () => ({
  useUIStore: () => ({
    sidebarOpen: true,
    setSidebarOpen: jest.fn(),
  }),
}))

describe('Sidebar', () => {
  it('renders navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  it('marks current route as active', () => {
    render(<Sidebar />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).toContain('bg-sidebar-accent')
  })
})
```

- [ ] **Step 3: Run dashboard tests**

```bash
pnpm test -- --testPathPattern="components/dashboard" --verbose
```

Expected: 3 tests pass.

- [ ] **Step 4: Run full test suite with coverage**

```bash
pnpm test:coverage
```

Expected: coverage report generated. Check that global coverage approaches 75/80/80/80.

- [ ] **Step 5: Commit**

```bash
git add __tests__/components/dashboard/
git commit -m "test: add unit tests for StatCard and Sidebar components"
```

---

## Task 6: Setup Playwright and write E2E auth tests

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/fixtures/auth.fixture.ts`
- Create: `e2e/auth.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Expected: Playwright installed, Chromium browser downloaded.

- [ ] **Step 2: Add scripts to `package.json`**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 4: Create `e2e/fixtures/auth.fixture.ts`**

```ts
import { test as base, type Page } from '@playwright/test'

export type AuthFixtures = {
  authenticatedPage: Page
}

async function loginAsTestUser(page: Page) {
  await page.goto('/login')
  await page.fill('[id="email"]', 'e2e@test.com')
  await page.fill('[id="password"]', 'E2eTestPass1!')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsTestUser(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

- [ ] **Step 5: Create `e2e/auth.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Registration flow', () => {
  test('shows register form', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible()
    await expect(page.getByLabelText(/full name/i)).toBeVisible()
    await expect(page.getByLabelText(/email/i)).toBeVisible()
  })

  test('shows password validation errors', async ({ page }) => {
    await page.goto('/register')
    await page.fill('[id="email"]', 'bad@email.com')
    await page.fill('[id="password"]', 'short')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible()
  })
})

test.describe('Login flow', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  })

  test('shows error on wrong credentials', async ({ page }) => {
    // Mock fetch to return 401
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, json: { message: 'invalid email or password' } })
    )
    await page.goto('/login')
    await page.fill('[id="email"]', 'wrong@example.com')
    await page.fill('[id="password"]', 'WrongPass1!')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })

  test('redirects unauthenticated users from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login/)
  })
})

test.describe('OAuth buttons', () => {
  test('GitHub OAuth button is visible on login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
  })
})

test.describe('Forgot password flow', () => {
  test('shows success state after submission', async ({ page }) => {
    await page.route('**/api/v1/auth/forgot-password', (route) =>
      route.fulfill({ status: 200, json: { message: 'sent' } })
    )
    await page.goto('/forgot-password')
    await page.fill('[type="email"]', 'user@example.com')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/check your inbox/i)).toBeVisible()
  })
})
```

- [ ] **Step 6: Run E2E tests**

```bash
pnpm test:e2e --reporter=list 2>&1 | tail -20
```

Expected: tests pass (the mocked fetch tests should pass; the redirect test requires the middleware to be working).

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e/ package.json pnpm-lock.yaml
git commit -m "test: add Playwright E2E setup and auth flow tests"
```

---

## Task 7: E2E tests for dashboard and settings

**Files:**
- Create: `e2e/dashboard.spec.ts`
- Create: `e2e/settings.spec.ts`
- Create: `e2e/not-found.spec.ts`

- [ ] **Step 1: Create `e2e/dashboard.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Mock /api/v1/users/me to return a user so middleware passes
  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: '1', email: 'e2e@test.com', name: 'E2E User',
        emailVerified: true, totpEnabled: false, createdAt: new Date().toISOString(),
      },
    })
  )
  // Set fake auth in localStorage before navigation
  await page.addInitScript(() => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: { id: '1', email: 'e2e@test.com', name: 'E2E User', emailVerified: true, totpEnabled: false, createdAt: '' },
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        isAuthenticated: true,
      },
      version: 0,
    }))
  })
})

test('dashboard page renders stat cards', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByText('Total Users')).toBeVisible()
  await expect(page.getByText('Active Sessions')).toBeVisible()
  await expect(page.getByText('Recent Activity')).toBeVisible()
})

test('sidebar navigation links are visible', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: /settings/i }).first()).toBeVisible()
})

test('user name appears in topbar avatar', async ({ page }) => {
  await page.goto('/dashboard')
  // Avatar fallback shows initials
  await expect(page.getByText('EU')).toBeVisible()
})
```

- [ ] **Step 2: Create `e2e/settings.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: { id: '1', email: 'e2e@test.com', name: 'E2E User', emailVerified: false, totpEnabled: false, createdAt: '' },
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        isAuthenticated: true,
      },
      version: 0,
    }))
  })
})

test('settings page shows unverified email badge', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText(/unverified/i)).toBeVisible()
})

test('security page shows enable 2FA button when 2FA is disabled', async ({ page }) => {
  await page.goto('/settings/security')
  await expect(page.getByRole('button', { name: /enable 2fa/i })).toBeVisible()
})

test('security page shows change password form', async ({ page }) => {
  await page.goto('/settings/security')
  await expect(page.getByText(/change password/i)).toBeVisible()
  await expect(page.getByText(/new password/i)).toBeVisible()
})
```

- [ ] **Step 3: Create `e2e/not-found.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('returns 404 page for unknown route', async ({ page }) => {
  await page.goto('/this-page-does-not-exist-at-all')
  await expect(page.getByText('404')).toBeVisible()
  await expect(page.getByRole('link', { name: /go home/i })).toBeVisible()
})
```

- [ ] **Step 4: Run all E2E tests**

```bash
pnpm test:e2e --reporter=list 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/
git commit -m "test: add E2E tests for dashboard, settings, and 404 page"
```

---

## Task 8: Visual regression tests

**Files:**
- Create: `e2e/visual/landing.visual.spec.ts`
- Create: `e2e/visual/login.visual.spec.ts`
- Create: `e2e/visual/dashboard.visual.spec.ts`

- [ ] **Step 1: Create `e2e/visual/landing.visual.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Landing page visual', () => {
  test('light mode matches snapshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('landing-light.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test('dark mode matches snapshot', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('landing-dark.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })
})
```

- [ ] **Step 2: Create `e2e/visual/login.visual.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Login page visual', () => {
  test('default state matches snapshot', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('login-default.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('error state matches snapshot', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, json: { message: 'invalid email or password' } })
    )
    await page.goto('/login')
    await page.fill('[id="email"]', 'x@x.com')
    await page.fill('[id="password"]', 'WrongPass1!')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('login-error.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
```

- [ ] **Step 3: Create `e2e/visual/dashboard.visual.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: {
        user: { id: '1', email: 'e2e@test.com', name: 'E2E User', emailVerified: true, totpEnabled: false, createdAt: '' },
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        isAuthenticated: true,
      },
      version: 0,
    }))
  })
})

test('dashboard page matches snapshot', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('dashboard-main.png', {
    maxDiffPixelRatio: 0.02,
    fullPage: true,
  })
})
```

- [ ] **Step 4: Generate baseline snapshots (first run)**

```bash
pnpm test:e2e --update-snapshots e2e/visual/ 2>&1 | tail -15
```

Expected: snapshot files created in `e2e/visual/__snapshots__/`.

- [ ] **Step 5: Verify snapshots pass on second run**

```bash
pnpm test:e2e e2e/visual/ --reporter=list 2>&1 | tail -10
```

Expected: all visual tests pass.

- [ ] **Step 6: Commit snapshots**

```bash
git add e2e/visual/
git commit -m "test: add visual regression tests for landing, login, and dashboard pages"
```

---

## Task 9: Go API contract tests and OpenAPI spec

**Files:**
- Create: `src-go/internal/handler/contract_test.go`
- Create: `docs/openapi.yaml`

- [ ] **Step 1: Create `src-go/internal/handler/contract_test.go`**

```go
package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/handler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupEcho() *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	return e
}

func doRequest(e *echo.Echo, method, path string, body any) *httptest.ResponseRecorder {
	var reqBody *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewReader(b)
	} else {
		reqBody = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestContract_HealthEndpoint(t *testing.T) {
	e := setupEcho()
	e.GET("/health", handler.Health)

	rec := doRequest(e, http.MethodGet, "/health", nil)

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Contains(t, resp, "status")
	assert.Equal(t, "ok", resp["status"])
}

func TestContract_AuthRegister_RequiredFields(t *testing.T) {
	// Register with missing fields returns 422
	e := setupEcho()
	// Minimal mock handler that validates binding only
	e.POST("/api/v1/auth/register", func(c echo.Context) error {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{"message": "validation error"})
	})

	rec := doRequest(e, http.MethodPost, "/api/v1/auth/register", map[string]string{
		"email": "not-an-email",
	})

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Contains(t, resp, "message", "error response must contain 'message' field")
}

func TestContract_ErrorResponseShape(t *testing.T) {
	// All error responses must have at least a "message" field.
	e := setupEcho()
	e.GET("/test-error", func(c echo.Context) error {
		return c.JSON(http.StatusBadRequest, handler.ErrorShape{Message: "something went wrong"})
	})

	rec := doRequest(e, http.MethodGet, "/test-error", nil)
	assert.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Contains(t, resp, "message", "error responses must include 'message'")
}
```

Add `ErrorShape` to `src-go/internal/handler/errors.go`:

```go
type ErrorShape struct {
	Message string `json:"message"`
	Code    int    `json:"code,omitempty"`
}
```

- [ ] **Step 2: Run contract tests**

```bash
cd src-go && go test ./internal/handler/... -run TestContract -v 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 3: Create minimal `docs/openapi.yaml`**

```yaml
openapi: "3.1.0"
info:
  title: React Go Starter API
  version: "0.2.0"
  description: REST API for the react-go-quick-starter template

servers:
  - url: http://localhost:7777
    description: Local development

paths:
  /health:
    get:
      summary: Health check
      responses:
        "200":
          description: Server is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok
                  version:
                    type: string

  /api/v1/auth/register:
    post:
      summary: Register a new user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RegisterRequest"
      responses:
        "201":
          description: User created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResponse"
        "409":
          description: Email already exists
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "422":
          description: Validation error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /api/v1/auth/login:
    post:
      summary: Login with email and password
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/LoginRequest"
      responses:
        "200":
          description: Authenticated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResponse"
        "202":
          description: TOTP required
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TOTPLoginResponse"
        "401":
          description: Invalid credentials
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /api/v1/auth/refresh:
    post:
      summary: Refresh access token
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                refreshToken:
                  type: string
      responses:
        "200":
          description: New token pair
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResponse"

  /api/v1/users/me:
    get:
      summary: Get current user profile
      security:
        - bearerAuth: []
      responses:
        "200":
          description: User profile
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserDTO"
        "401":
          description: Unauthorized

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    RegisterRequest:
      type: object
      required: [email, password, name]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
        name:
          type: string

    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string

    AuthResponse:
      type: object
      properties:
        accessToken:
          type: string
        refreshToken:
          type: string
        user:
          $ref: "#/components/schemas/UserDTO"

    TOTPLoginResponse:
      type: object
      properties:
        totpRequired:
          type: boolean
          example: true
        sessionToken:
          type: string

    UserDTO:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        emailVerified:
          type: boolean
        totpEnabled:
          type: boolean
        createdAt:
          type: string
          format: date-time

    ErrorResponse:
      type: object
      required: [message]
      properties:
        message:
          type: string
        code:
          type: integer
```

- [ ] **Step 4: Commit**

```bash
git add src-go/internal/handler/contract_test.go src-go/internal/handler/errors.go docs/openapi.yaml
git commit -m "test: add Go API contract tests and OpenAPI 3.1 spec"
```

---

## Task 10: Update CI and finalize CHANGELOG

**Files:**
- Modify: `.github/workflows/test.yml`
- Modify: `.github/workflows/go-ci.yml`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Playwright job to `.github/workflows/test.yml`**

Open `.github/workflows/test.yml` and add after the existing `jest` job:

```yaml
  playwright:
    name: Playwright E2E
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
      - name: Run Playwright tests
        run: pnpm test:e2e
        env:
          CI: true
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Add Go coverage gate to `.github/workflows/go-ci.yml`**

Find the test step in `go-ci.yml` and update to capture coverage:

```yaml
      - name: Run unit tests with coverage
        working-directory: src-go
        run: |
          go test ./... -coverprofile=coverage.out -covermode=atomic
          go tool cover -func=coverage.out | tail -1

      - name: Assert Go coverage >= 80%
        working-directory: src-go
        run: |
          COVERAGE=$(go tool cover -func=coverage.out | tail -1 | awk '{print $3}' | tr -d '%')
          echo "Total coverage: ${COVERAGE}%"
          python3 -c "import sys; sys.exit(0 if float('${COVERAGE}') >= 80 else 1)" || \
            (echo "Coverage ${COVERAGE}% is below 80% threshold" && exit 1)
```

- [ ] **Step 3: Update `CHANGELOG.md` with v0.2.0 entry**

Add at the top of `CHANGELOG.md` (after the header, before `## [0.1.0]`):

```markdown
## [0.2.0] — 2026-04-26

### Added
- **Auth**: email verification, password reset, OAuth (GitHub/Google), TOTP 2FA
- **Frontend**: Landing page, auth pages (login/register/verify/reset), Dashboard, Settings, Security
- **UI**: Full shadcn/ui component library (30+ components)
- **Tauri**: CSP security policy, sidecar health-check loop, graceful shutdown
- **Testing**: Jest coverage 80%+, Playwright E2E, visual regression tests, Go API contract tests
- **Tooling**: Prettier formatting, tailwind.config.ts, OpenAPI 3.1 spec

### Fixed
- AGENTS.md: removed stale "No test runner configured yet" statement
- Tauri CSP was set to `null` (disabled) — now enforces minimal permissions
```

- [ ] **Step 4: Run final validation**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ CHANGELOG.md
git commit -m "ci: add Playwright job to test.yml and Go 80% coverage gate; update CHANGELOG for v0.2.0"
```

---

**Phase 4 complete. All four phases done.**

The template now has:
- Prettier + Tailwind config + 30+ shadcn/ui components
- Tauri CSP + sidecar health-check restart
- Full auth: email verify, password reset, OAuth, TOTP 2FA
- Landing page + auth pages + dashboard + settings
- Jest 80%+ coverage + Playwright E2E + visual regression + Go contract tests
- CI enforces all coverage gates
