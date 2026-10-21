import { test, expect, type Page } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";
import { pitchPoint } from "./pitch";

async function arrowNear(
  page: Page,
  origin: { x: number; y: number },
  target: { x: number; y: number },
) {
  // Inspect the arrow-only layer, just beyond its player's edge.
  const length = Math.hypot(target.x - origin.x, target.y - origin.y);
  const point = {
    x: origin.x + ((target.x - origin.x) * 24) / length,
    y: origin.y + ((target.y - origin.y) * 24) / length,
  };
  return page
    .locator(".field-wrap canvas")
    .nth(1)
    .evaluate((canvas: HTMLCanvasElement, p) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(((p.x - rect.left) * canvas.width) / rect.width);
      const y = Math.round(((p.y - rect.top) * canvas.height) / rect.height);
      const pixels = canvas
        .getContext("2d")!
        .getImageData(x - 2, y - 2, 5, 5).data;
      return Array.from(pixels).some(
        (value, index) => index % 4 === 3 && value > 120,
      );
    }, point);
}

test("la flecha sigue la ficha sin esperar la red y vuelve con ella al rechazarse el arrastre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await themeBoardFixture(page, 3000);
  await page.goto(
    "/board/00000000-0000-4000-8000-000000000001?token=tttttttttttttttttttttttttttttttt",
  );
  await expect(page.locator(".field-wrap canvas")).toHaveCount(3);
  const start = await pitchPoint(page, 0.3, 0.65);
  const target = await pitchPoint(page, 0.5, 0.55);
  const moved = await pitchPoint(page, 0.7, 0.75);
  await expect.poll(() => arrowNear(page, start, target)).toBe(true);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(moved.x, moved.y, { steps: 5 });
  await expect
    .poll(() => arrowNear(page, moved, target), { timeout: 1000 })
    .toBe(true);
  await expect
    .poll(() => arrowNear(page, start, target), { timeout: 1000 })
    .toBe(false);
  await page.mouse.up();
  await expect
    .poll(() => arrowNear(page, start, target), { timeout: 5000 })
    .toBe(true);
  await expect.poll(() => arrowNear(page, moved, target)).toBe(false);
});
