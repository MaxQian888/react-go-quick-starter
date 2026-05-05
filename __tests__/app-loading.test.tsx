import { render, screen } from "@testing-library/react";

import Loading from "@/app/loading";

describe("app/loading.tsx", () => {
  it("renders the shared LoadingState centered in a full-screen container", () => {
    render(<Loading />);
    // LoadingState exposes role=status with aria-live=polite — verifies the
    // route-level loading boundary delegates to the standard component.
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
