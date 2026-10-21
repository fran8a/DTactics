import { describe, expect, it } from "vitest";
import {
  buildTrack,
  emptyTactics,
  sampleTrack,
  tacticalSignature,
  TACTICAL_SPEEDS,
} from "./tactics";

describe("recorridos tácticos", () => {
  it("aplica cada multiplicador, espera al llegar y conserva el ritmo lento al finalizar", () => {
    const track = buildTrack({ x: 0, y: 0 }, [{ x: 1, y: 0 }]);
    for (const speed of TACTICAL_SPEEDS) {
      expect(sampleTrack(track, 0.5, speed).x).toBeCloseTo(
        Math.min(1, speed / 2),
      );
      expect(sampleTrack(track, 1, speed).x).toBeCloseTo(Math.min(1, speed));
      expect(sampleTrack(track, -0.5, speed)).toEqual({ x: 0, y: 0 });
    }
    expect(sampleTrack(track, 0.5, 2)).toEqual({ x: 1, y: 0 });
    expect(sampleTrack(track, 0.9, 2)).toEqual({ x: 1, y: 0 });
    expect(sampleTrack(track, 0.8, 1.5)).toEqual({ x: 1, y: 0 });
    expect(sampleTrack(track, 1, 0.75)).toEqual({ x: 0.75, y: 0 });
    expect(sampleTrack(track, 0.4)).toEqual(sampleTrack(track, 0.4, 1));
  });
  it("incluye velocidades en la firma online independientemente del orden de sus claves", () => {
    const first = {
      ...emptyTactics,
      speeds: { a: 2 as const, b: 0.75 as const },
    };
    const reordered = { ...first, speeds: { b: 0.75 as const, a: 2 as const } };
    expect(tacticalSignature("formation", first, [])).toBe(
      tacticalSignature("formation", reordered, []),
    );
    expect(tacticalSignature("formation", first, [])).not.toBe(
      tacticalSignature(
        "formation",
        { ...first, speeds: { ...first.speeds, a: 1 } },
        [],
      ),
    );
    expect(tacticalSignature("formation", emptyTactics, [])).not.toBe(
      tacticalSignature("other", emptyTactics, []),
    );
  });
  it("recorre cada tramo a velocidad uniforme y llega al destino", () => {
    const track = buildTrack({ x: 0, y: 0 }, [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(track.length).toBe(1610);
    expect(sampleTrack(track, 620 / 1610)).toEqual({ x: 1, y: 0 });
    const half = sampleTrack(track, 0.5);
    expect(half.x).toBe(1);
    expect(half.y).toBeCloseTo((805 - 620) / 990);
    expect(sampleTrack(track, 1)).toEqual({ x: 1, y: 1 });
    expect(sampleTrack(track, 2)).toEqual({ x: 1, y: 1 });
  });
  it("maneja puntos repetidos y rutas inmóviles sin NaN ni modificar los puntos", () => {
    const origin = { x: 0.2, y: 0.3 };
    const points = [{ ...origin }, { x: 0.7, y: 0.8 }];
    const before = JSON.stringify(points);
    const track = buildTrack(origin, points);
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const p = sampleTrack(track, progress);
      expect(p.x).toBeGreaterThanOrEqual(0.2);
      expect(p.x).toBeLessThanOrEqual(0.7);
      expect(p.y).toBeGreaterThanOrEqual(0.3);
      expect(p.y).toBeLessThanOrEqual(0.8);
    }
    expect(sampleTrack(buildTrack(origin, [origin]), 0.5)).toEqual(origin);
    expect(JSON.stringify(points)).toBe(before);
  });
  it("sincroniza la llegada de recorridos con distinta distancia", () => {
    for (const end of [
      { x: 0.2, y: 0.1 },
      { x: 0.9, y: 0.8 },
    ]) {
      const track = buildTrack({ x: 0, y: 0 }, [end]);
      expect(sampleTrack(track, 0.5).x).toBeCloseTo(end.x / 2);
      expect(sampleTrack(track, 1)).toEqual(end);
    }
  });
});
