import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";

test("el encabezado transparente no intercepta el arrastre de suplentes arriba", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Encabezado y banco");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  await page.getByRole("switch", { name: "Cancha horizontal" }).click();
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
  const link = await api.rpc("open_board_link", {
    p_code: new URL(page.url()).pathname.split("/").pop(),
  });
  expect(link.error).toBeNull();
  const get = async () => {
    const response = await api.rpc("formation_snapshot", {
      p_board: link.data.board_id,
      p_formation: link.data.formation_id,
    });
    expect(response.error).toBeNull();
    return response.data;
  };
  await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .click();
  await expect(page.locator(".roster-player")).toHaveCount(1);
  const drag = async (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 6, from.y + 6);
    await expect.poll(async () => (await get()).locks.length).toBe(1);
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => (await get()).locks.length).toBe(0);
  };
  let player = (await get()).players[0];
  const origin = await pitchPoint(page, player.y, 1 - player.x);
  await drag(origin, await pitchPoint(page, 0.5, -0.3));
  player = (await get()).players[0];
  expect(player.placement).toBe("bench");
  const top = await pitchPoint(page, player.outside_y, 1 - player.outside_x);
  const heading = (await page.locator(".pitch-heading").boundingBox())!;
  expect(top.y).toBeGreaterThan(heading.y);
  expect(top.y).toBeLessThan(heading.y + heading.height);
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      top,
    ),
  ).toBe("CANVAS");
  await drag(top, await pitchPoint(page, 0.5, 0.5));
  expect((await get()).players[0].placement).toBe("field");
  const back = (await page.locator(".pitch-heading .back").boundingBox())!;
  expect(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("a"),
      { x: back.x + back.width / 2, y: back.y + back.height / 2 },
    ),
  ).toBe(true);
  await page.getByRole("switch", { name: "Cancha horizontal" }).click();
  await expect(
    page.getByRole("switch", { name: "Cancha horizontal" }),
  ).toHaveAttribute("aria-checked", "false");
});
