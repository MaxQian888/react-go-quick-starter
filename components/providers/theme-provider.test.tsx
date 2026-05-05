import { render, screen } from "@testing-library/react";

import { ThemeProvider } from "./theme-provider";

let lastReceivedProps: Record<string, unknown> | null = null;

jest.mock("next-themes", () => ({
  __esModule: true,
  ThemeProvider: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
  } & Record<string, unknown>) => {
    lastReceivedProps = rest;
    return <div data-testid="next-themes-mock">{children}</div>;
  },
}));

describe("ThemeProvider", () => {
  beforeEach(() => {
    lastReceivedProps = null;
  });

  it("forwards children through the next-themes provider", () => {
    render(
      <ThemeProvider>
        <span>boundary</span>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("next-themes-mock")).toBeInTheDocument();
    expect(screen.getByText("boundary")).toBeInTheDocument();
  });

  it("applies the project's defaults on the underlying provider", () => {
    render(
      <ThemeProvider>
        <span>x</span>
      </ThemeProvider>,
    );
    expect(lastReceivedProps).toMatchObject({
      attribute: "class",
      defaultTheme: "system",
      enableSystem: true,
      disableTransitionOnChange: true,
    });
  });

  it("lets caller props override the defaults (spread order)", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <span>x</span>
      </ThemeProvider>,
    );
    expect(lastReceivedProps?.defaultTheme).toBe("dark");
  });
});
