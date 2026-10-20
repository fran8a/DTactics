type Point = { x: number; y: number };

/** Keep a dragged circle outside a convex solid, even when its pointer is inside it. */
export function outsideSolid(
  position: Point,
  radius: number,
  vertices: Point[],
): Point | null {
  if (vertices.length < 3) return null;
  let positive = false,
    negative = false;
  let bestDistance = Infinity;
  let closest = position;
  let edge = { x: 0, y: 0 };
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 0.000001) continue;
    const cross = dx * (position.y - a.y) - dy * (position.x - a.x);
    if (cross > 0.000001) positive = true;
    if (cross < -0.000001) negative = true;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((position.x - a.x) * dx + (position.y - a.y) * dy) / lengthSquared,
      ),
    );
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const distance = Math.hypot(position.x - q.x, position.y - q.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = q;
      edge = { x: dx, y: dy };
    }
  }
  const inside = !(positive && negative);
  if (!inside && bestDistance >= radius) return null;
  let nx = position.x - closest.x,
    ny = position.y - closest.y;
  if (inside || bestDistance < 0.000001) {
    nx = edge.y;
    ny = -edge.x;
    const center = vertices.reduce(
      (sum, p) => ({
        x: sum.x + p.x / vertices.length,
        y: sum.y + p.y / vertices.length,
      }),
      { x: 0, y: 0 },
    );
    if (nx * (closest.x - center.x) + ny * (closest.y - center.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  const length = Math.hypot(nx, ny);
  if (!length) return null;
  return {
    x: closest.x + (nx / length) * radius,
    y: closest.y + (ny / length) * radius,
  };
}
