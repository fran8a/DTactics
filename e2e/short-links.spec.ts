import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("enlaces cortos reutilizados por formación, acceso compartido, recarga y enlaces anteriores", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Requiere Supabase real.",
  );
  test.setTimeout(120000);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Crear tablero", exact: true })
    .click();
  await page.getByLabel("Tu nombre o apodo").fill("Enlace corto");
  await page.getByRole("button", { name: "Entrar a la cancha" }).click();
  await expect(page.locator(".connection")).toHaveText("Conectado", {
    timeout: 30000,
  });
  await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]{32}$/);
  const first = page.url();
  const original = await page
    .locator('.formation-slot[aria-pressed="true"]')
    .getAttribute("aria-label");
  await page
    .getByRole("button", { name: "Agregar jugador del equipo A", exact: true })
    .click();
  await expect(page.locator(".roster-player")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Copiar enlace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copiar enlace", exact: true }),
  ).toContainText("¡Copiado!");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);

  const context = await browser.newContext();
  const remote = await context.newPage();
  try {
    await remote.goto(first);
    await remote.getByLabel("Tu nombre o apodo").fill("Otro participante");
    await remote.getByRole("button", { name: "Entrar a la cancha" }).click();
    await expect(remote.locator(".connection")).toHaveText("Conectado", {
      timeout: 30000,
    });
    await expect(remote.locator(".roster-player")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Nueva formación", exact: true })
      .click();
    await expect(page).not.toHaveURL(first);
    await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]{32}$/);
    const second = page.url();
    const secondLabel = await page
      .locator('.formation-slot[aria-pressed="true"]')
      .getAttribute("aria-label");
    await expect(page.locator(".roster-player")).toHaveCount(0);
    await expect(remote.locator(".roster-player")).toHaveCount(1);
    await page.getByRole("button", { name: original!, exact: true }).click();
    await expect(page).toHaveURL(first);
    await expect(page.locator(".roster-player")).toHaveCount(1);
    await page.getByRole("button", { name: secondLabel!, exact: true }).click();
    await expect(page).toHaveURL(second);
    await page.reload();
    await expect(page.locator(".connection")).toHaveText("Conectado");
    await expect(
      page.locator('.formation-slot[aria-pressed="true"]'),
    ).toHaveAttribute("aria-label", secondLabel!);
    await remote.goto(second);
    await expect(remote.locator(".connection")).toHaveText("Conectado");
    await expect(remote.locator(".roster-player")).toHaveCount(0);
    await expect(
      remote.locator('.formation-slot[aria-pressed="true"]'),
    ).toHaveAttribute("aria-label", secondLabel!);
  } finally {
    await context.close();
  }

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
  const legacy = await api.rpc("create_board");
  expect(legacy.error).toBeNull();
  const snapshot = await api.rpc("board_snapshot", { p_board: legacy.data.id });
  expect(snapshot.error).toBeNull();
  await page.goto(
    `/board/${legacy.data.id}?access=${legacy.data.token}&formation=${snapshot.data.formation.id}`,
  );
  await expect(page.locator(".connection")).toHaveText("Conectado");
  await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]{32}$/);
  const resolved = await api.rpc("open_board_link", {
    p_code: new URL(page.url()).pathname.split("/").pop(),
  });
  expect(resolved.error).toBeNull();
  expect(resolved.data).toEqual({
    board_id: legacy.data.id,
    formation_id: snapshot.data.formation.id,
  });
});
