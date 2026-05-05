"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

/**
 * Wraps next-themes so the app layout doesn't pull from a client-only package
 * directly. The CSS already declares dark mode via `.dark` (see globals.css);
 * `attribute="class"` lets next-themes toggle that class on <html>.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
