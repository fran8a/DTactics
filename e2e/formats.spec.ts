import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test("formatos: 7 y 11 por lado, numeración desde 1 y cupos de titulares", async ({
  page,
  browser,
}) => {
  const url = process.env.VITE_SUPABASE_URL,
    key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !key, "Requiere Supabase real configurado.");
  test.setTimeout(150000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Formato E2E");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  const invite = page.url();
  const api = createClient(url!, key!, { auth: { persistSession: false } });
  expect((await api.auth.signInAnonymously()).error).toBeNull();
  const link = await api.rpc("open_board_link", {
    p_code: new URL(invite).pathname.split("/").pop(),
  });
  expect(link.error).toBeNull();
  const id = link.data.board_id;
  const get = async () => {
    const r = await api.rpc("board_snapshot", { p_board: id });
    expect(r.error).toBeNull();
    return r.data;
  };
  const quick = (team: "A" | "B") =>
    api.rpc("quick_add_player", {
      p_board: id,
      p_id: crypto.randomUUID(),
      p_team: team,
      p_x: Math.random() * 0.6 + 0.2,
      p_y: team === "A" ? 0.7 : 0.3,
    });
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    mp = await mobile.newPage();
  try {
    await mp.goto(invite);
    await mp.getByLabel("Tu nombre o apodo").fill("Formato móvil");
    await mp.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(mp.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await page.getByRole("button", { name: "Fútbol 7", exact: false }).click();
    await expect(
      mp.getByRole("button", { name: "Fútbol 7", exact: false }),
    ).toHaveAttribute("aria-pressed", "true");
    expect((await get()).board.players_per_team).toBe(7);
    for (let i = 0; i < 6; i++) {
      expect((await quick("A")).error).toBeNull();
      expect((await quick("B")).error).toBeNull();
    }
    const race = await Promise.all([quick("A"), quick("A")]);
    expect(race.filter((r) => !r.error)).toHaveLength(1);
    expect(race.find((r) => r.error)?.error?.message).toContain("7 jugadores");
    expect((await quick("B")).error).toBeNull();
    await expect(page.locator(".roster-player")).toHaveCount(14);
    for (const p of [page, mp]) {
      await expect(
        p.getByRole("button", { name: "Fútbol 11", exact: false }),
      ).toBeEnabled();
      for (const team of ["A", "B"])
        await expect(
          p
            .getByRole("button", {
              name: `Agregar jugador del equipo ${team}`,
              exact: true,
            })
            .filter({ visible: true }),
        ).toBeDisabled();
      await expect(p.getByText("Requiere pizarrón vacío.")).toHaveCount(0);
    }
    let state = await get();
    for (const team of ["A", "B"])
      expect(
        state.players
          .filter((p: any) => p.team === team)
          .map((p: any) => p.number)
          .sort((a: number, b: number) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const blocked = await api.rpc("change_format", {
      p_board: id,
      p_format: 5,
      p_version: state.board.version,
    });
    expect(blocked.error?.message).toContain("fútbol 7 o fútbol 11");
    const b = state.players.find((p: any) => p.team === "B");
    expect(
      (
        await api.rpc("change_player", {
          p_board: id,
          p_action: "update",
          p_id: b.id,
          p_data: { name: b.name, number: b.number, team: "A" },
          p_version: b.version,
        })
      ).error?.message,
    ).toContain("7 jugadores");
    await page.getByRole("button", { name: "Fútbol 11", exact: true }).click();
    await expect(
      mp.getByRole("button", { name: "Fútbol 11", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect((await quick("A")).error).toBeNull();
    state = await get();
    for (const p of [page, mp]) {
      await expect(
        p.getByRole("button", { name: "Fútbol 7", exact: true }),
      ).toBeDisabled();
    }
    expect(
      (
        await api.rpc("change_format", {
          p_board: id,
          p_format: 7,
          p_version: state.board.version,
        })
      ).error?.message,
    ).toContain("más de 7 titulares");
    const eighth = state.players.find(
      (p: any) => p.team === "A" && p.number === 8,
    );
    expect(
      (
        await api.rpc("change_player", {
          p_board: id,
          p_action: "placement",
          p_id: eighth.id,
          p_data: { placement: "bench" },
          p_version: eighth.version,
        })
      ).error,
    ).toBeNull();
    await expect(
      page.getByRole("button", { name: "Fútbol 7", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Fútbol 7", exact: true }).click();
    await expect(
      mp.getByRole("button", { name: "Fútbol 7", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    state = await get();
    expect(state.players).toHaveLength(15);
    expect(state.players.find((p: any) => p.id === eighth.id).placement).toBe(
      "bench",
    );
    await page.screenshot({
      path: "test-results/format-7-desktop.png",
      fullPage: true,
    });
    await mp.screenshot({
      path: "test-results/format-7-mobile.png",
      fullPage: true,
    });
    for (const player of state.players)
      expect(
        (
          await api.rpc("change_player", {
            p_board: id,
            p_action: "delete",
            p_id: player.id,
            p_version: player.version,
          })
        ).error,
      ).toBeNull();
    await expect(page.locator(".roster-player")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Fútbol 11", exact: false }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Fútbol 11", exact: false }).click();
    await expect(
      mp.getByRole("button", { name: "Fútbol 11", exact: false }),
    ).toHaveAttribute("aria-pressed", "true");
    for (let i = 0; i < 11; i++)
      for (const team of ["A", "B"] as const)
        expect((await quick(team)).error).toBeNull();
    state = await get();
    for (const team of ["A", "B"])
      expect(
        state.players
          .filter((p: any) => p.team === team)
          .map((p: any) => p.number)
          .sort((a: number, b: number) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const team of ["A", "B"] as const)
      expect((await quick(team)).error?.message).toContain("11 jugadores");
    await expect(page.locator(".roster-player")).toHaveCount(22);
    await expect(mp.locator(".roster-player")).toHaveCount(22);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Fútbol 11", exact: false }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".roster-player")).toHaveCount(22);
    await page.screenshot({
      path: "test-results/format-11-desktop.png",
      fullPage: true,
    });
  } finally {
    await mobile.close();
  }
});
