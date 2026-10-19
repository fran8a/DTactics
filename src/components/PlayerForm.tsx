import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { validPlayer, type Player } from "../lib/model";
import { useModalFocus } from "./useModalFocus";
type Values = { name: string; number: number; team: "A" | "B" };
export default function PlayerForm({
  player,
  onSave,
  onDelete,
  onClose,
  onPlacement,
}: {
  player?: Player;
  onSave: (v: Values, operationId: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  onPlacement?: () => Promise<void>;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const modalRef = useModalFocus();
  const [name, setName] = useState(player?.name ?? ""),
    [number, setNumber] = useState(String(player?.number ?? 9)),
    [team, setTeam] = useState<"A" | "B">(player?.team ?? "A");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-title"
      >
        <button
          className="icon close"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="eyebrow">AL VESTUARIO</span>
        <h2 id="player-title">
          {player ? "Ajustá los detalles" : "Uno más para el equipo"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!validPlayer(name, Number(number)) || number === "") {
              setError("Completá el nombre y un número del 0 al 99.");
              return;
            }
            void run(() =>
              onSave(
                { name: name.trim(), number: Number(number), team },
                operationId,
              ),
            );
          }}
        >
          <label>
            Nombre del jugador
            <input
              autoFocus
              onFocus={(e) => e.target.select()}
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Ochoa"
            />
          </label>
          <label>
            Número de camiseta
            <input
              type="number"
              required
              min={0}
              max={99}
              step={1}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Equipo</legend>
            <div className="team-options">
              {(["A", "B"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={team === t}
                  className={`team-option ${team === t ? "active" : ""}`}
                  onClick={() => setTeam(t)}
                >
                  <i className={`dot team-${t}`} />
                  Equipo {t}
                </button>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Guardando…"
              : player
                ? "Guardar cambios"
                : "Agregar a la cancha"}
          </button>
        </form>
        {player && (
          <div className="delete-area">
            {onPlacement && (
              <button
                className="secondary full"
                disabled={busy}
                onClick={() => void run(onPlacement)}
              >
                {player.placement === "bench"
                  ? "Ingresar a la cancha"
                  : "Enviar al banco"}
              </button>
            )}
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void run(onDelete)}
            >
              <Trash2 size={16} /> Eliminar jugador
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
