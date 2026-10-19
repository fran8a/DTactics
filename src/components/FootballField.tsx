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
} from "react-konva";
import type Konva from "konva";
import { usePlayerDrag, type DragCallbacks } from "./usePlayerDrag";
import {
  toScreen,
  pitchGeometry,
  type Player,
  type Lease,
  type Participant,
} from "../lib/model";
type Props = DragCallbacks & {
  players: Player[];
  playersPerTeam: 7 | 11;
  locks: Lease[];
  people: Participant[];
  now: number;
  enabled: boolean;
  onSelect: (p: Player) => void;
};
export default function FootballField(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width: availableWidth, height: availableHeight } =
        entry.contentRect;
      let low = 0,
        high = availableWidth;
      for (let i = 0; i < 24; i++) {
        const candidate = (low + high) / 2;
        if (pitchGeometry(candidate, false).height <= availableHeight)
          low = candidate;
        else high = candidate;
      }
      setWidth(Math.max(1, Math.floor(low)));
    });
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const geometry = pitchGeometry(width, false);
  const { scale, height, apron } = geometry;
  const line = "#c9e1cf";
  return (
    <div
      className="field-wrap"
      ref={box}
      data-pitch-left={geometry.left}
      data-pitch-top={geometry.top}
      data-pitch-width={geometry.width}
      data-pitch-height={geometry.heightInside}
      aria-label="Cancha interactiva. También podés editar jugadores desde la lista."
    >
      <Stage width={width} height={height}>
        <Layer listening={false}>
          <Group x={apron} y={apron} scaleX={scale} scaleY={scale}>
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
            <Line points={[30, 525, 650, 525]} stroke={line} strokeWidth={2} />
            <Circle x={340} y={525} radius={90} stroke={line} strokeWidth={2} />
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
  const geometry = pitchGeometry(width, false);
  const { left, top, width: w, heightInside: h } = geometry;
  const fieldPosition = toScreen(player.x, player.y, false);
  const storedOutside =
    player.outside_x != null && player.outside_y != null
      ? toScreen(player.outside_x, player.outside_y, false)
      : null;
  // Older substitutes appear outside the nearest sideline until first moved.
  const position =
    player.placement === "bench"
      ? (storedOutside ?? {
          x: player.team === "A" ? -32 / w : 1 + 32 / w,
          y: 0.08 + (index % 10) * 0.09,
        })
      : fieldPosition;
  const display = {
    x: Math.max(19, Math.min(width - 19, left + position.x * w)),
    y: Math.max(19, Math.min(height - 19, top + position.y * h)),
  };
  const drag = usePlayerDrag(node, {
    player,
    width,
    height,
    horizontal: false,
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
