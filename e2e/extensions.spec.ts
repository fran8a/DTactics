import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
async function openBoard(p: Page, name: string, invite?: string) {
  await p.goto(invite ?? "/");
  if (!invite)
    await p.getByRole("button", { name: "Crear tablero", exact: true }).click();
  await p.getByLabel("Tu nombre o apodo").fill(name);
  await p.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(p.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
}
async function add(p: Page, team = "A") {
  await p
    .getByRole("button", {
      name: `Agregar jugador del equipo ${team}`,
      exact: true,
    })
    .filter({ visible: true })
    .click();
  await expect(
    p.getByRole("button", { name: "Deshacer", exact: true }),
  ).toBeEnabled();
}
test("ampliación colaborativa: banco, historial, formaciones, enlaces y atajos", async ({
  browser,
}) => {
  test.skip(!url || !key, "Requiere Supabase real.");
  test.setTimeout(240000);
  const a = await browser.newContext({
      viewport: { width: 1280, height: 1500 },
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
  try {
    await openBoard(pa, "Fran extensiones");
    const sidebar = pa.getByRole("complementary", {
      name: "Herramientas del pizarrón",
    });
    await expect(
      sidebar.getByRole("button", { name: "Fútbol 7", exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Nueva formación", exact: true }),
    ).toBeVisible();
    await expect(sidebar.locator(".board-title")).toBeVisible();
    const sideBox = (await sidebar.boundingBox())!,
      pitchBox = (await pa.locator(".pitch-panel").boundingBox())!;
    expect(sideBox.x + sideBox.width).toBeLessThanOrEqual(pitchBox.x + 1);
    const invite = pa.url();
    await openBoard(pb, "Guido extensiones", invite);
    await add(pa);
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pa.keyboard.press("Control+z");
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(0);
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(0);
    await pa.keyboard.press("Control+y");
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pa.locator(".player-row:not(.off-field)").click();
    await pa.getByLabel("Nombre del jugador").fill("Ochoa");
    await pa.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(pb.locator(".player-row:not(.off-field)")).toContainText(
      "Ochoa",
    );
    await pa.locator(".player-row:not(.off-field)").click();
    await pa
      .getByRole("button", { name: "Enviar al banco", exact: true })
      .click();
    await expect(pb.locator(".player-row.off-field")).toHaveCount(1);
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(0);
    await expect(
      pa.getByRole("button", { name: "Deshacer", exact: true }),
    ).toBeEnabled();
    await pa.keyboard.press("Control+z");
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pa.keyboard.press("Control+Shift+z");
    await expect(pb.locator(".player-row.off-field")).toHaveCount(1);
    await pb.locator(".player-row.off-field").click();
    await pb.getByLabel("Nombre del jugador").fill("Ochoa suplente");
    await pb.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(pa.locator(".player-row.off-field")).toContainText(
      "Ochoa suplente",
    );
    await pa.keyboard.press("Control+z");
    await expect(pa.getByRole("alert")).toContainText("cambios posteriores");
    await expect(pb.locator(".player-row.off-field")).toContainText(
      "Ochoa suplente",
    );
    await pb.locator(".player-row.off-field").click();
    await pb
      .getByRole("button", { name: "Ingresar a la cancha", exact: true })
      .click();
    await expect(pa.locator(".player-row:not(.off-field)")).toContainText(
      "Ochoa suplente",
    );
    // Delete and restore all player data, then send to the bench again.
    await pa.locator(".player-row:not(.off-field)").click();
    await pa
      .getByRole("button", { name: "Eliminar jugador", exact: true })
      .click();
    await pa.getByRole("button", { name: "Sí, eliminar jugador" }).click();
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(0);
    await pa.keyboard.press("Control+z");
    await expect(pb.locator(".player-row:not(.off-field)")).toContainText(
      "Ochoa suplente",
    );
    await pa.locator(".player-row:not(.off-field)").click();
    await pa
      .getByRole("button", { name: "Enviar al banco", exact: true })
      .click();
    await expect(pb.locator(".player-row.off-field")).toHaveCount(1);
    await pa
      .getByRole("button", { name: "Duplicar formación", exact: true })
      .click();
    await expect(
      pa.getByRole("tab", { name: "Copia de Original", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      pb.getByRole("tab", { name: "Original", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      pa.getByRole("button", { name: "Deshacer", exact: true }),
    ).toBeDisabled();
    await expect(pa.locator(".player-row.off-field")).toContainText(
      "Ochoa suplente",
    );
    await pa.locator(".player-row.off-field").click();
    await pa
      .getByRole("button", { name: "Ingresar a la cancha", exact: true })
      .click();
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(0);
    await expect(pb.locator(".player-row.off-field")).toHaveCount(1);
    await pa.keyboard.press("Control+z");
    await expect(pa.locator(".player-row.off-field")).toHaveCount(1);
    await expect(
      pa.getByRole("button", { name: "Rehacer", exact: true }),
    ).toBeEnabled();
    await pa
      .getByRole("button", { name: "Nueva formación", exact: true })
      .click();
    await expect(
      pa.getByRole("tab", { name: "Nueva formación", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(pa.locator(".player-row.off-field")).toHaveCount(0);
    await expect(
      pa.getByRole("button", { name: "Deshacer", exact: true }),
    ).toBeDisabled();
    await pa.getByRole("button", { name: "Renombrar", exact: true }).click();
    await pa.getByLabel("Nombre de la formación").fill("Segundo tiempo");
    await pa
      .getByRole("button", { name: "Guardar nombre de formación", exact: true })
      .click();
    await expect(
      pb.getByRole("tab", { name: "Segundo tiempo", exact: true }),
    ).toBeVisible();
    await add(pa, "B");
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(1);
    const secondURL = pa.url();
    expect(new URL(secondURL).searchParams.get("access")).toBe(
      new URL(invite).searchParams.get("access"),
    );
    await pa.keyboard.press("Meta+z");
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(0);
    await pa.keyboard.press("Meta+Shift+z");
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(1);
    // Editable targets keep the browser's own text undo shortcuts.
    const intercepted = await pa.evaluate(() => {
      return ["textarea", "div"].map((tag) => {
        const editable = document.createElement(tag);
        if (tag === "div") editable.contentEditable = "true";
        document.body.append(editable);
        const event = new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        editable.dispatchEvent(event);
        editable.remove();
        return event.defaultPrevented;
      });
    });
    expect(intercepted).toEqual([false, false]);
    await pa.locator(".player-row:not(.off-field)").click();
    await pa.getByLabel("Nombre del jugador").pressSequentially(" texto");
    await pa.keyboard.press("Control+z");
    await expect(pa.getByRole("dialog")).toBeVisible();
    await pa.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pa
      .getByRole("tab", { name: "Copia de Original", exact: true })
      .click();
    await expect(
      pa.getByRole("button", { name: "Rehacer", exact: true }),
    ).toBeEnabled();
    await pa.getByRole("button", { name: "Rehacer", exact: true }).click();
    await expect(pa.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pb
      .getByRole("tab", { name: "Copia de Original", exact: true })
      .click();
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pa
      .getByRole("button", { name: "Eliminar formación", exact: true })
      .click();
    await pa
      .getByRole("button", { name: "Sí, eliminar formación", exact: true })
      .click();
    await expect(
      pb.getByRole("tab", { name: "Copia de Original", exact: true }),
    ).toHaveCount(0);
    await expect(
      pb.getByRole("tab", { name: "Original", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await pb.goto(secondURL);
    await expect(
      pb.getByRole("tab", { name: "Segundo tiempo", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await pb.reload();
    await expect(pb.locator(".player-row:not(.off-field)")).toHaveCount(1);
    await expect(
      pb.getByRole("tab", { name: "Segundo tiempo", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      pa.getByRole("tab", { name: "Original", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(pa.locator(".player-row.off-field")).toContainText(
      "Ochoa suplente",
    );
    await pa.screenshot({
      path: "test-results/extensions-desktop.png",
      fullPage: true,
    });
    await pb.screenshot({
      path: "test-results/extensions-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test("concurrencia real: jugadores distintos, conflicto, undo contra edición y duplicados atómicos", async () => {
  test.skip(!url || !key, "Requiere Supabase real.");
  test.setTimeout(90000);
  const a = createClient(url!, key!, { auth: { persistSession: false } }),
    b = createClient(url!, key!, { auth: { persistSession: false } });
  for (const c of [a, b])
    expect((await c.auth.signInAnonymously()).error).toBeNull();
  const created = await a.rpc("create_board");
  expect(created.error).toBeNull();
  const board = created.data.id;
  expect(
    (await b.rpc("join_board", { p_board: board, p_token: created.data.token }))
      .error,
  ).toBeNull();
  const initial = await a.rpc("board_snapshot", { p_board: board });
  const formation = initial.data.formation.id;
  const get = async () => {
    const r = await a.rpc("formation_snapshot", {
      p_board: board,
      p_formation: formation,
    });
    expect(r.error).toBeNull();
    return r.data;
  };
  const quick = async (id: string) => {
    const r = await a.rpc("quick_add_v2", {
      p_board: board,
      p_formation: formation,
      p_id: id,
      p_team: "A",
      p_x: 0.3,
      p_y: 0.6,
    });
    expect(r.error).toBeNull();
    return r.data;
  };
  const p = crypto.randomUUID(),
    q = crypto.randomUUID();
  await quick(p);
  await quick(q);
  const edit = (c: typeof a, id: string, version: number, name: string) =>
    c.rpc("change_player_v2", {
      p_board: board,
      p_formation: formation,
      p_action: "update",
      p_id: id,
      p_data: { name, number: 9, team: "A" },
      p_version: version,
      p_operation: crypto.randomUUID(),
    });
  let results = await Promise.all([
    edit(a, p, 1, "Fran"),
    edit(b, q, 1, "Guido"),
  ]);
  expect(results.every((r) => !r.error)).toBe(true);
  results = await Promise.all([
    edit(a, p, 2, "Fran posterior"),
    edit(b, p, 2, "Guido posterior"),
  ]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  let s = await get();
  const mine = await edit(
    a,
    p,
    s.players.find((r: any) => r.id === p).version,
    "Acción reversible",
  );
  expect(mine.error).toBeNull();
  const op = mine.data.operation;
  const race = await Promise.all([
    a.rpc("reverse_operation", {
      p_board: board,
      p_formation: formation,
      p_operation: op.id,
      p_direction: "undo",
    }),
    edit(
      b,
      p,
      mine.data.players.find((r: any) => r.id === p).version,
      "Edición concurrente de Guido",
    ),
  ]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  s = await get();
  if (!race[1].error)
    expect(s.players.find((r: any) => r.id === p).name).toBe(
      "Edición concurrente de Guido",
    );
  else
    expect(s.players.find((r: any) => r.id === p).name).toBe(
      op.before_data.name,
    );
  const copies = await Promise.all(
    [a, b].map((c) =>
      c.rpc("manage_formation", {
        p_board: board,
        p_action: "duplicate",
        p_id: crypto.randomUUID(),
        p_source: formation,
      }),
    ),
  );
  expect(copies.every((r) => !r.error)).toBe(true);
  expect(copies[0].data.formation.id).not.toBe(copies[1].data.formation.id);
  expect(
    copies[0].data.players
      .map((p: any) => p.id)
      .some((id: string) =>
        copies[1].data.players.some((p: any) => p.id === id),
      ),
  ).toBe(false);
  expect((await get()).formations).toHaveLength(3);
});
