import { test, expect, type Page } from "@playwright/test";
import { pitchPoint } from "./pitch";

async function ballAt(page: Page, x: number, y: number) {
  const point = await pitchPoint(page, x, y);
  return page
    .locator(".field-wrap canvas")
    .last()
    .evaluate((canvas: HTMLCanvasElement, p) => {
      const rect = canvas.getBoundingClientRect();
      return (
        canvas
          .getContext("2d")!
          .getImageData(
            Math.round(((p.x - rect.left) * canvas.width) / rect.width),
            Math.round(((p.y - rect.top) * canvas.height) / rect.height),
            1,
            1,
          ).data[3] > 240
      );
    }, point);
}

test("pelota única: movimiento en vivo entre sesiones, guardado, recarga e historial", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real",
  );
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Pelota escritorio");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  await expect(page).toHaveURL(/\/p\//);
  const otherContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const other = await otherContext.newPage();
  other.on("pageerror", (error) => errors.push(error.message));
  try {
    await other.goto(page.url());
    await other.getByLabel("Tu nombre o apodo").fill("Pelota móvil");
    await other.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(other.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await expect.poll(() => ballAt(other, 0.5, 0.5)).toBe(true);
    const start = await pitchPoint(page, 0.5, 0.5);
    const destination = await pitchPoint(page, 0.3, 0.35);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const acquired = page.waitForResponse(
      (response) =>
        response.url().includes("/rpc/change_ball") &&
        response.request().postDataJSON().p_action === "acquire",
    );
    await page.mouse.move(start.x + 8, start.y + 8);
    expect((await acquired).ok()).toBe(true);
    // A confirmed lease must reach the observer before preview packets.
    await expect
      .poll(async () => {
        await page.mouse.move(destination.x, destination.y - 1);
        await page.mouse.move(destination.x, destination.y);
        return ballAt(other, 0.3, 0.35);
      })
      .toBe(true);
    await page.mouse.up();
    await expect.poll(() => ballAt(other, 0.3, 0.35)).toBe(true);
    await other.reload();
    await expect(other.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await expect.poll(() => ballAt(other, 0.3, 0.35)).toBe(true);
    await page.keyboard.press("Control+z");
    await expect.poll(() => ballAt(other, 0.5, 0.5)).toBe(true);
    await page.keyboard.press("Control+y");
    await expect.poll(() => ballAt(other, 0.3, 0.35)).toBe(true);
    // Move from the second session and verify the reverse direction too.
    const from = await pitchPoint(other, 0.3, 0.35);
    const to = await pitchPoint(other, 0.65, 0.7);
    await other.mouse.move(from.x, from.y);
    await other.mouse.down();
    await other.mouse.move(to.x, to.y, { steps: 10 });
    await other.mouse.up();
    await expect.poll(() => ballAt(page, 0.65, 0.7)).toBe(true);
    await page.getByRole("switch", { name: "Cancha horizontal" }).click();
    await expect.poll(() => ballAt(page, 0.7, 0.35)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await otherContext.close();
  }
});
