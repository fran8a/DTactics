import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Group,
  Text,
  Arc,
} from "react-konva";
import type Konva from "konva";
import { usePlayerDrag, type DragCallbacks } from "./usePlayerDrag";
import {
  toScreen,
  pitchGeometry,
  constrainPlayerPosition,
  lateralBenchPosition,
  type Player,
  type Lease,
  type Participant,
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
};
export default function FootballField(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [width, setWidth] = useState(500);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width: availableWidth, height: availableHeight } =
        entry.contentRect;
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
      if (props.horizontal) {
        setWidth(Math.max(1, Math.floor(low)));
        return;
      }
      // Keep the larger, scrollable margins in the vertical view.
      const fitted = pitchGeometry(
        Math.max(1, Math.floor(low)),
        props.horizontal,
      );
      const apron = 72 + 60 * fitted.scale;
      setWidth((props.horizontal ? 1050 : 680) * fitted.scale + apron * 2);
    });
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [props.horizontal]);
  const geometry = pitchGeometry(
    width,
    props.horizontal,
    props.horizontal ? 2 : 3,
  );
  const { scale, height, apron } = geometry;
  useLayoutEffect(() => {
    const viewport = box.current;
    if (!viewport) return;
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
  }, [width, props.horizontal]);
  const line = "#c9e1cf";
  return (
    <div
      className="field-wrap"
      ref={box}
      data-horizontal={props.horizontal}
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
              props.horizontal ||
              event.target !== event.target.getStage() ||
              !box.current
            )
              return;
            const viewport = box.current;
            pan.current = {
              x: event.evt.clientX,
              y: event.evt.clientY,
              left: viewport.scrollLeft,
              top: viewport.scrollTop,
            };
            const target = event.evt.target;
            if (target instanceof Element)
              target.setPointerCapture(event.evt.pointerId);
          }}
          onPointerMove={(event) => {
            const start = pan.current;
            if (props.horizontal || !start || !box.current) return;
            box.current.scrollLeft = start.left + start.x - event.evt.clientX;
            box.current.scrollTop = start.top + start.y - event.evt.clientY;
          }}
          onPointerUp={() => {
            pan.current = null;
          }}
          onPointerCancel={() => {
            pan.current = null;
          }}
        >
          <Layer listening={false}>
            <Group
              x={apron}
              y={apron + (props.horizontal ? 680 * scale : 0)}
              rotation={props.horizontal ? -90 : 0}
              scaleX={scale}
              scaleY={scale}
            >
              <Rect width={680} height={1050} fill="#246044" cornerRadius={8} />
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
            {props.players.map((player, index) => (
              <Token
                key={player.id}
                player={player}
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
  ...props
}: Props & { player: Player; width: number; height: number; index: number }) {
  const node = useRef<Konva.Group>(null);
  const lock = props.locks.find(
    (l) => l.player_id === player.id && Date.parse(l.expires_at) > props.now,
  );
  const geometry = pitchGeometry(
    width,
    props.horizontal,
    props.horizontal ? 2 : 3,
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
  const display = constrainPlayerPosition(
    { x: left + position.x * w, y: top + position.y * h },
    width,
    props.horizontal,
  );
  const drag = usePlayerDrag(node, {
    player,
    width,
    height,
    horizontal: props.horizontal,
    position: display,
    enabled: props.enabled,
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
        if (drag.canEdit()) props.onSelect(player);
      }}
      onDblTap={() => {
        if (drag.canEdit()) props.onSelect(player);
      }}
      onPointerDown={drag.onPointerDown}
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
      <Circle
        radius={18}
        hitStrokeWidth={10}
        fill={
          player.team === "A"
            ? muted
              ? "#b4a195"
              : "#ff9048"
            : muted
              ? "#96a6bb"
              : "#569cfa"
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
        fill={player.team === "A" ? "#40210c" : "#102f57"}
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
        fill={muted ? "#5d695c" : "white"}
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
          fill="#ffe8a5"
        />
      )}
    </Group>
  );
}
