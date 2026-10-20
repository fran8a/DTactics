import { expect, test } from "@playwright/test";

test("la pelota rebota en la cancha, señala el primer paso y se puede revolear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator(".nav-link").click();
  const ball = page.locator(".physics-ball").first();
  await expect(ball).toHaveAttribute("data-phase", /pitch|step/);
  await expect(ball).toHaveAttribute("data-phase", "step");
  await expect(page.locator(".step").first()).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(ball).toHaveAttribute("data-phase", "free");
  await expect
    .poll(async () => (await ball.boundingBox())!.y, { timeout: 10000 })
    .toBeGreaterThan(720);

  const resting = (await ball.boundingBox())!;
  await page.mouse.move(resting.x + 21, resting.y + 21);
  await page.mouse.down();
  await expect(ball).toHaveAttribute("data-grabbed", "true");
  await page.mouse.move(600, 300, { steps: 20 });
  await expect
    .poll(async () => (await ball.boundingBox())!.y)
    .toBeLessThan(400);
  await page.waitForTimeout(120);
  await page.mouse.move(740, 220, { steps: 8 });
  await page.mouse.up();
  await expect(ball).not.toHaveAttribute("data-grabbed");
  const released = (await ball.boundingBox())!;
  await expect
    .poll(async () => {
      const position = (await ball.boundingBox())!;
      return Math.hypot(position.x - released.x, position.y - released.y);
    })
    .toBeGreaterThan(60);

  for (let i = 0; i < 4; i++) {
    await page.locator(".nav-link").click();
    await page.waitForTimeout(180);
  }
  await expect(page.locator(".physics-ball")).toHaveCount(5);
  await expect
    .poll(async () => page.locator('.physics-ball[data-phase="free"]').count())
    .toBe(5);
  await page.waitForTimeout(2500);
  const boxes = await page.locator(".physics-ball").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }),
  );
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].x).toBeGreaterThan(19);
    expect(boxes[i].x).toBeLessThan(1347);
    expect(boxes[i].y).toBeLessThan(750);
    for (let j = i + 1; j < boxes.length; j++)
      expect(
        Math.hypot(boxes[i].x - boxes[j].x, boxes[i].y - boxes[j].y),
      ).toBeGreaterThan(40);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    768,
  );
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/guide-balls-desktop.png" });
});

test("las pelotas responden al tacto y respetan movimiento reducido", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.locator(".nav-link").tap();
    const ball = page.locator(".physics-ball");
    await expect(ball).toHaveAttribute("data-phase", "free");
    await expect(page.locator(".step").first()).toHaveAttribute(
      "aria-current",
      "step",
    );
    const box = (await ball.boundingBox())!;
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 21, y: box.y + 21, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 190, y: 400, id: 1 }],
    });
    await expect(ball).toHaveAttribute("data-grabbed", "true");
    await expect
      .poll(async () => (await ball.boundingBox())!.y)
      .toBeLessThan(500);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(ball).not.toHaveAttribute("data-grabbed");
  } finally {
    await context.close();
  }
});

test("la pelota choca con el contorno proyectado incluso al girar la cancha", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator(".nav-link").click();
  const ball = page.locator(".physics-ball");
  await expect(ball).toHaveAttribute("data-phase", "free");
  const pitch = page.locator(".pitch-scene");
  const ballBox = (await ball.boundingBox())!;
  const pitchBox = (await pitch.boundingBox())!;
  const centerX = pitchBox.x + pitchBox.width / 2;
  await page.mouse.move(
    ballBox.x + ballBox.width / 2,
    ballBox.y + ballBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(centerX, 744, { steps: 15 });
  await expect
    .poll(async () => {
      const box = (await ball.boundingBox())!;
      return Math.abs(box.x + box.width / 2 - centerX);
    })
    .toBeLessThan(10);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await ball.focus();
  await page.keyboard.press("Enter");
  await expect(pitch).toHaveAttribute("data-ball-impact", "true");
  await pitch.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  const samples = await page.evaluate(async () => {
    type Point = { x: number; y: number };
    const cross = (a: Point, b: Point, c: Point) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const hull = (points: Point[]) => {
      points.sort((a, b) => a.x - b.x || a.y - b.y);
      const half = (items: Point[]) => {
        const result: Point[] = [];
        for (const p of items) {
          while (
            result.length > 1 &&
            cross(result.at(-2)!, result.at(-1)!, p) <= 0
          )
            result.pop();
          result.push(p);
        }
        return result.slice(0, -1);
      };
      return [...half(points), ...half([...points].reverse())];
    };
    const records = [];
    for (let i = 0; i < 90; i++) {
      await new Promise(requestAnimationFrame);
      const shape = hull(
        [...document.querySelectorAll(".pitch-collision-probe")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        }),
      );
      const rect = document
        .querySelector(".physics-ball")!
        .getBoundingClientRect();
      const p = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const inside = shape.every(
        (a, index) => cross(a, shape[(index + 1) % shape.length], p) >= 0,
      );
      const distance = Math.min(
        ...shape.map((a, index) => {
          const b = shape[(index + 1) % shape.length];
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy),
            ),
          );
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
        }),
      );
      records.push({
        inside,
        distance,
        left: Math.min(...shape.map((point) => point.x)),
      });
    }
    return records;
  });
  expect(samples.every((sample) => !sample.inside)).toBe(true);
  expect(Math.min(...samples.map((sample) => sample.distance))).toBeGreaterThan(
    17,
  );
  await page.screenshot({
    path: "test-results/guide-balls-projected-collision.png",
  });
});
