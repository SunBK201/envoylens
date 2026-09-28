import test from "node:test";
import assert from "node:assert/strict";
import { layoutGraph, graphGeometry, GRAPH_GEOMETRY } from "../src/layout.js";
import { parseConfig } from "../src/parser.js";
import { sample } from "../src/sample.js";
test("single chains stay in one row and all edges point forward", () => {
  const nodes = [
    "listener",
    "listener_filter",
    "listener_filter",
    "match",
    "filter_chain",
  ].map((kind, i) => ({ id: String(i), kind }));
  const edges = nodes
    .slice(1)
    .map((n, i) => ({ source: String(i), target: n.id }));
  const pos = layoutGraph(nodes, edges);
  for (let i = 0; i < nodes.length; i++)
    assert.deepEqual(pos.get(String(i)), { x: i * 364, y: 0 });
});
test("sample layout has no overlapping nodes or backward edges", () => {
  const model = parseConfig(sample),
    pos = layoutGraph(model.nodes, model.edges);
  assert.equal(
    new Set([...pos.values()].map((p) => `${p.x},${p.y}`)).size,
    model.nodes.length,
  );
  for (const e of model.edges)
    assert(pos.get(e.source).x < pos.get(e.target).x);
});
test("branch parent is centered between its child bands", () => {
  const nodes = [
    { id: "root", kind: "listener" },
    { id: "a", kind: "filter_chain" },
    { id: "b", kind: "filter_chain" },
  ];
  const pos = layoutGraph(nodes, [
    { source: "root", target: "a" },
    { source: "root", target: "b" },
  ]);
  assert.equal(pos.get("root").y, (pos.get("a").y + pos.get("b").y) / 2);
  assert(pos.get("a").y < pos.get("b").y);
});

test("unlabeled columns use compact gutters", () => {
  const nodes = [
    { id: "a", kind: "listener" },
    { id: "b", kind: "match" },
    { id: "c", kind: "filter_chain" },
  ];
  const pos = layoutGraph(nodes, [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
  ]);
  assert.equal(pos.get("b").x - pos.get("a").x, 364);
  assert(pos.get("a").x + 300 < pos.get("b").x);
  assert.equal(pos.get("c").x + 300, 1028);
});

test("geometry ignores hidden labels while bounding long card titles", () => {
  const g = graphGeometry(
    [{ label: "x".repeat(100) }],
    [{ label: "Long edge label".repeat(10) }],
  );
  assert.equal(g.cardWidth, 400);
  assert.equal(g.columnStep - g.cardWidth, 64);
  assert(g.rowStep > g.cardHeight);
  const p = layoutGraph(
    [{ id: "a" }, { id: "b" }],
    [{ source: "a", target: "b" }],
    g,
  );
  assert.equal(p.get("b").x, g.cardWidth + 64);
});

test("branches that rejoin do not bend intermediate one-to-one chains", () => {
  const nodes = ["root", "a", "a2", "a3", "b", "b2", "merge", "end"].map(
    (id) => ({ id }),
  );
  const edges = [
    ["root", "a"],
    ["a", "a2"],
    ["a2", "a3"],
    ["root", "b"],
    ["b", "b2"],
    ["a3", "merge"],
    ["b2", "merge"],
    ["merge", "end"],
  ].map(([source, target]) => ({ source, target }));
  const positions = layoutGraph(nodes, edges);
  for (const chain of [
    ["a", "a2", "a3"],
    ["b", "b2"],
    ["merge", "end"],
  ]) {
    assert.equal(new Set(chain.map((id) => positions.get(id).y)).size, 1);
  }
  for (const a of nodes)
    for (const b of nodes) {
      if (a.id !== b.id && positions.get(a.id).x === positions.get(b.id).x)
        assert(
          Math.abs(positions.get(a.id).y - positions.get(b.id).y) >=
            GRAPH_GEOMETRY.cardHeight,
        );
    }
});

test("all target columns use compact gutters with hidden labels", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
  const edges = [
    { source: "a", target: "b", label: "Forward" },
    { source: "b", target: "c", label: "Weight 30" },
    { source: "c", target: "d", label: "HTTP #1" },
  ];
  const p = layoutGraph(nodes, edges);
  assert.equal(p.get("b").x - p.get("a").x - GRAPH_GEOMETRY.cardWidth, 64);
  assert.equal(p.get("c").x - p.get("b").x - GRAPH_GEOMETRY.cardWidth, 64);
  assert.equal(p.get("d").x - p.get("c").x - GRAPH_GEOMETRY.cardWidth, 64);
});
