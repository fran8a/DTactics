import type { Locator } from "@playwright/test";

/** Open the editor through the compact team selector. */
export async function editPlayer(option: Locator) {
  const value = await option.getAttribute("value");
  if (!value) throw new Error("Player option has no id");
  await option.locator("..").selectOption(value);
}
