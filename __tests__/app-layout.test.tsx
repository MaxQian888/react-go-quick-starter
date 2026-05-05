import { render, screen } from "@testing-library/react";

import RootLayout, { generateMetadata } from "@/app/layout";

jest.mock("next-intl/server", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getTranslations: async () => require("next-intl").useTranslations("Metadata"),
}));

jest.mock("next/font/google", () => ({
  __esModule: true,
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

jest.mock("@/components/providers/theme-provider", () => ({
  __esModule: true,
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

jest.mock("@/components/providers/query-provider", () => ({
  __esModule: true,
  QueryProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
}));

jest.mock("@/components/providers/locale-gate", () => ({
  __esModule: true,
  LocaleGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="locale-gate">{children}</div>
  ),
}));

jest.mock("@/components/ui/sonner", () => ({
  __esModule: true,
  Toaster: () => <div data-testid="toaster" />,
}));

describe("app/layout.tsx", () => {
  it("nests theme → query → locale-gate around the children and ships a toaster", () => {
    render(<RootLayout>{<span data-testid="page">child</span>}</RootLayout>);
    const theme = screen.getByTestId("theme-provider");
    const query = screen.getByTestId("query-provider");
    const gate = screen.getByTestId("locale-gate");

    expect(theme).toContainElement(query);
    expect(query).toContainElement(gate);
    expect(gate).toContainElement(screen.getByTestId("page"));
    expect(screen.getByTestId("toaster")).toBeInTheDocument();
  });

  it("generateMetadata returns the localized site title and description", async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe("React Go Quick Starter");
    expect(meta.description).toMatch(/Next\.js 16 \+ Go.*Tauri/);
  });
});
