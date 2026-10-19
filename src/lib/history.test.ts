import { describe, it, expect } from "vitest";
import {
  emptyHistory,
  remember,
  stepHistory,
  historyShortcut,
} from "./history";
import type { HistoryOperation } from "./model";
const op = (id: string) => ({ id, created_at: id }) as HistoryOperation;
describe("historial local", () => {
  it("limita a 50 y descarta duplicados y redo al crear otra acción", () => {
    let h = emptyHistory();
    for (let i = 0; i < 55; i++)
      h = remember(h, op(String(i).padStart(3, "0")));
    expect(h.undo).toHaveLength(50);
    expect(remember(h, h.undo[0])).toBe(h);
    h = stepHistory(h, "undo");
    expect(h.redo).toHaveLength(1);
    h = remember(h, op("nuevo"));
    expect(h.redo).toEqual([]);
  });
  it("mantiene el orden entre undo y redo", () => {
    let h = remember(remember(emptyHistory(), op("a")), op("b"));
    h = stepHistory(h, "undo");
    expect(h.undo.map((o) => o.id)).toEqual(["a"]);
    expect(h.redo.map((o) => o.id)).toEqual(["b"]);
    expect(stepHistory(h, "redo").undo.map((o) => o.id)).toEqual(["a", "b"]);
  });
  it("reconoce los atajos Windows y macOS sin usar Alt", () => {
    const key = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      key: "z",
    };
    expect(historyShortcut(key)).toBe("undo");
    expect(historyShortcut({ ...key, key: "y" })).toBe("redo");
    expect(historyShortcut({ ...key, shiftKey: true })).toBe("redo");
    expect(historyShortcut({ ...key, ctrlKey: false, metaKey: true })).toBe(
      "undo",
    );
    expect(
      historyShortcut({
        ...key,
        ctrlKey: false,
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe("redo");
    expect(historyShortcut({ ...key, altKey: true })).toBeNull();
  });
});
