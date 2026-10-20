import { test, expect } from "@playwright/test";

test("Cómo se juega mantiene la página visible y lanza la pelota sin errores", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Cómo se juega/ }).click();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
  await expect(page.locator(".physics-ball")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: /Mucho potrero/ }),
  ).toBeVisible();
});
