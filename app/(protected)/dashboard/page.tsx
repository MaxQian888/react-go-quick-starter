"use client";

import { useTranslations } from "next-intl";

import { useAuthStore } from "@/stores/auth-store";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {user?.email ? t("welcome", { email: user.email }) : null}
        </p>
      </div>
      <div className="bg-card rounded-lg border p-6">
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
    </div>
  );
}
