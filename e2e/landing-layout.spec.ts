import { test, expect } from "@playwright/test";

test("la cancha giratoria no invade el header ni el paso a paso", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1366, 768],
    [1280, 720],
    [1920, 1080],
    [1024, 650],
    [1024, 600],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const scene = page.locator(".pitch-scene");
    await scene.focus();
    for (let turn = 0; turn < 80; turn++) {
      await page.keyboard.press(turn % 3 === 0 ? "ArrowUp" : "ArrowRight");
      const bounds = await page.evaluate(() => {
        const header = document
          .querySelector(".home-header")!
          .getBoundingClientRect();
        const how = document.querySelector(".how")!.getBoundingClientRect();
        const probes = Array.from(
          document.querySelectorAll(".pitch-collision-probe"),
          (el) => el.getBoundingClientRect(),
        );
        return {
          top: Math.min(...probes.map((r) => r.top)),
          bottom: Math.max(...probes.map((r) => r.bottom)),
          header: header.bottom,
          how: how.top,
        };
      });
      expect(bounds.top, `${width}x${height}, giro ${turn}`).toBeGreaterThan(
        bounds.header + 12,
      );
      expect(bounds.bottom, `${width}x${height}, giro ${turn}`).toBeLessThan(
        bounds.how - 12,
      );
    }
    await page.screenshot({
      path: `test-results/landing-layout-${width}x${height}.png`,
      fullPage: true,
    });
  }
});
