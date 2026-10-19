import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { client, enterBoard, rpc, session, snapshot } from "../lib/api";
import {
  emptyHistory,
  remember,
  stepHistory,
  type HistoryStacks,
} from "../lib/history";
import {
  acceptSnapshot,
  events,
  type Participant,
  type Snapshot,
} from "../lib/model";

type Preview = { x: number; y: number; lease: string; seq: number };
type Drag = {
  id: string;
  lease: string;
  seq: number;
  last: number;
  renewing: boolean;
  ready: boolean;
  timer?: ReturnType<typeof setInterval>;
  formation: string;
};
export function useBoard(
  id: string,
  token: string,
  name: string,
  initialFormation: string | null = null,
) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("Conectando");
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState(false);
  const [people, setPeople] = useState<Participant[]>([]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [now, setNow] = useState(Date.now());
  const active = useRef<string | null>(initialFormation);
  const [selection, setSelection] = useState<string | null>(initialFormation);
  const histories = useRef<Record<string, HistoryStacks>>({});
  const [, setHistoryVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const current = useRef<Snapshot | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const drag = useRef<Drag | null>(null);
  const uid = useRef("");
  const tab = useRef(crypto.randomUUID());
  const online = useRef(false);
  const mounted = useRef(false);
  const refreshRef = useRef<() => Promise<boolean | void>>(async () => {});
  const run = useCallback(async <T>(operation: () => Promise<T>) => {
    pendingRef.current++;
    setPending(pendingRef.current);
    try {
      return await operation();
    } finally {
      pendingRef.current--;
      if (mounted.current) setPending(pendingRef.current);
    }
  }, []);
  const record = useCallback((result: Snapshot) => {
    const op = result.operation;
    if (!op || op.actor_id !== uid.current) return;
    histories.current[op.formation_id] = remember(
      histories.current[op.formation_id] ?? emptyHistory(),
      op,
    );
    setHistoryVersion((v) => v + 1);
  }, []);
  const apply = useCallback((incoming: Snapshot) => {
    if (!mounted.current || !incoming) return;
    if (
      active.current &&
      incoming.formation.id !== active.current &&
      incoming.formations.some((f) => f.id === active.current)
    )
      return;
    const next =
      current.current?.formation.id === incoming.formation.id
        ? acceptSnapshot(current.current, incoming)
        : incoming;
    active.current = next.formation.id;
    setSelection(next.formation.id);
    current.current = next;
    const validFormations = new Set(next.formations.map((f) => f.id));
    for (const formationId of Object.keys(histories.current)) {
      if (!validFormations.has(formationId))
        delete histories.current[formationId];
    }
    setData(next);
    setPreviews((old) =>
      Object.fromEntries(
        Object.entries(old).filter(([pid, p]) =>
          next.locks.some(
            (l) =>
              l.player_id === pid &&
              l.lease_id === p.lease &&
              Date.parse(l.expires_at) > Date.now(),
          ),
        ),
      ),
    );
  }, []);
  const change = useCallback(
    async (
      action: string,
      pid: string,
      values: Record<string, unknown> = {},
      version?: number,
      lease?: string,
      operationId?: string,
    ) => {
      if (!online.current)
        throw new Error("Sin conexión. Esperá a que se recupere para guardar.");
      const result = await run(() =>
        rpc<Snapshot>("change_player_v2", {
          p_board: id,
          p_formation: active.current,
          p_action: action,
          p_id: pid,
          p_data: values,
          p_version: version ?? null,
          p_lease: lease ?? null,
          p_operation: operationId ?? crypto.randomUUID(),
        }),
      );
      apply(result);
      record(result);
      return result;
    },
    [id, apply, run, record],
  );

  useEffect(() => {
    mounted.current = true;
    let disposed = false,
      retry: ReturnType<typeof setTimeout> | undefined,
      dirty = false,
      generation = 0;
    let pendingRefresh: Promise<boolean> | null = null;
    let ownChannel: RealtimeChannel | null = null;
    const fail = (e: unknown) => {
      if (!disposed)
        setError(
          e instanceof Error ? e.message : "No pudimos sincronizar el tablero.",
        );
    };
    const refresh = (): Promise<boolean> => {
      dirty = true;
      if (disposed || !navigator.onLine) return Promise.resolve(false);
      if (pendingRefresh) return pendingRefresh;
      pendingRefresh = (async () => {
        try {
          while (dirty && !disposed) {
            dirty = false;
            const requested = active.current;
            const result = await snapshot(id, requested);
            if (!result)
              throw new Error("Enlace inválido o tablero inexistente.");
            if (requested !== active.current) {
              dirty = true;
              continue;
            }
            if (!disposed) apply(result);
          }
          return !disposed;
        } catch (e) {
          if (!disposed) {
            fail(e);
            online.current = false;
            setStatus("Error de sincronización");
            schedule();
          }
          return false;
        } finally {
          pendingRefresh = null;
        }
      })();
      return pendingRefresh;
    };
    refreshRef.current = refresh;
    const cancelDrag = () => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (d) {
        clearInterval(d.timer);
        void rpc("change_player_v2", {
          p_board: id,
          p_formation: d.formation,
          p_action: "release",
          p_id: d.id,
          p_lease: d.lease,
        }).catch(() => {});
      }
      setPreviews({});
    };
    const disconnect = async (invalidate = true) => {
      if (invalidate) generation++;
      online.current = false;
      cancelDrag();
      setPeople([]);
      const old = ownChannel;
      ownChannel = null;
      channel.current = null;
      if (old) await client().removeChannel(old);
    };
    const schedule = () => {
      if (!disposed && !retry && navigator.onLine)
        retry = setTimeout(() => {
          retry = undefined;
          void connect().catch((e) => {
            fail(e);
            schedule();
          });
        }, 2500);
    };
    const connect = async () => {
      if (disposed) return;
      if (!navigator.onLine) {
        setStatus("Sin conexión");
        return;
      }
      const attempt = ++generation;
      await disconnect(false);
      if (disposed || attempt !== generation) return;
      setStatus(current.current ? "Reconectando" : "Conectando");
      try {
        uid.current = await session();
        await enterBoard(id, token);
      } catch (e) {
        fail(e);
        if (!disposed && attempt === generation) {
          setFatal(!current.current);
          setStatus(current.current ? "Reconectando" : "Acceso no disponible");
          if (current.current) schedule();
        }
        return;
      }
      if (disposed || attempt !== generation) return;
      await client().realtime.setAuth();
      if (disposed || attempt !== generation) return;
      const c = client().channel(`board:${id}`, {
        config: {
          private: true,
          broadcast: { self: false },
          presence: { key: tab.current },
        },
      });
      ownChannel = c;
      channel.current = c;
      for (const event of events)
        c.on("broadcast", { event }, ({ payload }) => {
          if (
            event !== "formation_updated" &&
            event !== "board_updated" &&
            payload.formation_id &&
            payload.formation_id !== active.current
          )
            return;
          void refresh();
        });
      c.on("broadcast", { event: "player_moving" }, ({ payload }) => {
        const p = payload as {
          id: string;
          lease: string;
          seq: number;
          x: number;
          y: number;
        };
        const lock = current.current?.locks.find(
          (l) =>
            l.player_id === p.id &&
            l.lease_id === p.lease &&
            Date.parse(l.expires_at) > Date.now(),
        );
        if (
          !lock ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.x > 1 ||
          p.y < 0 ||
          p.y > 1 ||
          !Number.isSafeInteger(p.seq)
        )
          return;
        setPreviews((old) =>
          old[p.id]?.lease === p.lease && old[p.id].seq >= p.seq
            ? old
            : {
                ...old,
                [p.id]: { x: p.x, y: p.y, lease: p.lease, seq: p.seq },
              },
        );
      });
      c.on("presence", { event: "sync" }, () => {
        if (disposed || ownChannel !== c) return;
        const participants = Object.values(
          c.presenceState<Participant>(),
        ).flat();
        if (
          (participants.length >= 15 &&
            !participants.some((p) => p.tab === tab.current)) ||
          (participants.length > 15 &&
            ![...participants]
              .sort((a, b) => a.tab.localeCompare(b.tab))
              .slice(0, 15)
              .some((p) => p.tab === tab.current))
        ) {
          setError(
            "La cancha está llena: máximo 15 participantes. Volvé a intentar más tarde.",
          );
          setStatus("Cancha llena");
          void disconnect();
          return;
        }
        setPeople(participants);
        const active = new Set(participants.map((p) => p.user_id));
        if (current.current?.locks.some((l) => !active.has(l.user_id)))
          void refresh();
      });
      c.subscribe(async (s) => {
        if (disposed || ownChannel !== c) return;
        if (s === "SUBSCRIBED") {
          try {
            const refreshed = await refresh();
            if (!refreshed)
              throw new Error(
                "No pudimos cargar el estado guardado. Reintentando…",
              );
            if (disposed || ownChannel !== c) return;
            const color = [
              "#ffae68",
              "#8dbbff",
              "#c9b4ff",
              "#f4d568",
              "#87d6b0",
            ][parseInt(uid.current.slice(0, 4), 16) % 5];
            const tracked = await c.track({
              user_id: uid.current,
              tab: tab.current,
              name,
              color,
            });
            if (tracked !== "ok")
              throw new Error("No pudimos anunciar tu presencia.");
            if (disposed || ownChannel !== c) return;
            online.current = true;
            setStatus("Conectado");
            setError("");
            setFatal(false);
          } catch (e) {
            fail(e);
            schedule();
          }
        } else if (
          s === "CHANNEL_ERROR" ||
          s === "TIMED_OUT" ||
          s === "CLOSED"
        ) {
          online.current = false;
          cancelDrag();
          setStatus("Reconectando");
          schedule();
        }
      });
    };
    const offline = () => {
      setStatus("Sin conexión");
      void disconnect();
    };
    const reconnect = () => {
      clearTimeout(retry);
      retry = undefined;
      void connect().catch((e) => {
        fail(e);
        schedule();
      });
    };
    const focus = () => {
      if (online.current) void refresh();
    };
    const expiry = setInterval(() => {
      setNow(Date.now());
      setPreviews((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([pid, p]) =>
            current.current?.locks.some(
              (l) =>
                l.player_id === pid &&
                l.lease_id === p.lease &&
                Date.parse(l.expires_at) > Date.now(),
            ),
          ),
        ),
      );
    }, 1000);
    window.addEventListener("offline", offline);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", focus);
    void connect().catch((e) => {
      fail(e);
      schedule();
    });
    return () => {
      disposed = true;
      mounted.current = false;
      online.current = false;
      clearTimeout(retry);
      clearInterval(expiry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", focus);
      void disconnect();
    };
  }, [id, token, name, apply]);

  const begin = async (pid: string) => {
    if (drag.current) return false;
    const d: Drag = {
      id: pid,
      lease: crypto.randomUUID(),
      seq: 0,
      last: 0,
      renewing: false,
      ready: false,
      formation: active.current!,
    };
    drag.current = d;
    setDragging(true);
    try {
      await change("acquire", pid, {}, undefined, d.lease);
      if (drag.current !== d || !online.current) {
        await rpc("change_player_v2", {
          p_board: id,
          p_formation: d.formation,
          p_action: "release",
          p_id: pid,
          p_lease: d.lease,
        });
        return false;
      }
      d.ready = true;
      d.timer = setInterval(async () => {
        if (d.renewing) return;
        d.renewing = true;
        try {
          await change("renew", pid, {}, undefined, d.lease);
        } catch (e) {
          if (drag.current !== d) return;
          clearInterval(d.timer);
          drag.current = null;
          setDragging(false);
          setError((e as Error).message);
          void refreshRef.current();
        } finally {
          d.renewing = false;
        }
      }, 4000);
      return true;
    } catch (e) {
      if (drag.current === d) drag.current = null;
      setDragging(false);
      setError((e as Error).message);
      void refreshRef.current();
      return false;
    }
  };
  const moving = (pid: string, x: number, y: number) => {
    const d = drag.current;
    if (!d || !d.ready || d.id !== pid || !online.current) return;
    if (Date.now() - d.last < 120) return;
    d.last = Date.now();
    d.seq++;
    void channel.current?.send({
      type: "broadcast",
      event: "player_moving",
      payload: { id: pid, lease: d.lease, seq: d.seq, x, y },
    });
  };
  const end = async (
    pid: string,
    x?: number,
    y?: number,
    placement?: "field" | "bench",
    outside?: { x: number; y: number },
  ) => {
    const d = drag.current;
    if (!d || d.id !== pid) {
      await refreshRef.current();
      return;
    }
    clearInterval(d.timer);
    drag.current = null;
    setDragging(false);
    try {
      await change(
        x === undefined ? "release" : "move",
        pid,
        x === undefined
          ? {}
          : {
              x,
              y,
              ...(placement ? { placement } : {}),
              ...(outside
                ? { outside_x: outside.x, outside_y: outside.y }
                : {}),
            },
        undefined,
        d.lease,
        d.lease,
      );
    } catch (e) {
      setError(
        `No pudimos confirmar el movimiento. ${(e as Error).message} Revisá la posición guardada y volvé a arrastrar para reintentar.`,
      );
      await refreshRef.current();
    }
  };
  const updateBoard = async (boardName: string, orientation: string) => {
    if (!online.current || !current.current)
      throw new Error("Esperá a recuperar la conexión.");
    const settings = current.current;
    try {
      apply(
        await run(() =>
          rpc<Snapshot>("change_settings_v2", {
            p_board: id,
            p_formation: active.current,
            p_name: boardName,
            p_orientation: orientation,
            p_version: settings.board.version,
            p_format: settings.board.players_per_team,
          }),
        ),
      );
    } catch (e) {
      await refreshRef.current();
      throw e;
    }
  };
  const quickAdd = async (
    team: "A" | "B",
    pid: string,
    x: number,
    y: number,
    placement: "field" | "bench" = "field",
  ) => {
    if (!online.current)
      throw new Error(
        "Sin conexión. Esperá a que se recupere para agregar jugadores.",
      );
    const result = await run(() =>
      rpc<Snapshot>("quick_add_v2", {
        p_board: id,
        p_formation: active.current,
        p_id: pid,
        p_team: team,
        p_x: x,
        p_y: y,
        p_placement: placement,
      }),
    );
    apply(result);
    record(result);
  };
  const changeFormat = async (format: 7 | 11) => {
    if (!online.current || !current.current)
      throw new Error("Esperá a recuperar la conexión.");
    const settings = current.current;
    if (drag.current || current.current.players.length)
      throw new Error(
        "Hay una formación pendiente. Vaciá la cancha antes de cambiar de formato.",
      );
    try {
      apply(
        await run(() =>
          rpc<Snapshot>("change_settings_v2", {
            p_board: id,
            p_formation: active.current,
            p_name: settings.board.name,
            p_orientation: settings.board.orientation,
            p_format: format,
            p_version: settings.board.version,
          }),
        ),
      );
    } catch (e) {
      await refreshRef.current();
      throw e;
    }
  };
  const selectFormation = async (formation: string) => {
    if (pendingRef.current || drag.current)
      throw new Error(
        "Esperá a que se guarden los cambios antes de cambiar de formación.",
      );
    active.current = formation;
    setSelection(formation);
    setPreviews({});
    await run(() => refreshRef.current());
  };
  useEffect(() => {
    if (
      initialFormation &&
      current.current?.formations.some((f) => f.id === initialFormation) &&
      initialFormation !== active.current
    )
      void selectFormation(initialFormation).catch((e) => setError(e.message));
  }, [initialFormation]);
  const manageFormation = async (
    action: "create" | "duplicate" | "rename" | "delete",
    formationId: string,
    formationName?: string,
  ) => {
    if (!online.current || !current.current)
      throw new Error("Esperá a recuperar la conexión.");
    const source = current.current.formation;
    const result = await run(() =>
      rpc<Snapshot>("manage_formation", {
        p_board: id,
        p_action: action,
        p_id: formationId,
        p_name: formationName ?? null,
        p_source: source.id,
        p_version: source.version,
      }),
    );
    if (action === "create" || action === "duplicate" || action === "delete") {
      active.current = result.formation.id;
      setSelection(result.formation.id);
      setPreviews({});
    }
    apply(result);
  };
  const reverse = async (direction: "undo" | "redo") => {
    if (
      !online.current ||
      !active.current ||
      pendingRef.current ||
      drag.current
    )
      return;
    const formation = active.current,
      stacks = histories.current[formation] ?? emptyHistory(),
      op = stacks[direction].at(-1);
    if (!op) return;
    try {
      const result = await run(() =>
        rpc<Snapshot>("reverse_operation", {
          p_board: id,
          p_formation: formation,
          p_operation: op.id,
          p_direction: direction,
        }),
      );
      histories.current[formation] = stepHistory(stacks, direction);
      setHistoryVersion((v) => v + 1);
      apply(result);
      setError("");
    } catch (e) {
      const message = (e as Error).message;
      if (
        /cambios posteriores|ya no está disponible en tu historial|rama de rehacer/.test(
          message,
        )
      ) {
        histories.current[formation] = {
          ...stacks,
          [direction]: stacks[direction].slice(0, -1),
        };
        setHistoryVersion((v) => v + 1);
      }
      setError(message);
      await refreshRef.current();
    }
  };
  const stacks = selection
    ? (histories.current[selection] ?? emptyHistory())
    : emptyHistory();
  return {
    data,
    status,
    error,
    fatal,
    people,
    previews,
    now,
    change,
    begin,
    moving,
    end,
    updateBoard,
    quickAdd,
    changeFormat,
    selectFormation,
    manageFormation,
    selection,
    busy: pending > 0 || dragging,
    dragging,
    canUndo: stacks.undo.length > 0,
    canRedo: stacks.redo.length > 0,
    undo: () => reverse("undo"),
    redo: () => reverse("redo"),
    refresh: () => refreshRef.current(),
    dismissError: () => setError(""),
    connected: status === "Conectado",
  };
}
