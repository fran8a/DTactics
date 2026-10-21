import { expect, test } from "@playwright/test";

test("the animated pitch scales as a single model across desktop and mobile breakpoints", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".pitch-scene")).toBeVisible();
  for (const [width, height] of [
    [1920, 1080],
    [1351, 600],
    [1024, 768],
    [783, 600],
    [761, 600],
    [760, 600],
    [600, 800],
    [390, 844],
    [320, 568],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page
          .locator(".pitch-scene")
          .evaluate((el) => el.getBoundingClientRect().width),
      )
      .toBeLessThan(width);
    const model = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>(".pitch-scene")!;
      const field = document.querySelector<HTMLElement>(
        ".pitch-front .illustration-pitch",
      )!;
      const note = document.querySelector<HTMLElement>(".pitch-note")!;
      const sticker = document.querySelector<HTMLElement>(".art-sticker")!;
      const rect = scene.getBoundingClientRect();
      return {
        width: scene.offsetWidth,
        fieldWidth: field.offsetWidth,
        fieldHeight: field.offsetHeight,
        ratio: rect.width / rect.height,
        noteFont: getComputedStyle(note).fontSize,
        stickerFont: getComputedStyle(sticker).fontSize,
        headerFont: getComputedStyle(document.querySelector(".preview-top")!)
          .fontSize,
        screenWidth: rect.width,
        viewportWidth: innerWidth,
      };
    });
    expect(model.width, `${width}: model width`).toBe(390);
    expect(model.fieldWidth).toBe(340);
    expect(model.fieldHeight).toBe(430);
    expect(model.ratio).toBeCloseTo(390 / 542.5, 2);
    expect(model.noteFont).toBe("22px");
    expect(model.stickerFont).toBe("12px");
    expect(model.headerFont).toBe("9px");
    expect(model.screenWidth).toBeLessThan(model.viewportWidth);
  }
});
