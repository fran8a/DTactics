import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Move,
  Copy,
  ChevronLeft,
  Check,
  AlertCircle,
  X,
  Pencil,
  Shirt,
  Smartphone,
  RotateCw,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { useBoard } from "../features/useBoard";
import { fieldDrop, freePosition, type Player } from "../lib/model";
import { useMobileLayout } from "../features/useMobileLayout";
import MobileOptions from "../components/MobileOptions";
import PlayerPalette from "../components/PlayerPalette";
import ThemeToggle from "../components/ThemeToggle";
import PlayerForm from "../components/PlayerForm";
import ClearPlayersDialog from "../components/ClearPlayersDialog";
import { SocialLinks, Logo } from "../components/Identity";
import FormationTabs from "../components/FormationTabs";
import { historyShortcut } from "../lib/history";
import { getBoardLink } from "../lib/api";
import { emptyTactics } from "../lib/tactics";
import { useTacticalPlayback } from "../features/useTacticalPlayback";
import { useTacticsEditor } from "../features/useTacticsEditor";
import TacticsPanel from "../components/TacticsPanel";
import "./BoardPage.css";
const FootballField = lazy(() => import("../components/FootballField"));
export default function BoardPage({
  id,
  token,
  name,
  initialFormation,
}: {
  id: string;
  token: string;
  name: string;
  initialFormation: string | null;
}) {
  const navigate = useNavigate();
  const requested = initialFormation;
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
  const players = (board.data?.players ?? []).map((p) => {
    const preview = board.previews[p.id];
    return preview ? { ...p, x: preview.x, y: preview.y } : p;
  });
  const tactics = board.data?.tactics ?? emptyTactics;
  const playback = useTacticalPlayback(
    board.data?.formation.id,
    players,
    tactics,
    board.playbackSignal,
    board.broadcastPlayback,
  );
  const tacticEditor = useTacticsEditor(
    board.data?.formation.id,
    players,
    tactics,
    board.saveTactics,
  );
  useEffect(() => {
    if (playback.locked && tacticEditor.preparing) tacticEditor.close();
  }, [playback.locked, tacticEditor.preparing]);
  const [palettePending, setPalettePending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const mobile = useMobileLayout();
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    setToolsOpen(false);
  }, [mobile, board.selection]);
  const [preferredHorizontal, setHorizontal] = useState(() => {
    try {
      return localStorage.getItem("bizarron.pitch-horizontal.v1") === "true";
    } catch {
      return false;
    }
  });
  const horizontal = !mobile && preferredHorizontal;
  const fieldRef = useRef<HTMLDivElement>(null);
  const links = useRef(new Map<string, Promise<string>>());
  function formationLink(formation: string) {
    const cached = links.current.get(formation);
    if (cached) return cached;
    const result =
      /^[A-Za-z0-9_-]{32}$/.test(token) && formation === initialFormation
        ? Promise.resolve(token)
        : getBoardLink(id, formation);
    links.current.set(formation, result);
    void result.catch(() => links.current.delete(formation));
    return result;
  }
  useEffect(() => {
    let active = true;
    if (board.selection)
      void formationLink(board.selection)
        .then((code) => {
          if (active)
            navigate(`/p/${code}`, {
              replace: true,
              state: { shortBoard: id, shortCode: code },
            });
        })
        .catch((e: Error) => {
          if (active) setLocalError(e.message);
        });
    setEditor(null);
    return () => {
      active = false;
    };
  }, [board.selection, navigate, id, token, initialFormation]);
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
        editor ||
        playback.locked ||
        tacticEditor.dirty ||
        tacticEditor.busy
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
    playback.locked,
    tacticEditor.dirty,
    tacticEditor.busy,
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
    return fieldDrop(
      x,
      y,
      canvas.getBoundingClientRect(),
      horizontal,
      horizontal ? 2 : 1,
    );
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
      compact={mobile}
      disabled={
        !board.connected ||
        saving ||
        board.busy ||
        playback.locked ||
        tacticEditor.preparing ||
        tacticEditor.busy ||
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
      if (!board.selection) return;
      const code = await formationLink(board.selection);
      await navigator.clipboard.writeText(
        `${window.location.origin}/p/${code}`,
      );
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
  if (!data || board.fatal)
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
  const formatBlocked =
    !board.connected ||
    saving ||
    renaming ||
    !!editor ||
    palettePending ||
    board.busy ||
    confirmClear ||
    playback.locked ||
    tacticEditor.busy;
  const exceedsFormat = (format: 7 | 11) =>
    (["A", "B"] as const).some(
      (team) =>
        data.players.filter(
          (player) => player.team === team && player.placement === "field",
        ).length > format,
    );
  const controlsDisabled =
    !board.connected ||
    board.busy ||
    saving ||
    palettePending ||
    !!editor ||
    renaming ||
    confirmClear ||
    playback.locked ||
    tacticEditor.busy;
  const sidebarContent = (
    <>
      <FormationTabs
        key={data.formation.id}
        formations={data.formations}
        active={data.formation}
        disabled={controlsDisabled}
        onSelect={board.selectFormation}
        onManage={board.manageFormation}
      />
      <section className="pitch-settings" aria-label="Configuración de cancha">
        <div className="section-heading">
          <h2>Cancha</h2>
        </div>
        <div className="match-format">
          <div className="format-toggle-row">
            <span className="format-label">Fútbol</span>
            <button
              type="button"
              className="clear-players-button"
              aria-label="Eliminar todos los jugadores"
              title="Eliminar todos los jugadores"
              disabled={
                controlsDisabled ||
                data.players.length === 0 ||
                data.locks.some(
                  (lock) => Date.parse(lock.expires_at) > board.now,
                )
              }
              onClick={() => {
                setToolsOpen(false);
                setConfirmClear(true);
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
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
                    exceedsFormat(format)
                      ? `Hay un equipo con más de ${format} titulares. Enviá jugadores al banco.`
                      : `${format} vs ${format}`
                  }
                  disabled={formatBlocked || exceedsFormat(format)}
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
          {formatBlocked && !data.players.length && (
            <p className="format-hint">Hay cambios pendientes.</p>
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
        {!mobile && <div className="sidebar-palette">{palette}</div>}
        <div className="team-columns">
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
              <ul
                className="team-players"
                aria-label={`Jugadores del equipo ${team}`}
              >
                {data.players
                  .filter((p) => p.team === team)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`roster-player team-${team}`}
                        aria-label={`Editar ${p.name}, número ${p.number}, equipo ${team}`}
                        disabled={
                          !board.connected ||
                          playback.locked ||
                          tacticEditor.busy ||
                          (tacticEditor.preparing && p.placement === "bench")
                        }
                        onClick={() => {
                          setToolsOpen(false);
                          if (tacticEditor.preparing) tacticEditor.select(p);
                          else setEditor(p);
                        }}
                      >
                        <span className="roster-number">{p.number}</span>
                        <span className="roster-player-name">
                          {p.name}
                          {p.placement === "bench" ? " (fuera)" : ""}
                        </span>
                        <Pencil size={12} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
              </ul>
              {!data.players.some((p) => p.team === team) && (
                <p className="roster-empty">Sin jugadores</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <TacticsPanel
        players={data.players}
        tactics={tactics}
        editor={tacticEditor}
        playback={playback}
        disabled={
          !board.connected ||
          board.busy ||
          saving ||
          palettePending ||
          !!editor ||
          renaming ||
          confirmClear
        }
        canUndo={board.canUndo}
        canRedo={board.canRedo}
        onUndo={board.undo}
        onRedo={board.redo}
      />
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
    </>
  );
  return (
    <div
      className={`board-app ${tacticEditor.preparing ? "preparing-tactics" : ""}`}
    >
      <header className="board-header" inert={mobile && toolsOpen}>
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
              disabled={
                !board.connected || playback.locked || tacticEditor.busy
              }
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
        <div className="board-header-actions">
          <ThemeToggle />
          <button
            className="primary share"
            aria-label="Copiar enlace"
            onClick={() => void copy()}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "¡Copiado!" : "Copiar enlace"}</span>
          </button>
        </div>
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
        {!mobile && (
          <aside className="sidebar" aria-label="Herramientas del pizarr?n">
            {sidebarContent}
          </aside>
        )}
        {mobile && toolsOpen && (
          <MobileOptions onClose={() => setToolsOpen(false)}>
            {sidebarContent}
          </MobileOptions>
        )}
        <main className="pitch-panel" inert={mobile && toolsOpen}>
          <div className="pitch-heading">
            <div>
              <Link to="/" className="back">
                <ChevronLeft size={15} /> VOLVER AL POTRERO
              </Link>
            </div>
            <div className="pitch-view-controls">
              {!mobile && (
                <button
                  type="button"
                  className="orientation-switch"
                  role="switch"
                  aria-label="Cancha horizontal"
                  aria-checked={horizontal}
                  disabled={
                    palettePending ||
                    data.locks.some(
                      (lock) => Date.parse(lock.expires_at) > board.now,
                    )
                  }
                  title={
                    horizontal
                      ? "Girar cancha a vertical"
                      : "Girar cancha a horizontal"
                  }
                  onClick={() => {
                    const next = !horizontal;
                    setHorizontal(next);
                    try {
                      localStorage.setItem(
                        "bizarron.pitch-horizontal.v1",
                        String(next),
                      );
                    } catch {
                      /* The view remains usable when storage is unavailable. */
                    }
                  }}
                >
                  <span className="orientation-icon" aria-hidden="true">
                    <span className="orientation-device">
                      <Smartphone size={18} />
                    </span>
                    <RotateCw className="orientation-arrow" size={12} />
                  </span>
                </button>
              )}
              <span className="pitch-format-badge">
                {data.board.players_per_team} vs {data.board.players_per_team}
              </span>
            </div>
          </div>
          <div className="pitch-workspace">
            <div
              ref={fieldRef}
              className={`pitch-container ${horizontal ? "horizontal" : "vertical"}`}
            >
              <Suspense
                fallback={<p className="status-page">Dibujando la cancha…</p>}
              >
                <FootballField
                  key={data.formation.id}
                  ball={{
                    ...(data.ball ?? {
                      id: data.formation.id,
                      x: 0.5,
                      y: 0.5,
                      version: 1,
                    }),
                    ...board.previews[data.formation.id],
                  }}
                  players={playback.players}
                  routePlayers={players}
                  routes={tactics.routes}
                  preparing={tacticEditor.preparing}
                  playbackLocked={playback.locked}
                  selectedRoute={tacticEditor.selected?.id}
                  draftPoints={tacticEditor.draft?.points}
                  onRouteSelect={tacticEditor.targetPlayer}
                  onArrowSelect={tacticEditor.editArrow}
                  onWaypointSave={tacticEditor.add}
                  onWaypoint={tacticEditor.add}
                  onWaypointChange={tacticEditor.move}
                  playersPerTeam={data.board.players_per_team}
                  horizontal={horizontal}
                  locks={data.locks}
                  people={board.people}
                  now={board.now}
                  enabled={board.connected && !confirmClear}
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
          {mobile && (
            <div className="mobile-board-actions">
              {palette}
              <button
                className="mobile-options-toggle"
                aria-expanded={toolsOpen}
                aria-controls="mobile-board-options"
                onClick={() => setToolsOpen(true)}
              >
                <SlidersHorizontal size={18} /> Opciones
              </button>
            </div>
          )}
          <div className="pitch-caption">
            <SocialLinks />
            <div className="pitch-help">
              <span>POSICIONES GUARDADAS AL SOLTAR</span>
              <span>
                <Move size={14} /> Arrastrá para mover · Doble clic para editar
              </span>
            </div>
          </div>
        </main>
      </div>
      {confirmClear && (
        <ClearPlayersDialog
          onClose={() => setConfirmClear(false)}
          onConfirm={async () => {
            setSaving(true);
            try {
              for (const player of data.players) {
                await board.change("delete", player.id, {}, player.version);
              }
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
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
