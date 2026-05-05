import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GlobalError from "@/app/global-error";

describe("app/global-error.tsx", () => {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => consoleErrorSpy.mockClear());
  afterAll(() => consoleErrorSpy.mockRestore());

  it("renders a self-contained crash screen with a try-again button", () => {
    render(<GlobalError error={new globalThis.Error("fatal")} reset={jest.fn()} />);

    expect(screen.getByText(/Application crashed/i)).toBeInTheDocument();
    expect(screen.getByText(/A fatal error prevented the app/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("invokes reset and forwards the error to console.error", async () => {
    const reset = jest.fn();
    const err = new globalThis.Error("fatal");
    const user = userEvent.setup();

    render(<GlobalError error={err} reset={reset} />);
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(err);
  });

  it("renders the digest when present, hides it otherwise", () => {
    const { rerender } = render(
      <GlobalError
        error={Object.assign(new globalThis.Error("fatal"), { digest: "xyz" })}
        reset={jest.fn()}
      />,
    );
    expect(screen.getByText(/digest: xyz/)).toBeInTheDocument();

    rerender(<GlobalError error={new globalThis.Error("fatal")} reset={jest.fn()} />);
    expect(screen.queryByText(/digest:/)).not.toBeInTheDocument();
  });
});
