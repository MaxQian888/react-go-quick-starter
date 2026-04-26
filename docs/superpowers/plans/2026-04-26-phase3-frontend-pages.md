# Phase 3: Frontend Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete frontend — landing page, auth flow (login/register/verify/reset), and dashboard with settings/security pages — wired to the backend via a typed API client and Zustand stores.

**Architecture:** Route groups `(marketing)`, `(auth)`, `(dashboard)` provide isolated layouts. `middleware.ts` enforces auth guards. `lib/api.ts` is a typed fetch wrapper with silent 401 refresh. Zustand stores (`auth.store.ts`, `ui.store.ts`) hold session and UI state. All forms use react-hook-form + zod. The dashboard shows static demo data only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand 5, react-hook-form, zod, shadcn/ui, Tailwind CSS v4

---

## File Map

| Action | Path |
|--------|------|
| Create | `stores/auth.store.ts` |
| Create | `stores/ui.store.ts` |
| Create | `lib/api.ts` |
| Create | `lib/api-types.ts` |
| Create | `middleware.ts` |
| Modify | `app/layout.tsx` |
| Create | `app/(marketing)/layout.tsx` |
| Create | `app/(marketing)/page.tsx` |
| Create | `app/(auth)/layout.tsx` |
| Create | `app/(auth)/login/page.tsx` |
| Create | `app/(auth)/register/page.tsx` |
| Create | `app/(auth)/verify-email/page.tsx` |
| Create | `app/(auth)/forgot-password/page.tsx` |
| Create | `app/(auth)/reset-password/page.tsx` |
| Create | `app/(dashboard)/layout.tsx` |
| Create | `app/(dashboard)/dashboard/page.tsx` |
| Create | `app/(dashboard)/settings/page.tsx` |
| Create | `app/(dashboard)/settings/security/page.tsx` |
| Create | `app/auth/callback/page.tsx` |
| Create | `app/error.tsx` |
| Create | `app/not-found.tsx` |
| Create | `app/loading.tsx` |
| Create | `components/marketing/hero.tsx` |
| Create | `components/marketing/tech-stack.tsx` |
| Create | `components/marketing/features.tsx` |
| Create | `components/marketing/code-preview.tsx` |
| Create | `components/marketing/nav.tsx` |
| Create | `components/dashboard/sidebar.tsx` |
| Create | `components/dashboard/topbar.tsx` |
| Create | `components/dashboard/stat-card.tsx` |
| Create | `components/auth/login-form.tsx` |
| Create | `components/auth/register-form.tsx` |
| Create | `components/auth/oauth-buttons.tsx` |
| Create | `components/auth/totp-input.tsx` |

---

## Task 1: Install frontend dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime dependencies**

```bash
pnpm add react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-hook-form, zod, @hookform/resolvers"
```

---

## Task 2: Create API types and client

**Files:**
- Create: `lib/api-types.ts`
- Create: `lib/api.ts`

- [ ] **Step 1: Create `lib/api-types.ts`**

```ts
export interface UserDTO {
  id: string
  email: string
  name: string
  emailVerified: boolean
  totpEnabled: boolean
  createdAt: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: UserDTO
}

export interface TOTPLoginResponse {
  totpRequired: true
  sessionToken: string
}

export type LoginResult = AuthResponse | TOTPLoginResponse

export interface TOTPSetupResponse {
  secret: string
  qrCodeUri: string
}

export interface ApiError {
  message: string
  status: number
}
```

- [ ] **Step 2: Create `lib/api.ts`**

