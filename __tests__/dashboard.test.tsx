import { render, screen } from "@testing-library/react";

import DashboardPage from "@/app/(protected)/dashboard/page";
import type { User } from "@/types/auth";

let mockUser: User | null = null;

jest.mock("@/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: { user: User | null }) => T) => selector({ user: mockUser }),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    mockUser = null;
  });

  it("renders the title and the protected description", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/protected page/i)).toBeInTheDocument();
  });

  it("greets the authenticated user by email", () => {
    mockUser = { id: "u_1", email: "alice@x.com", createdAt: "2026-01-01T00:00:00Z" };
    render(<DashboardPage />);
    expect(screen.getByText(/Welcome,\s+alice@x\.com/i)).toBeInTheDocument();
  });

  it("renders without a greeting when no user is loaded yet", () => {
    mockUser = null;
    render(<DashboardPage />);
    expect(screen.queryByText(/Welcome,/i)).not.toBeInTheDocument();
  });
});
