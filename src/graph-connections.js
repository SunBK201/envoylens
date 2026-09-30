import { createCardIndex, routeConnection } from "./edge-routing.js";
import { shouldShowEdgeLabel } from "./edge-path.js";

export function graphConnections(graph) {
  const { geometry } = graph;
  const outgoing = new Map(),
    incoming = new Map(),
    ports = new Map();
  for (const edge of graph.edges) {
    const source = outgoing.get(edge.source) || 0;
    const target = incoming.get(edge.target) || 0;
    ports.set(edge.id, { source, target });
    outgoing.set(edge.source, source + 1);
    incoming.set(edge.target, target + 1);
  }
  const columnXs = [...new Set(graph.nodes.map((n) => n.x))].sort(
    (a, b) => a - b,
  );
  const before = new Map(),
    after = new Map();
  for (let i = 1; i < columnXs.length; i++) {
    const gap = columnXs[i] - columnXs[i - 1] - geometry.cardWidth;
    before.set(columnXs[i], gap);
    after.set(columnXs[i - 1], gap);
  }
  const cards = graph.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    width: geometry.cardWidth,
    height: geometry.cardHeight,
  }));
  const cardIndex = createCardIndex(cards),
    captions = new Map();
  return graph.edges.map((edge) => {
    const a = graph.byId.get(edge.source),
      b = graph.byId.get(edge.target);
    const port = ports.get(edge.id);
    const path = routeConnection({
      sx: a.x + geometry.cardWidth,
      sy:
        a.y +
        (geometry.cardHeight * (port.source + 1)) / (outgoing.get(a.id) + 1),
      tx: b.x,
      ty:
        b.y +
        (geometry.cardHeight * (port.target + 1)) / (incoming.get(b.id) + 1),
      sourceId: a.id,
      targetId: b.id,
      cards,
      cardIndex,
      gutter: before.get(b.x),
      sourceGutter: after.get(a.x),
    });
    const caption = path.caption,
      showLabel = shouldShowEdgeLabel(edge.label);
    let top = Math.max(52, caption.y - 16);
    if (showLabel) {
      const occupied = captions.get(caption.x) || [];
      while (occupied.some((y) => Math.abs(y - top) < 36)) top += 36;
      occupied.push(top);
      captions.set(caption.x, occupied);
    }
    return {
      ...edge,
      path: path.path,
      bounds: path.bounds,
      showLabel,
      caption: { ...caption, top },
    };
  });
}
