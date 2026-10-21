import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Player, TacticalSpeed } from "../lib/model";
import { TACTICAL_SPEEDS } from "../lib/tactics";
import { useModalFocus } from "./useModalFocus";

export default function PlayerSpeedModal({
  player,
  speed,
  disabled,
  onSave,
  onClose,
}: {
  player: Player;
  speed: TacticalSpeed;
  disabled: boolean;
  onSave: (speed: TacticalSpeed) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useModalFocus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus();
  }, [ref]);
  return createPortal(
    <div
      className="overlay player-speed-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <section
        ref={ref}
        className="modal player-speed-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-speed-title"
        aria-busy={busy}
      >
        <h2 id="player-speed-title">Velocidad de jugada</h2>
        <p>
          {player.team} · {player.number}. {player.name}
        </p>
        <div
          className="player-speed-options"
          role="group"
          aria-label="Velocidad del jugador"
        >
          {TACTICAL_SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              autoFocus={value === speed}
              aria-pressed={value === speed}
              disabled={busy || disabled}
              onClick={async () => {
                if (value === speed) {
                  onClose();
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await onSave(value);
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              x{value}
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          Cerrar
        </button>
      </section>
    </div>,
    document.querySelector(".board-app") ?? document.body,
  );
}
