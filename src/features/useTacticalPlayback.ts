import { useCallback, useEffect, useRef, useState } from "react";
import type { Player, Tactics, TacticalSpeed } from "../lib/model";
import type { PlaybackSignal } from "./useBoard";
import {
  buildTrack,
  sampleTrack,
  tacticalSignature,
  type Track,
} from "../lib/tactics";

type Phase = "idle" | "playing" | "paused" | "finished";
type Capture = {
  signature: string;
  players: Player[];
  tracks: Record<string, Track>;
  duration: number;
  speeds: Record<string, TacticalSpeed>;
};

export function useTacticalPlayback(
  formation: string | undefined,
  players: Player[],
  tactics: Tactics,
  signal?: PlaybackSignal | null,
  broadcast?: (
    action: "play" | "pause" | "reset",
    elapsed?: number,
    signature?: string,
  ) => void,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const capture = useRef<Capture | null>(null);
  const elapsed = useRef(0);
  const frame = useRef(0);
  const start = useRef(0);
  const appliedSignal = useRef(0);
  const signature = tacticalSignature(formation, tactics, players);
  const stopFrame = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  const clear = useCallback(() => {
    stopFrame();
    capture.current = null;
    elapsed.current = 0;
    setProgress(0);
    setPhase("idle");
    setMessage("");
  }, [stopFrame]);
  const buildCapture = useCallback((): Capture | null => {
    const tracks: Record<string, Track> = {};
    for (const player of players) {
      const route = tactics.routes[player.id];
      if (player.placement === "field" && route?.length)
        tracks[player.id] = buildTrack(
          { x: player.x, y: player.y },
          route.slice(-1),
        );
    }
    if (!Object.keys(tracks).length) return null;
    return {
      signature,
      players: players.map((p) => ({ ...p })),
      tracks,
      duration: tactics.duration_ms,
      speeds: { ...tactics.speeds },
    };
  }, [players, tactics, signature]);
  useEffect(() => {
    if (capture.current && capture.current.signature !== signature) {
      clear();
      setMessage("La formación cambió. Se reinició la vista previa.");
    }
  }, [signature, clear]);
  useEffect(() => () => stopFrame(), [stopFrame]);
  useEffect(() => {
    if (
      !signal ||
      signal.id === appliedSignal.current ||
      signal.formation !== formation
    )
      return;
    if (signal.action === "reset") {
      appliedSignal.current = signal.id;
      clear();
      return;
    }
    if (signal.signature && signal.signature !== signature) return;
    if (!capture.current || capture.current.signature !== signature) {
      const nextCapture = buildCapture();
      if (!nextCapture) return;
      capture.current = nextCapture;
    }
    appliedSignal.current = signal.id;
    stopFrame();
    const duration = capture.current.duration;
    const extra =
      signal.action === "play"
        ? Math.max(0, performance.now() - signal.receivedAt)
        : 0;
    elapsed.current = Math.min(duration, Math.max(0, signal.elapsed + extra));
    const next = elapsed.current / duration;
    setProgress(next);
    setMessage("");
    if (signal.action === "pause") setPhase("paused");
    else if (next >= 1) setPhase("finished");
    else setPhase("playing");
  }, [signal, signature, formation, buildCapture, clear, stopFrame]);
  useEffect(() => {
    if (phase !== "playing" || !capture.current) return;
    start.current = performance.now() - elapsed.current;
    const tick = (now: number) => {
      if (!capture.current) return;
      elapsed.current = Math.min(
        capture.current.duration,
        Math.max(0, now - start.current),
      );
      const next = elapsed.current / capture.current.duration;
      setProgress(next);
      if (next >= 1) {
        setPhase("finished");
        frame.current = 0;
      } else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return stopFrame;
  }, [phase, signal?.id, stopFrame]);
  function play() {
    if (phase === "playing" || phase === "finished") return;
    if (phase === "idle") {
      const nextCapture = buildCapture();
      if (!nextCapture) return;
      capture.current = nextCapture;
      elapsed.current = 0;
      setProgress(0);
      setMessage("");
    }
    setPhase("playing");
    broadcast?.(
      "play",
      elapsed.current,
      capture.current?.signature ?? signature,
    );
  }
  function pause() {
    if (phase !== "playing" || !capture.current) return;
    stopFrame();
    elapsed.current = Math.min(
      capture.current.duration,
      Math.max(0, performance.now() - start.current),
    );
    setProgress(elapsed.current / capture.current.duration);
    setPhase("paused");
    broadcast?.("pause", elapsed.current, capture.current.signature);
  }
  function reset() {
    clear();
    broadcast?.("reset", 0, signature);
  }
  const preview =
    capture.current && phase !== "idle"
      ? capture.current.players.map((p) => {
          const track = capture.current!.tracks[p.id];
          return track
            ? {
                ...p,
                ...sampleTrack(
                  track,
                  progress,
                  capture.current!.speeds[p.id] ?? 1,
                ),
              }
            : p;
        })
      : players;
  return {
    phase,
    progress,
    message,
    players: preview,
    locked: phase !== "idle",
    play,
    pause,
    reset,
  };
}