```ts
import type { AuthResponse, LoginResult, TOTPSetupResponse, UserDTO } from './api-types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7777'

class ApiClientError extends Error {
  constructor(
    public message: string,
    public status: number
  ) {
    super(message)
  }
}

let getAccessToken: () => string | null = () => null
let onUnauthorized: () => void = () => {}
let refreshFn: () => Promise<string | null> = async () => null

export function configureApiClient(opts: {
  getAccessToken: () => string | null
  onUnauthorized: () => void
  refreshFn: () => Promise<string | null>
}) {
  getAccessToken = opts.getAccessToken
  onUnauthorized = opts.onUnauthorized
  refreshFn = opts.refreshFn
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    const newToken = await refreshFn()
    if (newToken) {
      return request<T>(path, options, false)
    }
    onUnauthorized()
    throw new ApiClientError('Unauthorized', 401)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiClientError(body.message ?? 'Request failed', res.status)
  }

  return res.json() as Promise<T>
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResult>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  confirmTotp: (sessionToken: string, code: string) =>
    request<AuthResponse>('/api/v1/auth/login/totp-confirm', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, code }),
    }),

  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  refresh: (refreshToken: string) =>
    request<AuthResponse>(
      '/api/v1/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }) },
      false
    ),

  logout: () =>
    request<void>('/api/v1/auth/logout', { method: 'POST' }),

  logoutAll: () =>
    request<void>('/api/v1/auth/sessions', { method: 'DELETE' }),

  sendVerification: () =>
    request<void>('/api/v1/auth/send-verification', { method: 'POST' }),

  verifyEmail: (token: string) =>
    request<void>('/api/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  forgotPassword: (email: string) =>
    request<void>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<void>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  totpSetup: () =>
    request<TOTPSetupResponse>('/api/v1/auth/totp/setup', { method: 'POST' }),

  totpVerify: (secret: string, code: string) =>
    request<void>('/api/v1/auth/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: { 'X-TOTP-Secret': secret },
    }),

  totpDisable: (password: string) =>
    request<void>('/api/v1/auth/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  oauthRedirect: (provider: 'github' | 'google') => {
    window.location.href = `${API_BASE}/api/v1/auth/oauth/${provider}`
  },
}

export const userApi = {
  getMe: () => request<UserDTO>('/api/v1/users/me'),

  updateProfile: (name: string) =>
    request<UserDTO>('/api/v1/users/me', {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/v1/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/api.ts lib/api-types.ts
git commit -m "feat: add typed API client with silent 401 refresh"
```

---

## Task 3: Create Zustand stores

**Files:**
- Create: `stores/auth.store.ts`
- Create: `stores/ui.store.ts`

- [ ] **Step 1: Create `stores/auth.store.ts`**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserDTO } from '@/lib/api-types'

interface AuthState {
  user: UserDTO | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: UserDTO, accessToken: string, refreshToken: string) => void
  setUser: (user: UserDTO) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      clearAuth: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
```

- [ ] **Step 2: Create `stores/ui.store.ts`**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface UIState {
  sidebarOpen: boolean
  theme: Theme
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: Theme) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'system',
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'ui-storage' }
  )
)
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add stores/
git commit -m "feat: add Zustand auth and UI stores with persistence"
```

---

## Task 4: Add Next.js route guard middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '?')
  )

  // Read token from Authorization header or a custom cookie
  const token =
    request.cookies.get('access_token')?.value ??
    request.headers.get('x-access-token') ??
    null

  if (!isPublic && !token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isPublic && token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icons).*)'],
}
```

**Note:** The token check is best-effort at the edge (no JWT verification). The API client handles the real 401 flow. This only redirects based on cookie presence for UX.

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Next.js middleware for auth route guard"
```

---

## Task 5: Update root layout and create route group layouts

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(marketing)/layout.tsx`
- Create: `app/(auth)/layout.tsx`
- Create: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

Replace the default Next.js content:

```tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ApiClientProvider } from '@/components/providers/api-client-provider'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'React Go Starter',
  description: 'Full-stack desktop app starter: Next.js + Go + Tauri',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ApiClientProvider>
          {children}
        </ApiClientProvider>
        <Toaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create `components/providers/api-client-provider.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { configureApiClient, authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

export function ApiClientProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, refreshToken, setAuth, clearAuth } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onUnauthorized: () => {
        clearAuth()
        router.push('/login')
      },
      refreshFn: async () => {
        const rt = useAuthStore.getState().refreshToken
        if (!rt) return null
        try {
          const resp = await authApi.refresh(rt)
          useAuthStore.getState().setAuth(resp.user, resp.accessToken, resp.refreshToken)
          return resp.accessToken
        } catch {
          useAuthStore.getState().clearAuth()
          return null
        }
      },
    })
  }, [clearAuth, router])

  return <>{children}</>
}
```

