import { expect, test } from "@playwright/test";

test("each launch reaches steps 1, 2, 3, 1, 2 in order before free physics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  for (let launch = 0; launch < 5; launch++) {
    await page.locator(".nav-link").click();
    const ball = page.locator(".physics-ball").nth(launch);
    const step = launch % 3;
    await expect(ball).toHaveAttribute("data-target-step", String(step + 1));
    const landing = await ball.evaluate(async (node, stepIndex) => {
      while (node.getAttribute("data-phase") !== "free")
        await new Promise(requestAnimationFrame);
      const rect = node.getBoundingClientRect();
      const target = document
        .querySelectorAll(".step-top span")
        [stepIndex].getBoundingClientRect();
      return Math.hypot(
        rect.x + rect.width / 2 - target.x - target.width / 2,
        rect.y + rect.height / 2 - target.y - target.height / 2,
      );
    }, step);
    expect(landing).toBeLessThan(12);
    await expect(page.locator(".step").nth(step)).toHaveAttribute(
      "aria-current",
      "step",
    );
  }
});

test("free balls collide with Create board without activating the button", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator(".nav-link").click();
  const ball = page.locator(".physics-ball");
  await expect(ball).toHaveAttribute("data-phase", "free");
  const box = (await ball.boundingBox())!;
  const cta = (await page.locator(".hero-cta").boundingBox())!;
  const center = cta.x + cta.width / 2;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(center, 740, { steps: 20 });
  await expect
    .poll(async () => {
      const b = (await ball.boundingBox())!;
      return Math.abs(b.x + b.width / 2 - center);
    })
    .toBeLessThan(10);
  await page.mouse.move(center, cta.y + cta.height / 2, { steps: 20 });
  await page.waitForTimeout(300);
  const blocked = (await ball.boundingBox())!;
  expect(blocked.y + blocked.height / 2).toBeGreaterThan(
    cta.y + cta.height + 17,
  );
  expect(blocked.y + blocked.height / 2).toBeLessThan(cta.y + cta.height + 30);
  await page.mouse.up();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
