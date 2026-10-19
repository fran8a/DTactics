import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
test("landing responsive y enlace inválido", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Mucho potrero/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Crear tablero" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page.goto("/board/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("alert")).toContainText("Enlace inválido");
  expect(errors).toEqual([]);
});
test("Supabase real: dos navegadores, CRUD, movimiento, bloqueos, reconexión y RLS", async ({
  browser,
}) => {
  test.skip(
    !url || !key,
    "Requiere .env.local conectado a un Supabase configurado. No utiliza datos ni conexiones simulados.",
  );
  test.setTimeout(180000);
  const a = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    b = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const pa = await a.newPage(),
    pb = await b.newPage();
  const errors: string[] = [];
  for (const p of [pa, pb]) p.on("pageerror", (e) => errors.push(e.message));
  async function add(p: Page, name: string, team: "A" | "B" = "A") {
    await p
      .getByRole("button", {
        name: `Agregar jugador del equipo ${team}`,
        exact: true,
      })
      .filter({ visible: true })
      .click();
    await p
      .locator(".team-list")
      .filter({ hasText: `EQUIPO ${team}` })
      .locator(".player-row")
      .filter({ hasText: /Jugador \d+/ })
      .last()
      .click();
    await p.getByLabel("Nombre del jugador").fill(name);
    await p.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
  }
  try {
    await pa.goto("/");
    await pa
      .getByRole("button", { name: "Crear tablero", exact: true })
      .click();
    await pa.getByLabel("Tu nombre o apodo").fill("Colo E2E");
    await pa.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(pa.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    const invite = pa.url(),
      parsed = new URL(invite),
      board = parsed.pathname.split("/").pop()!,
      token = parsed.searchParams.get("access")!;
    await pa
      .getByRole("button", { name: "Copiar enlace", exact: true })
      .click();
    await expect(
      pa.getByRole("button", { name: "¡Copiado!", exact: true }),
    ).toBeVisible();
    expect(await pa.evaluate(() => navigator.clipboard.readText())).toBe(
      invite,
    );
    await pb.goto(invite);
    await pb.getByLabel("Tu nombre o apodo").fill("Lau E2E");
    await pb.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(pb.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await expect(pa.locator(".person")).toHaveCount(2);
    await add(pa, "Ochoa");
    await expect(
      pb.locator(".player-row").filter({ hasText: "Ochoa" }),
    ).toBeVisible();
    await pb.locator(".player-row").filter({ hasText: "Ochoa" }).click();
    await pb.getByLabel("Número de camiseta").fill("10");
    await pb.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(
      pa.locator(".player-row").filter({ hasText: "Ochoa" }).locator(".jersey"),
    ).toHaveText("10");
    const apiA = createClient(url!, key!, { auth: { persistSession: false } }),
      apiB = createClient(url!, key!, { auth: { persistSession: false } });
    for (const api of [apiA, apiB]) {
      const auth = await api.auth.signInAnonymously();
      expect(auth.error).toBeNull();
    }
    const denied = await apiB.rpc("board_snapshot", { p_board: board });
    expect(denied.error).toBeNull();
    expect(denied.data).toBeNull();
    const wrong = await apiB.rpc("join_board", {
      p_board: board,
      p_token: "0".repeat(64),
    });
    expect(wrong.error).not.toBeNull();
    for (const api of [apiA, apiB])
      expect(
        (await api.rpc("join_board", { p_board: board, p_token: token })).error,
      ).toBeNull();
    const get = async () => {
      const s = await apiA.rpc("board_snapshot", { p_board: board });
      expect(s.error).toBeNull();
      return s.data;
    };
    let state = await get();
    const player = state.players.find((p: any) => p.name === "Ochoa");
    const field = pa.locator(".field-wrap canvas").first();
    await field.scrollIntoViewIfNeeded();
    const { x, y } = await pitchPoint(pa, player.x, player.y);
    await pa.mouse.move(x, y);
    await pa.mouse.down();
    await pa.mouse.move(x + 7, y - 7);
    await expect.poll(async () => (await get()).locks.length).toBe(1);
    await expect(
      pb
        .locator(".player-row")
        .filter({ hasText: "Ochoa" })
        .getByLabel("En movimiento"),
    ).toBeVisible();
    const remoteCanvas = pb.locator(".field-wrap canvas").nth(1);
    const beforeMove = await remoteCanvas.evaluate(
      (canvas: HTMLCanvasElement) => canvas.toDataURL(),
    );
    await pa.mouse.move(x + 45, y - 55, { steps: 8 });
    await expect
      .poll(() =>
        remoteCanvas.evaluate((canvas: HTMLCanvasElement) =>
          canvas.toDataURL(),
        ),
      )
      .not.toBe(beforeMove);
    // PostgreSQL still has the old position while the remote canvas has moved.
    expect((await get()).players.find((p: any) => p.id === player.id).x).toBe(
      player.x,
    );
    await pa.mouse.up();
    await expect
      .poll(
        async () =>
          (await get()).players.find((p: any) => p.id === player.id).x,
      )
      .not.toBe(player.x);
    await expect.poll(async () => (await get()).locks.length).toBe(0);
    // Wait for the other browser to reconcile the committed position and lease.
    await expect(
      pb
        .locator(".player-row")
        .filter({ hasText: "Ochoa" })
        .getByLabel("En movimiento"),
    ).toHaveCount(0);
    // A real touch gesture in the mobile Chromium context, with no API mocks.
    const beforeTouch = (await get()).players.find(
      (p: any) => p.id === player.id,
    );
    const mobileCanvas = pb.locator(".field-wrap canvas").first();
    await mobileCanvas.scrollIntoViewIfNeeded();
    const { x: tx, y: ty } = await pitchPoint(pb, beforeTouch.x, beforeTouch.y);
    const touch = await b.newCDPSession(pb);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: tx, y: ty, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: tx - 7, y: ty - 7, id: 1 }],
    });
    await expect.poll(async () => (await get()).locks.length).toBe(1);
    for (let i = 1; i <= 8; i++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: tx - i * 4, y: ty - i * 5, id: 1 }],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(
        async () =>
          (await get()).players.find((p: any) => p.id === player.id).x,
      )
      .not.toBe(beforeTouch.x);
    await expect.poll(async () => (await get()).locks.length).toBe(0);
    await touch.detach();
    const leaseA = crypto.randomUUID(),
      leaseB = crypto.randomUUID();
    const locks = await Promise.all([
      apiA.rpc("change_player", {
        p_board: board,
        p_action: "acquire",
        p_id: player.id,
        p_lease: leaseA,
      }),
      apiB.rpc("change_player", {
        p_board: board,
        p_action: "acquire",
        p_id: player.id,
        p_lease: leaseB,
      }),
    ]);
    expect(locks.filter((l) => !l.error)).toHaveLength(1);
    const winner = locks[0].error ? apiB : apiA,
      lease = locks[0].error ? leaseB : leaseA;
    expect(
      (
        await winner.rpc("change_player", {
          p_board: board,
          p_action: "release",
          p_id: player.id,
          p_lease: lease,
        })
      ).error,
    ).toBeNull();
    await Promise.all([add(pa, "A simultáneo"), add(pb, "B simultáneo", "B")]);
    for (const p of [pa, pb])
      await expect(p.locator(".player-row")).toHaveCount(3);
    await b.setOffline(true);
    await expect(pb.locator(".connection")).toContainText(
      /Sin conexión|Reconectando/,
    );
    await add(pa, "Durante desconexión");
    await b.setOffline(false);
    await expect(pb.locator(".player-row")).toHaveCount(4, { timeout: 30000 });
    await pa.locator(".board-title > button").click();
    await pa.getByLabel("Nombre del tablero").fill("El partidito E2E");
    await pa
      .getByRole("button", { name: "Guardar nombre", exact: true })
      .click();
    await expect(pb.locator(".board-title")).toContainText("El partidito E2E");
    await expect(
      pa.getByRole("button", { name: "Horizontal", exact: true }),
    ).toHaveCount(0);
    await expect(pb.locator(".pitch-container")).toHaveClass(/vertical/);
    await pb.reload();
    await expect(pb.locator(".player-row")).toHaveCount(4, { timeout: 30000 });
    await pb.locator(".player-row").filter({ hasText: "Ochoa" }).click();
    await pb
      .getByRole("button", { name: "Eliminar jugador", exact: true })
      .click();
    await pb.getByRole("button", { name: "Sí, eliminar jugador" }).click();
    await expect(
      pa.locator(".player-row").filter({ hasText: "Ochoa" }),
    ).toHaveCount(0);
    await pa.screenshot({
      path: "test-results/board-desktop.png",
      fullPage: true,
    });
    await pb.screenshot({
      path: "test-results/board-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
