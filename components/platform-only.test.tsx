import { render, screen } from "@testing-library/react";

import { PlatformOnly } from "./platform-only";

const mockUseIsTauri = jest.fn();
jest.mock("@/hooks/use-is-tauri", () => ({
  __esModule: true,
  useIsTauri: () => mockUseIsTauri(),
}));

describe("PlatformOnly", () => {
  beforeEach(() => mockUseIsTauri.mockReset());

  it("renders children when on='tauri' and the runtime is Tauri", () => {
    mockUseIsTauri.mockReturnValue(true);
    render(
      <PlatformOnly on="tauri" fallback={<span>web</span>}>
        <span>tauri</span>
      </PlatformOnly>,
    );
    expect(screen.getByText("tauri")).toBeInTheDocument();
    expect(screen.queryByText("web")).not.toBeInTheDocument();
  });

  it("renders the fallback when on='tauri' but the runtime is web", () => {
    mockUseIsTauri.mockReturnValue(false);
    render(
      <PlatformOnly on="tauri" fallback={<span>web</span>}>
        <span>tauri</span>
      </PlatformOnly>,
    );
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.queryByText("tauri")).not.toBeInTheDocument();
  });

  it("renders children when on='web' and the runtime is web", () => {
    mockUseIsTauri.mockReturnValue(false);
    render(
      <PlatformOnly on="web">
        <span>web only</span>
      </PlatformOnly>,
    );
    expect(screen.getByText("web only")).toBeInTheDocument();
  });

  it("returns null fallback by default when no fallback is provided", () => {
    mockUseIsTauri.mockReturnValue(true);
    const { container } = render(
      <PlatformOnly on="web">
        <span>web only</span>
      </PlatformOnly>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
