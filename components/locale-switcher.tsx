"use client";

import { useTranslations } from "next-intl";

import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const active = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <nav aria-label={t("label")} className="flex items-center gap-2 text-sm">
      {locales.map((locale: Locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => setLocale(locale)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              isActive
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            )}
          >
            {t(`name.${locale}`)}
          </button>
        );
      })}
    </nav>
  );
}
