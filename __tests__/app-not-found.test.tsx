import { render, screen } from "@testing-library/react";

import NotFound from "@/app/not-found";

jest.mock("next-intl/server", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getTranslations: async () => require("next-intl").useTranslations("Errors"),
}));

describe("app/not-found.tsx", () => {
  it("renders the 404 marker, localized headline, and a home link", async () => {
    const ui = await NotFound();
    render(ui);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Page not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go home/i })).toHaveAttribute("href", "/");
  });
});
