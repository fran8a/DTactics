import { test, expect } from "@playwright/test";

test("renueva sin descargar el tablero y limita a cinco pizarras por usuario", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  test.setTimeout(120000);
  await page.clock.install();
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("bizarron.nickname", "Ciclo de pizarras"),
  );
  for (let i = 0; i < 5; i++) {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Crear tablero", exact: true })
      .click();
    await expect(page.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
  }
  const renewal = page.waitForResponse(
    (response) =>
      response.url().includes("/rpc/touch_board") &&
      response.request().method() === "POST",
  );
  await page.clock.fastForward(61000);
  const response = await renewal;
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe("");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "máximo de 5 pizarras vigentes",
  );
});

test("un enlace eliminado muestra el vencimiento en lugar de reconectar indefinidamente", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  await page.goto(`/board/${crypto.randomUUID()}?access=${"a".repeat(64)}`);
  await expect(page.getByRole("alert")).toContainText(
    "venció por inactividad o ya no existe",
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("link", { name: "Ir al inicio para crear otra pizarra" }),
  ).toBeVisible();
});
