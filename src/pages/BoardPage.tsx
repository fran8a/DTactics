import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Move,
  Copy,
  ChevronLeft,
  Check,
  AlertCircle,
  X,
  Pencil,
  Shirt,
} from "lucide-react";
import { useBoard } from "../features/useBoard";
import { fieldDrop, freePosition, type Player } from "../lib/model";
import PlayerPalette from "../components/PlayerPalette";
import PlayerForm from "../components/PlayerForm";
import { Logo } from "../components/Identity";
import FormationTabs from "../components/FormationTabs";
import { historyShortcut } from "../lib/history";
import "./BoardPage.css";
const FootballField = lazy(() => import("../components/FootballField"));
export default function BoardPage({
  id,
  token,
  name,
}: {
  id: string;
  token: string;
  name: string;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("formation");
  const board = useBoard(
      id,
      token,
      name,
      requested && /^[0-9a-f-]{36}$/i.test(requested) ? requested : null,
    ),
    [editor, setEditor] = useState<Player | null>(null),
    [copied, setCopied] = useState(false),
    [localError, setLocalError] = useState(""),
    [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState(""),
    [saving, setSaving] = useState(false);
  const [palettePending, setPalettePending] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (board.selection)
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("formation", board.selection!);
          return next;
        },
        { replace: true },
      );
    setEditor(null);
  }, [board.selection, setParams]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input,textarea,[contenteditable]:not([contenteditable="false"]),form,[role="dialog"]',
        )
      )
        return;
      const action = historyShortcut(event);
      if (
        !action ||
        !board.connected ||
        board.busy ||
        saving ||
        palettePending ||
        editor
      )
        return;
      event.preventDefault();
      if (action === "undo") void board.undo();
      else void board.redo();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [
    board.undo,
    board.redo,
    board.connected,
    board.busy,
    saving,
    palettePending,
    editor,
  ]);
  async function setPlacement(
    player: Player,
    point?: { x: number; y: number },
  ) {
    const placement = player.placement === "field" ? "bench" : "field";
    const position =
      placement === "field"
        ? (point ??
          freePosition(board.data?.players ?? [], player.team, {
            x: player.x,
            y: player.y,
          }))
        : {};
    await board.change(
      "placement",
      player.id,
      { placement, ...position },
      player.version,
    );
  }
  function getPosition(x: number, y: number) {
    const canvas = fieldRef.current?.querySelector("canvas");
    if (!canvas || !board.data) return null;
    return fieldDrop(x, y, canvas.getBoundingClientRect(), false);
  }
  async function quickAdd(addition: {
    team: "A" | "B";
    id: string;
    x?: number;
    y?: number;
  }) {
    const current = board.data;
    if (!current) return;
    const fallback = freePosition(current.players, addition.team);
    await board.quickAdd(
      addition.team,
      addition.id,
      addition.x ?? fallback.x,
      addition.y ?? fallback.y,
    );
  }
  const palette = (
    <PlayerPalette
      disabled={
        !board.connected ||
        saving ||
        board.busy ||
        (board.data?.players.length ?? 0) >= 40
      }
      fullTeams={{
        A:
          (board.data?.players.filter(
            (p) => p.team === "A" && p.placement === "field",
          ).length ?? 0) >= (board.data?.board.players_per_team ?? 11),
        B:
          (board.data?.players.filter(
            (p) => p.team === "B" && p.placement === "field",
          ).length ?? 0) >= (board.data?.board.players_per_team ?? 11),
      }}
      onPendingChange={setPalettePending}
      getPosition={getPosition}
      onAdd={quickAdd}
    />
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setLocalError(
        "No pudimos copiar. Copiá el enlace completo de la barra de direcciones.",
      );
    }
  }
  async function update(name: string) {
    setSaving(true);
    setLocalError("");
    try {
      await board.updateBoard(name, "vertical");
      setRenaming(false);
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const data = board.data;
  if (!data)
    return (
      <div className="status-page">
        <Logo />
        {board.fatal ? <AlertCircle size={36} /> : <div className="spinner" />}
        <h2>
          {board.fatal
            ? "No pudimos abrir la cancha"
            : "Preparando la pizarra…"}
        </h2>
        <p role="status">{board.error || board.status}</p>
        <Link to="/">Volver al inicio</Link>
      </div>
    );
  const players = data.players.map((p) => {
    const preview = board.previews[p.id];
    return preview ? { ...p, x: preview.x, y: preview.y } : p;
  });
  const formatBlocked =
    !board.connected ||
    saving ||
    renaming ||
    !!editor ||
    palettePending ||
    board.busy ||
    data.players.length > 0;
  const controlsDisabled =
    !board.connected ||
    board.busy ||
    saving ||
    palettePending ||
    !!editor ||
    renaming;
  return (
    <div className="board-app">
      <header className="board-header">
        <Logo />
        <div className="board-title header-board-name">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void update(title);
              }}
            >
              <input
                autoFocus
                aria-label="Nombre del tablero"
                maxLength={80}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button
                className="icon"
                disabled={saving}
                aria-label="Guardar nombre"
              >
                <Check size={18} />
              </button>
              <button
                type="button"
                className="icon"
                aria-label="Cancelar"
                onClick={() => setRenaming(false)}
              >
                <X size={18} />
              </button>
            </form>
          ) : (
            <button
              aria-label="Editar nombre de la pizarra"
              title={data.board.name}
              disabled={!board.connected}
              onClick={() => {
                setTitle(data.board.name);
                setRenaming(true);
              }}
            >
              <span>{data.board.name}</span>
              <Pencil size={13} />
            </button>
          )}
        </div>
        <span
          className={`connection ${board.connected ? "connected" : ""}`}
          role="status"
        >
          <i className="dot" />
          {board.status}
        </span>
        <button
          className="primary share"
          aria-label="Copiar enlace"
          onClick={() => void copy()}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? "¡Copiado!" : "Copiar enlace"}</span>
        </button>
      </header>
      {(board.error || localError) && (
        <div className="error-banner" role="alert">
          <AlertCircle size={17} />
          <span>{localError || board.error}</span>
          <button className="text-button" onClick={() => void board.refresh()}>
            Actualizar datos
          </button>
          <button
            className="icon"
            aria-label="Cerrar aviso"
            onClick={() => {
              setLocalError("");
              board.dismissError();
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="board-layout">
        <aside className="sidebar" aria-label="Herramientas del pizarrón">
          <FormationTabs
            key={data.formation.id}
            formations={data.formations}
            active={data.formation}
            disabled={controlsDisabled}
            onSelect={board.selectFormation}
            onManage={board.manageFormation}
          />
          <section
            className="pitch-settings"
            aria-label="Configuración de cancha"
          >
            <div className="section-heading">
              <h2>Cancha</h2>
            </div>
            <div className="match-format">
              <div className="format-toggle-row">
                <span className="format-label">Fútbol</span>
                <div
                  className="format-options"
                  role="group"
                  aria-label="Formato del partido"
                >
                  {([7, 11] as const).map((format) => (
                    <button
                      key={format}
                      className={
                        data.board.players_per_team === format ? "active" : ""
                      }
                      aria-label={`Fútbol ${format}`}
                      aria-pressed={data.board.players_per_team === format}
                      title={
                        data.players.length
                          ? "Vaciá el pizarrón para cambiar el formato"
                          : `${format} vs ${format}`
                      }
                      disabled={formatBlocked}
                      onClick={async () => {
                        setSaving(true);
                        setLocalError("");
                        try {
                          await board.changeFormat(format);
                        } catch (e) {
                          setLocalError((e as Error).message);
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>
              {formatBlocked && (
                <p className="format-hint">
                  {data.players.length
                    ? "Requiere pizarrón vacío."
                    : "Hay cambios pendientes."}
                </p>
              )}
            </div>
          </section>
          <section className="roster">
            <div className="section-heading">
              <h2>Jugadores</h2>
              <span className="muted">
                {data.players.filter((p) => p.placement === "field").length}/
                {data.board.players_per_team * 2}
              </span>
            </div>
            <div className="sidebar-palette">{palette}</div>
            {(["A", "B"] as const).map((team) => (
              <div className="team-list" key={team}>
                <div className="team-label">
                  <i className={`dot team-${team}`} />
                  EQUIPO {team}
                  <span>
                    {
                      data.players.filter(
                        (p) => p.team === team && p.placement === "field",
                      ).length
                    }
                    /{data.board.players_per_team}
                  </span>
                </div>
                <select
                  aria-label={`Editar jugador del equipo ${team}`}
                  value=""
                  disabled={
                    !board.connected ||
                    !data.players.some((p) => p.team === team)
                  }
                  onChange={(event) => {
                    const player = data.players.find(
                      (p) => p.id === event.target.value,
                    );
                    if (player) setEditor(player);
                  }}
                >
                  <option value="">
                    {data.players.some((p) => p.team === team)
                      ? "Editar jugador..."
                      : "Sin jugadores"}
                  </option>
                  {data.players
                    .filter((p) => p.team === team)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.number}. {p.name}
                        {p.placement === "bench" ? " (fuera)" : ""}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </section>
          <section className="presence">
            <div className="section-heading">
              <span className="eyebrow">CONECTADOS</span>
              <span className="count">{board.people.length}</span>
            </div>
            <div className="people">
              {board.people.map((p) => (
                <span key={p.tab} className="person">
                  <i style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
          </section>
        </aside>
        <main className="pitch-panel">
          <div className="pitch-heading">
            <div>
              <Link to="/" className="back">
                <ChevronLeft size={15} /> VOLVER AL POTRERO
              </Link>
            </div>
            <span className="pitch-format-badge">
              {data.board.players_per_team} vs {data.board.players_per_team}
            </span>
          </div>
          <div className="pitch-workspace">
            <div ref={fieldRef} className="pitch-container vertical">
              <Suspense
                fallback={<p className="status-page">Dibujando la cancha…</p>}
              >
                <FootballField
                  players={players}
                  playersPerTeam={data.board.players_per_team}
                  locks={data.locks}
                  people={board.people}
                  now={board.now}
                  enabled={board.connected}
                  onSelect={setEditor}
                  begin={board.begin}
                  moving={board.moving}
                  end={board.end}
                />
              </Suspense>
              {players.length === 0 && (
                <div className="empty-pitch">
                  <Shirt size={28} />
                  <h2>Armá tu equipo.</h2>
                  <p>Arrastrá un color a la cancha.</p>
                </div>
              )}
            </div>
          </div>
          <div className="pitch-caption">
            <span>
              <Move size={14} /> Arrastrá para mover · Doble clic para editar
            </span>
            <span>POSICIONES GUARDADAS AL SOLTAR</span>
          </div>
        </main>
      </div>
      {editor && (
        <PlayerForm
          key={editor.id}
          player={editor}
          onClose={() => setEditor(null)}
          onSave={async (values, operationId) => {
            await board.change(
              "update",
              editor.id,
              values,
              editor.version,
              undefined,
              operationId,
            );
          }}
          onDelete={async () => {
            await board.change("delete", editor.id, {}, editor.version);
          }}
          onPlacement={() => setPlacement(editor)}
        />
      )}
    </div>
  );
}
