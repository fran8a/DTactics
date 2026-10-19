import { test, expect, type Page, type Route } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";

async function orangeAt(page: Page, p: { x: number; y: number }) {
  return page
    .locator(".field-wrap canvas")
    .nth(1)
    .evaluate((canvas: HTMLCanvasElement, p) => {
      const r = canvas.getBoundingClientRect();
      const [red, green, blue, alpha] = canvas
        .getContext("2d")!
        .getImageData(
          Math.round(((p.x - r.left) * canvas.width) / r.width),
          Math.round(((p.y - r.top - 13) * canvas.height) / r.height),
          1,
          1,
        ).data;
      return red > 220 && green > 100 && blue < 120 && alpha > 240;
    }, p);
}

test("arrastre inmediato con red demorada: soltar antes de confirmar, conflicto y cancelación", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real",
  );
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 1500 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Latencia");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const parsed = new URL(page.url()),
    board = parsed.pathname.split("/").pop()!,
    formation = parsed.searchParams.get("formation")!;
  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find(
          (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
        )!,
      )!,
    ),
  );
  const api = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  expect((await api.auth.setSession(stored)).error).toBeNull();
  const get = async () => {
    const r = await api.rpc("formation_snapshot", {
      p_board: board,
      p_formation: formation,
    });
    expect(r.error).toBeNull();
    return r.data;
  };
  await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .click();
  await expect(page.locator(".player-row")).toHaveCount(1);
  let player = (await get()).players[0];
  const original = { x: player.x, y: player.y };
  let releaseGate: () => void = () => {},
    acquireSeen: () => void = () => {};
  let gate: Promise<void>,
    seen: Promise<void>,
    delayed = true,
    writes = 0;
  function nextGate() {
    gate = new Promise((resolve) => {
      releaseGate = resolve;
    });
    seen = new Promise((resolve) => {
      acquireSeen = resolve;
    });
  }
  nextGate();
  const route = async (route: Route) => {
    const body = route.request().postDataJSON();
    if (body.p_action === "move") writes++;
    if (body.p_action === "acquire" && delayed) {
      acquireSeen();
      await gate;
    }
    await route.continue();
  };
  await page.route("**/rest/v1/rpc/change_player_v2", route);
  try {
    const start = await pitchPoint(page, player.x, player.y),
      target = await pitchPoint(page, 0.55, 0.4);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 3 });
    await seen;
    await expect
      .poll(() => orangeAt(page, target), {
        timeout: 1000,
        intervals: [16, 32, 50],
      })
      .toBe(true);
    expect((await get()).players[0]).toMatchObject(original);
    expect((await get()).locks).toHaveLength(0);
    // The same painted position remains while the drop waits for authorization.
    await page.mouse.up();
    await expect.poll(() => orangeAt(page, target)).toBe(true);
    expect(writes).toBe(0);
    releaseGate();
    await expect
      .poll(async () => (await get()).players[0].x)
      .toBeCloseTo(0.55, 2);
    await expect
      .poll(async () => (await get()).players[0].y)
      .toBeCloseTo(0.4, 2);
    expect(writes).toBe(1);
    await page.keyboard.press("Control+z");
    await expect
      .poll(async () => (await get()).players[0].x)
      .toBeCloseTo(original.x, 2);
    await page.keyboard.press("Control+y");
    await expect
      .poll(async () => (await get()).players[0].x)
      .toBeCloseTo(0.55, 2);

    // An independent client takes the lease first (also protects tabs sharing a session).
    const other = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await other.auth.setSession(stored)).error).toBeNull();
    expect(
      (
        await other.rpc("join_board", {
          p_board: board,
          p_token: parsed.searchParams.get("access"),
        })
      ).error,
    ).toBeNull();
    nextGate();
    player = (await get()).players[0];
    const origin = await pitchPoint(page, player.x, player.y),
      contested = await pitchPoint(page, 0.75, 0.3);
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(contested.x, contested.y, { steps: 3 });
    await seen;
    await expect.poll(() => orangeAt(page, contested)).toBe(true);
    const lease = crypto.randomUUID();
    expect(
      (
        await other.rpc("change_player_v2", {
          p_board: board,
          p_formation: formation,
          p_action: "acquire",
          p_id: player.id,
          p_lease: lease,
        })
      ).error,
    ).toBeNull();
    releaseGate();
    await expect(page.getByRole("alert")).toContainText("Otro participante");
    await page.mouse.up();
    await expect
      .poll(async () =>
        orangeAt(page, await pitchPoint(page, player.x, player.y)),
      )
      .toBe(true);
    expect(writes).toBe(1);
    expect(
      (
        await other.rpc("change_player_v2", {
          p_board: board,
          p_formation: formation,
          p_action: "move",
          p_id: player.id,
          p_lease: lease,
          p_data: { x: 0.45, y: 0.65 },
        })
      ).error,
    ).toBeNull();
    await expect
      .poll(async () => (await get()).players[0].x)
      .toBeCloseTo(0.45, 2);
    const saved = await pitchPoint(page, 0.45, 0.65);
    await expect.poll(() => orangeAt(page, saved)).toBe(true);

    // Cancellation before the reply restores the original and releases a later lease.
    nextGate();
    const cancelled = await pitchPoint(page, 0.65, 0.5);
    await page.mouse.move(saved.x, saved.y);
    await page.mouse.down();
    await page.mouse.move(cancelled.x, cancelled.y, { steps: 3 });
    await seen;
    await expect.poll(() => orangeAt(page, cancelled)).toBe(true);
    await page.evaluate(() =>
      window.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      ),
    );
    await page.mouse.up();
    await expect.poll(() => orangeAt(page, saved)).toBe(true);
    releaseGate();
    delayed = false;
    await expect
      .poll(async () =>
        page.getByRole("button", { name: "Nueva formación" }).isEnabled(),
      )
      .toBe(true);
    expect((await get()).locks).toHaveLength(0);
    expect((await get()).players[0]).toMatchObject({ x: 0.45, y: 0.65 });
    expect(writes).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    releaseGate();
    await page.unroute("**/rest/v1/rpc/change_player_v2", route);
  }
});
