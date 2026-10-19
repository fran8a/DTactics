import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";
test("altas rápidas: soltar fichas, doble clic, táctil y secuencias concurrentes por equipo", async ({
  page,
  browser,
}) => {
  const url = process.env.VITE_SUPABASE_URL,
    key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !key, "Requiere Supabase real configurado.");
  test.setTimeout(120000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Fichas E2E");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const invite = page.url(),
    parsed = new URL(invite),
    board = parsed.pathname.split("/").pop()!,
    token = parsed.searchParams.get("access")!;
  const api = createClient(url!, key!, { auth: { persistSession: false } });
  expect((await api.auth.signInAnonymously()).error).toBeNull();
  expect(
    (await api.rpc("join_board", { p_board: board, p_token: token })).error,
  ).toBeNull();
  const get = async () => {
    const r = await api.rpc("board_snapshot", { p_board: board });
    expect(r.error).toBeNull();
    return r.data;
  };
  const canvas = page.locator(".field-wrap canvas").first();
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const target = await pitchPoint(page, 0.34, 0.25);
  const source = await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .filter({ visible: true })
    .boundingBox();
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".player-row")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let state = await get();
  const first = state.players[0];
  expect(first).toMatchObject({ team: "A", number: 1, name: "Jugador 1" });
  expect(first.x).toBeCloseTo(0.34, 2);
  expect(first.y).toBeCloseTo(0.25, 2);
  await page.mouse.click(target.x, target.y, { clickCount: 2, delay: 65 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Nombre del jugador").fill("Ochoa rápido");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator(".player-row")).toContainText("Ochoa rápido");
  // Canceling outside the field must not create a player or consume a number.
  const blue = await page
    .getByRole("button", { name: "Agregar jugador del equipo B", exact: true })
    .filter({ visible: true })
    .boundingBox();
  await page.mouse.move(blue!.x + 25, blue!.y + 25);
  await page.mouse.down();
  await page.mouse.move(40, 95, { steps: 8 });
  await page.mouse.up();
  expect((await get()).players).toHaveLength(1);
  await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .filter({ visible: true })
    .press("Enter");
  await expect(page.locator(".player-row")).toHaveCount(2);
  expect(
    (await get()).players
      .filter((p: any) => p.team === "A")
      .map((p: any) => p.number),
  ).toEqual([1, 2]);
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    mp = await mobile.newPage();
  try {
    await mp.goto(invite);
    await mp.getByLabel("Tu nombre o apodo").fill("Táctil E2E");
    await mp.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(mp.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    const ms = (await mp
      .getByRole("button", {
        name: "Agregar jugador del equipo B",
        exact: true,
      })
      .filter({ visible: true })
      .boundingBox())!;
    const touch = await mobile.newCDPSession(mp);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: ms.x + ms.width / 2, y: ms.y + ms.height / 2, id: 1 }],
    });
    for (let i = 1; i <= 10; i++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: 230,
            y: ms.y + ms.height / 2 + ((800 - ms.y - ms.height / 2) * i) / 10,
            id: 1,
          },
        ],
      });
    // The palette is above the field on mobile: scroll while holding the same gesture.
    await expect
      .poll(async () => (await pitchPoint(mp, 0.65, 0.4)).y)
      .toBeLessThan(650);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 230, y: 600, id: 1 }],
    });
    await mp.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const targetMobile = await pitchPoint(mp, 0.65, 0.4);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...targetMobile, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
    await expect(page.locator(".player-row")).toHaveCount(3);
    state = await get();
    const bluePlayer = state.players.find((p: any) => p.team === "B");
    expect(bluePlayer.number).toBe(1);
    expect(bluePlayer.x).toBeCloseTo(0.65, 2);
    expect(bluePlayer.y).toBeCloseTo(0.4, 2);
    const additions = await Promise.all(
      [crypto.randomUUID(), crypto.randomUUID()].map((id) =>
        api.rpc("quick_add_player", {
          p_board: board,
          p_id: id,
          p_team: "A",
          p_x: 0.5,
          p_y: 0.6,
        }),
      ),
    );
    expect(additions.every((r) => !r.error)).toBe(true);
    state = await get();
    expect(
      state.players
        .filter((p: any) => p.team === "A")
        .map((p: any) => p.number)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
    await expect(mp.locator(".player-row")).toHaveCount(5);
    expect(
      await mp.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".player-row")).toHaveCount(5, {
      timeout: 30000,
    });
    await page.screenshot({
      path: "test-results/quick-add-desktop.png",
      fullPage: true,
    });
    await mp.screenshot({
      path: "test-results/quick-add-mobile.png",
      fullPage: true,
    });
  } finally {
    await mobile.close();
  }
});
