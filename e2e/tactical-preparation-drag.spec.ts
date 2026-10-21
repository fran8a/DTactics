import { test, expect } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";
import { pitchPoint } from "./pitch";
import { createClient } from "@supabase/supabase-js";

test("Supabase real: persiste el arrastre de jugadores con y sin recorrido mientras se edita", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real",
  );
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Arrastre en preparación");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const session = await page.evaluate(() =>
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
  expect((await api.auth.setSession(session)).error).toBeNull();
  const resolved = await api.rpc("open_board_link", {
    p_code: new URL(page.url()).pathname.split("/").pop(),
  });
  expect(resolved.error).toBeNull();
  const { board_id, formation_id } = resolved.data;
  const get = async () => {
    const result = await api.rpc("formation_snapshot", {
      p_board: board_id,
      p_formation: formation_id,
    });
    expect(result.error).toBeNull();
    return result.data;
  };
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  for (const [i, team] of ["A", "B"].entries()) {
    expect(
      (
        await api.rpc("quick_add_v2", {
          p_board: board_id,
          p_formation: formation_id,
          p_id: ids[i],
          p_team: team,
          p_x: i ? 0.6 : 0.3,
          p_y: i ? 0.3 : 0.65,
          p_placement: "field",
        })
      ).error,
    ).toBeNull();
  }
  for (const team of ["A", "B"]) {
    await expect(
      page
        .getByRole("list", { name: `Jugadores del equipo ${team}` })
        .getByRole("button"),
    ).toHaveCount(1);
  }
  const prepare = page.getByRole("button", {
    name: "Preparar jugada",
    exact: true,
  });
  await prepare.click();
  const selector = page.getByRole("combobox", {
    name: "Jugador para la jugada",
  });
  await selector.selectOption(ids[0]);
  const destination = await pitchPoint(page, 0.8, 0.2);
  await page.mouse.click(destination.x, destination.y);
  await expect
    .poll(async () => (await get()).tactics.routes[ids[0]])
    .toEqual([{ x: expect.closeTo(0.8, 2), y: expect.closeTo(0.2, 2) }]);
  await selector.selectOption(ids[0]);
  const before = (await get()).tactics;
  for (const [index, origin, target] of [
    [1, [0.6, 0.3], [0.7, 0.4]],
    [0, [0.3, 0.65], [0.2, 0.6]],
  ] as const) {
    const start = await pitchPoint(page, ...origin);
    const end = await pitchPoint(page, ...target);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const player = (await get()).players.find(
          (p: any) => p.id === ids[index],
        );
        return [player.x, player.y];
      })
      .toEqual([expect.closeTo(target[0], 2), expect.closeTo(target[1], 2)]);
    await expect(prepare).toHaveAttribute("aria-pressed", "true");
    await expect(selector).toHaveValue(ids[0]);
  }
  expect((await get()).tactics).toEqual(before);
});

test("arrastra jugadores sin recorrido durante la preparación sin modificar la jugada seleccionada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await themeBoardFixture(page, 0, true);
  await page.goto(
    "/board/00000000-0000-4000-8000-000000000001?token=tttttttttttttttttttttttttttttttt",
  );
  await page
    .getByRole("button", { name: "Preparar jugada", exact: true })
    .click();
  const selector = page.getByRole("combobox", {
    name: "Jugador para la jugada",
  });
  await selector.selectOption("player-1");
  const source = await pitchPoint(page, 0.6, 0.3);
  const target = await pitchPoint(page, 0.75, 0.4);
  const tokenAt = (point: { x: number; y: number }) =>
    page
      .locator(".field-wrap canvas")
      .last()
      .evaluate((canvas: HTMLCanvasElement, p) => {
        const rect = canvas.getBoundingClientRect();
        const pixel = canvas
          .getContext("2d")!
          .getImageData(
            Math.round(((p.x - rect.left) * canvas.width) / rect.width),
            Math.round(((p.y - rect.top - 12) * canvas.height) / rect.height),
            1,
            1,
          ).data;
        return pixel[3] > 240;
      }, point);
  await expect.poll(() => tokenAt(source)).toBe(true);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect.poll(() => tokenAt(target)).toBe(true);
  await page.mouse.up();
  await expect.poll(() => tokenAt(source)).toBe(false);
  await expect.poll(() => tokenAt(target)).toBe(true);
  await expect(selector).toHaveValue("player-1");
  await expect(page.locator(".tactics-footer")).toContainText("1 recorrido");
  await expect(
    page.getByRole("button", { name: "Preparar jugada", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // The selected player can also move, preserving its existing route.
  const participant = await pitchPoint(page, 0.3, 0.65);
  await page.mouse.move(participant.x, participant.y);
  await page.mouse.down();
  await page.mouse.move(source.x, source.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => tokenAt(participant)).toBe(false);
  await expect.poll(() => tokenAt(source)).toBe(true);
  await expect(selector).toHaveValue("player-1");
  await expect(page.locator(".tactics-footer")).toContainText("1 recorrido");
});
