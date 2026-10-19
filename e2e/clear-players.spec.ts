import { test, expect } from "@playwright/test";

test("vaciar jugadores requiere confirmación y persiste al recargar", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Vaciar equipo");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const clear = page.getByRole("button", {
    name: "Eliminar todos los jugadores",
    exact: true,
  });
  await expect(clear).toBeDisabled();
  for (const team of ["A", "B"]) {
    await page
      .getByRole("button", {
        name: `Agregar jugador del equipo ${team}`,
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("list", { name: `Jugadores del equipo ${team}` })
        .getByRole("button"),
    ).toHaveCount(1);
  }
  await expect(
    page.getByText("Requiere pizarrón vacío.", { exact: true }),
  ).toHaveCount(0);
  const clearBox = (await clear.boundingBox())!;
  const formatBox = (await page
    .getByRole("button", { name: "Fútbol 7", exact: true })
    .boundingBox())!;
  expect(clearBox.x).toBeLessThan(formatBox.x);
  await clear.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("incluidos los suplentes");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".roster-player")).toHaveCount(2);
  await clear.click();
  await dialog
    .getByRole("button", { name: "Sí, eliminar todos", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".roster-player")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Fútbol 7", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.locator(".connection")).toHaveText("Conectado");
  await expect(page.locator(".roster-player")).toHaveCount(0);
  await expect(clear).toBeDisabled();
});
