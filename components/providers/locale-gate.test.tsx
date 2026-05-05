import { render, screen } from "@testing-library/react";

import { LocaleGate } from "./locale-gate";

let storeState = { locale: "en" as "en" | "zh", loaded: true };

jest.mock("@/stores/locale-store", () => ({
  useLocaleStore: <T,>(selector: (state: { locale: "en" | "zh"; loaded: boolean }) => T) =>
    selector(storeState),
}));

let lastProps: Record<string, unknown> | null = null;

jest.mock("next-intl", () => ({
  __esModule: true,
  NextIntlClientProvider: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    const { children, ...rest } = props;
    lastProps = rest;
    return <div data-testid="intl-mock">{children}</div>;
  },
}));

describe("LocaleGate", () => {
  beforeEach(() => {
    lastProps = null;
    storeState = { locale: "en", loaded: true };
  });

  it("forwards the persisted locale once the store has hydrated", () => {
    storeState = { locale: "zh", loaded: true };
    render(
      <LocaleGate>
        <span>kid</span>
      </LocaleGate>,
    );
    expect(screen.getByText("kid")).toBeInTheDocument();
    expect(lastProps).toMatchObject({ locale: "zh", timeZone: "UTC" });
  });

  it("falls back to the default locale until the store reports loaded", () => {
    storeState = { locale: "zh", loaded: false };
    render(
      <LocaleGate>
        <span>kid</span>
      </LocaleGate>,
    );
    // Default locale is "en" per i18n/config.
    expect(lastProps?.locale).toBe("en");
  });
});
