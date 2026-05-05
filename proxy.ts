import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_TOKEN_COOKIE, AUTH_PUBLIC_PATHS, ROUTES } from "@/constants/routes";

/**
 * Server-side route guard. In Next.js 16 the former `middleware.ts` was
 * renamed to `proxy.ts`; the runtime semantics are unchanged.
 *
 * Static-export builds (Tauri) skip this file entirely — the same protection
 * is reapplied client-side inside `app/(protected)/layout.tsx`. The cookie
 * name is shared with the auth store so the boundary stays in sync.
 */
export function proxy(req: NextRequest) {
  const { pathname, searchParams, search } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (token) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = ROUTES.login;
  loginUrl.search = "";
  if (pathname !== ROUTES.home) {
    loginUrl.searchParams.set("next", pathname + (search ?? ""));
  }
  // Respect any locale param so the login page renders in the user's language.
  const locale = searchParams.get("locale");
  if (locale) loginUrl.searchParams.set("locale", locale);

  return NextResponse.redirect(loginUrl);
}

function isPublicPath(pathname: string): boolean {
  if (AUTH_PUBLIC_PATHS.includes(pathname as (typeof AUTH_PUBLIC_PATHS)[number])) return true;
  return AUTH_PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(`${p}/`));
}

export const config = {
  // Skip Next internals, static assets, and the API proxy (handled by the Go backend).
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
