import { render, screen } from "@testing-library/react";

import Home from "@/app/page";
import type { User } from "@/types/auth";

let mockUser: User | null = null;

jest.mock("@/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: { user: User | null }) => T) => selector({ user: mockUser }),
}));

jest.mock("@/components/locale-switcher", () => ({
  __esModule: true,
  LocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));

jest.mock("@/components/theme-toggle", () => ({
  __esModule: true,
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

describe("Home page", () => {
  beforeEach(() => {
    mockUser = null;
  });

  it("renders the heading and standard CTAs", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /To get started, edit the page.tsx file/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deploy Now/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Documentation/i })).toBeInTheDocument();
  });

  it("links the auth CTA to /login when no user is signed in", () => {
    mockUser = null;
    render(<Home />);
    const cta = screen.getByRole("link", { name: /Sign in/i });
    expect(cta).toHaveAttribute("href", "/login");
  });

  it("links the auth CTA to /dashboard when a user is signed in", () => {
    mockUser = { id: "u_1", email: "u@x.com", createdAt: "2026-01-01T00:00:00Z" };
    render(<Home />);
    const cta = screen.getByRole("link", { name: /Open dashboard/i });
    expect(cta).toHaveAttribute("href", "/dashboard");
  });
});
