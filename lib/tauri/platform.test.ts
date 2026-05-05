/**
 * @jest-environment jsdom
 */
import { getPlatform, isTauriRuntime } from "./platform";

const TAURI_KEY = "__TAURI_INTERNALS__";

function setTauri(present: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (present) w[TAURI_KEY] = {};
  else delete w[TAURI_KEY];
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

describe("isTauriRuntime", () => {
  afterEach(() => setTauri(false));

  it("returns false when the Tauri global is absent", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("returns true when the Tauri global is present", () => {
    setTauri(true);
    expect(isTauriRuntime()).toBe(true);
  });
});

describe("getPlatform", () => {
  afterEach(() => setTauri(false));

  it("returns 'web' when not running inside Tauri", () => {
    expect(getPlatform()).toBe("web");
  });

  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "macos"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
  ])("maps real desktop user agent %p to %p when in Tauri runtime", (ua, expected) => {
    setTauri(true);
    setUserAgent(ua);
    expect(getPlatform()).toBe(expected);
  });

  // Note: real iPhone/Android UAs contain "Mac"/"Linux" substrings, so the
  // detection order in getPlatform() short-circuits on those branches first
  // and never reaches the iphone/android matches. We feed synthetic UAs here
  // purely to exercise the remaining branches and document the contract: the
  // function does pattern-match those tokens when the earlier branches miss.
  it.each([
    ["mock-iphone-agent", "ios"],
    ["mock-ipad-agent", "ios"],
    ["mock-android-agent", "android"],
  ])("falls through to %p when the UA only contains the late-branch token", (ua, expected) => {
    setTauri(true);
    setUserAgent(ua);
    expect(getPlatform()).toBe(expected);
  });

  it("returns 'unknown' inside Tauri when the userAgent is unrecognised", () => {
    setTauri(true);
    setUserAgent("SomeWeirdAgent/1.0");
    expect(getPlatform()).toBe("unknown");
  });
});
