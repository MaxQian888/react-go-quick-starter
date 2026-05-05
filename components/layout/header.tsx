"use client";

import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/stores/auth-store";

type Props = {
  /** Hide auth controls on the auth pages themselves to avoid recursion. */
  hideAuthActions?: boolean;
};

export function Header({ hideAuthActions = false }: Props) {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
      <Link href={ROUTES.home} className="text-sm font-semibold tracking-tight">
        React Go Starter
      </Link>
      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
        {!hideAuthActions ? (
          user ? (
            <LogoutButton size="sm" variant="ghost" />
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link href={ROUTES.login}>Sign in</Link>
            </Button>
          )
        ) : null}
      </div>
    </header>
  );
}
