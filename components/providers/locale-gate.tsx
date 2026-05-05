"use client";

import { NextIntlClientProvider } from "next-intl";

import { defaultLocale } from "@/i18n/config";
import { allMessages } from "@/i18n/messages";
import { useLocaleStore } from "@/stores/locale-store";

/**
 * Wraps children in a NextIntlClientProvider whose locale is sourced from the
 * persisted user setting. Until the store has hydrated we pin to the default
 * locale to avoid hydration mismatches against the server-rendered markup
 * (which uses the static-export default).
 */
export function LocaleGate({ children }: { children: React.ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  const loaded = useLocaleStore((s) => s.loaded);
  const active = loaded ? locale : defaultLocale;

  return (
    <NextIntlClientProvider
      locale={active}
      messages={allMessages[active]}
      // App is offline-first; pinning the time zone keeps formatted dates stable.
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
