import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoginPage from "@/app/(auth)/login/page";
import { ApiError } from "@/lib/api-client";

const replaceMock = jest.fn();
const searchParamsGet = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: replaceMock,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => ({ get: searchParamsGet }),
}));

const loginMock = jest.fn();
jest.mock("@/services/auth.service", () => ({
  __esModule: true,
  authService: { login: (req: unknown) => loginMock(req) },
}));

const setSessionMock = jest.fn();
jest.mock("@/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: { setSession: (resp: unknown) => void }) => T) =>
    selector({ setSession: setSessionMock }),
}));

const toastErrorMock = jest.fn();
jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: (msg: string) => toastErrorMock(msg) },
}));

describe("LoginPage", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    loginMock.mockReset();
    setSessionMock.mockClear();
    toastErrorMock.mockClear();
    searchParamsGet.mockReset();
  });

  it("renders the title and email/password fields", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create one/i })).toHaveAttribute("href", "/register");
  });

  it("submits credentials, persists the session, and routes to the dashboard by default", async () => {
    const session = {
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u_1", email: "u@x.com", createdAt: "2026-01-01T00:00:00Z" },
    };
    loginMock.mockResolvedValue(session);
    searchParamsGet.mockReturnValue(null);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "pwd");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ email: "u@x.com", password: "pwd" });
      expect(setSessionMock).toHaveBeenCalledWith(session);
      expect(replaceMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("honours an internal ?next= redirect target", async () => {
    loginMock.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u_1", email: "u@x.com", createdAt: "2026-01-01T00:00:00Z" },
    });
    searchParamsGet.mockReturnValue("/dashboard/settings");

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "pwd");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/settings");
    });
  });

  it("ignores an external ?next= URL and falls back to the dashboard", async () => {
    loginMock.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u_1", email: "u@x.com", createdAt: "2026-01-01T00:00:00Z" },
    });
    searchParamsGet.mockReturnValue("https://evil.example.com/x");

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "pwd");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("surfaces ApiError messages via toast and does not navigate", async () => {
    loginMock.mockRejectedValue(new ApiError({ message: "Bad creds", status: 401 }));
    searchParamsGet.mockReturnValue(null);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "pwd");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Bad creds");
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("falls back to the localized error message for non-ApiError failures", async () => {
    loginMock.mockRejectedValue(new globalThis.Error("network"));
    searchParamsGet.mockReturnValue(null);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "pwd");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Sign-in failed. Check your credentials and try again.",
      );
    });
  });
});
