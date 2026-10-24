import { freePosition, type Player } from "./model";

export function fillPlayerPlan(players: Player[], format: 7 | 11) {
  const occupied = [...players];
  const additions: { team: "A" | "B"; x: number; y: number }[] = [];
  for (const team of ["A", "B"] as const) {
    const count = players.filter(
      (p) => p.team === team && p.placement === "field",
    ).length;
    for (let i = count; i < format; i++) {
      const point = { team, ...freePosition(occupied, team) };
      additions.push(point);
      occupied.push({
        ...point,
        placement: "field",
        id: "",
        board_id: "",
        formation_id: "",
        name: "",
        number: 0,
        version: 1,
      });
    }
  }
  return additions;
}
