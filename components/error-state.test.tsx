import { fireEvent, render, screen } from "@testing-library/react";

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("exposes alert role and renders title plus description when provided", () => {
    render(<ErrorState title="Failed" description="Something went wrong." />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("does not render a retry button when onRetry is omitted", () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a retry button with the default label and forwards clicks", () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} />);

    const button = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses the supplied retryLabel when provided", () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} retryLabel="Try again" />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
