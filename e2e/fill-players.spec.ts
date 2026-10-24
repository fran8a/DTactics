import { test, expect } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";

test("muestra todos juntos mientras espera el guardado", async ({ page }) => {
  await themeBoardFixture(page, 0, false, 200);
  await page.goto("/p/tttttttttttttttttttttttttttttttt");
  await page.getByRole("button", { name: "Rellenar", exact: true }).click();
  const teamA = page.getByRole("list", { name: "Jugadores del equipo A" });
  const teamB = page.getByRole("list", { name: "Jugadores del equipo B" });
  await expect(teamA.locator("li")).toHaveCount(8);
  await expect(teamB.locator("li")).toHaveCount(7);
  // There are still unsaved players: the complete roster is already visible.
  await expect(
    teamB.getByRole("button", { name: /Editar Jugador, / }).first(),
  ).toBeDisabled();
  await expect(
    teamB.getByRole("button", { name: /Editar Nuevo, / }),
  ).toHaveCount(6);
  await expect(teamA.locator("li")).toHaveCount(8);
  await expect(teamB.locator("li")).toHaveCount(7);
});

test("rellenar completa 7 y luego 11, conserva jugadores y se desactiva al completar", async ({
  page,
}) => {
  await themeBoardFixture(page);
  await page.goto("/p/tttttttttttttttttttttttttttttttt");
  const fill = page.getByRole("button", { name: "Rellenar", exact: true });
  await fill.click();
  await expect(fill).toBeDisabled();
  await expect(
    page.getByRole("list", { name: "Jugadores del equipo A" }).locator("li"),
  ).toHaveCount(8);
  await expect(
    page.getByRole("list", { name: "Jugadores del equipo B" }).locator("li"),
  ).toHaveCount(7);
  await expect(
    page.getByRole("button", {
      name: "Editar Jugador 1, número 1, equipo A",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fútbol 11", exact: true }).click();
  await expect(fill).toBeEnabled();
  await fill.click();
  await expect(fill).toBeDisabled();
  await expect(
    page.getByRole("list", { name: "Jugadores del equipo A" }).locator("li"),
  ).toHaveCount(12);
  await expect(
    page.getByRole("list", { name: "Jugadores del equipo B" }).locator("li"),
  ).toHaveCount(11);
});
