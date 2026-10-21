import { expect, test } from "@playwright/test";

test("small desktop keeps two columns, readable controls and all content without scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1351, 600],
    [1280, 720],
    [1024, 600],
    [783, 600],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".hero-cta")).toBeVisible();
    const layout = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      const copy = rect(".hero-copy"),
        pitch = rect(".pitch-scene"),
        steps = rect(".how"),
        cta = rect(".hero-cta");
      return {
        copyBottom: copy.bottom,
        stepsTop: steps.top,
        pitchLeft: pitch.left,
        copyRight: copy.right,
        stepsBottom: steps.bottom,
        ctaHeight: cta.height,
        descriptionSize: parseFloat(
          getComputedStyle(document.querySelector(".description")!).fontSize,
        ),
        logoSize: parseFloat(
          getComputedStyle(document.querySelector(".logo")!).fontSize,
        ),
      };
    });
    expect(layout.copyBottom).toBeLessThanOrEqual(layout.stepsTop);
    expect(layout.copyRight).toBeLessThan(layout.pitchLeft);
    expect(layout.stepsBottom).toBeLessThanOrEqual(height);
    expect(layout.descriptionSize).toBeGreaterThanOrEqual(13);
    expect(layout.logoSize).toBe(37);
    expect(layout.ctaHeight).toBeGreaterThanOrEqual(36);
    await page.evaluate(() => window.scrollTo(1000, 1000));
    expect(
      await page.evaluate(() => [
        scrollX,
        scrollY,
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ]),
    ).toEqual([0, 0, width, height]);
  }
});
