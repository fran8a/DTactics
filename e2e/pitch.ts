import type { Page } from "@playwright/test";
export async function pitchPoint(page: Page, x: number, y: number) {
  const field = page.locator(".field-wrap");
  const box = (await field.locator("canvas").first().boundingBox())!;
  const g = await field.evaluate((el) => ({
    left: Number((el as HTMLElement).dataset.pitchLeft),
    top: Number((el as HTMLElement).dataset.pitchTop),
    width: Number((el as HTMLElement).dataset.pitchWidth),
    height: Number((el as HTMLElement).dataset.pitchHeight),
  }));
  return { x: box.x + g.left + x * g.width, y: box.y + g.top + y * g.height };
}
