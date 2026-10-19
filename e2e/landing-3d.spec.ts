import { test, expect } from "@playwright/test";

test("maqueta 3D: frente, reverso, vueltas, orientación conservada y movimiento reducido", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const scene = page.getByRole("img", { name: /Cancha de fútbol 3D/ }),
    solid = scene.locator(".pitch-solid");
  await expect(scene).toBeVisible();
  const pose = () => solid.getAttribute("style");
  const initial = await pose();
  await page.waitForTimeout(250);
  expect(await pose()).toBe(initial);
  await page.screenshot({
    path: "test-results/landing-3d-front.png",
    fullPage: true,
  });
  await scene.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  const rear = await pose();
  expect(rear).not.toBe(initial);
  expect(
    await solid.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).m33,
    ),
  ).toBeLessThan(-0.9);
  const box = (await scene.boundingBox())!;
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest(".pitch-face")
          ?.classList.contains("pitch-back"),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ),
  ).toBe(true);
  expect(await scene.locator(".pitch-back").innerText()).toBe("");
  await expect(scene.locator(".pitch-back .pitch-boundary")).toHaveCount(1);
  await expect(scene.locator(".pitch-edge")).toHaveCount(4);
  await page.screenshot({
    path: "test-results/landing-3d-back.png",
    fullPage: true,
  });
  await page.waitForTimeout(200);
  expect(await pose()).toBe(rear);
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  expect(
    await solid.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).m33,
    ),
  ).toBeGreaterThan(0.9);
  // Drag continues from the chosen orientation, and accepts pointer moves outside its box.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(scene).toHaveAttribute("data-dragging", "true");
  await page.mouse.move(
    box.x + box.width / 2 + 130,
    box.y + box.height / 2 + 90,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(scene).toHaveAttribute("data-dragging", "false");
  const dragged = await pose();
  await page.waitForTimeout(200);
  expect(await pose()).toBe(dragged);
  expect(dragged).not.toBe(rear);
  // Four quarter-turn drags accumulate to a full revolution around each screen axis.
  const baseline = await solid.evaluate((el) =>
    Array.from(new DOMMatrix(getComputedStyle(el).transform).toFloat64Array()),
  );
  for (const vertical of [false, true]) {
    for (let i = 0; i < 4; i++) {
      const x = box.x + 70,
        y = box.y + box.height / 2 - 70;
      await page.mouse.move(x, y);
      await page.mouse.down();
      const distance = Math.PI / 2 / 0.008;
      await page.mouse.move(
        x + (vertical ? 0 : distance),
        y + (vertical ? distance : 0),
        { steps: 15 },
      );
      await page.mouse.up();
    }
    const turned = await solid.evaluate((el) =>
      Array.from(
        new DOMMatrix(getComputedStyle(el).transform).toFloat64Array(),
      ),
    );
    expect(
      Math.max(...baseline.map((n, i) => Math.abs(n - turned[i]))),
    ).toBeLessThan(0.015);
  }
  await expect(
    page.getByRole("heading", { name: /Mucho potrero/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear tablero", exact: true }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("vaivén continuo, inercia corta y navegación fuera de la maqueta", async ({
  page,
}) => {
  await page.goto("/");
  const scene = page.locator(".pitch-scene"),
    solid = scene.locator(".pitch-solid");
  const initial = await solid.getAttribute("style");
  await expect.poll(() => solid.getAttribute("style")).not.toBe(initial);
  // The visible oscillation continues beyond the original one-shot introduction.
  await page.waitForTimeout(3200);
  const startPose = await solid.evaluate((el) =>
    Array.from(new DOMMatrix(getComputedStyle(el).transform).toFloat64Array()),
  );
  await expect
    .poll(async () => {
      const pose = await solid.evaluate((el) =>
        Array.from(
          new DOMMatrix(getComputedStyle(el).transform).toFloat64Array(),
        ),
      );
      return Math.max(...startPose.map((n, i) => Math.abs(n - pose[i])));
    })
    .toBeGreaterThan(0.06);
  const box = (await scene.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 - 100,
    box.y + box.height / 2 + 35,
    { steps: 10 },
  );
  const held = await solid.getAttribute("style");
  await page.waitForTimeout(180);
  expect(await solid.getAttribute("style")).toBe(held);
  await page.mouse.move(
    box.x + box.width / 2 - 125,
    box.y + box.height / 2 + 40,
  );
  await page.mouse.up();
  const released = await solid.getAttribute("style");
  await expect.poll(() => solid.getAttribute("style")).not.toBe(released);
  await page.waitForTimeout(800);
  const end = await solid.evaluate((el) =>
    Array.from(new DOMMatrix(getComputedStyle(el).transform).toFloat64Array()),
  );
  await page.waitForTimeout(200);
  const later = await solid.evaluate((el) =>
    Array.from(new DOMMatrix(getComputedStyle(el).transform).toFloat64Array()),
  );
  expect(Math.max(...end.map((n, i) => Math.abs(n - later[i])))).toBeLessThan(
    0.25,
  );
  await page.getByRole("link", { name: /Cómo se juega/ }).click();
  await expect(page).toHaveURL(/#como-funciona$/);
});

test("rotación táctil móvil sin desplazar la página ni desbordar", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  let cdp;
  try {
    await page.goto("/");
    const scene = page.locator(".pitch-scene");
    await scene.scrollIntoViewIfNeeded();
    const box = (await scene.boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const scroll = await page.evaluate(() => scrollY),
      initial = await scene.locator(".pitch-solid").getAttribute("style");
    cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    for (let i = 1; i <= 10; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + i * 9, y: y - i * 7, id: 1 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await scene.locator(".pitch-solid").getAttribute("style")).not.toBe(
      initial,
    );
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/landing-3d-mobile.png",
      fullPage: true,
    });
  } finally {
    await cdp?.detach();
    await context.close();
  }
});
