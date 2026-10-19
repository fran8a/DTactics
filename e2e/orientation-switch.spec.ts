import { test, expect } from "@playwright/test";

test("switch de orientación conserva la vista y ajusta la cancha en desktop y móvil", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Vista cancha");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const toggle = page.getByRole("switch", { name: "Cancha horizontal" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const canvas = page.locator(".field-wrap canvas").first();
  const vertical = (await canvas.boundingBox())!;
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const margins = await page.locator(".field-wrap").evaluate((el) => {
    const field = el as HTMLElement;
    const width = Number(field.dataset.pitchWidth);
    const height = Number(field.dataset.pitchHeight);
    const scale = width / 990;
    return {
      left: Number(field.dataset.pitchLeft),
      top: Number(field.dataset.pitchTop),
      expected: 2 * (24 + 30 * scale),
      height,
      expectedHeight:
        620 *
        Math.min(
          (field.clientWidth - 96) / 1110,
          (field.clientHeight - 96) / 740,
        ),
    };
  });
  expect(margins.left).toBeCloseTo(margins.expected);
  expect(margins.top).toBeCloseTo(margins.expected);
  expect(Math.abs(margins.height - margins.expectedHeight)).toBeLessThan(2);
  await expect
    .poll(async () => {
      const box = (await canvas.boundingBox())!;
      return box.width / box.height;
    })
    .toBeGreaterThan(1.3);
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(vertical.width);
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeInViewport();
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page
          .locator(".field-wrap")
          .evaluate(
            (el) =>
              el.scrollWidth <= el.clientWidth &&
              el.scrollHeight <= el.clientHeight,
          ),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(async () => {
      const box = (await canvas.boundingBox())!;
      return box.height > box.width;
    })
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/orientation-switch-mobile.png" });
});