- [ ] **Step 3: Create `app/(marketing)/layout.tsx`**

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="font-semibold text-lg">
            React Go Starter
          </Link>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} React Go Starter — MIT License
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/(dashboard)/layout.tsx`**

```tsx
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Build check**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/ components/providers/
git commit -m "feat: update root layout and add marketing/auth/dashboard route group layouts"
```

---

## Task 6: Build Landing Page

**Files:**
- Create: `app/(marketing)/page.tsx`
- Create: `components/marketing/hero.tsx`
- Create: `components/marketing/tech-stack.tsx`
- Create: `components/marketing/features.tsx`
- Create: `components/marketing/code-preview.tsx`

- [ ] **Step 1: Create `components/marketing/hero.tsx`**

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="container flex flex-col items-center gap-6 py-24 text-center">
      <div className="rounded-full border px-4 py-1 text-sm text-muted-foreground">
        Open Source Starter Template
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        React + Go + Tauri
        <br />
        <span className="text-muted-foreground">full-stack starter</span>
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Production-ready template with authentication, desktop support, and a complete
        development workflow — clone it and ship faster.
      </p>
      <div className="flex gap-4">
        <Button size="lg" asChild>
          <Link href="/register">Get Started</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </Button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `components/marketing/tech-stack.tsx`**

```tsx
const stack = [
  { name: 'Next.js 16', desc: 'App Router + React 19' },
  { name: 'Go + Echo', desc: 'Fast REST API backend' },
  { name: 'Tauri 2', desc: 'Native desktop wrapper' },
  { name: 'TypeScript', desc: 'End-to-end type safety' },
  { name: 'PostgreSQL', desc: 'Relational database' },
  { name: 'Redis', desc: 'Token cache + sessions' },
]

