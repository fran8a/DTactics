import { useEffect, useState } from "react";
import {
  Save,
  Pause,
  Play,
  RotateCcw,
  Route,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import type { Player, Tactics } from "../lib/model";
import type { useTacticsEditor } from "../features/useTacticsEditor";
import type { useTacticalPlayback } from "../features/useTacticalPlayback";
import { useModalFocus } from "./useModalFocus";
import "./TacticsPanel.css";

type Props = {
  players: Player[];
  tactics: Tactics;
  editor: ReturnType<typeof useTacticsEditor>;
  playback: ReturnType<typeof useTacticalPlayback>;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => Promise<void>;
  onRedo: () => Promise<void>;
};

function ConfirmTactics({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useModalFocus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div
      className="overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tactics-confirm-title"
        ref={ref}
      >
        <h2 id="tactics-confirm-title">{title}</h2>
        <p>{description}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="clear-players-actions">
          <button
            type="button"
            className="secondary"
            autoFocus
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function TacticsPanel({
  players,
  tactics,
  editor,
  playback,
  disabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const [seconds, setSeconds] = useState(String(tactics.duration_ms / 1000));
  const [confirm, setConfirm] = useState<"clear" | "discard" | null>(null);
  useEffect(
    () => setSeconds(String(tactics.duration_ms / 1000)),
    [tactics.duration_ms],
  );
  const blocked = disabled || editor.busy || playback.locked;
  const count = Object.keys(tactics.routes).length;
  const playable = !disabled && !editor.busy && !editor.dirty && count > 0;
  return (
    <section className="tactics-panel" aria-label="Jugada táctica">
      <div className="tactics-heading">
        <h2>Situaciones (beta)</h2>
        <button
          type="button"
          className={`tactics-mode ${editor.preparing ? "active" : ""}`}
          aria-label="Preparar jugada"
          aria-pressed={editor.preparing}
          disabled={blocked}
          onClick={() => {
            if (editor.preparing && editor.dirty) setConfirm("discard");
            else editor.toggle();
          }}
        >
          <Route size={14} />
          <span>{editor.preparing ? "Listo" : "Preparar"}</span>
        </button>
        <button
          type="button"
          className="tactics-icon"
          aria-label="Limpiar todos los recorridos"
          title="Limpiar todos los recorridos"
          disabled={blocked || count === 0}
          onClick={() => setConfirm("clear")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {editor.preparing && (
        <div className="tactics-editor">
          <select
            aria-label="Jugador para la jugada"
            value={editor.selected?.id ?? ""}
            disabled={blocked}
            onChange={(e) => {
              const player = players.find((p) => p.id === e.target.value);
              if (player) editor.select(player);
            }}
          >
            <option value="">Elegí un titular o tocá su ficha</option>
            {players
              .filter((p) => p.placement === "field")
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.team} · {p.number}. {p.name}
                </option>
              ))}
          </select>
          <div className="tactics-edit-actions">
            <button
              type="button"
              className="tactics-icon"
              aria-label="Recargar recorrido"
              title="Descartar cambios y recargar recorrido"
              disabled={blocked || !editor.selected}
              onClick={editor.reload}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              className="tactics-icon"
              aria-label="Eliminar recorrido seleccionado"
              title="Eliminar recorrido seleccionado"
              disabled={
                blocked ||
                !editor.selected ||
                (!editor.draft?.points.length &&
                  !tactics.routes[editor.selected.id])
              }
              onClick={() => void editor.remove().catch(() => {})}
            >
              <Trash2 size={14} />
            </button>
            {editor.dirty && (
              <button
                type="button"
                className="tactics-save"
                aria-label="Guardar recorrido"
                title="Guardar recorrido"
                disabled={blocked || !editor.selected || !editor.dirty}
                onClick={() => void editor.saveDraft().catch(() => {})}
              >
                <Save size={14} />
              </button>
            )}
          </div>
          <p className="tactics-hint">
            {editor.dirty
              ? "Cambios sin guardar. Guardá antes de cambiar."
              : "Tocá la cancha para guardar la flecha. Tocá otro jugador para continuar con él."}
          </p>
        </div>
      )}
      <div className="tactics-playback">
        <button
          type="button"
          className="tactics-play"
          aria-label={
            playback.phase === "paused"
              ? "Continuar jugada"
              : "Reproducir jugada"
          }
          title={
            playback.phase === "paused"
              ? "Continuar jugada"
              : "Reproducir jugada"
          }
          disabled={
            !playable ||
            playback.phase === "playing" ||
            playback.phase === "finished"
          }
          onClick={() => {
            editor.close();
            playback.play();
          }}
        >
          <Play size={16} />
        </button>
        <button
          type="button"
          className="tactics-icon"
          aria-label="Pausar jugada"
          title="Pausar jugada"
          disabled={playback.phase !== "playing"}
          onClick={playback.pause}
        >
          <Pause size={16} />
        </button>
        <button
          type="button"
          className="tactics-icon"
          aria-label="Reiniciar jugada"
          title="Reiniciar jugada"
          disabled={!playback.locked}
          onClick={playback.reset}
        >
          <RotateCcw size={16} />
        </button>
        <label className="tactics-duration">
          Duración
          <input
            aria-label="Duración de la jugada en segundos"
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={seconds}
            disabled={blocked || editor.dirty}
            onChange={(e) => setSeconds(e.target.value)}
            onBlur={() => {
              const value = Number(seconds);
              if (!Number.isFinite(value) || value < 1 || value > 30) {
                setSeconds(String(tactics.duration_ms / 1000));
                return;
              }
              const ms = Math.round(value * 1000);
              if (ms !== tactics.duration_ms)
                void editor.duration(ms).catch(() => {});
            }}
          />
          s
        </label>
      </div>
      <div className="tactics-footer">
        <span role="status" aria-live="polite">
          {playback.phase === "playing"
            ? "Reproduciendo"
            : playback.phase === "paused"
              ? "En pausa"
              : playback.phase === "finished"
                ? "Finalizada · reiniciá para volver"
                : `${count} recorrido${count === 1 ? "" : "s"}`}
        </span>
        <div className="tactics-history">
          <button
            type="button"
            className="tactics-icon"
            aria-label="Deshacer"
            title="Deshacer"
            disabled={blocked || editor.dirty || !canUndo}
            onClick={() => void onUndo()}
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            className="tactics-icon"
            aria-label="Rehacer"
            title="Rehacer"
            disabled={blocked || editor.dirty || !canRedo}
            onClick={() => void onRedo()}
          >
            <Redo2 size={13} />
          </button>
        </div>
      </div>
      {playback.locked && (
        <progress
          className="tactics-progress"
          aria-label="Progreso de la jugada"
          max={1}
          value={playback.progress}
        />
      )}
      {(editor.error || playback.message) && (
        <p className="tactics-error" role={editor.error ? "alert" : "status"}>
          {editor.error || playback.message}
        </p>
      )}
      {confirm && (
        <ConfirmTactics
          title={
            confirm === "clear"
              ? "¿Limpiar todos los recorridos?"
              : "¿Descartar los cambios sin guardar?"
          }
          description={
            confirm === "clear"
              ? "Se eliminarán las flechas de esta formación. Los jugadores conservarán sus posiciones."
              : "El recorrido sin guardar se descartará al salir de la preparación."
          }
          onClose={() => setConfirm(null)}
          onConfirm={
            confirm === "clear" ? editor.clear : async () => editor.toggle()
          }
        />
      )}
    </section>
  );
}
