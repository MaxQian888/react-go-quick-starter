import { fireEvent, render, screen } from "@testing-library/react";

import { LocaleSwitcher } from "@/components/locale-switcher";

let mockLocale: "en" | "zh" = "en";
const setLocale = jest.fn((locale: "en" | "zh") => {
  mockLocale = locale;
});

jest.mock("@/stores/locale-store", () => ({
  useLocaleStore: <T,>(
    selector: (state: {
      locale: "en" | "zh";
      setLocale: (l: "en" | "zh") => void;
    }) => T,
  ) => selector({ locale: mockLocale, setLocale }),
}));

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    mockLocale = "en";
    setLocale.mockClear();
  });

  it("marks the active locale with aria-current", () => {
    render(<LocaleSwitcher />);

    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "中文" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("invokes setLocale when a locale button is clicked", () => {
    render(<LocaleSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(setLocale).toHaveBeenCalledWith("zh");
  });
});