export function TechStack() {
  return (
    <section className="border-y bg-muted/30 py-16">
      <div className="container">
        <h2 className="mb-10 text-center text-2xl font-semibold">Built with modern tools</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {stack.map((item) => (
            <div
              key={item.name}
              className="flex flex-col items-center gap-2 rounded-lg border bg-background p-4 text-center"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create `components/marketing/features.tsx`**

```tsx
import { Shield, Monitor, Wrench, TestTube, GitBranch, Database } from 'lucide-react'

const features = [
  { icon: Shield, title: 'Auth System', desc: 'JWT, OAuth (GitHub/Google), TOTP 2FA, email verification, password reset.' },
  { icon: Monitor, title: 'Desktop App', desc: 'Tauri wraps the Next.js frontend — one codebase, web + native.' },
  { icon: Wrench, title: 'Modern Toolchain', desc: 'Prettier, ESLint, Tailwind v4, shadcn/ui, TypeScript strict mode.' },
  { icon: TestTube, title: 'Test Suite', desc: 'Jest + RTL for unit tests, Playwright for E2E and visual regression.' },
  { icon: GitBranch, title: 'CI/CD Pipelines', desc: '7 GitHub Actions workflows: lint, test, build, release, deploy.' },
  { icon: Database, title: 'Docker Integration', desc: 'PostgreSQL + Redis via Docker Compose with health checks and scripts.' },
]

export function Features() {
  return (
    <section className="container py-20">
      <h2 className="mb-12 text-center text-2xl font-semibold">Everything you need to ship</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-lg border p-6">
            <Icon className="mb-3 h-6 w-6 text-primary" />
            <h3 className="mb-2 font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `components/marketing/code-preview.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const samples = {
  frontend: `// app/(auth)/login/page.tsx
const form = useForm<LoginSchema>({ resolver: zodResolver(schema) })
const onSubmit = async (data: LoginSchema) => {
  const result = await authApi.login(data.email, data.password)
  if ('totpRequired' in result) setShowTotp(true)
  else store.setAuth(result.user, result.accessToken, result.refreshToken)
}`,
  backend: `// internal/service/auth_service.go
func (s *AuthService) Login(ctx context.Context, req *model.LoginRequest) (any, error) {
  user, _ := s.userRepo.GetByEmail(ctx, req.Email)
  bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
  if user.TOTPEnabled {
    sessionToken := uuid.New().String()
    s.cacheRepo.SetTOTPSession(ctx, sessionToken, user.ID.String())
    return &model.TOTPLoginResponse{TOTPRequired: true, SessionToken: sessionToken}, nil
  }
  return s.issueTokens(ctx, user)
}`,
  tauri: `// src-tauri/src/lib.rs
tauri::async_runtime::spawn(async move {
  let mut failures: u8 = 0;
  loop {
    sleep(Duration::from_secs(5)).await;
    let ok = reqwest::get(&health_url).await
      .map(|r| r.status().is_success()).unwrap_or(false);
    if !ok { failures += 1;
      if failures >= 3 { /* restart sidecar */ }
    } else { failures = 0; }
  }
});`,
}

export function CodePreview() {
  return (
    <section className="border-y bg-muted/30 py-20">
      <div className="container max-w-3xl">
        <h2 className="mb-8 text-center text-2xl font-semibold">Clean, readable code</h2>
        <Tabs defaultValue="frontend">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="frontend" className="flex-1">Frontend</TabsTrigger>
            <TabsTrigger value="backend" className="flex-1">Backend</TabsTrigger>
            <TabsTrigger value="tauri" className="flex-1">Tauri</TabsTrigger>
          </TabsList>
          {Object.entries(samples).map(([key, code]) => (
            <TabsContent key={key} value={key}>
              <pre className="overflow-x-auto rounded-lg border bg-background p-4 text-sm">
                <code>{code}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Create `app/(marketing)/page.tsx`**

```tsx
import { Hero } from '@/components/marketing/hero'
import { TechStack } from '@/components/marketing/tech-stack'
import { Features } from '@/components/marketing/features'
import { CodePreview } from '@/components/marketing/code-preview'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TechStack />
      <Features />
      <CodePreview />
      <section className="container py-20 text-center">
        <h2 className="mb-4 text-2xl font-semibold">Ready to build?</h2>
        <p className="mb-8 text-muted-foreground">Start your next full-stack project today.</p>
        <Button size="lg" asChild>
          <Link href="/register">Get Started — it&apos;s free</Link>
        </Button>
      </section>
    </>
  )
}
```

- [ ] **Step 6: Build check**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/\(marketing\)/ components/marketing/
git commit -m "feat: build landing page with hero, tech stack, features, and code preview sections"
```

---

## Task 7: Build auth components and login page

**Files:**
- Create: `components/auth/login-form.tsx`
- Create: `components/auth/oauth-buttons.tsx`
- Create: `components/auth/totp-input.tsx`
- Create: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create `components/auth/oauth-buttons.tsx`**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { authApi } from '@/lib/api'

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function OAuthButtons() {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => authApi.oauthRedirect('github')}
      >
        <GitHubIcon />
        Continue with GitHub
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => authApi.oauthRedirect('google')}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/auth/totp-input.tsx`**

```tsx
'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TOTPInputProps {
  value: string
  onChange: (val: string) => void
}

export function TOTPInput({ value, onChange }: TOTPInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="totp">Authenticator code</Label>
      <Input
        id="totp"
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="text-center text-2xl tracking-widest"
        autoComplete="one-time-code"
      />
    </div>
  )
}
```

- [ ] **Step 3: Create `components/auth/login-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { OAuthButtons } from './oauth-buttons'
import { TOTPInput } from './totp-input'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import Link from 'next/link'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type LoginSchema = z.infer<typeof schema>

export function LoginForm() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [totpRequired, setTotpRequired] = useState(false)
  const [sessionToken, setSessionToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginSchema>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: LoginSchema) => {
    setSubmitting(true)
    try {
      const result = await authApi.login(data.email, data.password)
      if ('totpRequired' in result) {
        setTotpRequired(true)
        setSessionToken(result.sessionToken)
      } else {
        setAuth(result.user, result.accessToken, result.refreshToken)
        router.push('/dashboard')
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onTotpSubmit = async () => {
    setSubmitting(true)
    try {
      const result = await authApi.confirmTotp(sessionToken, totpCode)
      setAuth(result.user, result.accessToken, result.refreshToken)
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e.message ?? 'Invalid code')
    } finally {
      setSubmitting(false)
    }
  }

  if (totpRequired) {
    return (
      <div className="space-y-4">
        <TOTPInput value={totpCode} onChange={setTotpCode} />
        <Button className="w-full" onClick={onTotpSubmit} disabled={submitting || totpCode.length < 6}>
          {submitting ? 'Verifying…' : 'Verify'}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox id="remember" />
          <Label htmlFor="remember" className="font-normal">Remember me</Label>
        </div>
        <Link href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
          or
        </span>
      </div>
      <OAuthButtons />
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="underline">Sign up</Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 4: Create `app/(auth)/login/page.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = { title: 'Sign in — React Go Starter' }

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Build check**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add components/auth/ app/\(auth\)/login/
git commit -m "feat: build login page with OAuth buttons, TOTP input, and react-hook-form validation"
```

---

## Task 8: Build register page

**Files:**
- Create: `components/auth/register-form.tsx`
- Create: `app/(auth)/register/page.tsx`

- [ ] **Step 1: Create `components/auth/register-form.tsx`**

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { OAuthButtons } from './oauth-buttons'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import Link from 'next/link'
import { useState } from 'react'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})
type RegisterSchema = z.infer<typeof schema>

export function RegisterForm() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterSchema>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: RegisterSchema) => {
    setSubmitting(true)
    try {
      const result = await authApi.register(data.name, data.email, data.password)
      setAuth(result.user, result.accessToken, result.refreshToken)
      router.push('/dashboard')
      toast.success('Account created! Check your email to verify.')
    } catch (e: any) {
      toast.error(e.message ?? 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {(['name', 'email', 'password', 'confirmPassword'] as const).map((field) => (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>
            {{ name: 'Full name', email: 'Email', password: 'Password', confirmPassword: 'Confirm password' }[field]}
          </Label>
          <Input
            id={field}
            type={field.includes('assword') ? 'password' : field === 'email' ? 'email' : 'text'}
            {...register(field)}
          />
          {errors[field] && <p className="text-sm text-destructive">{errors[field]?.message}</p>}
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">or</span>
      </div>
      <OAuthButtons />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="underline">Sign in</Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 2: Create `app/(auth)/register/page.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegisterForm } from '@/components/auth/register-form'

export const metadata = { title: 'Create account — React Go Starter' }

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your details to get started</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/auth/register-form.tsx app/\(auth\)/register/
git commit -m "feat: build register page with zod validation and password strength rules"
```

---

## Task 9: Build verify-email, forgot-password, and reset-password pages

**Files:**
- Create: `app/(auth)/verify-email/page.tsx`
- Create: `app/(auth)/forgot-password/page.tsx`
- Create: `app/(auth)/reset-password/page.tsx`

- [ ] **Step 1: Create `app/(auth)/verify-email/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { authApi } from '@/lib/api'

export default function VerifyEmailPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); return }
    authApi.verifyEmail(token)
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/dashboard'), 2000)
      })
      .catch(() => setStatus('error'))
  }, [params, router])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {status === 'loading' && 'Verifying…'}
          {status === 'success' && '✓ Email verified'}
          {status === 'error' && 'Verification failed'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === 'success' && <p className="text-muted-foreground">Redirecting to dashboard…</p>}
        {status === 'error' && (
          <div className="space-y-4">
            <p className="text-muted-foreground">The link is invalid or has expired.</p>
            <Button onClick={() => authApi.sendVerification()}>Resend verification email</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create `app/(auth)/forgot-password/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'
import Link from 'next/link'

const schema = z.object({ email: z.string().email() })
type Schema = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Schema>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Schema) => {
    await authApi.forgotPassword(data.email).catch(() => {})
    setSent(true)
    toast.success('If that email exists, a reset link has been sent.')
  }

  if (sent) {
    return (
      <Card>
        <CardHeader><CardTitle>Check your inbox</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">A password reset link has been sent if the email is registered.</p>
          <Link href="/login" className="underline text-sm">Back to login</Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>Enter your email to receive a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
          <Link href="/login" className="block text-center text-sm text-muted-foreground underline">
            Back to login
          </Link>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create `app/(auth)/reset-password/page.tsx`**

```tsx
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'

const schema = z.object({
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ['confirm'] })
type Schema = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const params = useSearchParams()
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Schema>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Schema) => {
    const token = params.get('token') ?? ''
    try {
      await authApi.resetPassword(token, data.password)
      toast.success('Password updated. Please sign in.')
      router.push('/login')
    } catch (e: any) {
      toast.error(e.message ?? 'Reset failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set new password</CardTitle>
        <CardDescription>Choose a strong password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {(['password', 'confirm'] as const).map((f) => (
            <div key={f} className="space-y-2">
              <Label>{f === 'password' ? 'New password' : 'Confirm password'}</Label>
              <Input type="password" {...register(f)} />
              {errors[f] && <p className="text-sm text-destructive">{errors[f]?.message}</p>}
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/verify-email/ app/\(auth\)/forgot-password/ app/\(auth\)/reset-password/
git commit -m "feat: build verify-email, forgot-password, and reset-password auth pages"
```

---

## Task 10: Build Dashboard layout (Sidebar + Topbar)

**Files:**
- Create: `components/dashboard/sidebar.tsx`
- Create: `components/dashboard/topbar.tsx`

- [ ] **Step 1: Create `components/dashboard/sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, Shield, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/ui.store'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/settings', icon: Settings, label: 'Settings' },
  { href: '/settings/security', icon: Shield, label: 'Security' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen } = useUIStore()

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r bg-sidebar transition-transform lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <Link href="/" className="font-semibold">React Go Starter</Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === href
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  )
}
```

- [ ] **Step 2: Create `components/dashboard/topbar.tsx`**

```tsx
'use client'

import { Menu, LogOut, Settings, User } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { useUIStore } from '@/stores/ui.store'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'

export function Topbar() {
  const { toggleSidebar } = useUIStore()
  const { user, clearAuth } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const label = pathname === '/dashboard' ? 'Dashboard'
    : pathname === '/settings' ? 'Settings'
    : pathname === '/settings/security' ? 'Security'
    : 'Page'

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    clearAuth()
    router.push('/login')
    toast.success('Signed out')
  }

  const initials = (user?.name ?? 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <header className="flex h-16 items-center gap-4 border-b px-4">
      <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden">
        <Menu className="h-4 w-4" />
      </Button>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbPage>{label}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/settings"><User className="mr-2 h-4 w-4" />Profile</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/settings/security"><Settings className="mr-2 h-4 w-4" />Security</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/sidebar.tsx components/dashboard/topbar.tsx
git commit -m "feat: build collapsible dashboard sidebar and topbar with user dropdown"
```

---

## Task 11: Build Dashboard main page

**Files:**
- Create: `components/dashboard/stat-card.tsx`
- Create: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create `components/dashboard/stat-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string
  change: string
  icon: LucideIcon
}

export function StatCard({ title, value, change, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{change}</p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create `app/(dashboard)/dashboard/page.tsx`**

```tsx
import { Users, Activity, TrendingUp, DollarSign } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const stats = [
  { title: 'Total Users', value: '2,350', change: '+12% from last month', icon: Users },
  { title: 'Active Sessions', value: '1,247', change: '+4% from last month', icon: Activity },
  { title: 'Signups Today', value: '43', change: '+18% from yesterday', icon: TrendingUp },
  { title: 'Revenue', value: '$12,450', change: '+8% from last month', icon: DollarSign },
]

const activity = [
  { user: 'alice@example.com', action: 'Signed up', time: '2 min ago', status: 'success' },
  { user: 'bob@example.com', action: 'Password reset', time: '15 min ago', status: 'warning' },
  { user: 'carol@example.com', action: 'Enabled 2FA', time: '1 hr ago', status: 'success' },
  { user: 'dave@example.com', action: 'Login failed', time: '2 hr ago', status: 'error' },
  { user: 'eve@example.com', action: 'Email verified', time: '3 hr ago', status: 'success' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your application</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => <StatCard key={s.title} {...s} />)}
      </div>
      <Card>
        <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((row) => (
                <TableRow key={row.user + row.time}>
                  <TableCell className="font-medium">{row.user}</TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell className="text-muted-foreground">{row.time}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'success' ? 'default' : row.status === 'warning' ? 'secondary' : 'destructive'}>
                      {row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/stat-card.tsx app/\(dashboard\)/dashboard/
git commit -m "feat: build dashboard main page with stat cards and activity table (static demo data)"
```

---

## Task 12: Build Settings and Security pages

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`
- Create: `app/(dashboard)/settings/security/page.tsx`
- Create: `app/auth/callback/page.tsx`

- [ ] **Step 1: Create `app/(dashboard)/settings/page.tsx`**

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/lib/api'

const schema = z.object({ name: z.string().min(1, 'Name is required') })
type Schema = z.infer<typeof schema>

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const initials = (user?.name ?? 'U').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '' },
  })

  const onSubmit = async (data: Schema) => {
    try {
      const updated = await userApi.updateProfile(data.name)
      setUser(updated)
      toast.success('Profile updated')
    } catch (e: any) {
      toast.error(e.message ?? 'Update failed')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="mt-1 flex items-center gap-2">
                {user?.emailVerified
                  ? <Badge>Email verified</Badge>
                  : (
                    <>
                      <Badge variant="secondary">Unverified</Badge>
                      <button
                        className="text-xs text-muted-foreground underline"
                        onClick={() => authApi.sendVerification().then(() => toast.success('Verification email sent'))}
                      >
                        Resend
                      </button>
                    </>
                  )
                }
              </div>
            </div>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ''} disabled />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

Add missing import at top: `import { userApi } from '@/lib/api'`

- [ ] **Step 2: Create `app/(dashboard)/settings/security/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { TOTPInput } from '@/components/auth/totp-input'
import { useAuthStore } from '@/stores/auth.store'
import { authApi, userApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import type { TOTPSetupResponse } from '@/lib/api-types'

const pwSchema = z.object({
  current: z.string().min(1, 'Required'),
  next: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  confirm: z.string(),
}).refine((d) => d.next === d.confirm, { message: "Passwords don't match", path: ['confirm'] })
type PwSchema = z.infer<typeof pwSchema>

export default function SecurityPage() {
  const { user, setUser, clearAuth } = useAuthStore()
  const router = useRouter()
  const [totpSetup, setTotpSetup] = useState<TOTPSetupResponse | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PwSchema>({
    resolver: zodResolver(pwSchema),
  })

  const onChangePassword = async (data: PwSchema) => {
    try {
      await userApi.changePassword(data.current, data.next)
      toast.success('Password changed')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed')
    }
  }

  const startTotpSetup = async () => {
    const resp = await authApi.totpSetup().catch(() => null)
    if (resp) setTotpSetup(resp)
  }

  const confirmTotp = async () => {
    if (!totpSetup) return
    try {
      await authApi.totpVerify(totpSetup.secret, totpCode)
      if (user) setUser({ ...user, totpEnabled: true })
      setTotpSetup(null)
      toast.success('2FA enabled')
    } catch (e: any) {
      toast.error(e.message ?? 'Invalid code')
    }
  }

  const disableTotp = async (password: string) => {
    try {
      await authApi.totpDisable(password)
      if (user) setUser({ ...user, totpEnabled: false })
      toast.success('2FA disabled')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed')
    }
  }

  const logoutAll = async () => {
    await authApi.logoutAll().catch(() => {})
    clearAuth()
    router.push('/login')
    toast.success('Signed out from all devices')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Security</h1>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
            {(['current', 'next', 'confirm'] as const).map((f) => (
              <div key={f} className="space-y-2">
                <Label>{{ current: 'Current password', next: 'New password', confirm: 'Confirm new password' }[f]}</Label>
                <Input type="password" {...register(f)} />
                {errors[f] && <p className="text-sm text-destructive">{errors[f]?.message}</p>}
              </div>
            ))}
            <Button type="submit" disabled={isSubmitting}>Update password</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>Add an extra layer of security using an authenticator app</CardDescription>
        </CardHeader>
        <CardContent>
          {user?.totpEnabled ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Disable 2FA</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
                  <AlertDialogDescription>Enter your current password to confirm.</AlertDialogDescription>
                </AlertDialogHeader>
                <Input type="password" placeholder="Current password" id="disable-pw" />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    const pw = (document.getElementById('disable-pw') as HTMLInputElement).value
                    disableTotp(pw)
                  }}>Disable</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Dialog onOpenChange={(open) => { if (open) startTotpSetup() }}>
              <DialogTrigger asChild>
                <Button>Enable 2FA</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Set up authenticator</DialogTitle></DialogHeader>
                {totpSetup && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app:</p>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(totpSetup.qrCodeUri)}&size=200x200`} alt="TOTP QR code" className="mx-auto rounded" />
                    <p className="text-xs text-muted-foreground text-center">Or enter secret manually: <code>{totpSetup.secret}</code></p>
                    <TOTPInput value={totpCode} onChange={setTotpCode} />
                    <Button className="w-full" onClick={confirmTotp} disabled={totpCode.length < 6}>Confirm</Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Sign out from all other devices</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Logout all devices</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
                <AlertDialogDescription>This will terminate all active sessions including this one.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={logoutAll}>Sign out all</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/auth/callback/page.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { userApi } from '@/lib/api'
import { configureApiClient } from '@/lib/api'

export default function AuthCallbackPage() {
  const params = useSearchParams()
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const accessToken = params.get('accessToken')
    const refreshToken = params.get('refreshToken')
    if (!accessToken || !refreshToken) {
      router.push('/login?error=oauth_failed')
      return
    }
    // Temporarily configure token so we can call getMe
    configureApiClient({
      getAccessToken: () => accessToken,
      onUnauthorized: () => router.push('/login'),
      refreshFn: async () => null,
    })
    userApi.getMe().then((user) => {
      setAuth(user, accessToken, refreshToken)
      router.push('/dashboard')
    }).catch(() => router.push('/login?error=oauth_failed'))
  }, [params, router, setAuth])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Completing sign in…</p>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx`**

`app/error.tsx`:
```tsx
'use client'
import { Button } from '@/components/ui/button'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-bold">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
```

`app/not-found.tsx`:
```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-5xl font-bold">404</h2>
      <p className="text-muted-foreground">This page doesn&apos;t exist.</p>
      <Button asChild><Link href="/">Go home</Link></Button>
    </div>
  )
}
```

`app/loading.tsx`:
```tsx
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}
```

- [ ] **Step 5: Full type check**

```bash
pnpm exec tsc --noEmit
```

Fix any type errors.

- [ ] **Step 6: Commit**

```bash
git add app/ components/
git commit -m "feat: build settings, security, OAuth callback pages; add error/not-found/loading boundaries"
```

---

**Phase 3 complete.** Proceed to `2026-04-26-phase4-testing.md`.
