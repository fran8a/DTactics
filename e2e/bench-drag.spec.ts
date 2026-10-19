import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";

test("jugadores fuera de las líneas: mismo arrastre mouse/touch, gris, historial y recarga", async ({
  page,
  browser,
}) => {
  const url = process.env.VITE_SUPABASE_URL,
    key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !key, "Requiere Supabase real");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 1500 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Fuera de líneas");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const invite = page.url(),
    parsed = new URL(invite);
  // Reuse this browser's session for read assertions instead of signing up another user.
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    )!;
    return JSON.parse(localStorage.getItem(key)!);
  });
  const api = createClient(url!, key!, { auth: { persistSession: false } });
  expect((await api.auth.setSession(saved)).error).toBeNull();
  const get = async () => {
    const r = await api.rpc("formation_snapshot", {
      p_board: parsed.pathname.split("/").pop(),
      p_formation: parsed.searchParams.get("formation"),
    });
    expect(r.error).toBeNull();
    return r.data;
  };
  await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator(".player-row")).toHaveCount(1);
  const original = (await get()).players[0];
  const start = await pitchPoint(page, original.x, original.y),
    edge = await pitchPoint(page, 0, original.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 7, start.y - 7);
  await expect.poll(async () => (await get()).locks.length).toBe(1);
  await page.mouse.move(edge.x - 28, edge.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".player-row.off-field")).toHaveCount(1);
  expect(await page.locator(".bench").count()).toBe(0);
  let p = (await get()).players[0];
  expect(p).toMatchObject({ x: original.x, y: original.y, placement: "bench" });
  expect(p.outside_x).toBeLessThan(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".player-row.off-field")).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(page.locator(".player-row.off-field")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".connection")).toHaveText("Conectado");
  expect((await get()).players[0].outside_x).toBe(p.outside_x);
  await page.screenshot({
    path: "test-results/outside-desktop.png",
    fullPage: true,
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await context.newPage();
  try {
    await mobile.goto(invite);
    await mobile.getByLabel("Tu nombre o apodo").fill("Táctil exterior");
    await mobile.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(mobile.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await mobile.locator(".field-wrap canvas").first().scrollIntoViewIfNeeded();
    // Stored normalized coordinates can be clipped to the exterior margin on a smaller screen.
    const g = await mobile.locator(".field-wrap canvas").first().boundingBox();
    let from = await pitchPoint(mobile, p.outside_x, p.outside_y);
    from.x = Math.max(g!.x + 19, from.x);
    const target = await pitchPoint(mobile, 0.4, 0.4);
    const touch = await context.newCDPSession(mobile);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...from, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + 7, y: from.y - 7, id: 1 }],
    });
    await expect.poll(async () => (await get()).locks.length).toBe(1);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...target, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(mobile.locator(".player-row.off-field")).toHaveCount(0);
    await expect(page.locator(".player-row.off-field")).toHaveCount(0);
    p = (await get()).players[0];
    expect(p.x).toBeCloseTo(0.4, 2);
    expect(p.y).toBeCloseTo(0.4, 2);
    const out = await pitchPoint(mobile, 1, 0.4);
    out.x += 28;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...target, id: 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: target.x + 7, y: target.y, id: 2 }],
    });
    await expect.poll(async () => (await get()).locks.length).toBe(1);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...out, id: 2 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator(".player-row.off-field")).toHaveCount(1);
    await mobile.reload();
    await expect(mobile.locator(".player-row.off-field")).toHaveCount(1);
    expect(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mobile.screenshot({
      path: "test-results/outside-mobile.png",
      fullPage: true,
    });
    await touch.detach();
  } finally {
    await context.close();
  }
});
