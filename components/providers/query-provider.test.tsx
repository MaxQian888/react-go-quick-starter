import { useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";

import { QueryProvider } from "./query-provider";

jest.mock("@tanstack/react-query-devtools", () => ({
  __esModule: true,
  ReactQueryDevtools: () => null,
}));

function Probe() {
  const { data } = useQuery({
    queryKey: ["probe"],
    queryFn: async () => "ok",
  });
  return <span>{data ?? "pending"}</span>;
}

describe("QueryProvider", () => {
  it("provides a QueryClient so descendant useQuery hooks work", async () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
    });
  });
});
