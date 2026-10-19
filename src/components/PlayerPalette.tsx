import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useDragScroll } from "./useDragScroll";
type Point = { x: number; y: number };
type Addition = Point & { team: "A" | "B"; id: string };
type Props = {
  disabled: boolean;
  fullTeams?: { A: boolean; B: boolean };
  onPendingChange?: (pending: boolean) => void;
  getPosition: (x: number, y: number) => Point | null;
  onAdd: (addition: {
    team: "A" | "B";
    id: string;
    x?: number;
    y?: number;
  }) => Promise<void>;
};
export default function PlayerPalette({
  disabled,
  fullTeams,
  onPendingChange,
  getPosition,
  onAdd,
}: Props) {
  const gesture = useRef<{
    team: "A" | "B";
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [ghost, setGhost] = useState<{
    team: "A" | "B";
    x: number;
    y: number;
    valid: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  useDragScroll(!!ghost);
  const [failed, setFailed] = useState<{
    addition: Partial<Point> & { team: "A" | "B"; id: string };
    message: string;
  } | null>(null);
  useEffect(() => {
    onPendingChange?.(pending || !!ghost || !!failed);
  }, [pending, ghost, failed, onPendingChange]);
  async function add(
    addition: Partial<Point> & { team: "A" | "B"; id: string },
  ) {
    setPending(true);
    setFailed(null);
    try {
      await onAdd(addition);
    } catch (e) {
      setFailed({ addition, message: (e as Error).message });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="player-palette">
      <p className="palette-instruction">Arrastrá o tocá para agregar</p>
      <div className="palette-teams">
        {(["A", "B"] as const).map((team) => (
          <div className="palette-team" key={team}>
            <button
              className={`palette-token team-${team}`}
              aria-label={`Agregar jugador del equipo ${team}`}
              disabled={disabled || pending || fullTeams?.[team]}
              onPointerDown={(e) => {
                if (disabled || pending || !e.isPrimary || e.button !== 0)
                  return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                gesture.current = {
                  team,
                  x: e.clientX,
                  y: e.clientY,
                  moved: false,
                };
              }}
              onPointerMove={(e) => {
                const g = gesture.current;
                if (!g) return;
                g.moved ||= Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5;
                if (g.moved)
                  setGhost({
                    team: g.team,
                    x: e.clientX,
                    y: e.clientY,
                    valid: !!getPosition(e.clientX, e.clientY),
                  });
              }}
              onPointerUp={(e) => {
                const g = gesture.current;
                gesture.current = null;
                setGhost(null);
                if (!g || disabled || pending) return;
                const point = getPosition(e.clientX, e.clientY);
                if (g.moved) {
                  if (point)
                    void add({
                      ...point,
                      team: g.team,
                      id: crypto.randomUUID(),
                    } satisfies Addition);
                } else void add({ team: g.team, id: crypto.randomUUID() });
              }}
              onPointerCancel={() => {
                gesture.current = null;
                setGhost(null);
              }}
              onLostPointerCapture={() => {
                gesture.current = null;
                setGhost(null);
              }}
              onClick={(e) => {
                if (e.detail === 0 && !disabled && !pending)
                  void add({ team, id: crypto.randomUUID() });
              }}
            >
              <Plus size={25} aria-hidden="true" />
            </button>
            <span>
              Equipo {team}
              {fullTeams?.[team] ? " · Completo" : ""}
            </span>
          </div>
        ))}
      </div>
      {pending && (
        <p className="palette-help" role="status">
          Agregando…
        </p>
      )}
      {failed && (
        <div className="palette-error" role="alert">
          <p>{failed.message}</p>
          <button
            className="text-button"
            disabled={disabled || pending}
            onClick={() => void add(failed.addition)}
          >
            Reintentar
          </button>
          <button
            className="text-button"
            disabled={pending}
            onClick={() => setFailed(null)}
          >
            Descartar intento
          </button>
        </div>
      )}
      {ghost && (
        <div
          aria-hidden="true"
          className={`palette-ghost team-${ghost.team} ${ghost.valid ? "valid" : ""}`}
          style={{ left: ghost.x, top: ghost.y }}
        >
          <Plus size={23} />
        </div>
      )}
    </div>
  );
}
