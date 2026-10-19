import { describe, it, expect } from "vitest";
import {
  acceptSnapshot,
  clamp,
  fieldDrop,
  pitchGeometry,
  fromScreen,
  toScreen,
  validPlayer,
  type Snapshot,
} from "./model";
describe("coordenadas y validación", () => {
  it("ubica altas al soltar sobre el canvas y descarta las que quedan afuera", () => {
    for (const horizontal of [false, true]) {
      const pitch = pitchGeometry(340, horizontal);
      const rect = { left: 100, top: 60, width: 340, height: pitch.height };
      const result = fieldDrop(
        100 + pitch.left + pitch.width * 0.25,
        60 + pitch.top + pitch.heightInside * 0.25,
        rect,
        horizontal,
      )!;
      expect(result.x).toBeCloseTo(horizontal ? 0.75 : 0.25);
      expect(result.y).toBeCloseTo(0.25);
      expect(fieldDrop(110, 100, rect, horizontal)).toBeNull();
      expect(fieldDrop(99, 182, rect, horizontal)).toBeNull();
    }
  });
  it("conserva posiciones al rotar, independientemente del tamaño", () => {
    for (const horizontal of [false, true])
      for (const [x, y] of [
        [0, 0],
        [1, 1],
        [0.2, 0.8],
        [0.5, 0.5],
      ]) {
        const s = toScreen(x, y, horizontal);
        const p = fromScreen(s.x, s.y, horizontal);
        expect(p.x).toBeCloseTo(x);
        expect(p.y).toBeCloseTo(y);
      }
  });
  it("mantiene coordenadas dentro de la cancha", () => {
    expect(clamp(-3)).toBe(0);
    expect(fromScreen(2, -2, false)).toEqual({ x: 1, y: 0 });
  });
  it("valida nombres y números", () => {
    expect(validPlayer("Ochoa", 9)).toBe(true);
    for (const [name, n] of [
      ["", 9],
      [" ".repeat(5), 9],
      ["a".repeat(41), 1],
      ["Pepe", 100],
      ["Pepe", -1],
      ["Pepe", 1.5],
    ] as [string, number][])
      expect(validPlayer(name, n)).toBe(false);
  });
  it("ignora respuestas antiguas y aplica duplicados de forma idempotente", () => {
    const newer = {
      board: { version: 12 },
      players: [],
      locks: [],
    } as unknown as Snapshot;
    const older = {
      board: { version: 11 },
      players: [{ id: "borrado" }],
      locks: [],
    } as unknown as Snapshot;
    expect(acceptSnapshot(newer, older)).toBe(newer);
    expect(acceptSnapshot(newer, newer)).toBe(newer);
  });
});
