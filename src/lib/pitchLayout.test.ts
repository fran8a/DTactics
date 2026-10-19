import { describe, expect, it } from "vitest";
import { fitPitch } from "./pitchLayout";
import { fieldDrop, toScreen } from "./model";

describe("responsive pitch geometry", () => {
  it("fills desktop height without distorting or overflowing the container", () => {
    for (const [width, height] of [
      [1086, 720],
      [1640, 1032],
    ]) {
      const g = fitPitch(width, height, true);
      expect(g.horizontal).toBe(true);
      expect(g.canvasWidth).toBeLessThanOrEqual(width + 0.01);
      expect(g.height).toBeLessThanOrEqual(height + 0.01);
      expect(g.heightInside / height).toBeGreaterThanOrEqual(0.85);
      expect(g.width / g.heightInside).toBeCloseTo(990 / 620);
    }
  });

  it("keeps a portrait pitch on phones and on narrow tablet containers", () => {
    expect(fitPitch(370, 500, false).horizontal).toBe(false);
    expect(fitPitch(550, 1000, true).horizontal).toBe(false);
  });

  it("round trips palette drops to the same canonical coordinates in either view", () => {
    for (const [width, height, landscape] of [
      [1086, 720, true],
      [370, 500, false],
    ] as const) {
      const g = fitPitch(width, height, landscape);
      const screen = toScreen(0.21, 0.73, g.horizontal);
      const result = fieldDrop(
        100 + g.left + screen.x * g.width,
        50 + g.top + screen.y * g.heightInside,
        { left: 100, top: 50, width: g.canvasWidth, height: g.height },
        g.horizontal,
      )!;
      expect(result.x).toBeCloseTo(0.21);
      expect(result.y).toBeCloseTo(0.73);
    }
  });
});
