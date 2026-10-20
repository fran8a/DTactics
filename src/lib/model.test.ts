import { describe, it, expect } from "vitest";
import {
  acceptSnapshot,
  clamp,
  fieldDrop,
  pitchGeometry,
  fromScreen,
  toScreen,
  validPlayer,
  constrainPlayerPosition,
  lateralBenchPosition,
  type Snapshot,
} from "./model";
describe("coordenadas y validación", () => {
  it("limita el arrastre a los laterales visibles en ambas orientaciones", () => {
    for (const horizontal of [false, true]) {
      const g = pitchGeometry(800, horizontal, horizontal ? 2 : 1);
      for (const y of [-1000, g.top, g.height + 1000]) {
        for (const x of [0, g.left + g.width / 2, 800]) {
          const p = constrainPlayerPosition({ x, y }, 800, horizontal);
          if (horizontal) {
            expect(p.x).toBeGreaterThanOrEqual(g.left + 19);
            expect(p.x).toBeLessThanOrEqual(g.left + g.width - 19);
          } else {
            expect(p.y).toBeGreaterThanOrEqual(g.top + 19);
            expect(p.y).toBeLessThanOrEqual(g.top + g.heightInside - 19);
          }
          expect(p.x).toBeGreaterThanOrEqual(19);
          expect(p.x).toBeLessThanOrEqual(781);
        }
      }
      if (horizontal) {
        expect(
          constrainPlayerPosition({ x: 400, y: 0 }, 800, true).y,
        ).toBeLessThan(g.top);
        expect(
          constrainPlayerPosition({ x: 400, y: g.height }, 800, true).y,
        ).toBeGreaterThan(g.top + g.heightInside);
      } else {
        expect(
          constrainPlayerPosition({ x: 0, y: g.top }, 800, false).x,
        ).toBeLessThan(g.left);
        expect(
          constrainPlayerPosition({ x: 800, y: g.top }, 800, false).x,
        ).toBeGreaterThan(g.left + g.width);
      }
    }
  });
  it("ubica suplentes en los laterales de la cancha, también al rotarla", () => {
    for (const horizontal of [false, true]) {
      for (const position of [
        { x: -0.2, y: 0.5 },
        { x: 1.2, y: 0.5 },
        { x: 0.5, y: -0.2 },
        { x: 0.5, y: 1.2 },
      ]) {
        const canonical = lateralBenchPosition(position, "A", 0, 620);
        const projected = toScreen(canonical.x, canonical.y, horizontal);
        const cross = horizontal ? projected.y : projected.x;
        const along = horizontal ? projected.x : projected.y;
        expect(cross < 0 || cross > 1).toBe(true);
        expect(along).toBeGreaterThanOrEqual(0);
        expect(along).toBeLessThanOrEqual(1);
      }
    }
  });
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
