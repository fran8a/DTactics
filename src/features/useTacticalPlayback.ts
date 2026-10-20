import { useCallback, useEffect, useRef, useState } from "react";
import type { Player, Tactics } from "../lib/model";
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
};

export function useTacticalPlayback(
  formation: string | undefined,
  players: Player[],
  tactics: Tactics,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const capture = useRef<Capture | null>(null);
  const elapsed = useRef(0);
  const frame = useRef(0);
  const start = useRef(0);
  const signature = tacticalSignature(formation, tactics, players);
  const stopFrame = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  const reset = useCallback(() => {
    stopFrame();
    capture.current = null;
    elapsed.current = 0;
    setProgress(0);
    setPhase("idle");
    setMessage("");
  }, [stopFrame]);
  useEffect(() => {
    if (capture.current && capture.current.signature !== signature) {
      reset();
      setMessage("La formación cambió. Se reinició la vista previa.");
    }
  }, [signature, reset]);
  useEffect(() => () => stopFrame(), [stopFrame]);
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
  }, [phase, stopFrame]);
  function play() {
    if (phase === "playing" || phase === "finished") return;
    if (phase === "idle") {
      const tracks: Record<string, Track> = {};
      for (const player of players) {
        const route = tactics.routes[player.id];
        if (player.placement === "field" && route?.length)
          tracks[player.id] = buildTrack(
            { x: player.x, y: player.y },
            route.slice(-1),
          );
      }
      if (!Object.keys(tracks).length) return;
      capture.current = {
        signature,
        players: players.map((p) => ({ ...p })),
        tracks,
        duration: tactics.duration_ms,
      };
      elapsed.current = 0;
      setProgress(0);
      setMessage("");
    }
    setPhase("playing");
  }
  function pause() {
    if (phase !== "playing" || !capture.current) return;
    stopFrame();
    elapsed.current = Math.min(
      capture.current.duration,
      performance.now() - start.current,
    );
    setProgress(elapsed.current / capture.current.duration);
    setPhase("paused");
  }
  const preview =
    capture.current && phase !== "idle"
      ? capture.current.players.map((p) => {
          const track = capture.current!.tracks[p.id];
          return track ? { ...p, ...sampleTrack(track, progress) } : p;
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
