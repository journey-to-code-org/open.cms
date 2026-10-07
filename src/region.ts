import type { Bounds } from "./site-package";

type Coordinate = [number, number];

export const regionBbox = (bounds: Bounds): string =>
  [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]].join(",");

export function regionMinZoom(bounds: Bounds, width: number, height: number): number {
  const mercatorY = (latitude: number): number =>
    (1 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / Math.PI) / 2;
  const worldWidth = (bounds[1][0] - bounds[0][0]) / 360 * 512;
  const worldHeight = (mercatorY(bounds[0][1]) - mercatorY(bounds[1][1])) * 512;
  return Math.max(0, Math.log2(Math.max(1, width) / worldWidth), Math.log2(Math.max(1, height) / worldHeight));
}

export function inRegion([longitude, latitude]: Coordinate, bounds: Bounds): boolean {
  return longitude >= bounds[0][0] && longitude <= bounds[1][0] &&
    latitude >= bounds[0][1] && latitude <= bounds[1][1];
}

// Clip edges as well as points so crossings survive without joining across outside excursions.
export function clipSegments(segments: Coordinate[][], bounds: Bounds): Coordinate[][] {
  const result: Coordinate[][] = [];
  for (const segment of segments) {
    let current: Coordinate[] = [];
    for (let i = 1; i < segment.length; i++) {
      const a = segment[i - 1]; const b = segment[i];
      const dx = b[0] - a[0]; const dy = b[1] - a[1];
      const p = [-dx, dx, -dy, dy];
      const q = [a[0] - bounds[0][0], bounds[1][0] - a[0], a[1] - bounds[0][1], bounds[1][1] - a[1]];
      let start = 0; let end = 1; let visible = true;
      for (let edge = 0; edge < 4; edge++) {
        if (p[edge] === 0) { if (q[edge] < 0) visible = false; }
        else {
          const ratio = q[edge] / p[edge];
          if (p[edge] < 0) start = Math.max(start, ratio);
          else end = Math.min(end, ratio);
        }
      }
      if (!visible || start > end) {
        if (current.length > 1) result.push(current);
        current = [];
        continue;
      }
      const clamp = ([x, y]: Coordinate): Coordinate => [
        Math.max(bounds[0][0], Math.min(bounds[1][0], x)),
        Math.max(bounds[0][1], Math.min(bounds[1][1], y)),
      ];
      const first = clamp([a[0] + start * dx, a[1] + start * dy]);
      const last = clamp([a[0] + end * dx, a[1] + end * dy]);
      const previous = current[current.length - 1];
      if (!previous || previous[0] !== first[0] || previous[1] !== first[1] || !inRegion(a, bounds)) {
        if (current.length > 1) result.push(current);
        current = [first];
      }
      current.push(last);
      if (!inRegion(b, bounds)) {
        if (current.length > 1) result.push(current);
        current = [];
      }
    }
    if (current.length > 1) result.push(current);
  }
  return result;
}
