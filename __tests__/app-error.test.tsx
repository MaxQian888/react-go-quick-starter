import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Error from "@/app/error";

describe("app/error.tsx route boundary", () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => consoleErrorSpy.mockClear());
  afterAll(() => consoleErrorSpy.mockRestore());

  it("renders the localized title, description, and retry/home actions", () => {
    const reset = jest.fn();
    render(<Error error={new globalThis.Error("boom")} reset={reset} />);

    expect(screen.getByRole("heading", { name: /Something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go home/i })).toHaveAttribute("href", "/");
  });

  it("invokes the reset callback when retry is clicked", async () => {
    const reset = jest.fn();
    const user = userEvent.setup();

    render(<Error error={new globalThis.Error("boom")} reset={reset} />);
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("forwards the error to console.error and surfaces the digest when present", () => {
    const err = Object.assign(new globalThis.Error("boom"), { digest: "abc123" });
    render(<Error error={err} reset={jest.fn()} />);

    expect(consoleErrorSpy).toHaveBeenCalledWith(err);
    expect(screen.getByText(/digest: abc123/)).toBeInTheDocument();
  });

  it("hides the digest line when the error has no digest", () => {
    render(<Error error={new globalThis.Error("boom")} reset={jest.fn()} />);
    expect(screen.queryByText(/digest:/)).not.toBeInTheDocument();
  });
});
