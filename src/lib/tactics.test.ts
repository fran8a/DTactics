import { describe, expect, it } from "vitest";
import { buildTrack, sampleTrack } from "./tactics";

describe("recorridos tácticos", () => {
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
