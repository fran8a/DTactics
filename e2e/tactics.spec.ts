import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";
import { buildTrack, sampleTrack } from "../src/lib/tactics";

async function open(page: Page, name: string, invite?: string) {
  await page.goto(invite ?? "/");
  if (!invite)
    await page
      .getByRole("button", { name: "Crear tablero", exact: true })
      .click();
  await page.getByLabel("Tu nombre o apodo").fill(name);
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
}
async function apiFor(page: Page) {
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        Object.keys(localStorage).find(
          (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
        )!,
      )!,
    ),
  );
  const api = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  expect((await api.auth.setSession(saved)).error).toBeNull();
  const resolved = await api.rpc("open_board_link", {
    p_code: new URL(page.url()).pathname.split("/").pop(),
  });
  expect(resolved.error).toBeNull();
  const { board_id: board, formation_id: formation } = resolved.data;
  const get = async (selected = formation) => {
    const result = await api.rpc("formation_snapshot", {
      p_board: board,
      p_formation: selected,
    });
    expect(result.error).toBeNull();
    return result.data;
  };
  return { api, board, formation, get };
}
async function waypoint(page: Page, x: number, y: number, horizontal = false) {
  const point = await pitchPoint(
    page,
    horizontal ? y : x,
    horizontal ? 1 - x : y,
  );
  await page.mouse.click(point.x, point.y);
}
async function orangeAt(page: Page, point: { x: number; y: number }) {
  const pixel = await pitchPoint(page, point.x, point.y);
  return page
    .locator(".field-wrap canvas")
    .last()
    .evaluate((el, p) => {
      const canvas = el as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const data = canvas
        .getContext("2d")!
        .getImageData(
          Math.round(((p.x + 12 - rect.left) * canvas.width) / rect.width),
          Math.round(((p.y - rect.top) * canvas.height) / rect.height),
          1,
          1,
        ).data;
      return data[0] > 240 && data[1] > 110 && data[1] < 180 && data[2] < 100;
    }, pixel);
}

