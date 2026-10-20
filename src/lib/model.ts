export type Board = {
  id: string;
  name: string;
  orientation: "vertical" | "horizontal";
  players_per_team: 7 | 11;
  version: number;
};
export type Player = {
  id: string;
  board_id: string;
  formation_id: string;
  placement: "field" | "bench";
  outside_x?: number | null;
  outside_y?: number | null;
  name: string;
  number: number;
  team: "A" | "B";
  x: number;
  y: number;
  version: number;
};
export type Lease = {
  player_id: string;
  user_id: string;
  lease_id: string;
  expires_at: string;
};
export type Formation = {
  id: string;
  board_id: string;
  name: string;
  orientation: "vertical" | "horizontal";
  players_per_team: 7 | 11;
  version: number;
};
export type HistoryOperation = {
  kind?: "tactics";
  id: string;
  formation_id: string;
  player_id: string;
  type: string;
  actor_id: string;
  before_data: Player | TacticsConfig | null;
  after_data: Player | TacticsConfig | null;
  created_at: string;
};
export type TacticalPoint = { x: number; y: number };
export type TacticsConfig = {
  routes: Record<string, TacticalPoint[]>;
  duration_ms: number;
};
export type Tactics = TacticsConfig & { version: number };
export type Snapshot = {
  board: Board;
  formation: Formation;
  formations: Formation[];
  players: Player[];
  locks: Lease[];
  operation?: HistoryOperation;
  tactics?: Tactics;
};
export type Participant = {
  user_id: string;
  tab: string;
  name: string;
  color: string;
};
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function freePosition(
  players: Player[],
  team: "A" | "B",
  preferred?: { x: number; y: number },
) {
  const onField = players.filter((p) => p.placement === "field");
  const distance = (point: { x: number; y: number }) =>
    Math.min(
      ...onField.map((p) => Math.hypot(p.x - point.x, p.y - point.y)),
      2,
    );
  if (preferred && distance(preferred) > 0.1) return preferred;
  return Array.from({ length: 20 }, (_, i) => ({
    x: 0.18 + (i % 4) * 0.21,
    y: (team === "A" ? 0.58 : 0.12) + Math.floor(i / 4) * 0.075,
  })).sort((a, b) => distance(b) - distance(a))[0];
}
export function fieldDrop(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  horizontal: boolean,
  marginMultiplier = 1,
) {
  const pitch = pitchGeometry(
    rect.width,
    horizontal,
    marginMultiplier,
    rect.height,
  );
  if (
    rect.width <= 44 ||
    rect.height <= 44 ||
    clientX < rect.left + pitch.left ||
    clientX > rect.left + pitch.left + pitch.width ||
    clientY < rect.top + pitch.top ||
    clientY > rect.top + pitch.top + pitch.heightInside
  )
    return null;
  return fromScreen(
    (clientX - rect.left - pitch.left) / pitch.width,
    (clientY - rect.top - pitch.top) / pitch.heightInside,
    horizontal,
  );
}
export function pitchGeometry(
  width: number,
  horizontal: boolean,
  marginMultiplier = 1,
  availableHeight = Infinity,
) {
  const base = horizontal ? 1050 : 680;
  const scale = Math.max(
    0.001,
    Math.min(
      Math.max(1, width - 48 * marginMultiplier) /
        (base + 60 * (marginMultiplier - 1)),
      horizontal
        ? Infinity
        : (availableHeight - 48 * marginMultiplier) /
            (1050 + 60 * (marginMultiplier - 1)),
    ),
  );
  const apron = 24 * marginMultiplier + 30 * scale * (marginMultiplier - 1);
  const height = (horizontal ? 680 : 1050) * scale + apron * 2;
  return {
    apron,
    scale,
    height,
    left: (width - base * scale) / 2 + 30 * scale,
    top: apron + 30 * scale,
    width: (horizontal ? 990 : 620) * scale,
    heightInside: (horizontal ? 620 : 990) * scale,
  };
}
export function outsideField(point: { x: number; y: number }) {
  return point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1;
}
/** Sidelines rotate with the pitch; goal-line exits are always blocked. */
export function constrainPlayerPosition(
  position: { x: number; y: number },
  width: number,
  horizontal: boolean,
  availableHeight = Infinity,
) {
  const g = pitchGeometry(
    width,
    horizontal,
    horizontal ? 2 : 1,
    availableHeight,
  );
  const insetX = Math.min(19, g.width / 2);
  const insetY = Math.min(19, g.heightInside / 2);
  const canvasInsetX = Math.min(19, width / 2);
  const canvasInsetY = Math.min(19, g.height / 2);
  return {
    x: Math.max(
      horizontal ? g.left + insetX : canvasInsetX,
      Math.min(
        horizontal ? g.left + g.width - insetX : width - canvasInsetX,
        position.x,
      ),
    ),
    y: Math.max(
      horizontal ? canvasInsetY : g.top + insetY,
      Math.min(
        horizontal ? g.height - canvasInsetY : g.top + g.heightInside - insetY,
        position.y,
      ),
    ),
  };
}
/** Canonical sideline positions, projected into the current view by toScreen. */
export function lateralBenchPosition(
  position: { x: number; y: number } | null,
  team: "A" | "B",
  index: number,
  fieldWidth: number,
) {
  const fallback = {
    x: team === "A" ? -32 / fieldWidth : 1 + 32 / fieldWidth,
    y: 0.08 + (index % 10) * 0.09,
  };
  if (!position) return fallback;
  return {
    x:
      position.x < 0 || position.x > 1
        ? position.x
        : position.x < 0.5
          ? -32 / fieldWidth
          : position.x > 0.5
            ? 1 + 32 / fieldWidth
            : fallback.x,
    y: clamp(position.y),
  };
}
export function toScreen(x: number, y: number, horizontal: boolean) {
  return horizontal ? { x: y, y: 1 - x } : { x, y };
}
export function fromScreen(x: number, y: number, horizontal: boolean) {
  return horizontal
    ? { x: clamp(1 - y), y: clamp(x) }
    : { x: clamp(x), y: clamp(y) };
}
export function validPlayer(name: string, number: number) {
  return (
    name.trim().length > 0 &&
    name.trim().length <= 40 &&
    Number.isInteger(number) &&
    number >= 0 &&
    number <= 99
  );
}
export function acceptSnapshot(current: Snapshot | null, incoming: Snapshot) {
  return !current || incoming.board.version >= current.board.version
    ? incoming
    : current;
}
export const events = [
  "tactics_updated",
  "player_added",
  "player_updated",
  "player_deleted",
  "player_drag_started",
  "player_drag_ended",
  "board_updated",
  "formation_updated",
] as const;
