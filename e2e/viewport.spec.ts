import { test, expect } from "@playwright/test";
import { pitchPoint } from "./pitch";

test("cancha completa y herramientas accesibles sin desplazar la página", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase configurado.",
  );
  test.setTimeout(120000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Vista adaptable");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });

  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 600],
    [390, 844],
    [360, 640],
    [844, 390],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    const canvas = page.locator(".field-wrap canvas").first();
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return (
          !!box &&
          box.width > 100 &&
          box.height > 100 &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width + 1 &&
          box.y + box.height <= height + 1
        );
      })
      .toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await expect(page.locator(".tool-navigation")).toHaveCount(0);
    for (const section of [
      ".roster",
      ".formations-nav",
      ".pitch-settings",
      ".presence",
    ]) {
      await expect(page.locator(section)).toBeVisible();
      const box = (await page.locator(section).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    }
    for (const control of await page
      .locator(".sidebar button, .sidebar select")
      .all()) {
      if (await control.isVisible()) {
        await expect(control).toBeInViewport({ ratio: 1 });
        const box = (await control.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      }
    }
    await page.screenshot({
      path: `test-results/viewport-${width}x${height}.png`,
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar .board-title")).toHaveCount(0);
  await expect(page.locator(".pitch-heading h1")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Editar nombre de la pizarra", exact: true })
    .click();
  await page
    .getByLabel("Nombre del tablero", { exact: true })
    .fill("Pizarra desde el header");
  await page
    .getByRole("button", { name: "Guardar nombre", exact: true })
    .click();
  await expect(page.locator(".header-board-name")).toContainText(
    "Pizarra desde el header",
  );
  const source = (await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .boundingBox())!;
  const target = await pitchPoint(page, 0.5, 0.7);
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 16 });
  await page.mouse.up();
  await expect(page.getByLabel("Editar jugador del equipo A")).toBeEnabled();
  await page
    .getByLabel("Editar jugador del equipo A")
    .selectOption({ index: 1 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Nombre del jugador", { exact: true })
    .fill("Jugador adaptable");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(page.getByLabel("Editar jugador del equipo A")).toContainText(
    "Jugador adaptable",
  );
  await page
    .getByLabel("Editar jugador del equipo A")
    .selectOption({ index: 1 });
  await expect(page.getByRole("dialog")).toBeVisible();
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Nueva formación", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Elegir formación" })
      .locator("button:not(.empty)"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Renombrar", exact: true }).click();
  await page
    .getByLabel("Nombre de la formación", { exact: true })
    .fill("Prueba de espacio");
  await page
    .getByRole("button", { name: "Guardar nombre de formación", exact: true })
    .click();
  await expect(
    page.locator(".formation-slot[aria-pressed=true]"),
  ).toContainText("Prueba de espacio");
  await page
    .getByRole("button", { name: "Eliminar formación", exact: true })
    .click();
  const confirmation = page.getByRole("button", {
    name: "Sí, eliminar formación",
    exact: true,
  });
  const confirmationBox = (await confirmation.boundingBox())!;
  expect(confirmationBox.y + confirmationBox.height).toBeLessThanOrEqual(844);
  await confirmation.click();
  await expect(
    page
      .getByRole("group", { name: "Elegir formación" })
      .locator("button:not(.empty)"),
  ).toHaveCount(1);
  const slots = page
    .getByRole("group", { name: "Elegir formación" })
    .locator("button");
  await expect(slots).toHaveCount(5);
  for (let count = 2; count <= 5; count++) {
    await page
      .getByRole("button", {
        name: count === 5 ? "Duplicar formación" : "Nueva formación",
        exact: true,
      })
      .click();
    await expect(page.locator(".formation-slot:not(.empty)")).toHaveCount(
      count,
    );
  }
  await expect(
    page.getByRole("button", { name: "Nueva formación", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Duplicar formación", exact: true }),
  ).toBeDisabled();
  await slots.first().click();
  await expect(slots.first()).toHaveAttribute("aria-pressed", "true");
  const actionHeight = (await page
    .locator(".formation-actions button")
    .first()
    .boundingBox())!.height;
  for (const slot of await slots.all())
    expect((await slot.boundingBox())!.height).toBe(actionHeight);
  await page.screenshot({ path: "test-results/five-formations-mobile.png" });
});
