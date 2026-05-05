import { queryKeys } from "./query-keys";

describe("queryKeys.auth", () => {
  it("me() returns a stable tuple consumers can use as a TanStack key", () => {
    expect(queryKeys.auth.me()).toEqual(["auth", "me"]);
  });

  it("returns deep-equal keys across calls so query invalidation matches", () => {
    expect(queryKeys.auth.me()).toEqual(queryKeys.auth.me());
  });
});
