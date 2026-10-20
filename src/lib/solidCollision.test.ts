import { expect, test } from "vitest";
import { outsideSolid } from "./solidCollision";

const square = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 200 },
  { x: 100, y: 200 },
];

test("a pointer inside the button cannot pull the ball through its bottom", () => {
  expect(outsideSolid({ x: 200, y: 195 }, 21, square)).toEqual({
    x: 200,
    y: 221,
  });
  expect(outsideSolid({ x: 200, y: 205 }, 21, square)).toEqual({
    x: 200,
    y: 221,
  });
  expect(outsideSolid({ x: 200, y: 195 }, 21, [...square].reverse())).toEqual({
    x: 200,
    y: 221,
  });
});
test("corner contact follows the outline rather than its bounding rectangle", () => {
  const result = outsideSolid({ x: 95, y: 95 }, 21, square)!;
  expect(Math.hypot(result.x - 100, result.y - 100)).toBeCloseTo(21);
  expect(outsideSolid({ x: 70, y: 95 }, 21, square)).toBeNull();
});
test("a rotated solid uses its sloped face", () => {
  const diamond = [
    { x: 0, y: 100 },
    { x: 100, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 200 },
  ];
  const result = outsideSolid({ x: 155, y: 45 }, 21, diamond)!;
  expect(result.x).toBeCloseTo(150 + 21 / Math.sqrt(2));
  expect(result.y).toBeCloseTo(50 - 21 / Math.sqrt(2));
});
