import { useEffect, useState } from "react";
import type {
  Player,
  TacticalPoint,
  Tactics,
  TacticsConfig,
} from "../lib/model";
import { MAX_ROUTE_POINTS } from "../lib/tactics";

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
      const points = (tactics.routes[old.playerId] ?? []).map((p) => ({
        ...p,
      }));
      return { ...old, points, basePoints: points, version: tactics.version };
    });
  }, [tactics.version]);
  function load(player: Player) {
    if (player.placement !== "field") return;
    const points = (tactics.routes[player.id] ?? []).map((p) => ({ ...p }));
    setDraft({
      playerId: player.id,
      points,
      basePoints: points,
      version: tactics.version,
    });
    setError("");
  }
  function select(player: Player) {
    if (draft?.playerId === player.id) return;
    if (
      draft &&
      JSON.stringify(draft.points) !== JSON.stringify(draft.basePoints)
    ) {
      setError("Guardá el recorrido o recargalo antes de elegir otro jugador.");
      return;
    }
    load(player);
  }
  function add(point: TacticalPoint) {
    if (!draft || busy) return;
    if (draft.points.length >= MAX_ROUTE_POINTS) {
      setError("Máximo: 24 puntos por recorrido.");
      return;
    }
    setDraft({ ...draft, points: [...draft.points, point] });
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
      await save({ routes, duration_ms: tactics.duration_ms }, draft.version);
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
      await save({ routes, duration_ms: tactics.duration_ms }, draft.version);
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
    add,
    move,
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
    undoPoint: () =>
      setDraft((old) =>
        old ? { ...old, points: old.points.slice(0, -1) } : old,
      ),
    reload: () => {
      if (selected) load(selected);
    },
    duration: (duration_ms: number) =>
      run(() => save({ routes: tactics.routes, duration_ms }, tactics.version)),
    clear: () =>
      run(async () => {
        await save(
          { routes: {}, duration_ms: tactics.duration_ms },
          tactics.version,
        );
        setDraft(null);
      }),
  };
}
