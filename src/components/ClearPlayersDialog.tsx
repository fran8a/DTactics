import { useState } from "react";
import { useModalFocus } from "./useModalFocus";

export default function ClearPlayersDialog({
  onConfirm,
  onClose,
}: {
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const modalRef = useModalFocus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div
      className="overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        className="modal clear-players-dialog"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-players-title"
        aria-describedby="clear-players-description"
        aria-busy={busy}
      >
        <h2 id="clear-players-title">¿Eliminar todos los jugadores?</h2>
        <p id="clear-players-description">
          Se eliminarán los jugadores de ambos equipos, incluidos los suplentes,
          de la formación actual.
        </p>
        {error && (
          <p className="error" role="alert">
            {error} Podés volver a intentar para eliminar los jugadores
            restantes.
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
            onClick={() => void confirm()}
          >
            {busy ? "Eliminando…" : "Sí, eliminar todos"}
          </button>
        </div>
      </section>
    </div>
  );
}
