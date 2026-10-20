import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  outsideField,
  pitchGeometry,
  constrainPlayerPosition,
  type Lease,
  type Player,
} from "../lib/model";

type Point = { x: number; y: number };
export type DragCallbacks = {
  begin: (id: string) => Promise<boolean>;
  moving: (id: string, x: number, y: number) => void;
  end: (
    id: string,
    x?: number,
    y?: number,
    placement?: "field" | "bench",
    outside?: Point,
  ) => Promise<void>;
};
type Options = DragCallbacks & {
  player: Player;
  width: number;
  height: number;
  horizontal: boolean;
  position: Point;
  canEnterField: boolean;
  enabled: boolean;
  lock?: Lease;
};
type Gesture = {
  pointerId: number;
  start: Point;
  origin: Point;
  local?: Point;
  rect: { left: number; top: number };
  capture: Element | null;
  active: boolean;
  finished: boolean;
  cancelled: boolean;
  authorized: boolean;
  finalizing: boolean;
  permission?: Promise<boolean>;
};

function point(node: Konva.Group, options: Options): Point {
  const g = pitchGeometry(
    options.width,
    options.horizontal,
    options.horizontal ? 2 : 1,
    options.height,
  );
  const x = (node.x() - g.left) / g.width;
  const y = (node.y() - g.top) / g.heightInside;
  return options.horizontal ? { x: 1 - y, y: x } : { x, y };
}

/** Paint locally on pointer input; only broadcast or persist after owning the lease. */
export function usePlayerDrag(
  node: RefObject<Konva.Group | null>,
  options: Options,
) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const mounted = useRef(false);
  const cancel = useRef<() => void>(() => {});
  const lastDrag = useRef(-Infinity);
  const shade = useRef<boolean | null>(null);
  const [dragOutside, setDragOutside] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const g = gesture.current;
    node.current?.position(g?.active && g.local ? g.local : options.position);
  });

  useEffect(() => {
    mounted.current = true;
    const color = (value: boolean | null) => {
      if (mounted.current && shade.current !== value) {
        shade.current = value;
        setDragOutside(value);
      }
    };
    const releaseCapture = (g: Gesture) => {
      if (g.capture?.hasPointerCapture(g.pointerId))
        g.capture.releasePointerCapture(g.pointerId);
    };
    const restore = (g: Gesture, reposition = true) => {
      if (gesture.current !== g) return;
      gesture.current = null;
      if (mounted.current) {
        if (reposition) node.current?.position(latest.current.position);
        color(null);
        const container = node.current?.getStage()?.container();
        if (container) container.style.cursor = "grab";
      }
    };
    const publish = (g: Gesture) => {
      if (!g.authorized || !node.current || g.cancelled || g.finished) return;
      const p = point(node.current, latest.current);
      latest.current.moving(
        latest.current.player.id,
        Math.max(0, Math.min(1, p.x)),
        Math.max(0, Math.min(1, p.y)),
      );
    };
    const finish = async (g: Gesture, cancelled: boolean) => {
      if (g.finished) return;
      g.finished = true;
      g.cancelled = cancelled;
      releaseCapture(g);
      if (!g.active) {
        restore(g);
        return;
      }
      g.finalizing = true;
      const target = node.current ? point(node.current, latest.current) : null;
      if (cancelled) {
        g.active = false;
        node.current?.position(latest.current.position);
        color(null);
      }
      try {
        if (await g.permission) {
          const current = latest.current;
          if (
            g.cancelled ||
            !mounted.current ||
            !target ||
            (current.player.placement === "bench" &&
              !current.canEnterField &&
              !outsideField(target))
          ) {
            node.current?.position(current.position);
            await current.end(current.player.id);
          } else if (outsideField(target))
            await current.end(
              current.player.id,
              current.player.x,
              current.player.y,
              "bench",
              target,
            );
          else
            await current.end(current.player.id, target.x, target.y, "field");
        }
      } finally {
        restore(g, false);
      }
    };
    cancel.current = () => {
      if (gesture.current) void finish(gesture.current, true);
    };
    const move = (event: PointerEvent) => {
      const g = gesture.current,
        n = node.current;
      if (!g || !n || g.finished || event.pointerId !== g.pointerId) return;
      if (
        !g.active &&
        Math.hypot(event.clientX - g.start.x, event.clientY - g.start.y) < 3
      )
        return;
      const starting = !g.active;
      g.active = true;
      lastDrag.current = performance.now();
      const current = latest.current;
      const rect = n.getStage()!.container().getBoundingClientRect();
      const previousPosition = n.position();
      n.position(
        constrainPlayerPosition(
          {
            x: g.origin.x + event.clientX - g.start.x + g.rect.left - rect.left,
            y: g.origin.y + event.clientY - g.start.y + g.rect.top - rect.top,
          },
          current.width,
          current.horizontal,
          current.height,
        ),
      );
      if (
        current.player.placement === "bench" &&
        !current.canEnterField &&
        !outsideField(point(n, current))
      ) {
        n.position(previousPosition);
      }
      g.local = n.position();
      color(outsideField(point(n, current)));
      n.getStage()!.container().style.cursor = "grabbing";
      if (starting) {
        g.permission = current.begin(current.player.id).then(
          (allowed) => {
            g.authorized = allowed;
            if (!allowed) {
              g.cancelled = g.finished = true;
              releaseCapture(g);
              restore(g);
            } else if (mounted.current) publish(g);
            return allowed;
          },
          () => {
            g.cancelled = g.finished = true;
            releaseCapture(g);
            restore(g);
            return false;
          },
        );
      } else publish(g);
    };
    const release = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      if (event.type === "pointerup" && g.active) move(event);
      void finish(g, event.type !== "pointerup");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("lostpointercapture", release);
    const blur = () => cancel.current();
    window.addEventListener("blur", blur);
    return () => {
      mounted.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("lostpointercapture", release);
      window.removeEventListener("blur", blur);
      const g = gesture.current;
      if (g) {
        g.cancelled = g.finished = true;
        releaseCapture(g);
        if (!g.finalizing && g.permission)
          void g.permission.then((allowed) => {
            if (allowed) return latest.current.end(latest.current.player.id);
          });
      }
      gesture.current = null;
    };
  }, [node]);

  useEffect(() => {
    const g = gesture.current;
    if (
      g &&
      !g.finished &&
      (!options.enabled || (g.authorized && !options.lock))
    )
      cancel.current();
  }, [options.enabled, options.lock]);

  const onPointerDown = (event: KonvaEventObject<PointerEvent>) => {
    const current = latest.current,
      e = event.evt,
      n = node.current;
    if (
      !n ||
      !current.enabled ||
      current.lock ||
      gesture.current ||
      e.button !== 0 ||
      !e.isPrimary
    )
      return;
    const capture = e.target instanceof Element ? e.target : null;
    capture?.setPointerCapture(e.pointerId);
    gesture.current = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      origin: n.position(),
      rect: n.getStage()!.container().getBoundingClientRect(),
      capture,
      active: false,
      finished: false,
      cancelled: false,
      authorized: false,
      finalizing: false,
    };
  };
  return {
    dragOutside,
    onPointerDown,
    canEdit: () =>
      !gesture.current?.active && performance.now() - lastDrag.current > 300,
  };
}
