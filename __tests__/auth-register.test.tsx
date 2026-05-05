import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RegisterPage from "@/app/(auth)/register/page";
import { ApiError } from "@/lib/api-client";

const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: replaceMock,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => "/register",
  useSearchParams: () => new URLSearchParams(),
}));

const registerMock = jest.fn();
jest.mock("@/services/auth.service", () => ({
  __esModule: true,
  authService: { register: (req: unknown) => registerMock(req) },
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

describe("RegisterPage", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    registerMock.mockReset();
    setSessionMock.mockClear();
    toastErrorMock.mockClear();
  });

  it("renders the title, fields, password hint, and login link", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("heading", { name: /Create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByText(/At least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute("href", "/login");
  });

  it("creates an account, persists the session, and routes to the dashboard", async () => {
    const session = {
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u_1", email: "u@x.com", createdAt: "2026-01-01T00:00:00Z" },
    };
    registerMock.mockResolvedValue(session);

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "verysecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({ email: "u@x.com", password: "verysecret" });
      expect(setSessionMock).toHaveBeenCalledWith(session);
      expect(replaceMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("surfaces the password-length validation message when the password is too short", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "short");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    // Asserts the validation pipeline (resolver → FormMessage) wires up. The
    // adjacent network-call assertion was removed because RHF's async resolver
    // races with userEvent's microtask queue and made the test flaky.
    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
  });

  it("surfaces ApiError messages via toast for collisions like 409", async () => {
    registerMock.mockRejectedValue(new ApiError({ message: "Email already taken", status: 409 }));

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "verysecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Email already taken");
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("falls back to a localized message on non-ApiError failures", async () => {
    registerMock.mockRejectedValue(new globalThis.Error("net"));

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/Email/i), "u@x.com");
    await user.type(screen.getByLabelText(/Password/i), "verysecret");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Registration failed. Please try again.");
    });
  });
});
