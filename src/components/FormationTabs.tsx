import { useState } from "react";
import { Plus, Copy, Pencil, Trash2, Check, X } from "lucide-react";
import type { Formation } from "../lib/model";
export default function FormationTabs({
  formations,
  active,
  disabled,
  onSelect,
  onManage,
}: {
  formations: Formation[];
  active: Formation;
  disabled: boolean;
  onSelect: (id: string) => Promise<void>;
  onManage: (
    action: "create" | "duplicate" | "rename" | "delete",
    id: string,
    name?: string,
  ) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false),
    [name, setName] = useState(""),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setRenaming(false);
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="formations-nav" aria-label="Formaciones del tablero">
      <div className="section-heading">
        <h2>Formaciones</h2>
        <div className="formation-actions">
          <button
            className="formation-create"
            aria-label="Nueva formación"
            title="Nueva formación"
            disabled={
              disabled || busy || renaming || confirm || formations.length >= 5
            }
            onClick={() =>
              void run(() => onManage("create", crypto.randomUUID()))
            }
          >
            <Plus size={14} />
          </button>

          <button
            aria-label="Renombrar"
            title="Renombrar formación"
            disabled={disabled || busy || renaming || confirm}
            onClick={() => {
              setName(active.name);
              setRenaming(true);
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            aria-label="Duplicar formación"
            title="Duplicar formación"
            disabled={
              disabled || busy || renaming || confirm || formations.length >= 5
            }
            onClick={() =>
              void run(() => onManage("duplicate", crypto.randomUUID()))
            }
          >
            <Copy size={14} />
          </button>
          <button
            aria-label="Eliminar formación"
            title="Eliminar formación"
            disabled={
              disabled || busy || renaming || confirm || formations.length <= 1
            }
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div
        className="formation-slots"
        role="group"
        aria-label="Elegir formación"
      >
        {Array.from({ length: 5 }, (_, index) => {
          const formation = formations[index];
          return (
            <button
              key={formation?.id ?? `empty-${index}`}
              className={formation ? "formation-slot" : "formation-slot empty"}
              aria-label={
                formation
                  ? `Seleccionar ${formation.name}`
                  : `Espacio ${index + 1} disponible`
              }
              aria-pressed={formation?.id === active.id}
              title={formation?.name ?? `Espacio ${index + 1} disponible`}
              disabled={!formation || disabled || busy || renaming || confirm}
              onClick={() =>
                formation && void run(() => onSelect(formation.id))
              }
            >
              {formation?.name ?? "—"}
            </button>
          );
        })}
      </div>
      {renaming && (
        <form
          className="formation-rename"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => onManage("rename", active.id, name.trim()));
          }}
        >
          <input
            autoFocus
            required
            maxLength={60}
            aria-label="Nombre de la formación"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="icon"
            aria-label="Guardar nombre de formación"
            disabled={busy}
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            className="icon"
            aria-label="Cancelar nombre"
            onClick={() => setRenaming(false)}
          >
            <X size={15} />
          </button>
        </form>
      )}
      {confirm && (
        <div className="formation-confirm" role="alert">
          <span>¿Eliminar “{active.name}” y sus jugadores?</span>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void run(() => onManage("delete", active.id))}
          >
            Sí, eliminar formación
          </button>
          <button className="text-button" onClick={() => setConfirm(false)}>
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
