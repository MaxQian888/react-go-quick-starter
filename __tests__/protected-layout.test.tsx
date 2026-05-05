import { render, screen } from "@testing-library/react";

import ProtectedLayout from "@/app/(protected)/layout";
import type { User } from "@/types/auth";

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

const useQueryMock = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: (opts: unknown) => useQueryMock(opts),
}));

jest.mock("@/services/auth.service", () => ({
  __esModule: true,
  authService: { me: jest.fn() },
}));

jest.mock("@/components/layout/header", () => ({
  __esModule: true,
  Header: () => <header data-testid="header" />,
}));

type AuthSnapshot = {
  loaded: boolean;
  accessToken: string | null;
  user: User | null;
  setUser: (u: User) => void;
};

let storeSnapshot: AuthSnapshot;
const setUserMock = jest.fn();

jest.mock("@/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: <T,>(selector: (state: AuthSnapshot) => T) => selector(storeSnapshot),
}));

function configureStore(partial: Partial<AuthSnapshot> = {}) {
  storeSnapshot = {
    loaded: true,
    accessToken: "a",
    user: null,
    setUser: setUserMock,
    ...partial,
  };
}

describe("ProtectedLayout", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    setUserMock.mockClear();
    useQueryMock.mockReset();
    configureStore();
  });

  it("renders the loading shell while the auth store is rehydrating", () => {
    configureStore({ loaded: false, accessToken: null });
    useQueryMock.mockReturnValue({ data: undefined, isError: false, isPending: false });

    render(
      <ProtectedLayout>
        <span>kid</span>
      </ProtectedLayout>,
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByTestId("header")).not.toBeInTheDocument();
  });

  it("redirects anonymous users to /login and renders nothing", () => {
    configureStore({ loaded: true, accessToken: null });
    useQueryMock.mockReturnValue({ data: undefined, isError: false, isPending: false });

    const { container } = render(
      <ProtectedLayout>
        <span data-testid="kid">kid</span>
      </ProtectedLayout>,
    );

    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect(container.querySelector('[data-testid="kid"]')).toBeNull();
  });

  it("shows the loading shell while /me is pending for an authenticated session", () => {
    configureStore({ loaded: true, accessToken: "a" });
    useQueryMock.mockReturnValue({ data: undefined, isError: false, isPending: true });

    render(
      <ProtectedLayout>
        <span>kid</span>
      </ProtectedLayout>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("header")).not.toBeInTheDocument();
  });

  it("renders Header + children once the user is verified", () => {
    const user: User = { id: "u_1", email: "u@x.com", createdAt: "2026-01-01T00:00:00Z" };
    configureStore({ loaded: true, accessToken: "a" });
    useQueryMock.mockReturnValue({ data: user, isError: false, isPending: false });

    render(
      <ProtectedLayout>
        <span data-testid="kid">kid</span>
      </ProtectedLayout>,
    );

    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("kid")).toBeInTheDocument();
    expect(setUserMock).toHaveBeenCalledWith(user);
  });

  it("redirects to /login when the /me query fails", () => {
    configureStore({ loaded: true, accessToken: "a" });
    useQueryMock.mockReturnValue({ data: undefined, isError: true, isPending: false });

    render(
      <ProtectedLayout>
        <span>kid</span>
      </ProtectedLayout>,
    );

    expect(replaceMock).toHaveBeenCalledWith("/login");
  });
});
