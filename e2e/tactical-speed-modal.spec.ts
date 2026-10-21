import { test, expect } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";
import { pitchPoint } from "./pitch";

test("doble clic abre la velocidad del titular sin guardar un pase accidental", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await themeBoardFixture(page);
  await page.goto(
    "/board/00000000-0000-4000-8000-000000000001?token=tttttttttttttttttttttttttttttttt",
  );
  await page
    .getByRole("button", { name: "Preparar jugada", exact: true })
    .click();
  const selector = page.getByRole("combobox", {
    name: "Jugador para la jugada",
  });
  await selector.selectOption("player-1");
  const point = await pitchPoint(page, 0.6, 0.3);
  await page.mouse.dblclick(point.x, point.y);
  const dialog = page.getByRole("dialog", { name: "Velocidad de jugada" });
  await expect(dialog).toContainText("Jugador 2");
  await dialog.getByRole("button", { name: "x2", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(selector).toHaveValue("player-1");
  await expect(page.locator(".tactics-footer")).toContainText("1 recorrido");
  await page.mouse.dblclick(point.x, point.y);
  await expect(
    dialog.getByRole("button", { name: "x2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

// Isolated UI checks; persistence and validation use PostgreSQL in database.test.ts.
for (const [width, height] of [
  [1280, 900],
  [390, 844],
  [320, 568],
]) {
  test(`velocidad individual: guardado, foco y layout ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await themeBoardFixture(page);
    await page.goto(
      "/board/00000000-0000-4000-8000-000000000001?token=tttttttttttttttttttttttttttttttt",
    );
    if (width < 768)
      await page.getByRole("button", { name: "Opciones", exact: true }).click();
    await page
      .getByRole("button", { name: "Preparar jugada", exact: true })
      .click();
    const selector = page.getByRole("combobox", {
      name: "Jugador para la jugada",
    });
    await expect(selector.locator("option")).toHaveCount(3); // placeholder + two starters
    await selector.selectOption("player-1");
    const trigger = page.getByRole("button", {
      name: "Velocidad del jugador",
      exact: true,
    });
    const panel = page.locator(".tactics-panel");
    const before = await panel.boundingBox();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Velocidad de jugada" });
    await expect(
      dialog.getByRole("button", { name: "x1", exact: true }),
    ).toBeFocused();
    await expect(dialog.getByRole("button")).toHaveCount(6);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "x0.5", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Cerrar", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("button", { name: "x1.5", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await expect(
      dialog.getByRole("button", { name: "x1.5", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "x1.5", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: `test-results/tactical-speed-${width}.png` });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    expect((await panel.boundingBox())!.height).toBe(before!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
