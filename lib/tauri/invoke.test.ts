import { tauriInvoke, tryTauriInvoke } from "./invoke";
import { isTauriRuntime } from "./platform";

/**
 * @jest-environment jsdom
 */
const mockInvoke = jest.fn();

jest.mock("@tauri-apps/api/core", () => ({
  __esModule: true,
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

jest.mock("./platform", () => ({
  __esModule: true,
  isTauriRuntime: jest.fn(),
}));

const isTauriMock = isTauriRuntime as jest.MockedFunction<typeof isTauriRuntime>;

describe("tauriInvoke", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    isTauriMock.mockReset();
  });

  it("throws a clear error when called outside the Tauri runtime", async () => {
    isTauriMock.mockReturnValue(false);
    await expect(tauriInvoke("ping")).rejects.toThrow(/outside Tauri runtime/);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("delegates to @tauri-apps/api invoke when running inside Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    mockInvoke.mockResolvedValue("pong");

    await expect(tauriInvoke<string>("ping", { foo: 1 })).resolves.toBe("pong");
    expect(mockInvoke).toHaveBeenCalledWith("ping", { foo: 1 });
  });
});

describe("tryTauriInvoke", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    mockInvoke.mockReset();
    isTauriMock.mockReset();
    warnSpy.mockClear();
  });

  afterAll(() => warnSpy.mockRestore());

  it("returns null silently when not in Tauri", async () => {
    isTauriMock.mockReturnValue(false);
    await expect(tryTauriInvoke("ping")).resolves.toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns the resolved value when invoke succeeds", async () => {
    isTauriMock.mockReturnValue(true);
    mockInvoke.mockResolvedValue(42);
    await expect(tryTauriInvoke<number>("answer")).resolves.toBe(42);
  });

  it("logs a warning and returns null when invoke rejects", async () => {
    isTauriMock.mockReturnValue(true);
    mockInvoke.mockRejectedValue(new Error("boom"));

    await expect(tryTauriInvoke("explode")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
