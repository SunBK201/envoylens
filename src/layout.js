import { shouldShowEdgeLabel } from "./edge-path.js";
export const GRAPH_GEOMETRY = {
  cardWidth: 300,
  cardHeight: 146,
  columnStep: 364,
  rowStep: 188,
};

// Use dependency depth rather than kind-based columns: a sequence of listener
// filters must remain left-to-right, regardless of how many filters it contains.
// Conservative width budget keeps captions on one line without shrinking text.
export function graphGeometry(nodes, edges) {
  const titleWidth = Math.max(
    0,
    ...nodes.map(
      (n) => Array.from(displayTitle(n.label || "")).length * 11 + 30,
    ),
  );
  const cardWidth = Math.min(
    400,
    Math.max(GRAPH_GEOMETRY.cardWidth, titleWidth),
  );
  const gutter = Math.max(
    64,
    ...edges
      .filter((e) => shouldShowEdgeLabel(e.label))
      .map((e) => Math.max(150, Array.from(e.label).length * 15 + 30)),
  );
  return { ...GRAPH_GEOMETRY, cardWidth, columnStep: cardWidth + gutter };
}
export function displayTitle(label) {
  return label.replace(/^envoy\.filters\.(network|http|listener)\./, "");
}
export function layoutGraph(nodes, edges, geometry = GRAPH_GEOMETRY) {
  const pending = new Map(nodes.map((n) => [n.id, 0]));
  const children = new Map(nodes.map((n) => [n.id, []]));
  const parents = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!pending.has(e.source) || !pending.has(e.target)) continue;
    pending.set(e.target, pending.get(e.target) + 1);
    children.get(e.source).push(e.target);
    parents.get(e.target).push(e.source);
  }
  const queue = nodes
    .filter((n) => pending.get(n.id) === 0)
    .sort(
      (a, b) =>
        (a.kind === "listener" ? 0 : 1) - (b.kind === "listener" ? 0 : 1),
    )
    .map((n) => n.id);
  const positions = new Map(),
    depth = new Map(),
    occupied = new Map();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      upstream = parents.get(id);
    const col = upstream.length
      ? Math.max(...upstream.map((p) => depth.get(p))) + 1
      : 0;
    let row = upstream.length
      ? Math.min(...upstream.map((p) => positions.get(p).y / geometry.rowStep))
      : 0;
    if (!occupied.has(col)) occupied.set(col, new Set());
    while (occupied.get(col).has(row)) row++;
    occupied.get(col).add(row);
    depth.set(id, col);
    positions.set(id, {
      x: col * geometry.columnStep,
      y: row * geometry.rowStep,
    });
    for (const child of children.get(id)) {
      pending.set(child, pending.get(child) - 1);
      if (pending.get(child) === 0) queue.push(child);
    }
  }
  if (positions.size !== nodes.length)
    throw new Error(
      "Configuration relationships contain a cycle; cannot create a layered layout",
    );
  // A label only needs space in the gutter immediately before its target.
  // Keep the other column gaps compact, including gaps crossed by long edges.
  const gutters = Array(Math.max(0, ...depth.values()) + 1).fill(64);
  for (const e of edges) {
    if (
      !depth.has(e.source) ||
      !depth.has(e.target) ||
      !shouldShowEdgeLabel(e.label)
    )
      continue;
    const col = depth.get(e.target);
    gutters[col] = Math.max(
      gutters[col],
      150,
      Array.from(e.label).length * 15 + 30,
    );
  }
  const columnX = [0];
  for (let col = 1; col < gutters.length; col++)
    columnX[col] = columnX[col - 1] + geometry.cardWidth + gutters[col];
  // Reserve space for leaves first, then center parents on their children.
  // Reverse topological order avoids recursion on very long filter chains.
  const rows = new Map();
  let leaf = 0;
  for (const id of [...queue].reverse()) {
    const next = children.get(id);
    rows.set(
      id,
      next.length
        ? next.reduce((sum, child) => sum + rows.get(child), 0) / next.length
        : leaf++,
    );
  }
  // Move an entire unbranched run together. Per-column collision resolution
  // bends chains when another branch pushes only one of their nodes downward.
  const runByNode = new Map(),
    runs = [];
  for (const id of queue) {
    const upstream = parents.get(id);
    const previous =
      upstream.length === 1 && children.get(upstream[0]).length === 1
        ? runByNode.get(upstream[0])
        : null;
    const run = previous || {
      ids: [],
      start: depth.get(id),
      end: depth.get(id),
    };
    if (!previous) runs.push(run);
    run.ids.push(id);
    run.end = depth.get(id);
    runByNode.set(id, run);
  }
  for (const run of runs) {
    run.preferred =
      run.ids.reduce(
        (sum, id) => sum + Math.max(0, leaf - 1 - rows.get(id)),
        0,
      ) / run.ids.length;
  }
  runs.sort((a, b) => a.preferred - b.preferred || a.start - b.start);
  const placedRuns = [];
  for (const run of runs) {
    let row = run.preferred;
    const conflicts = placedRuns.filter(
      (other) => run.start <= other.end && other.start <= run.end,
    );
    for (;;) {
      const conflict = conflicts.find(
        (other) => Math.abs(row - other.row) < 1 - 1e-9,
      );
      if (!conflict) break;
      row = conflict.row + 1;
    }
    run.row = row;
    placedRuns.push(run);
    for (const id of run.ids)
      positions.set(id, {
        x: columnX[depth.get(id)],
        y: row * geometry.rowStep,
      });
  }
  return positions;
}
