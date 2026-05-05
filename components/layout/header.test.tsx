import { render, screen } from "@testing-library/react";

import type { User } from "@/types/auth";

import { Header } from "./header";

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

jest.mock("@/components/auth/logout-button", () => ({
  __esModule: true,
  LogoutButton: () => <button>logout</button>,
}));

describe("Header", () => {
  beforeEach(() => {
    mockUser = null;
  });

  it("links the brand to the home route and shows shared switchers", () => {
    render(<Header />);
    const brand = screen.getByRole("link", { name: /React Go Starter/i });
    expect(brand).toHaveAttribute("href", "/");
    expect(screen.getByTestId("locale-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("shows a Sign in link when no user is authenticated", () => {
    mockUser = null;
    render(<Header />);
    const signIn = screen.getByRole("link", { name: /Sign in/i });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
  });

  it("shows the logout button when a user is authenticated", () => {
    mockUser = { id: "u_1", email: "a@b.com", createdAt: "2026-01-01T00:00:00Z" };
    render(<Header />);
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sign in/i })).not.toBeInTheDocument();
  });

  it("hides auth controls entirely when hideAuthActions is set", () => {
    mockUser = { id: "u_1", email: "a@b.com", createdAt: "2026-01-01T00:00:00Z" };
    render(<Header hideAuthActions />);
    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sign in/i })).not.toBeInTheDocument();
  });
});
