import { render, screen } from "@testing-library/react";

import AuthLayout from "@/app/(auth)/layout";

jest.mock("@/components/layout/header", () => ({
  __esModule: true,
  Header: ({ hideAuthActions }: { hideAuthActions?: boolean }) => (
    <header data-testid="header" data-hide-auth={String(hideAuthActions ?? false)} />
  ),
}));

describe("app/(auth)/layout.tsx", () => {
  it("hides the auth controls in the header and renders the centered child slot", () => {
    render(
      <AuthLayout>
        <span data-testid="form">login form</span>
      </AuthLayout>,
    );

    const header = screen.getByTestId("header");
    expect(header).toHaveAttribute("data-hide-auth", "true");
    expect(screen.getByTestId("form")).toBeInTheDocument();
  });
});
