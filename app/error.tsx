"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary. Triggers on errors from server/client components
 * inside `app/`. Pair this with `global-error.tsx` to also cover root layout
 * crashes. Wire `console.error` to your error tracker (Sentry, etc.) at the
 * marked spot.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  useEffect(() => {
    // TODO: forward to error tracker. Sentry's captureException(error) goes here.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{t("description")}</p>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">digest: {error.digest}</p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={reset}>{t("retry")}</Button>
        <Button variant="outline" asChild>
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}