test("jugadas: edición colaborativa, conflicto, reproducción local sin escrituras, historial y duplicación", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  test.setTimeout(180000);
  await page.clock.install();
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page, "Táctica principal");
  for (const team of ["A", "B"]) {
    await page
      .getByRole("button", {
        name: `Agregar jugador del equipo ${team}`,
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("list", { name: `Jugadores del equipo ${team}` })
        .getByRole("button"),
    ).toHaveCount(1);
  }
  const { api, board, formation, get } = await apiFor(page);
  let state = await get();
  const a = state.players.find((p: any) => p.team === "A");
  const b = state.players.find((p: any) => p.team === "B");
  const remoteContext = await browser.newContext();
  const remote = await remoteContext.newPage();
  try {
    await open(remote, "Otra táctica", page.url());
    for (const p of [page, remote]) {
      await p
        .getByRole("button", { name: "Preparar jugada", exact: true })
        .click();
      await p.getByLabel("Jugador para la jugada").selectOption(a.id);
    }
    await waypoint(remote, 0.3, 0.3);
    await waypoint(page, 0.4, 0.4);
    await waypoint(page, 0.65, 0.3);
    await page
      .getByRole("button", { name: "Guardar recorrido", exact: true })
      .click();
    await expect
      .poll(async () => (await get()).tactics.routes[a.id]?.length ?? 0)
      .toBe(2);
    await remote
      .getByRole("button", { name: "Guardar recorrido", exact: true })
      .click();
    await expect(remote.getByRole("alert")).toContainText("La jugada cambió");
    await remote
      .getByRole("button", { name: "Recargar recorrido", exact: true })
      .click();
    await expect(
      remote.getByText("2/24 puntos", { exact: true }),
    ).toBeVisible();
    await remote
      .getByRole("button", { name: "Preparar jugada", exact: true })
      .click();
    await page.getByLabel("Jugador para la jugada").selectOption(b.id);
    await waypoint(page, 0.7, 0.7);
    await page
      .getByRole("button", { name: "Guardar recorrido", exact: true })
      .click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(2);
    const handle = await pitchPoint(page, 0.7, 0.7);
    const moved = await pitchPoint(page, 0.75, 0.65);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(moved.x, moved.y, { steps: 12 });
    await page.mouse.up();
    await expect(
      page.getByRole("button", { name: "Guardar recorrido", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Guardar recorrido", exact: true })
      .click();
    await expect
      .poll(async () => (await get()).tactics.routes[b.id][0].x)
      .toBeCloseTo(0.75, 2);
    const duration = page.getByLabel("Duración de la jugada en segundos");
    await duration.fill("2");
    await duration.press("Tab");
    await expect.poll(async () => (await get()).tactics.duration_ms).toBe(2000);
    await page
      .getByRole("button", { name: "Preparar jugada", exact: true })
      .click();
    const before = await get();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (
        /\/rpc\/(edit_tactics|change_player_v2|quick_add_v2)/.test(
          request.url(),
        )
      )
        writes.push(request.url());
    });
    await page
      .getByRole("button", { name: "Reproducir jugada", exact: true })
      .click();
    await page.clock.runFor(500);
    const ballStart = await pitchPoint(page, 0.5, 0.5);
    const ballTarget = await pitchPoint(page, 0.2, 0.6);
    await page.mouse.move(ballStart.x, ballStart.y);
    await page.mouse.down();
    await page.mouse.move(ballTarget.x, ballTarget.y, { steps: 8 });
    await page.mouse.up();
    await page.clock.runFor(32);
    expect(
      await page
        .locator(".field-wrap canvas")
        .last()
        .evaluate((el, point) => {
          const canvas = el as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          const color = canvas
            .getContext("2d")!
            .getImageData(
              Math.round(
                ((point.x + 7 - rect.left) * canvas.width) / rect.width,
              ),
              Math.round(
                ((point.y + 3 - rect.top) * canvas.height) / rect.height,
              ),
              1,
              1,
            ).data;
          return color[0] > 220 && color[1] > 220 && color[2] > 220;
        }, ballTarget),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Pausar jugada", exact: true })
      .click();
    const progress = Number(
      await page
        .getByRole("progressbar", { name: "Progreso de la jugada" })
        .getAttribute("value"),
    );
    expect(progress).toBeGreaterThan(0.15);
    expect(progress).toBeLessThan(0.5);
    await page.clock.runFor(800);
    expect(
      Number(
        await page
          .getByRole("progressbar", { name: "Progreso de la jugada" })
          .getAttribute("value"),
      ),
    ).toBe(progress);
    const expectedPosition = sampleTrack(
      buildTrack(a, before.tactics.routes[a.id]),
      progress,
    );
    await expect.poll(() => orangeAt(page, expectedPosition)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Preparar jugada", exact: true }),
    ).toBeDisabled();
    await expect(remote.getByRole("progressbar")).toHaveCount(0);
    await expect.poll(() => orangeAt(remote, a)).toBe(true);
    await page
      .getByRole("button", { name: "Continuar jugada", exact: true })
      .click();
    await page.clock.runFor(2500);
    await expect(
      page.getByText("Finalizada · reiniciá para volver", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => orangeAt(page, before.tactics.routes[a.id].at(-1)))
      .toBe(true);
    expect((await get()).players).toEqual(before.players);
    expect(writes).toHaveLength(0);
    await page
      .getByRole("button", { name: "Reiniciar jugada", exact: true })
      .click();
    await page.clock.runFor(32);
    await expect.poll(() => orangeAt(page, a)).toBe(true);
    await page.clock.resume();
    const toggle = page.getByRole("switch", { name: "Cancha horizontal" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect((await get()).tactics).toEqual(before.tactics);
    await toggle.click();
    await page
      .getByRole("button", {
        name: "Limpiar todos los recorridos",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    expect(Object.keys((await get()).tactics.routes)).toHaveLength(2);
    await page
      .getByRole("button", {
        name: "Limpiar todos los recorridos",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar", exact: true })
      .click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(0);
    await page.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(2);
    await page.getByRole("button", { name: "Rehacer", exact: true }).click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(0);
    await page.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(2);
    await page
      .getByRole("button", { name: "Preparar jugada", exact: true })
      .click();
    await page.getByLabel("Jugador para la jugada").selectOption(a.id);
    await page
      .getByRole("button", {
        name: "Eliminar recorrido seleccionado",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(1);
    await page.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect
      .poll(async () => Object.keys((await get()).tactics.routes).length)
      .toBe(2);
    await page
      .getByRole("button", { name: "Preparar jugada", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Duplicar formación", exact: true })
      .click();
    await expect(page).not.toHaveURL(
      new RegExp(`/p/${new URL(remote.url()).pathname.split("/").pop()}$`),
    );
    const copiedLink = await api.rpc("open_board_link", {
      p_code: new URL(page.url()).pathname.split("/").pop(),
    });
    expect(copiedLink.error).toBeNull();
    const copy = await get(copiedLink.data.formation_id);
    expect(copy.formation.id).not.toBe(formation);
    expect(copy.tactics.duration_ms).toBe(2000);
    expect(Object.keys(copy.tactics.routes)).toHaveLength(2);
    for (const player of copy.players)
      expect(copy.tactics.routes[player.id]).toEqual(
        before.tactics.routes[player.team === "A" ? a.id : b.id],
      );
    await page.reload();
    await expect(page.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await expect(
      page.getByRole("region", { name: "Jugada táctica" }).getByRole("status"),
    ).toContainText("2 recorridos");
    const copiedPlayer = copy.players[0];
    await page
      .getByRole("button", {
        name: `Editar ${copiedPlayer.name}, número ${copiedPlayer.number}, equipo ${copiedPlayer.team}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Enviar al banco", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          Object.keys((await get(copy.formation.id)).tactics.routes).length,
      )
      .toBe(1);
    expect(Object.keys((await get()).tactics.routes)).toHaveLength(2);
    expect(copy.board.id).toBe(board);
    await page.screenshot({ path: "test-results/tactics-desktop.png" });
  } finally {
    await remoteContext.close();
  }
});

test("jugadas táctiles: puntos editables y sidebar fija con scroll en dos columnas", async ({
  browser,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  test.setTimeout(150000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await open(page, "Táctica táctil");
    await page
      .getByRole("button", {
        name: "Agregar jugador del equipo A",
        exact: true,
      })
      .tap();
    await expect(page.locator(".roster-player")).toHaveCount(1);
    const { api, board, formation, get } = await apiFor(page);
    const player = (await get()).players[0];
    const sidebarHeight = (await page.locator(".sidebar").boundingBox())!
      .height;
    await page.getByRole("switch", { name: "Cancha horizontal" }).tap();
    await page
      .getByRole("button", { name: "Preparar jugada", exact: true })
      .tap();
    await page.getByLabel("Jugador para la jugada").selectOption(player.id);
    const point = await pitchPoint(page, 0.5, 0.5);
    await page.touchscreen.tap(point.x, point.y);
    await page
      .getByRole("button", { name: "Guardar recorrido", exact: true })
      .tap();
    await expect
      .poll(async () => (await get()).tactics.routes[player.id]?.length ?? 0)
      .toBe(1);
    const target = await pitchPoint(page, 0.5, 0.4);
    const touch = await context.newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...point, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x + 6, y: point.y - 6, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...target, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByRole("button", { name: "Guardar recorrido", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Guardar recorrido", exact: true })
      .tap();
    await expect
      .poll(async () => (await get()).tactics.routes[player.id][0].x)
      .toBeCloseTo(0.6, 2);
    for (const team of ["A", "B"]) {
      for (let i = 0; i < 9; i++) {
        const result = await api.rpc("quick_add_v2", {
          p_board: board,
          p_formation: formation,
          p_id: crypto.randomUUID(),
          p_team: team,
          p_x: 0.2 + i * 0.06,
          p_y: team === "A" ? 0.7 : 0.3,
          p_placement: "field",
        });
        expect(result.error).toBeNull();
      }
    }
    await expect(page.locator(".roster-player")).toHaveCount(19);
    expect((await page.locator(".sidebar").boundingBox())!.height).toBe(
      sidebarHeight,
    );
    expect(
      await page
        .locator(".team-columns")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    const before = (await page
      .getByRole("region", { name: "Jugada táctica" })
      .boundingBox())!;
    await page.locator(".team-columns").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(
      (await page
        .getByRole("region", { name: "Jugada táctica" })
        .boundingBox())!.y,
    ).toBe(before.y);
    for (const [width, height] of [
      [390, 844],
      [360, 640],
      [844, 390],
      [320, 568],
    ]) {
      await page.setViewportSize({ width, height });
      for (const name of [
        "Preparar jugada",
        "Reproducir jugada",
        "Guardar recorrido",
      ])
        await expect(
          page.getByRole("button", { name, exact: true }),
        ).toBeInViewport();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".team-columns")
          .evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
          ),
      ).toBe(2);
      expect(
        await page.locator(".team-columns").evaluate((el) => el.clientHeight),
      ).toBeGreaterThanOrEqual(34);
      await page.locator(".team-columns").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(
        page.locator(".team-list").first().locator(".roster-player").last(),
      ).toBeInViewport({ ratio: 0.98 });
      await page
        .getByRole("button", { name: "Preparar jugada", exact: true })
        .tap();
      expect(
        await page.locator(".team-columns").evaluate((el) => el.clientHeight),
        `Listado sin modo táctico: ${width}x${height}`,
      ).toBeGreaterThanOrEqual(34);
      await page
        .getByRole("button", { name: "Preparar jugada", exact: true })
        .tap();
    }
    await page.screenshot({ path: "test-results/tactics-mobile.png" });
  } finally {
    await context.close();
  }
});
