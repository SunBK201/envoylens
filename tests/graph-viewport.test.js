import test from "node:test";
import assert from "node:assert/strict";
import { visibleGraph } from "../src/graph-viewport.js";

test("viewport rendering keeps crossing edges without mounting offscreen cards", () => {
  const graph = {
    geometry: { cardWidth: 300, cardHeight: 146 },
    nodes: Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      x: 0,
      y: i * 188,
    })),
  };
  const edges = [
    {
      id: "crossing",
      bounds: { left: -100, right: 600, top: 90, bottom: 210 },
    },
    {
      id: "hidden",
      bounds: { left: -100, right: 600, top: 900, bottom: 1000 },
    },
  ];
  const visible = visibleGraph(graph, edges, {
    left: 0,
    right: 500,
    top: 150,
    bottom: 200,
  });
  assert.deepEqual(
    visible.nodes.map((n) => n.id),
    ["1"],
  );
  assert.deepEqual(
    visible.connections.map((e) => e.id),
    ["crossing"],
  );
  assert.equal(graph.nodes.length, 10000);
  const bottom = visibleGraph(graph, edges, {
    left: 0,
    right: 500,
    top: 9999 * 188,
    bottom: 10000 * 188,
  });
  assert.equal(bottom.nodes[0].id, "9999");
});
