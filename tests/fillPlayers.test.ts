import { describe, expect, it } from "vitest";
import { fillPlayerPlan } from "../src/lib/fillPlayers";
import type { Player } from "../src/lib/model";

const player = (team: "A" | "B", placement: "field" | "bench"): Player => ({
  id: crypto.randomUUID(),
  board_id: "board",
  formation_id: "formation",
  name: "Existente",
  number: 1,
  team,
  placement,
  x: 0.5,
  y: 0.7,
  version: 1,
});

describe("rellenar cancha", () => {
  it.each([7, 11] as const)(
    "completa %i titulares por equipo sin superponer altas",
    (format) => {
      const plan = fillPlayerPlan([], format);
      expect(plan.filter((p) => p.team === "A")).toHaveLength(format);
      expect(plan.filter((p) => p.team === "B")).toHaveLength(format);
      expect(new Set(plan.map((p) => `${p.x},${p.y}`)).size).toBe(format * 2);
      expect(plan.every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1)).toBe(
        true,
      );
    },
  );
  it("conserva titulares y suplentes y agrega solo los faltantes", () => {
    const players = [
      player("A", "field"),
      player("A", "bench"),
      player("B", "field"),
    ];
    const before = structuredClone(players);
    const plan = fillPlayerPlan(players, 7);
    expect(plan.filter((p) => p.team === "A")).toHaveLength(6);
    expect(plan.filter((p) => p.team === "B")).toHaveLength(6);
    expect(players).toEqual(before);
  });
  it("no agrega a un equipo completo", () => {
    const plan = fillPlayerPlan(
      Array.from({ length: 7 }, () => player("A", "field")),
      7,
    );
    expect(plan.every((p) => p.team === "B")).toBe(true);
    expect(plan).toHaveLength(7);
  });
});
