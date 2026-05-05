"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { defaultLocale, locales, type Locale } from "@/i18n/config";

type LocaleState = {
  locale: Locale;
  loaded: boolean;
  setLocale: (locale: Locale) => void;
  _markLoaded: () => void;
};

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      loaded: false,
      setLocale: (locale) => set({ locale }),
      _markLoaded: () => set({ loaded: true }),
    }),
    {
      name: "react-go-starter:locale",
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!isLocale(state.locale)) {
            state.locale = defaultLocale;
          }
          state._markLoaded();
        }
      },
    },
  ),
);
