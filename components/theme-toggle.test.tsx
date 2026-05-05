import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle } from "./theme-toggle";

const mockSetTheme = jest.fn();
const mockUseTheme = jest.fn();

jest.mock("next-themes", () => ({
  __esModule: true,
  useTheme: () => mockUseTheme(),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockSetTheme.mockReset();
    mockUseTheme.mockReturnValue({ setTheme: mockSetTheme, resolvedTheme: "light" });
  });

  it("renders the trigger with an accessible label", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("opens the menu and exposes light, dark, and system options", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(await screen.findByRole("menuitem", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "System" })).toBeInTheDocument();
  });

  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "system"],
  ])("calls setTheme(%p) when %p is selected", async (label, value) => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    await user.click(await screen.findByRole("menuitem", { name: label }));

    expect(mockSetTheme).toHaveBeenCalledWith(value);
  });
});
