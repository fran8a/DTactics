import { memo, useEffect, useRef } from "react";
import { ArrowUpRight, Move, Users } from "lucide-react";
import {
  cssRotation,
  initialRotation,
  matrix,
  multiply,
  rotation,
  type Quaternion,
} from "../lib/rotation";
import "./LandingPitch.css";

function Surface({ note = false }: { note?: boolean }) {
  return (
    <div className="illustration-pitch">
      <div className="pitch-boundary">
        <div className="pitch-midline" />
        <div className="pitch-circle" />
        <div className="pitch-area top" />
        <div className="pitch-area bottom" />
        <div className="pitch-small top" />
        <div className="pitch-small bottom" />
        <div className="pitch-spot top" />
        <div className="pitch-spot bottom" />
      </div>
      <div className="pitch-center-dot" />
      {note && (
        <div className="pitch-note">
          Acá empieza
          <br />
          <strong>el partido.</strong>
          <ArrowUpRight size={30} />
        </div>
      )}
    </div>
  );
}

function LandingPitch() {
  const scene = useRef<HTMLDivElement>(null);
  const solid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scene.current!,
      object = solid.current!;
    if (!CSS.supports("transform-style", "preserve-3d")) return;
    const faces = Array.from(
      object.querySelectorAll<HTMLElement>("[data-normal]"),
    );
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let reduced = motion.matches,
      visible = true,
      frame = 0,
      previous = performance.now();
    let base: Quaternion = initialRotation,
      rendered = base;
    let pointer: { id: number; x: number; y: number; time: number } | null =
      null;
    let vx = 0,
      vy = 0,
      idle = 1,
      phase = 0;
    const draw = (q: Quaternion) => {
      rendered = q;
      object.style.transform = cssRotation(q);
      const m = matrix(q);
      for (const face of faces) {
        const [x, y, z] = face.dataset.normal!.split(",").map(Number);
        const nx = m[0] * x + m[4] * y + m[8] * z,
          ny = m[1] * x + m[5] * y + m[9] * z,
          nz = m[2] * x + m[6] * y + m[10] * z;
        const light = Math.max(0, -0.25 * nx - 0.35 * ny + 0.9 * nz);
        face.style.setProperty(
          "--face-shade",
          String(0.025 + (1 - light) * 0.17),
        );
      }
    };
    const animate = (time: number) => {
      if (disposed) return;
      frame = 0;
      const dt = Math.min(32, Math.max(0, time - previous));
      previous = time;
      if (!pointer) {
        if (Math.hypot(vx, vy) > 0.00001) {
          base = multiply(rotation(vx * dt, vy * dt), base);
          const friction = Math.exp(-dt / 90);
          vx *= friction;
          vy *= friction;
          idle = 0;
          phase = 0;
        } else {
          vx = vy = 0;
          phase = (phase + dt / 1000) % 5.2;
          idle += (1 - idle) * (1 - Math.exp(-dt / 900));
        }
        const progress = phase / 2.6;
        const swing =
          Math.sin(progress * Math.PI * 2) *
          Math.sin(progress * Math.PI) *
          idle;
        draw(multiply(rotation(-0.13 * swing, 0.42 * swing), base));
      }
      if (!reduced && visible && !document.hidden)
        frame = requestAnimationFrame(animate);
    };
    const wake = () => {
      if (disposed) return;
      if (!frame && !reduced && visible && !document.hidden) {
        previous = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || pointer) return;
      e.preventDefault();
      root.focus({ preventScroll: true });
      root.dataset.pointerFocus = "true";
      root.setPointerCapture(e.pointerId);
      base = rendered;
      idle = phase = vx = vy = 0;
      pointer = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: e.timeStamp,
      };
      root.dataset.dragging = "true";
    };
    const move = (e: PointerEvent) => {
      if (!pointer || pointer.id !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y,
        dt = Math.max(8, e.timeStamp - pointer.time);
      const rx = -dy * 0.008,
        ry = dx * 0.008;
      base = multiply(rotation(rx, ry), base);
      const speed = Math.hypot(rx, ry) / dt,
        limit = speed > 0.003 ? 0.003 / speed : 1;
      vx = 0.35 * vx + ((0.65 * rx) / dt) * limit;
      vy = 0.35 * vy + ((0.65 * ry) / dt) * limit;
      pointer = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: e.timeStamp,
      };
      draw(base);
    };
    const end = (e: PointerEvent) => {
      if (!pointer || pointer.id !== e.pointerId) return;
      if (reduced || e.type !== "pointerup" || e.timeStamp - pointer.time > 90)
        vx = vy = 0;
      pointer = null;
      root.dataset.dragging = "false";
      if (root.hasPointerCapture(e.pointerId))
        root.releasePointerCapture(e.pointerId);
      wake();
    };
    const keyboard = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [0, -0.16],
        ArrowRight: [0, 0.16],
        ArrowUp: [0.16, 0],
        ArrowDown: [-0.16, 0],
      };
      const delta = directions[e.key];
      if (!delta) return;
      delete root.dataset.pointerFocus;
      e.preventDefault();
      base = multiply(rotation(...delta), rendered);
      idle = phase = vx = vy = 0;
      draw(base);
      wake();
    };
    const preference = () => {
      reduced = motion.matches;
      base = rendered;
      vx = vy = idle = phase = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      draw(base);
      wake();
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        vx = vy = 0;
      } else wake();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
        vx = vy = 0;
      } else wake();
    });
    observer.observe(root);
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("lostpointercapture", end);
    root.addEventListener("keydown", keyboard);
    motion.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    draw(base);
    wake();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (pointer && root.hasPointerCapture(pointer.id))
        root.releasePointerCapture(pointer.id);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", end);
      root.removeEventListener("pointercancel", end);
      root.removeEventListener("lostpointercapture", end);
      root.removeEventListener("keydown", keyboard);
      motion.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <div
      className="hero-art pitch-scene"
      ref={scene}
      tabIndex={0}
      role="img"
      aria-label="Cancha de fútbol 3D. Arrastrá para girar en cualquier dirección, o usá las flechas del teclado."
    >
      <div
        className="pitch-solid"
        ref={solid}
        style={{ transform: cssRotation(initialRotation) }}
      >
        <div
          className="pitch-face pitch-front"
          data-normal="0,0,1"
          aria-hidden="true"
        >
          <div className="preview-top">
            <span>
              <i className="dot" /> TU PRÓXIMA GRAN JUGADA
            </span>
            <span>01 / 90</span>
          </div>
          <Surface note />
          <div className="preview-bottom">
            <span>LA CANCHA ES DE TODOS.</span>
            <Move size={18} />
          </div>
          <div className="art-sticker">
            <Users size={18} /> Una idea. Todo el equipo.
          </div>
        </div>
        <div
          className="pitch-face pitch-back"
          data-normal="0,0,-1"
          aria-hidden="true"
        >
          <Surface />
        </div>
        <div
          className="pitch-face pitch-edge pitch-edge-left"
          data-normal="-1,0,0"
          aria-hidden="true"
        />
        <div
          className="pitch-face pitch-edge pitch-edge-right"
          data-normal="1,0,0"
          aria-hidden="true"
        />
        <div
          className="pitch-face pitch-edge pitch-edge-top"
          data-normal="0,-1,0"
          aria-hidden="true"
        />
        <div
          className="pitch-face pitch-edge pitch-edge-bottom"
          data-normal="0,1,0"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
export default memo(LandingPitch);
