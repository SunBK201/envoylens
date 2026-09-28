import { connectionPath, edgeCaption } from "./edge-path.js";
const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function curveHits(points, rect, depth = 0) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const box = {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys) - 0.01,
    bottom: Math.max(...ys) + 0.01,
  };
  if (!overlaps(box, rect)) return false;
  if (
    depth === 12 ||
    Math.max(box.right - box.left, box.bottom - box.top) < 0.5
  )
    return true;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const [a, b, c, d] = points,
    ab = mid(a, b),
    bc = mid(b, c),
    cd = mid(c, d),
    abc = mid(ab, bc),
    bcd = mid(bc, cd),
    center = mid(abc, bcd);
  return (
    curveHits([a, ab, abc, center], rect, depth + 1) ||
    curveHits([center, bcd, cd, d], rect, depth + 1)
  );
}
export function segmentHitsCard(a, b, r, padding = 0) {
  const left = r.x - padding,
    right = r.x + r.width + padding,
    top = r.y - padding,
    bottom = r.y + r.height + padding;
  if (a.x === b.x)
    return (
      a.x > left &&
      a.x < right &&
      Math.max(a.y, b.y) > top &&
      Math.min(a.y, b.y) < bottom
    );
  if (a.y === b.y)
    return (
      a.y > top &&
      a.y < bottom &&
      Math.max(a.x, b.x) > left &&
      Math.min(a.x, b.x) < right
    );
  throw new Error("Obstacle checks require orthogonal segments");
}
function simplify(points) {
  const out = [];
  for (const p of points) {
    if (out.length && out.at(-1).x === p.x && out.at(-1).y === p.y) continue;
    while (out.length > 1) {
      const a = out.at(-2),
        b = out.at(-1);
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))
        out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}
function rounded(points) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y),
      after = Math.hypot(c.x - b.x, c.y - b.y),
      r = Math.min(6, before / 2, after / 2);
    const enter = {
      x: b.x + ((a.x - b.x) * r) / before,
      y: b.y + ((a.y - b.y) * r) / before,
    };
    const leave = {
      x: b.x + ((c.x - b.x) * r) / after,
      y: b.y + ((c.y - b.y) * r) / after,
    };
    path += ` L ${enter.x} ${enter.y} Q ${b.x} ${b.y} ${leave.x} ${leave.y}`;
  }
  const end = points.at(-1);
  return `${path} L ${end.x} ${end.y}`;
}
export function routeConnection({
  sx,
  sy,
  tx,
  ty,
  sourceId,
  targetId,
  cards,
  gutter,
  sourceGutter = gutter,
}) {
  const center = (sx + tx) / 2,
    curve = [
      { x: sx, y: sy },
      { x: center, y: sy },
      { x: center, y: ty },
      { x: tx, y: ty },
    ];
  const obstacles = cards.filter((r) => r.id !== sourceId && r.id !== targetId);
  const blocked = obstacles.some((r) =>
    curveHits(curve, {
      left: r.x - 4,
      right: r.x + r.width + 4,
      top: r.y - 4,
      bottom: r.y + r.height + 4,
    }),
  );
  const caption = edgeCaption(sx, sy, tx, ty, gutter);
  if (!blocked)
    return { ...connectionPath(sx, sy, tx, ty), caption, detour: false };
  // Column gutters are clear vertical lanes. Choose the closest clear horizontal
  // band rather than sending every skipped-column edge around the whole graph.
  const exitX = sx + sourceGutter / 2,
    entryX = tx - gutter / 2;
  const candidates = new Set([
    sy,
    ty,
    ...cards.flatMap((r) => [r.y - 12, r.y + r.height + 12]),
  ]);
  let best = null,
    bestCost = Infinity;
  for (const y of candidates) {
    const lane = [
      { x: exitX, y: sy },
      { x: exitX, y },
      { x: entryX, y },
      { x: entryX, y: ty },
    ];
    if (
      lane.some(
        (p, i) => i && cards.some((r) => segmentHitsCard(lane[i - 1], p, r, 8)),
      )
    )
      continue;
    const cost =
      Math.abs(y - sy) + Math.abs(y - ty) + Math.abs(y - (sy + ty) / 2) * 0.05;
    if (cost < bestCost) {
      bestCost = cost;
      best = lane;
    }
  }
  if (!best)
    throw new Error("No safe edge path found; check for overlapping nodes");
  const points = simplify([{ x: sx, y: sy }, ...best, { x: tx, y: ty }]);
  return {
    path: rounded(points),
    caption: { ...caption, x: entryX, y: ty },
    detour: true,
    points,
  };
}
