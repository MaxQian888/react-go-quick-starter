"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Header } from "@/components/layout/header";
import { LoadingState } from "@/components/loading-state";
import { ROUTES } from "@/constants/routes";
import { queryKeys } from "@/lib/query-keys";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Client-side route guard. Static-export builds (Tauri) skip middleware
 * entirely, so this is the only thing protecting the dashboard there. Web
 * builds get layered protection: middleware redirects anonymous users *plus*
 * this layout verifies the token with the backend on mount.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const loaded = useAuthStore((s) => s.loaded);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);

  // Hard short-circuit: if rehydration has finished and there's no token,
  // we already know the user is anonymous — don't bother hitting the server.
  useEffect(() => {
    if (loaded && !accessToken) {
      router.replace(ROUTES.login);
    }
  }, [loaded, accessToken, router]);

  const { data, isError, isPending } = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => authService.me(),
    enabled: Boolean(loaded && accessToken),
    staleTime: 60_000,
  });

  // Mirror backend user back into the store so other components reading from
  // the store stay current.
  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  // /me failed even after refresh-token retry → onAuthFailure already cleared
  // the store; just send the user to login.
  useEffect(() => {
    if (isError) router.replace(ROUTES.login);
  }, [isError, router]);

  if (!loaded || (accessToken && isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (!accessToken) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
