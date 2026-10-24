import { test, expect } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";

for (const fail of [false, true]) {
  test(`elimina juntos con guardado demorado${fail ? " y restaura si falla" : ""}`, async ({
    page,
  }) => {
    await themeBoardFixture(page, 0, false, 0, 400, fail);
    await page.goto("/p/tttttttttttttttttttttttttttttttt");
    await page
      .getByRole("button", {
        name: "Eliminar todos los jugadores",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Sí, eliminar todos", exact: true })
      .click();
    const rows = page.locator(".team-players li");
    await expect(rows).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    if (fail) {
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
        "No se pudo guardar",
      );
      await expect(rows).toHaveCount(3);
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(rows).toHaveCount(0);
    }
  });
}
