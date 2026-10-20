import { useEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Group,
  Text,
  Arc,
  Arrow,
  RegularPolygon,
} from "react-konva";
import type Konva from "konva";
import { usePitchColors, type PitchColors } from "./usePitchColors";
import { usePlayerDrag, type DragCallbacks } from "./usePlayerDrag";
import {
  toScreen,
  pitchGeometry,
  constrainPlayerPosition,
  lateralBenchPosition,
  type Player,
  type Lease,
  type Participant,
  type TacticalPoint,
} from "../lib/model";
type Props = DragCallbacks & {
  players: Player[];
  playersPerTeam: 7 | 11;
  horizontal: boolean;
  locks: Lease[];
  people: Participant[];
  now: number;
  enabled: boolean;
  onSelect: (p: Player) => void;
  routes?: Record<string, TacticalPoint[]>;
  routePlayers?: Player[];
  preparing?: boolean;
  playbackLocked?: boolean;
  selectedRoute?: string | null;
  draftPoints?: TacticalPoint[];
  onRouteSelect?: (player: Player) => void;
  onArrowSelect?: (player: Player) => void;
  onWaypointSave?: (point: TacticalPoint) => void;
  onWaypoint?: (point: TacticalPoint) => void;
  onWaypointChange?: (index: number, point: TacticalPoint) => void;
};
export default function FootballField(props: Props) {
  const colors = usePitchColors();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [availableHeight, setAvailableHeight] = useState(800);
  const [ball, setBall] = useState<TacticalPoint>({ x: 0.5, y: 0.5 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width: availableWidth, height: availableHeight } =
        entry.contentRect;
      setAvailableHeight(availableHeight);
      if (!props.horizontal) {
        setWidth(Math.max(1, Math.floor(availableWidth)));
        return;
      }
      let low = 0,
        high = availableWidth;
      for (let i = 0; i < 24; i++) {
        const candidate = (low + high) / 2;
        if (
          pitchGeometry(candidate, props.horizontal, props.horizontal ? 2 : 1)
            .height <= availableHeight
        )
          low = candidate;
        else high = candidate;
      }
      setWidth(Math.max(1, Math.floor(low)));
    });
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [props.horizontal]);
  const geometry = pitchGeometry(
    width,
    props.horizontal,
    props.horizontal ? 2 : 1,
    availableHeight,
  );
  const { scale, height, apron } = geometry;
  const line = colors.line;
  const screenPoint = (point: TacticalPoint) => {
    const p = toScreen(point.x, point.y, props.horizontal);
    return {
      x: geometry.left + p.x * geometry.width,
      y: geometry.top + p.y * geometry.heightInside,
    };
  };
  const canonicalPoint = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(1, (x - geometry.left) / geometry.width));
    const sy = Math.max(
      0,
      Math.min(1, (y - geometry.top) / geometry.heightInside),
    );
    return props.horizontal ? { x: 1 - sy, y: sx } : { x: sx, y: sy };
  };
  const routePlayers = props.routePlayers ?? props.players;
  // Include the outline in the bounds so the entire ball stays on the pitch.
  const ballRadius = Math.min(
    12,
    geometry.width / 4,
    geometry.heightInside / 4,
  );
  const ballInset = ballRadius + 1;
  const constrainBall = (position: { x: number; y: number }) => ({
    x: Math.max(
      geometry.left + ballInset,
      Math.min(geometry.left + geometry.width - ballInset, position.x),
    ),
    y: Math.max(
      geometry.top + ballInset,
      Math.min(geometry.top + geometry.heightInside - ballInset, position.y),
    ),
  });
  const ballDisplay = constrainBall(screenPoint(ball));
  return (
    <div
      className="field-wrap"
      ref={box}
      data-horizontal={props.horizontal}
      data-preparing={!!props.preparing}
      data-pitch-left={geometry.left}
      data-pitch-top={geometry.top}
      data-pitch-width={geometry.width}
      data-pitch-height={geometry.heightInside}
      aria-label="Cancha interactiva. También podés editar jugadores desde la lista."
    >
      <div className="field-scroll-surface" style={{ width, height }}>
        <Stage
          width={width}
          height={height}
          onPointerDown={(event) => {
            if (
              props.preparing &&
              !props.playbackLocked &&
              event.target === event.target.getStage()
            ) {
              const p = event.target.getStage()?.getPointerPosition();
              if (
                p &&
                p.x >= geometry.left &&
                p.x <= geometry.left + geometry.width &&
                p.y >= geometry.top &&
                p.y <= geometry.top + geometry.heightInside
              ) {
                event.evt.preventDefault();
                props.onWaypoint?.(canonicalPoint(p.x, p.y));
                return;
              }
            }
          }}
        >
          <Layer listening={false}>
            <Group
              x={geometry.left - 30 * scale}
              y={apron + (props.horizontal ? 680 * scale : 0)}
              rotation={props.horizontal ? -90 : 0}
              scaleX={scale}
              scaleY={scale}
            >
              <Rect
                width={680}
                height={1050}
                fill={colors.grass}
                cornerRadius={8}
              />
              {Array.from({ length: 10 }, (_, i) => (
                <Rect
                  key={i}
                  x={0}
                  y={i * 105}
                  width={680}
                  height={105}
                  fill={i % 2 ? "#ffffff05" : "#00000005"}
                />
              ))}
              <Rect
                x={30}
                y={30}
                width={620}
                height={990}
                stroke={line}
                strokeWidth={2}
              />
              <Line
                points={[30, 525, 650, 525]}
                stroke={line}
                strokeWidth={2}
              />
              <Circle
                x={340}
                y={525}
                radius={90}
                stroke={line}
                strokeWidth={2}
              />
              <Circle x={340} y={525} radius={4} fill={line} />
              {[false, true].map((bottom) => (
                <Group
                  key={String(bottom)}
                  y={bottom ? 1050 : 0}
                  scaleY={bottom ? -1 : 1}
                >
                  {props.playersPerTeam === 11 ? (
                    <>
                      <Rect
                        x={145}
                        y={30}
                        width={390}
                        height={160}
                        stroke={line}
                        strokeWidth={2}
                      />
                      <Rect
                        x={250}
                        y={30}
                        width={180}
                        height={55}
                        stroke={line}
                        strokeWidth={2}
                      />
                    </>
                  ) : (
                    <Rect
                      x={220}
                      y={30}
                      width={240}
                      height={110}
                      stroke={line}
                      strokeWidth={2}
                    />
                  )}
                  <Rect
                    x={295}
                    y={11}
                    width={90}
                    height={19}
                    stroke={line}
                    strokeWidth={2}
                  />
                  {props.playersPerTeam === 11 && (
                    <>
                      <Circle x={340} y={140} radius={4} fill={line} />
                      <Arc
                        x={340}
                        y={140}
                        innerRadius={90}
                        outerRadius={90}
                        angle={112}
                        rotation={34}
                        stroke={line}
                        strokeWidth={2}
                      />
                    </>
                  )}
                </Group>
              ))}
            </Group>
          </Layer>
          <Layer>
            {routePlayers
              .filter((p) => p.placement === "field")
              .map((player) => {
                const selected =
                  props.preparing && props.selectedRoute === player.id;
                const points = selected
                  ? (props.draftPoints ?? [])
                  : (props.routes?.[player.id] ?? []);
                if (!points.length) return null;
                const color = player.team === "A" ? colors.teamA : colors.teamB;
                return (
                  <Group key={player.id}>
                    <Arrow
                      listening={props.enabled && !props.playbackLocked}
                      hitStrokeWidth={18}
                      onPointerDown={(event) => {
                        event.cancelBubble = true;
                        props.onArrowSelect?.(player);
                      }}
                      points={[
                        { x: player.x, y: player.y },
                        ...points.slice(-1),
                      ].flatMap((p) => {
                        const s = screenPoint(p);
                        return [s.x, s.y];
                      })}
                      stroke={color}
                      fill={color}
                      strokeWidth={selected ? 3.5 : 2.5}
                      pointerLength={10}
                      pointerWidth={10}
                      lineCap="round"
                      lineJoin="round"
                      opacity={selected ? 1 : 0.8}
                    />
                    {selected &&
                      !props.playbackLocked &&
                      points.slice(-1).map((p, index) => {
                        const s = screenPoint(p);
                        return (
                          <Circle
                            key={index}
                            x={s.x}
                            y={s.y}
                            radius={7}
                            hitStrokeWidth={18}
                            stroke="white"
                            strokeWidth={2}
                            fill={color}
                            draggable
                            dragBoundFunc={(position) => ({
                              x: Math.max(
                                geometry.left,
                                Math.min(
                                  geometry.left + geometry.width,
                                  position.x,
                                ),
                              ),
                              y: Math.max(
                                geometry.top,
                                Math.min(
                                  geometry.top + geometry.heightInside,
                                  position.y,
                                ),
                              ),
                            })}
                            onPointerDown={(e) => {
                              e.cancelBubble = true;
                            }}
                            onDragMove={(e) =>
                              props.onWaypointChange?.(
                                index,
                                canonicalPoint(e.target.x(), e.target.y()),
                              )
                            }
                            onDragEnd={(e) =>
                              props.onWaypointSave?.(
                                canonicalPoint(e.target.x(), e.target.y()),
                              )
                            }
                          />
                        );
                      })}
                  </Group>
                );
              })}
          </Layer>
          <Layer>
            <Group
              name="ball"
              listening={!props.preparing}
              x={ballDisplay.x}
              y={ballDisplay.y}
              draggable={props.enabled && !props.preparing}
              dragBoundFunc={constrainBall}
              onPointerDown={(event) => {
                event.cancelBubble = true;
              }}
              onDragEnd={(event) => {
                const position = constrainBall(event.target.position());
                event.target.position(position);
                setBall(canonicalPoint(position.x, position.y));
              }}
              onMouseEnter={(event) => {
                const stage = event.target.getStage();
                if (stage)
                  stage.container().style.cursor =
                    props.enabled && !props.preparing ? "grab" : "default";
              }}
              onMouseLeave={(event) => {
                const stage = event.target.getStage();
                if (stage) stage.container().style.cursor = "default";
              }}
            >
              <Circle
                radius={ballRadius}
                fill={colors.ball}
                stroke={colors.ballInk}
                strokeWidth={2}
                shadowColor="#000"
                shadowBlur={5}
                shadowOpacity={0.25}
                shadowOffsetY={2}
              />
              <RegularPolygon
                sides={5}
                radius={ballRadius * 0.45}
                fill={colors.ballInk}
                listening={false}
              />
              {Array.from({ length: 5 }, (_, index) => {
                const angle = ((index * 72 - 90) * Math.PI) / 180;
                return (
                  <Line
                    key={index}
                    points={[
                      Math.cos(angle) * ballRadius * 0.4,
                      Math.sin(angle) * ballRadius * 0.4,
                      Math.cos(angle) * ballRadius * 0.9,
                      Math.sin(angle) * ballRadius * 0.9,
                    ]}
                    stroke={colors.ballInk}
                    strokeWidth={1.5}
                    listening={false}
                  />
                );
              })}
            </Group>
            {props.players.map((player, index) => (
              <Token
                key={player.id}
                player={player}
                colors={colors}
                width={width}
                height={height}
                index={index}
                {...props}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
function Token({
  player,
  width,
  height,
  index,
  colors,
  ...props
}: Props & {
  player: Player;
  width: number;
  height: number;
  index: number;
  colors: PitchColors;
}) {
  const node = useRef<Konva.Group>(null);
  const lock = props.locks.find(
    (l) => l.player_id === player.id && Date.parse(l.expires_at) > props.now,
  );
  const geometry = pitchGeometry(
    width,
    props.horizontal,
    props.horizontal ? 2 : 1,
    height,
  );
  const { left, top, width: w, heightInside: h } = geometry;
  const fieldPosition = toScreen(player.x, player.y, props.horizontal);
  const storedOutside =
    player.outside_x != null && player.outside_y != null
      ? { x: player.outside_x, y: player.outside_y }
      : null;
  const benchPosition = lateralBenchPosition(
    storedOutside,
    player.team,
    index,
    props.horizontal ? h : w,
  );
  // Canonical left/right sidelines become bottom/top when the pitch rotates.
  const position =
    player.placement === "bench"
      ? toScreen(benchPosition.x, benchPosition.y, props.horizontal)
      : fieldPosition;
  const rawDisplay = { x: left + position.x * w, y: top + position.y * h };
  const display =
    player.placement === "bench"
      ? constrainPlayerPosition(rawDisplay, width, props.horizontal, height)
      : rawDisplay;
  const drag = usePlayerDrag(node, {
    player,
    width,
    height,
    horizontal: props.horizontal,
    position: display,
    canEnterField:
      props.players.filter(
        (p) => p.team === player.team && p.placement === "field",
      ).length < props.playersPerTeam,
    enabled: props.enabled && !props.preparing && !props.playbackLocked,
    lock,
    begin: props.begin,
    moving: props.moving,
    end: props.end,
  });
  const muted = drag.dragOutside ?? player.placement === "bench";
  return (
    <Group
      ref={node}
      x={display.x}
      y={display.y}
      draggable={false}
      onDblClick={() => {
        if (!props.preparing && !props.playbackLocked && drag.canEdit())
          props.onSelect(player);
      }}
      onDblTap={() => {
        if (!props.preparing && !props.playbackLocked && drag.canEdit())
          props.onSelect(player);
      }}
      onPointerDown={(event) => {
        if (props.preparing) {
          event.cancelBubble = true;
          if (!props.playbackLocked && player.placement === "field")
            props.onRouteSelect?.(player);
        } else drag.onPointerDown(event);
      }}
      onMouseEnter={() => {
        if (node.current)
          node.current.getStage()!.container().style.cursor = lock
            ? "not-allowed"
            : "grab";
      }}
      onMouseLeave={() => {
        if (node.current)
          node.current.getStage()!.container().style.cursor = "default";
      }}
    >
      {props.preparing && props.selectedRoute === player.id && (
        <Circle radius={24} stroke="white" strokeWidth={2} listening={false} />
      )}
      <Circle
        radius={18}
        hitStrokeWidth={10}
        fill={
          player.team === "A"
            ? muted
              ? colors.mutedA
              : colors.teamA
            : muted
              ? colors.mutedB
              : colors.teamB
        }
        stroke={lock ? "#fff" : "#ffffffa0"}
        strokeWidth={lock ? 3 : 1.5}
        shadowColor="#000"
        shadowBlur={muted ? 2 : 8}
        shadowOpacity={0.18}
        shadowOffsetY={3}
      />
      <Text
        x={-18}
        y={-8}
        width={36}
        height={20}
        align="center"
        text={String(player.number)}
        fontSize={17}
        fontStyle="bold"
        fill={player.team === "A" ? colors.inkA : colors.inkB}
      />
      <Text
        x={display.x < 60 ? -18 : display.x > width - 60 ? -96 : -57}
        y={24}
        width={114}
        height={16}
        wrap="none"
        ellipsis
        align={
          display.x < 60 ? "left" : display.x > width - 60 ? "right" : "center"
        }
        text={player.name}
        fontSize={12}
        fontStyle="bold"
        fill={muted ? colors.benchName : colors.name}
        shadowColor="#102c20"
        shadowBlur={muted ? 0 : 3}
      />
      {lock && (
        <Text
          x={-75}
          y={40}
          width={150}
          align="center"
          text={`${props.people.find((p) => p.user_id === lock.user_id)?.name ?? "Alguien"} está moviendo`}
          fontSize={10}
          fill={muted ? colors.benchName : colors.lockName}
        />
      )}
    </Group>
  );
}
