import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { outsideSolid } from "../lib/solidCollision";
import "./GuideBalls.css";

const {
  Bodies,
  Body,
  Composite,
  Constraint,
  Engine,
  Sleeping,
  Events,
  Vertices,
} = Matter;
const RADIUS = 21;
const STEP = 1000 / 120;
const GRAVITY = 0.00115;
const BALL_CATEGORY = 1;
const OBSTACLE_CATEGORY = 2;
const WALL_CATEGORY = 4;
type Point = { x: number; y: number };
type Ball = {
  id: number;
  body: Matter.Body;
  step: number;
  flight?: { stage: "pitch" | "step"; remaining: number; target: Point };
};
type Drag = {
  ball: Ball;
  constraint: Matter.Constraint;
  samples: (Point & { time: number })[];
};

/** DOM paints the balls; Matter owns all positions, collisions and throw velocities. */
export default function GuideBalls({
  launches,
  onArrival,
}: {
  launches: number;
  onArrival: (step: number) => void;
}) {
  const [ids, setIds] = useState<number[]>([]);
  const nodes = useRef(new Map<number, HTMLButtonElement>());
  const runtime = useRef<{
    launch: () => void;
    grab: (id: number, event: React.PointerEvent<HTMLButtonElement>) => void;
    move: (event: React.PointerEvent<HTMLButtonElement>) => void;
    release: (pointerId: number, cancelled?: boolean) => void;
    kick: (id: number) => void;
  } | null>(null);
  const arrival = useRef(onArrival);
  arrival.current = onArrival;
  const consumed = useRef(0);

  useEffect(() => {
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1;
    engine.gravity.scale = GRAVITY;
    engine.positionIterations = 10;
    const balls: Ball[] = [];
    const drags = new Map<number, Drag>();
    let walls: Matter.Body[] = [];
    let pitchBody: Matter.Body | null = null;
    let buttonBody: Matter.Body | null = null;
    let buttonBounds = "";
    let pitchHull: Point[] = [];
    const probes = [
      ...document.querySelectorAll<HTMLElement>(".home .pitch-collision-probe"),
    ];
    const syncPitch = () => {
      const points = probes.map((probe) => {
        const rect = probe.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
      });
      if (points.length < 3) return;
      const hull = Vertices.hull(points as Matter.Vertex[]);
      if (Math.abs(Vertices.area(hull, false)) < 1) return;
      const changed =
        hull.length !== pitchHull.length ||
        hull.some((point, index) => {
          const previousPoint = pitchHull[index];
          return (
            !previousPoint ||
            Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) >
              0.1
          );
        });
      if (changed && pitchBody) {
        // A sleeping ball resting against the slab must fall or be pushed when it rotates.
        const oldBounds = pitchBody.bounds;
        const minX =
          Math.min(oldBounds.min.x, ...hull.map((p) => p.x)) - RADIUS * 2;
        const maxX =
          Math.max(oldBounds.max.x, ...hull.map((p) => p.x)) + RADIUS * 2;
        const minY =
          Math.min(oldBounds.min.y, ...hull.map((p) => p.y)) - RADIUS * 2;
        const maxY =
          Math.max(oldBounds.max.y, ...hull.map((p) => p.y)) + RADIUS * 2;
        for (const ball of balls) {
          const p = ball.body.position;
          if (
            ball.body.isSleeping &&
            p.x >= minX &&
            p.x <= maxX &&
            p.y >= minY &&
            p.y <= maxY
          )
            Sleeping.set(ball.body, false);
        }
      }
      pitchHull = hull;
      const center = Vertices.centre(hull);
      if (!pitchBody) {
        pitchBody = Bodies.fromVertices(center.x, center.y, [hull], {
          isStatic: true,
          restitution: 0.8,
          friction: 0.1,
          slop: 0.01,
          label: "Projected pitch",
          collisionFilter: { category: OBSTACLE_CATEGORY },
        });
        Composite.add(engine.world, pitchBody);
      } else {
        Body.setVertices(pitchBody, hull);
        Body.setPosition(pitchBody, center);
      }
    };
    const syncButton = () => {
      const button = document.querySelector<HTMLElement>(".home .hero-cta");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const bounds = [rect.x, rect.y, rect.width, rect.height].join(",");
      if (bounds === buttonBounds) return;
      buttonBounds = bounds;
      if (buttonBody) Composite.remove(engine.world, buttonBody);
      buttonBody = Bodies.rectangle(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width,
        rect.height,
        {
          isStatic: true,
          restitution: 0.8,
          friction: 0.2,
          chamfer: { radius: Math.min(6, rect.height / 2) },
          collisionFilter: { category: OBSTACLE_CATEGORY },
          label: "Create board button",
        },
      );
      Composite.add(engine.world, buttonBody);
    };
    let frame = 0;
    let previous = 0;
    let accumulated = 0;
    let impactTimer = 0;
    let nextId = 0;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (p: Point): Point => ({
      x: Math.max(RADIUS, Math.min(innerWidth - RADIUS, p.x)),
      y: Math.max(RADIUS, Math.min(innerHeight - RADIUS, p.y)),
    });
    const center = (selector: string, fallback: Point) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? clamp({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : fallback;
    };
    const stepPoint = (step: number) =>
      center(`.home .step:nth-of-type(${step + 1}) .step-top span`, {
        x: (innerWidth * (step + 1)) / 4,
        y: innerHeight - 90,
      });
    const pitchPoint = () => {
      if (!pitchHull.length)
        return { x: innerWidth * 0.75, y: innerHeight * 0.35 };
      // Approach a point just inside the upper edge; the actual collision triggers the bounce.
      const top = [...pitchHull].sort((a, b) => a.y - b.y).slice(0, 3);
      return clamp({
        x: top.reduce((sum, p) => sum + p.x, 0) / top.length,
        y: Math.min(...top.map((p) => p.y)) + RADIUS,
      });
    };
    const flashPitch = () => {
      const pitch = document.querySelector<HTMLElement>(".home .pitch-scene");
      if (!pitch) return;
      pitch.dataset.ballImpact = "true";
      clearTimeout(impactTimer);
      impactTimer = window.setTimeout(
        () => delete pitch.dataset.ballImpact,
        350,
      );
    };
    // Solve a ballistic arc, including gravity, rather than interpolating through other balls.
    const aim = (ball: Ball, target: Point, duration: number) => {
      const p = ball.body.position;
      Body.setVelocity(ball.body, {
        x: ((target.x - p.x) / duration) * (1000 / 60),
        y:
          ((target.y - p.y) / duration - (GRAVITY * duration) / 2) *
          (1000 / 60),
      });
      Body.setAngularVelocity(ball.body, (target.x - p.x) / 3000);
      Sleeping.set(ball.body, false);
    };
    const collision = (event: Matter.IEventCollision<Matter.Engine>) => {
      for (const pair of event.pairs) {
        const hitPitch = pair.bodyA === pitchBody || pair.bodyB === pitchBody;
        const hitButton =
          pair.bodyA === buttonBody || pair.bodyB === buttonBody;
        if (hitPitch) flashPitch();
        if (hitButton) {
          const button = document.querySelector<HTMLElement>(".home .hero-cta");
          button?.animate(
            [
              { boxShadow: "0 0 0 5px #e98c5080" },
              { boxShadow: "0 0 0 0 transparent" },
            ],
            { duration: 350 },
          );
        }
      }
    };
    Events.on(engine, "collisionStart", collision);
    const paint = () => {
      for (const ball of balls) {
        const node = nodes.current.get(ball.id);
        if (node) {
          node.style.transform = `translate3d(${ball.body.position.x - RADIUS}px,${ball.body.position.y - RADIUS}px,0) rotate(${ball.body.angle}rad)`;
          node.dataset.phase = ball.flight?.stage ?? "free";
          node.dataset.targetStep = String(ball.step + 1);
        }
      }
    };
    const update = (time: number) => {
      frame = 0;
      accumulated += Math.min(40, previous ? time - previous : STEP);
      previous = time;
      syncPitch();
      syncButton();
      while (accumulated >= STEP) {
        // During the introduction, keep the destination exact and ignore page obstacles.
        // Ball-to-ball collisions remain enabled; free physics starts at the numbered step.
        for (const ball of balls) {
          if (!ball.flight) continue;
          if (ball.flight.stage === "step")
            ball.flight.target = stepPoint(ball.step);
          if (ball.flight.remaining > STEP)
            aim(ball, ball.flight.target, ball.flight.remaining);
        }
        Engine.update(engine, STEP);
        // Pointer constraints run after Matter's contact solver. Keep held balls on the surface.
        for (const drag of drags.values()) {
          for (const solid of [pitchBody, buttonBody]) {
            if (!solid) continue;
            const outside = outsideSolid(
              drag.ball.body.position,
              RADIUS,
              solid.vertices,
            );
            if (outside) Body.setPosition(drag.ball.body, outside);
          }
        }
        for (const ball of balls) {
          const flight = ball.flight;
          if (!flight) continue;
          flight.remaining -= STEP;
          if (flight.remaining > 0) continue;
          Body.setPosition(ball.body, flight.target);
          if (flight.stage === "pitch") {
            flashPitch();
            ball.flight = {
              stage: "step",
              remaining: 1100,
              target: stepPoint(ball.step),
            };
            aim(ball, ball.flight.target, 1100);
          } else {
            ball.flight = undefined;
            ball.body.collisionFilter.mask = 0xffffffff;
            ball.body.frictionAir = 0.003;
            Body.setVelocity(ball.body, { x: -2 + Math.random() * 4, y: -6 });
            arrival.current(ball.step);
          }
        }
        accumulated -= STEP;
      }
      paint();
      if (drags.size || balls.length > 0) {
        frame = requestAnimationFrame(update);
      } else previous = 0;
    };
    const wake = () => {
      if (!frame && !document.hidden) {
        previous = 0;
        frame = requestAnimationFrame(update);
      }
    };
    const resize = () => {
      Composite.remove(engine.world, walls);
      walls = [
        Bodies.rectangle(
          innerWidth / 2,
          innerHeight + 50,
          innerWidth + 200,
          100,
          { isStatic: true, collisionFilter: { category: WALL_CATEGORY } },
        ),
        Bodies.rectangle(innerWidth / 2, -50, innerWidth + 200, 100, {
          isStatic: true,
          collisionFilter: { category: WALL_CATEGORY },
        }),
        Bodies.rectangle(-50, innerHeight / 2, 100, innerHeight + 200, {
          isStatic: true,
          collisionFilter: { category: WALL_CATEGORY },
        }),
        Bodies.rectangle(
          innerWidth + 50,
          innerHeight / 2,
          100,
          innerHeight + 200,
          { isStatic: true, collisionFilter: { category: WALL_CATEGORY } },
        ),
      ];
      Composite.add(engine.world, walls);
      for (const ball of balls) {
        Body.setPosition(ball.body, clamp(ball.body.position));
        Sleeping.set(ball.body, false);
      }
      wake();
    };
    const release = (pointerId: number, cancelled = false) => {
      const drag = drags.get(pointerId);
      if (!drag) return;
      Composite.remove(engine.world, drag.constraint);
      drags.delete(pointerId);
      const node = nodes.current.get(drag.ball.id);
      if (node) delete node.dataset.grabbed;
      if (!cancelled) {
        const last = drag.samples.at(-1)!;
        const first = drag.samples[0];
        const elapsed = Math.max(16, last.time - first.time);
        const fresh = performance.now() - last.time < 100;
        const vx = fresh ? ((last.x - first.x) / elapsed) * (1000 / 60) : 0;
        const vy = fresh ? ((last.y - first.y) / elapsed) * (1000 / 60) : 0;
        // Bound velocity so even a fast flick cannot tunnel through another ball.
        const speed = Math.hypot(vx, vy);
        const factor = Math.min(1, 24 / Math.max(1, speed));
        Body.setVelocity(drag.ball.body, { x: vx * factor, y: vy * factor });
        Body.setAngularVelocity(drag.ball.body, vx * 0.015);
      }
      Sleeping.set(drag.ball.body, false);
      wake();
    };
    runtime.current = {
      launch: () => {
        const source = center(".home .nav-link", {
          x: innerWidth - 100,
          y: 40,
        });
        const origin = motion.matches
          ? { x: source.x, y: innerHeight - RADIUS }
          : source;
        // Find a free launch position when users click repeatedly.
        let position = origin;
        for (let i = 0; i < 160; i++) {
          const candidate = clamp({
            x: origin.x + Math.cos(i * 2.4) * Math.sqrt(i) * RADIUS,
            y: origin.y + Math.sin(i * 2.4) * Math.sqrt(i) * RADIUS,
          });
          if (
            balls.every(
              (ball) =>
                Math.hypot(
                  ball.body.position.x - candidate.x,
                  ball.body.position.y - candidate.y,
                ) >=
                RADIUS * 2 + 2,
            )
          ) {
            position = candidate;
            break;
          }
        }
        const ball: Ball = {
          id: ++nextId,
          step: (nextId - 1) % 3,
          body: Bodies.circle(
            position.x,
            position.y,
            RADIUS,
            {
              collisionFilter: {
                category: BALL_CATEGORY,
                mask: motion.matches
                  ? 0xffffffff
                  : BALL_CATEGORY | WALL_CATEGORY,
              },
              restitution: 0.76,
              friction: 0.18,
              frictionStatic: 0.5,
              frictionAir: 0,
              slop: 0.01,
              sleepThreshold: 90,
            },
            32,
          ),
        };
        balls.push(ball);
        Composite.add(engine.world, ball.body);
        if (motion.matches) {
          arrival.current(ball.step);
        } else {
          const target = pitchPoint();
          aim(ball, target, 520);
          ball.flight = { stage: "pitch", remaining: 520, target };
        }
        setIds(balls.map((item) => item.id));
        wake();
      },
      grab: (id, event) => {
        if (event.button !== 0) return;
        const ball = balls.find((item) => item.id === id);
        if (!ball || [...drags.values()].some((drag) => drag.ball === ball))
          return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        ball.flight = undefined;
        ball.body.collisionFilter.mask = 0xffffffff;
        ball.body.frictionAir = 0.003;
        const point = clamp({ x: event.clientX, y: event.clientY });
        const constraint = Constraint.create({
          pointA: point,
          bodyB: ball.body,
          pointB: {
            x: point.x - ball.body.position.x,
            y: point.y - ball.body.position.y,
          },
          stiffness: 0.25,
          damping: 0.15,
          length: 0,
        });
        Composite.add(engine.world, constraint);
        drags.set(event.pointerId, {
          ball,
          constraint,
          samples: [{ ...point, time: performance.now() }],
        });
        event.currentTarget.dataset.grabbed = "true";
        Sleeping.set(ball.body, false);
        wake();
      },
      move: (event) => {
        const drag = drags.get(event.pointerId);
        if (!drag) return;
        const point = clamp({ x: event.clientX, y: event.clientY });
        drag.constraint.pointA = point;
        const now = performance.now();
        drag.samples.push({ ...point, time: now });
        drag.samples = drag.samples.filter(
          (sample) => now - sample.time <= 100,
        );
        wake();
      },
      release,
      kick: (id) => {
        const ball = balls.find((item) => item.id === id);
        if (!ball) return;
        ball.flight = undefined;
        ball.body.collisionFilter.mask = 0xffffffff;
        Body.setVelocity(ball.body, { x: (Math.random() - 0.5) * 12, y: -13 });
        Sleeping.set(ball.body, false);
        wake();
      },
    };
    const blur = () => {
      for (const pointer of drags.keys()) release(pointer, true);
    };
    const visibility = () => {
      if (document.hidden) {
        blur();
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
      } else wake();
    };
    syncPitch();
    syncButton();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(impactTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      delete document.querySelector<HTMLElement>(".home .pitch-scene")?.dataset
        .ballImpact;
      Composite.clear(engine.world, false);
      Events.off(engine, "collisionStart", collision);
      Engine.clear(engine);
      runtime.current = null;
      consumed.current = 0;
    };
  }, []);

  useEffect(() => {
    while (consumed.current < launches && runtime.current) {
      consumed.current++;
      runtime.current.launch();
    }
  }, [launches]);

  return (
    <div className="guide-balls" aria-label="Pelotas interactivas">
      {ids.map((id) => (
        <button
          key={id}
          ref={(node) => {
            if (node) nodes.current.set(id, node);
            else nodes.current.delete(id);
          }}
          type="button"
          className="physics-ball"
          aria-label={`Pelota ${id}. Arrastrá y soltá para revolear; Enter para patear.`}
          onPointerDown={(event) => runtime.current?.grab(id, event)}
          onPointerMove={(event) => runtime.current?.move(event)}
          onPointerUp={(event) => runtime.current?.release(event.pointerId)}
          onPointerCancel={(event) =>
            runtime.current?.release(event.pointerId, true)
          }
          onLostPointerCapture={(event) =>
            runtime.current?.release(event.pointerId, true)
          }
          onClick={(event) => {
            if (event.detail === 0) runtime.current?.kick(id);
          }}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="49" fill="#fbfbf1" />
            <g fill="none" stroke="#858c83" strokeWidth="1.2">
              <path d="M38 34 19 22M62 34 81 22M71 57 94 64M50 73 50 98M29 57 6 64M19 22 12 45 6 64M81 22 88 45 94 64M6 64 29 83 50 98 71 83 94 64M19 22 50 12 81 22" />
            </g>
            <g fill="#1b3029">
              <path d="m50 27 23 17-9 27H36l-9-27ZM9 16l15 4-6 21L0 43ZM76 20l15-4 9 27-18-2ZM17 76l18 4 4 20-22-8ZM65 80l18-4v16l-22 8ZM39 0h22l-4 13H43Z" />
            </g>
          </svg>
        </button>
      ))}
    </div>
  );
}
