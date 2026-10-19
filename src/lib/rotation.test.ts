import { describe, it, expect } from "vitest";
import { identity, multiply, rotation, matrix } from "./rotation";
describe("rotación de la maqueta", () => {
  it("mantiene una base ortogonal y longitud unitaria tras muchos arrastres combinados", () => {
    let q = identity;
    for (let i = 0; i < 10000; i++)
      q = multiply(rotation(Math.sin(i) * 0.02, Math.cos(i) * 0.03), q);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
    const m = matrix(q),
      axes = [
        [m[0], m[1], m[2]],
        [m[4], m[5], m[6]],
        [m[8], m[9], m[10]],
      ];
    for (const axis of axes) expect(Math.hypot(...axis)).toBeCloseTo(1, 10);
    for (let i = 0; i < 3; i++)
      expect(
        axes[i].reduce((s, n, j) => s + n * axes[(i + 1) % 3][j], 0),
      ).toBeCloseTo(0, 10);
  });
  it("permite observar el reverso y dar vueltas completas en ambos ejes", () => {
    for (const axis of [
      [1, 0],
      [0, 1],
    ]) {
      const half = rotation(axis[0] * Math.PI, axis[1] * Math.PI);
      expect(matrix(half)[10]).toBeCloseTo(-1, 12);
      const whole = multiply(half, half);
      matrix(whole).forEach((n, i) =>
        expect(n).toBeCloseTo(matrix(identity)[i], 12),
      );
    }
  });
  it("acumula rotaciones sin conmutarlas ni perder grados de libertad al mirar de canto", () => {
    const x = rotation(Math.PI / 2, 0),
      y = rotation(0, Math.PI / 2);
    expect(matrix(multiply(x, y))).not.toEqual(matrix(multiply(y, x)));
    const turned = multiply(rotation(0, Math.PI), x);
    expect(matrix(turned)[9]).toBeCloseTo(-1, 12);
  });
});
