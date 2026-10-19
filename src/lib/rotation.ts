// Unit quaternions, multiplied in screen space to avoid Euler angle locks.
export type Quaternion = readonly [number, number, number, number];
export const identity: Quaternion = [0, 0, 0, 1];
export function multiply(a: Quaternion, b: Quaternion): Quaternion {
  const [x, y, z, w] = a,
    [u, v, s, t] = b;
  const result = [
    w * u + x * t + y * s - z * v,
    w * v - x * s + y * t + z * u,
    w * s + x * v - y * u + z * t,
    w * t - x * u - y * v - z * s,
  ];
  const length = Math.hypot(...result);
  return result.map((n) => n / length) as unknown as Quaternion;
}
export function rotation(x: number, y: number, z = 0): Quaternion {
  const angle = Math.hypot(x, y, z);
  if (angle < 1e-10) return identity;
  const s = Math.sin(angle / 2) / angle;
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}
export function matrix(q: Quaternion) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    0,
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    0,
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
    0,
    0,
    0,
    0,
    1,
  ];
}
export const cssRotation = (q: Quaternion) =>
  `matrix3d(${matrix(q).join(",")})`;
export const initialRotation = multiply(
  rotation(0, 0, Math.PI / 60),
  multiply(rotation(0, -Math.PI / 15), rotation(-Math.PI / 24, 0)),
);
