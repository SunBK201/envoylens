import test from "node:test";
import assert from "node:assert/strict";
import { graphConnections } from "../src/graph-connections.js";
import { layoutGraph, graphGeometry } from "../src/layout.js";
import { parseConfig } from "../src/parser.js";
import { sample } from "../src/sample.js";

test("connection preparation preserves every edge and assigns finite geometry", () => {
  const model = parseConfig(sample);
  const geometry = graphGeometry(model.nodes, model.edges);
  const positions = layoutGraph(model.nodes, model.edges, geometry);
  const nodes = model.nodes.map((n) => ({ ...n, ...positions.get(n.id) }));
  const graph = {
    nodes,
    edges: model.edges,
    geometry,
    byId: new Map(nodes.map((n) => [n.id, n])),
  };
  const connections = graphConnections(graph);
  assert.equal(connections.length, model.edges.length);
  assert.deepEqual(
    connections.map((e) => e.id),
    model.edges.map((e) => e.id),
  );
  for (const edge of connections) {
    assert(!/NaN|undefined|Infinity/.test(edge.path));
    assert(Object.values(edge.bounds).every(Number.isFinite));
  }
});
