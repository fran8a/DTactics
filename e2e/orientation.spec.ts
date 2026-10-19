import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { pitchPoint } from "./pitch";

async function orangeAt(page: Page, x: number, y: number) {
  const point = await pitchPoint(page, x, y);
  return page
    .locator(".field-wrap canvas")
    .nth(1)
    .evaluate((canvas: HTMLCanvasElement, point) => {
      const rect = canvas.getBoundingClientRect();
      const [r, g, b, a] = canvas
        .getContext("2d")!
        .getImageData(
          Math.round(((point.x - rect.left) * canvas.width) / rect.width),
          Math.round(((point.y - rect.top - 11) * canvas.height) / rect.height),
          1,
          1,
        ).data;
      return r > 220 && g > 100 && b < 120 && a > 240;
    }, point);
}

test("orientaciones distintas comparten posiciones, arrastre mouse/touch y persistencia", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  test.setTimeout(150000);
  const issues: string[] = [];
  const watch = (p: Page) => {
    p.on("pageerror", (error) => issues.push(error.message));
    p.on("console", (message) => {
      if (["warning", "error"].includes(message.type()))
        issues.push(message.text());
    });
  };
  watch(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Horizontal");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const invite = page.url(),
    parsed = new URL(invite);
  const stored = await page.evaluate(() =>
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
  expect((await api.auth.setSession(stored)).error).toBeNull();
  const get = async () => {
    const response = await api.rpc("formation_snapshot", {
      p_board: parsed.pathname.split("/").pop(),
      p_formation: parsed.searchParams.get("formation"),
    });
    expect(response.error).toBeNull();
    return response.data;
  };
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const remote = await mobile.newPage();
  watch(remote);
  try {
    await remote.goto(invite);
    await remote.getByLabel("Tu nombre o apodo").fill("Vertical");
    await remote.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(remote.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await expect(page.locator(".field-wrap")).toHaveAttribute(
      "data-horizontal",
      "true",
    );
    await expect(remote.locator(".field-wrap")).toHaveAttribute(
      "data-horizontal",
      "false",
    );
    const usedHeight = await page
      .locator(".field-wrap")
      .evaluate(
        (el) =>
          Number((el as HTMLElement).dataset.pitchHeight) / el.clientHeight,
      );
    expect(usedHeight).toBeGreaterThanOrEqual(0.85);

    for (const format of [7, 11]) {
      await page
        .getByRole("button", { name: `Fútbol ${format}`, exact: true })
        .click();
      await expect(
        remote.getByRole("button", { name: `Fútbol ${format}`, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const source = (await page
        .getByRole("button", {
          name: "Agregar jugador del equipo A",
          exact: true,
        })
        .boundingBox())!;
      const drop = await pitchPoint(page, 0.35, 0.65);
      await page.mouse.move(
        source.x + source.width / 2,
        source.y + source.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(drop.x, drop.y, { steps: 15 });
      await page.mouse.up();
      await expect.poll(async () => (await get()).players.length).toBe(1);
      let player = (await get()).players[0];
      expect(player.x).toBeCloseTo(0.35, 2);
      expect(player.y).toBeCloseTo(0.65, 2);
      await expect.poll(() => orangeAt(remote, 0.35, 0.65)).toBe(true);

      const start = await pitchPoint(page, player.x, player.y),
        target = await pitchPoint(page, 0.68, 0.3);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 8, start.y + 8);
      await expect.poll(async () => (await get()).locks.length).toBe(1);
      await page.mouse.move(target.x, target.y, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(async () => (await get()).players[0].x)
        .toBeCloseTo(0.68, 2);
      await expect.poll(() => orangeAt(remote, 0.68, 0.3)).toBe(true);
      await expect.poll(async () => (await get()).locks.length).toBe(0);

      const touch = await mobile.newCDPSession(remote);
      const touchStart = await pitchPoint(remote, 0.68, 0.3),
        touchEnd = await pitchPoint(remote, 0.45, 0.52);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...touchStart, id: 1 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: touchStart.x + 8, y: touchStart.y + 8, id: 1 }],
      });
      await expect.poll(async () => (await get()).locks.length).toBe(1);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...touchEnd, id: 1 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
      await expect
        .poll(async () => (await get()).players[0].x)
        .toBeCloseTo(0.45, 2);
      await expect
        .poll(async () => (await get()).players[0].y)
        .toBeCloseTo(0.52, 2);
      await expect.poll(async () => (await get()).locks.length).toBe(0);
      await expect.poll(() => orangeAt(page, 0.45, 0.52)).toBe(true);
      await page.reload();
      await remote.reload();
      await expect(page.locator(".connection")).toHaveText("Conectado");
      await expect(remote.locator(".connection")).toHaveText("Conectado");
      await expect.poll(() => orangeAt(page, 0.45, 0.52)).toBe(true);
      await expect.poll(() => orangeAt(remote, 0.45, 0.52)).toBe(true);
      player = (await get()).players[0];
      expect(player.x).toBeCloseTo(0.45, 2);
      expect(player.y).toBeCloseTo(0.52, 2);
      for (const p of [page, remote]) {
        const point = await pitchPoint(p, player.x, player.y);
        await p.mouse.dblclick(point.x, point.y);
        await expect(p.getByRole("dialog")).toBeVisible();
        await p.getByRole("button", { name: "Cerrar", exact: true }).click();
      }
      await page.screenshot({
        path: `test-results/orientation-${format}-desktop.png`,
      });
      await remote.screenshot({
        path: `test-results/orientation-${format}-mobile.png`,
      });
      expect(
        (
          await api.rpc("change_player_v2", {
            p_board: parsed.pathname.split("/").pop(),
            p_formation: parsed.searchParams.get("formation"),
            p_action: "delete",
            p_id: player.id,
            p_version: player.version,
            p_operation: crypto.randomUUID(),
          })
        ).error,
      ).toBeNull();
      await expect(
        remote.locator('.team-list option[value]:not([value=""])'),
      ).toHaveCount(0);
    }

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator(".field-wrap")).toHaveAttribute(
      "data-horizontal",
      "true",
    );
    await expect
      .poll(
        async () =>
          (await page.locator(".field-wrap canvas").first().boundingBox())!
            .width,
      )
      .toBeLessThanOrEqual(760);
    const before = (await page
      .locator(".field-wrap canvas")
      .first()
      .boundingBox())!.width;
    await page
      .getByRole("button", { name: "Ocultar herramientas", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect
      .poll(
        async () =>
          (await page.locator(".field-wrap canvas").first().boundingBox())!
            .width,
      )
      .toBeGreaterThan(before + 100);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Mostrar herramientas", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await page
      .getByRole("button", { name: "Mostrar herramientas", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toBeVisible();
    expect(issues).toEqual([]);
  } finally {
    await mobile.close();
  }
});
