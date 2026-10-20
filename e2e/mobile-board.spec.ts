import { test, expect } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";

test("mobile prioritizes vertical pitch, quick add and accessible sliding options; desktop keeps its preference", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() =>
    localStorage.setItem("bizarron.pitch-horizontal.v1", "true"),
  );
  await themeBoardFixture(page);
  await page.goto("/p/tttttttttttttttttttttttttttttttt");
  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  await expect(page.locator(".field-wrap")).toHaveAttribute(
    "data-horizontal",
    "false",
  );
  await expect(
    page.getByRole("switch", { name: "Cancha horizontal" }),
  ).toHaveCount(0);
  await expect(page.locator(".sidebar")).toHaveCount(0);
  expect(
    (await page.locator(".pitch-container").boundingBox())!.height,
  ).toBeGreaterThan(600);
  await page
    .getByRole("button", { name: "Agregar jugador del equipo A" })
    .tap();
  await page
    .getByRole("button", { name: "Agregar jugador del equipo B" })
    .tap();
  const options = page.getByRole("button", { name: "Opciones", exact: true });
  await options.tap();
  const dialog = page.getByRole("dialog", { name: "Opciones del pizarrón" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".roster-player")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Cerrar opciones" }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/mobile-options.png" });
  await dialog.locator(".roster-player").first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await options.click();
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await page.screenshot({ path: "test-results/mobile-pitch.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".field-wrap")).toHaveAttribute(
    "data-horizontal",
    "false",
  );
  await expect(options).toBeVisible();
  await context.close();

  const desktop = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const pc = await desktop.newPage();
  await pc.addInitScript(() =>
    localStorage.setItem("bizarron.pitch-horizontal.v1", "true"),
  );
  await themeBoardFixture(pc);
  await pc.goto("/p/tttttttttttttttttttttttttttttttt");
  await expect(pc.locator(".sidebar")).toBeVisible();
  await expect(
    pc.getByRole("switch", { name: "Cancha horizontal" }),
  ).toBeChecked();
  await expect(pc.locator(".mobile-board-actions")).toHaveCount(0);
  await desktop.close();
});

test("vertical touch on home pitch scrolls the page", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  const scene = page.locator(".pitch-scene");
  await scene.scrollIntoViewIfNeeded();
  const box = (await scene.boundingBox())!;
  const initialScroll = await page.evaluate(() => scrollY);
  const initialPose = await scene.locator(".pitch-solid").getAttribute("style");
  const session = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = Math.min(750, box.y + box.height * 0.7);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 12; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i / 3, y: y - i * 18, id: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(initialScroll + 80);
  expect(await scene.locator(".pitch-solid").getAttribute("style")).toBe(
    initialPose,
  );
  await context.close();
});
