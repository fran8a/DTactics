import type { HistoryOperation } from "./model";
export type HistoryStacks = {
  undo: HistoryOperation[];
  redo: HistoryOperation[];
};
export const emptyHistory = (): HistoryStacks => ({ undo: [], redo: [] });
export function remember(
  stacks: HistoryStacks,
  operation: HistoryOperation,
): HistoryStacks {
  if ([...stacks.undo, ...stacks.redo].some((op) => op.id === operation.id))
    return stacks;
  return {
    undo: [...stacks.undo, operation]
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      )
      .slice(-50),
    redo: [],
  };
}
export function stepHistory(
  stacks: HistoryStacks,
  direction: "undo" | "redo",
): HistoryStacks {
  const source = stacks[direction],
    last = source.at(-1);
  if (!last) return stacks;
  return direction === "undo"
    ? { undo: source.slice(0, -1), redo: [...stacks.redo, last] }
    : { undo: [...stacks.undo, last], redo: source.slice(0, -1) };
}
export function historyShortcut(
  event: Pick<
    KeyboardEvent,
    "ctrlKey" | "metaKey" | "altKey" | "key" | "shiftKey"
  >,
): "undo" | "redo" | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey) return "redo";
  return null;
}
