import { expect, test } from "@playwright/test";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7777";

const FAKE_USER = {
  id: "u_1",
  email: "demo@example.com",
  name: "Demo User",
  createdAt: "2026-05-05T00:00:00.000Z",
};

const FAKE_TOKENS = {
  accessToken: "access_demo",
  refreshToken: "refresh_demo",
};

/**
 * Mocks the Go backend at the network layer so this suite can run on a fresh
 * checkout without PostgreSQL/Redis. Real API integration is exercised by the
 * Go test suite under src-go/.
 */
test.beforeEach(async ({ page }) => {
  await page.route(`${API_BASE}/api/v1/auth/login`, async (route) => {
    const body = (await route.request().postDataJSON()) as { email?: string; password?: string };
    if (body.email === "demo@example.com" && body.password === "correct-horse") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...FAKE_TOKENS, user: FAKE_USER }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "invalid credentials" }),
    });
  });

  await page.route(`${API_BASE}/api/v1/users/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_USER),
    }),
  );

  await page.route(`${API_BASE}/api/v1/auth/logout`, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

test("anonymous visitors hitting /dashboard land on /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("invalid credentials surface an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("demo@example.com");
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();

  // The toast appears via Sonner — assert on the message.
  await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("successful login redirects to /dashboard and shows the user email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("demo@example.com");
  await page.getByLabel(/password/i).fill("correct-horse");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("demo@example.com")).toBeVisible();
});
