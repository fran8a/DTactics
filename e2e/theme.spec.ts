import { test, expect, type Page } from "@playwright/test";
import { themeBoardFixture } from "./theme-fixture";

const key = "bizarron.theme.v1";
const toggle = (page: Page) =>
  page.getByRole("switch", { name: "Modo nocturno" });

async function readable(page: Page, selector: string) {
  const colors = await page.locator(selector).evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getBoundingClientRect().width)
      .map((node) => {
        let parent: Element | null = node;
        let background = "";
        while (parent) {
          background = getComputedStyle(parent).backgroundColor;
          if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent")
            break;
          parent = parent.parentElement;
        }
        return {
          text: node.textContent?.trim().slice(0, 45) || node.tagName,
          foreground: getComputedStyle(node).color,
          background,
        };
      }),
  );
  const luminance = (rgb: string) => {
    const values = rgb
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  for (const color of colors) {
    const [low, high] = [
      luminance(color.foreground),
      luminance(color.background),
    ].sort((a, b) => a - b);
    expect((high + 0.05) / (low + 0.05), color.text).toBeGreaterThanOrEqual(
      4.5,
    );
  }
}

test("el tema del sistema se aplica antes de cargar React y la elección se conserva", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route("**/src/main.tsx*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator("html")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(16, 24, 20)");
  unblock();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await toggle(page).focus();
  await page.keyboard.press("Space");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "light",
  );
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f5f5ed",
  );
});

test("sigue los cambios del sistema hasta que se elige manualmente", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await toggle(page).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
});

test("sincroniza pestañas y funciona con almacenamiento bloqueado", async ({
  page,
  context,
  browser,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await toggle(page).click();
  await expect(toggle(other)).toHaveAttribute("aria-checked", "true");
  await other.close();
  const blocked = await browser.newContext({ colorScheme: "dark" });
  try {
    const isolated = await blocked.newPage();
    await isolated.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("Blocked", "SecurityError");
      };
      Storage.prototype.setItem = () => {
        throw new DOMException("Blocked", "SecurityError");
      };
    });
    await isolated.goto("/");
    await expect(toggle(isolated)).toHaveAttribute("aria-checked", "true");
    await toggle(isolated).click();
    await expect(toggle(isolated)).toHaveAttribute("aria-checked", "false");
  } finally {
    await blocked.close();
  }
});

test("home legible en ambos temas sin reducir el título ni la animación", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const dimensions = () =>
    page.evaluate(() => ({
      title: getComputedStyle(document.querySelector("h1")!).fontSize,
      pitch: getComputedStyle(document.querySelector(".illustration-pitch")!)
        .height,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
  const light = await dimensions();
  for (const mode of ["light", "dark"]) {
    if (mode === "dark") await toggle(page).click();
    await readable(
      page,
      ".description, .step p, .step h3, .step-top span, .no-registration, .nav-link, .hero-cta",
    );
    await page.screenshot({ path: `test-results/theme-home-${mode}.png` });
    await page.locator(".nav-link").click();
    await expect(page.locator(".step").first()).toHaveAttribute(
      "aria-current",
      "step",
    );
    await readable(page, ".step-active p, .step-active .step-top span");
  }
  expect(await dimensions()).toEqual(light);
  expect(light.width).toBe(1366);
  expect(light.height).toBe(768);
  const scene = page.locator(".pitch-solid");
  const before = await scene.getAttribute("style");
  await page.locator(".pitch-scene").focus();
  await page.keyboard.press("ArrowRight");
  await expect(scene).not.toHaveAttribute("style", before!);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ["dark", "light"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== mode)
        await toggle(page).click();
      await expect(toggle(page)).toBeInViewport();
      await readable(page, ".description, .step p, .nav-link, .hero-cta");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: `test-results/theme-home-mobile-${mode}-${width}.png`,
        fullPage: true,
      });
    }
  }
});

test("pizarra: colores de canvas, formularios, jugadas y navegación en ambos temas", async ({
  page,
}) => {
  await themeBoardFixture(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/p/tttttttttttttttttttttttttttttttt");
  await expect(page.locator(".field-wrap canvas")).toHaveCount(3);
  const grass: number[][] = [];
  for (const mode of ["light", "dark"]) {
    if (mode === "dark") await toggle(page).click();
    grass.push(
      await page.locator(".field-wrap").evaluate((node) => {
        const canvas = node.querySelector("canvas")!;
        const rect = canvas.getBoundingClientRect();
        const x =
          Number((node as HTMLElement).dataset.pitchLeft) +
          Number((node as HTMLElement).dataset.pitchWidth) * 0.1;
        const y =
          Number((node as HTMLElement).dataset.pitchTop) +
          Number((node as HTMLElement).dataset.pitchHeight) * 0.2;
        return [
          ...canvas
            .getContext("2d")!
            .getImageData(
              (x * canvas.width) / rect.width,
              (y * canvas.height) / rect.height,
              1,
              1,
            ).data,
        ];
      }),
    );
    await readable(
      page,
      ".error-banner > span, .roster-player, .roster-empty, .format-label, .tactics-hint, .connection, .pitch-caption > span",
    );
    await page.screenshot({ path: `test-results/theme-board-${mode}.png` });
    await page.locator(".roster-player").first().click();
    await expect(page.getByLabel("Nombre del jugador")).toBeFocused();
    await readable(
      page,
      ".modal h2, .modal label, .modal input, .modal .team-option, .modal .danger",
    );
    await page.screenshot({
      path: `test-results/theme-player-modal-${mode}.png`,
    });
    await page.getByLabel("Nombre del jugador").fill(`Jugador ${mode}`);
    await page.getByLabel("Nombre del jugador").press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".roster-player").first()).toContainText(
      `Jugador ${mode}`,
    );
    await page.getByRole("button", { name: "Preparar jugada" }).click();
    await page.getByLabel("Jugador para la jugada").selectOption("player-1");
    await readable(page, ".tactics-editor select, .tactics-hint");
    await page.getByRole("button", { name: "Preparar jugada" }).click();
    await page.getByRole("button", { name: "Reproducir jugada" }).click();
    await expect(
      page.getByRole("button", { name: "Pausar jugada" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Reiniciar jugada" }).click();
  }
  expect(grass[0]).not.toEqual(grass[1]);
  await page.getByRole("switch", { name: "Cancha horizontal" }).click();
  await expect(page.locator(".field-wrap")).toHaveAttribute(
    "data-horizontal",
    "true",
  );
  for (const [width, height] of [
    [390, 844],
    [320, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    for (const mode of ["dark", "light"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== mode)
        await toggle(page).click();
      await expect(toggle(page)).toBeInViewport();
      await expect(
        page.getByRole("button", { name: "Copiar enlace" }),
      ).toBeInViewport();
      await readable(page, ".roster-player, .format-label, .connection");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: `test-results/theme-board-mobile-${mode}-${width}.png`,
      });
    }
  }
  await toggle(page).click();
  await page.locator(".back").click();
  await expect(page.locator(".home")).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});
