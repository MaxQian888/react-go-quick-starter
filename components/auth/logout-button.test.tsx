import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LogoutButton } from "./logout-button";

const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: replaceMock,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const logoutMock = jest.fn();
jest.mock("@/services/auth.service", () => ({
  __esModule: true,
  authService: { logout: () => logoutMock() },
}));

const clearMock = jest.fn();
jest.mock("@/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: { clear: () => void }) => T) =>
    selector({ clear: clearMock }),
}));

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("LogoutButton", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    logoutMock.mockReset();
    clearMock.mockClear();
  });

  it("renders the localized sign-out label", () => {
    const client = new QueryClient();
    render(<LogoutButton />, { wrapper: withClient(client) });
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeInTheDocument();
  });

  it("logs out, clears the store, clears the query cache, and routes to login", async () => {
    const client = new QueryClient();
    const clearSpy = jest.spyOn(client, "clear");
    logoutMock.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LogoutButton />, { wrapper: withClient(client) });

    await user.click(screen.getByRole("button", { name: /Sign out/i }));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(clearMock).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith("/login");
    });
  });
});
