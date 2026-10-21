import { useEffect, useState } from "react";
import type {
  Player,
  TacticalPoint,
  Tactics,
  TacticsConfig,
  TacticalSpeed,
} from "../lib/model";

export function useTacticsEditor(
  formation: string | undefined,
  players: Player[],
  tactics: Tactics,
  save: (config: TacticsConfig, version: number) => Promise<void>,
) {
  const [preparing, setPreparing] = useState(false);
  const [draft, setDraft] = useState<{
    playerId: string;
    points: TacticalPoint[];
    basePoints: TacticalPoint[];
    version: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPreparing(false);
    setDraft(null);
    setError("");
  }, [formation]);
  const selected = players.find(
    (p) => p.id === draft?.playerId && p.placement === "field",
  );
  useEffect(() => {
    if (draft && !selected) setDraft(null);
  }, [!!selected, draft?.playerId]);
  useEffect(() => {
    setDraft((old) => {
      if (!old || JSON.stringify(old.points) !== JSON.stringify(old.basePoints))
        return old;
      const points = (tactics.routes[old.playerId] ?? [])
        .slice(-1)
        .map((p) => ({
          ...p,
        }));
      return { ...old, points, basePoints: points, version: tactics.version };
    });
  }, [tactics.version]);
  function load(player: Player, version = tactics.version) {
    if (player.placement !== "field") return;
    const points = (tactics.routes[player.id] ?? [])
      .slice(-1)
      .map((p) => ({ ...p }));
    setDraft({
      playerId: player.id,
      points,
      basePoints: points,
      version,
    });
    setError("");
  }
  function select(player: Player) {
    if (busy || draft?.playerId === player.id) return;
    if (
      draft &&
      JSON.stringify(draft.points) !== JSON.stringify(draft.basePoints)
    ) {
      setError("Guardá el recorrido o recargalo antes de elegir otro jugador.");
      return;
    }
    load(player);
  }
  async function add(point: TacticalPoint, nextPlayer?: Player) {
    if (!draft || busy) return;
    const points = [point];
    setDraft({ ...draft, points });
    try {
      await run(async () => {
        await save(
          {
            routes: { ...tactics.routes, [draft.playerId]: points },
            speeds: tactics.speeds,
            duration_ms: tactics.duration_ms,
          },
          draft.version,
        );
        if (nextPlayer) load(nextPlayer, draft.version + 1);
        else setDraft(null);
      });
    } catch {
      // Keep the draft available for retry when saving fails.
    }
  }
  function targetPlayer(player: Player) {
    if (busy || player.placement !== "field") return;
    if (!draft) load(player);
    else if (draft.playerId !== player.id)
      void add({ x: player.x, y: player.y }, player);
  }
  function move(index: number, point: TacticalPoint) {
    if (!draft || busy) return;
    setDraft((old) =>
      old
        ? {
            ...old,
            points: old.points.map((p, i) => (i === index ? point : p)),
          }
        : old,
    );
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!draft || !selected) return;
    const routes = { ...tactics.routes };
    if (draft.points.length) routes[draft.playerId] = draft.points;
    else delete routes[draft.playerId];
    await run(async () => {
      await save(
        { routes, speeds: tactics.speeds, duration_ms: tactics.duration_ms },
        draft.version,
      );
      setDraft((old) =>
        old
          ? { ...old, basePoints: old.points, version: tactics.version + 1 }
          : old,
      );
    });
  }
  async function remove() {
    if (!draft) return;
    if (!tactics.routes[draft.playerId]) {
      setDraft({ ...draft, points: [] });
      return;
    }
    const routes = { ...tactics.routes };
    delete routes[draft.playerId];
    await run(async () => {
      await save(
        { routes, speeds: tactics.speeds, duration_ms: tactics.duration_ms },
        draft.version,
      );
      setDraft({
        ...draft,
        points: [],
        basePoints: [],
        version: tactics.version + 1,
      });
    });
  }
  const dirty =
    !!draft &&
    JSON.stringify(draft.points) !== JSON.stringify(draft.basePoints);
  return {
    preparing,
    draft,
    selected,
    error,
    busy,
    dirty,
    select,
    targetPlayer,
    add,
    move,
    editArrow: (player: Player) => {
      if (busy) return;
      setPreparing(true);
      load(player);
    },
    saveDraft,
    remove,
    toggle: () => {
      setPreparing((old) => !old);
      setDraft(null);
      setError("");
    },
    close: () => {
      setPreparing(false);
      setDraft(null);
      setError("");
    },
    reload: () => {
      if (selected) load(selected);
    },
    speed: (player: Player, speed: TacticalSpeed) =>
      run(async () => {
        if (player.placement !== "field") return;
        await save(
          {
            routes: tactics.routes,
            duration_ms: tactics.duration_ms,
            speeds: { ...tactics.speeds, [player.id]: speed },
          },
          tactics.version,
        );
      }),
    duration: (duration_ms: number) =>
      run(() =>
        save(
          { routes: tactics.routes, speeds: tactics.speeds, duration_ms },
          tactics.version,
        ),
      ),
    clear: () =>
      run(async () => {
        await save(
          {
            routes: {},
            speeds: tactics.speeds,
            duration_ms: tactics.duration_ms,
          },
          tactics.version,
        );
        setDraft(null);
      }),
  };
}
