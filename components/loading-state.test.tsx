import { render, screen } from "@testing-library/react";

import { LoadingState } from "./loading-state";

describe("LoadingState", () => {
  it("exposes an aria-live status region for assistive tech", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders the optional label when provided", () => {
    render(<LoadingState label="Loading data…" />);
    expect(screen.getByText("Loading data…")).toBeInTheDocument();
  });

  it("omits the label when none is given", () => {
    const { container } = render(<LoadingState />);
    // Only the spinner svg should be present, no text node siblings.
    expect(container.querySelector("span")).toBeNull();
  });
});
