import type { Player, TacticalPoint, Tactics, TacticalSpeed } from "./model";

export const emptyTactics: Tactics = {
  routes: {},
  speeds: {},
  duration_ms: 5000,
  version: 1,
};
export const TACTICAL_SPEEDS: readonly TacticalSpeed[] = [0.5, 0.75, 1, 1.5, 2];
export const MAX_ROUTE_POINTS = 24;
export type Track = {
  points: TacticalPoint[];
  distances: number[];
  length: number;
};

export function buildTrack(
  origin: TacticalPoint,
  waypoints: TacticalPoint[],
): Track {
  const points = [origin, ...waypoints];
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(
      distances[i - 1] +
        Math.hypot(
          (points[i].x - points[i - 1].x) * 620,
          (points[i].y - points[i - 1].y) * 990,
        ),
    );
  }
  return { points, distances, length: distances.at(-1)! };
}

export function sampleTrack(
  track: Track,
  progress: number,
  speed: TacticalSpeed = 1,
): TacticalPoint {
  progress = Math.min(1, progress * speed);
  if (progress >= 1 || !track.length) return track.points.at(-1)!;
  const distance = Math.max(0, progress) * track.length;
  for (let i = 1; i < track.points.length; i++) {
    if (track.distances[i] < distance) continue;
    const span = track.distances[i] - track.distances[i - 1];
    const fraction = span ? (distance - track.distances[i - 1]) / span : 1;
    return {
      x:
        track.points[i - 1].x +
        (track.points[i].x - track.points[i - 1].x) * fraction,
      y:
        track.points[i - 1].y +
        (track.points[i].y - track.points[i - 1].y) * fraction,
    };
  }
  return track.points.at(-1)!;
}

export function tacticalSignature(
  formation: string | undefined,
  tactics: Tactics,
  players: Player[],
) {
  const speeds = Object.entries(tactics.speeds ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `${JSON.stringify(speeds)}:${formation}:${tactics.version}:${players.map((p) => `${p.id}/${p.version}/${p.placement}/${p.x}/${p.y}`).join(";")}`;
}
