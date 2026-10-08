import test from "node:test";
import assert from "node:assert/strict";
import { retainRefreshView } from "../src/refresh-view.js";
import { parseConfig } from "../src/parser.js";
const node = (id, kind, label, detail = {}) => ({
  id,
  kind,
  label,
  detail,
  state: "active",
  path: id,
});
const previous = {
  nodes: [
    node("1", "listener", "inbound"),
    node("2", "filter_chain", "chain"),
    node("3", "cluster", "backend"),
  ],
  edges: [
    { source: "1", target: "2" },
    { source: "2", target: "3" },
  ],
};
const next = {
  nodes: [
    node("1", "cluster", "new"),
    node("4", "listener", "inbound"),
    node("5", "filter_chain", "chain", { changed: true }),
    node("6", "cluster", "backend"),
  ],
  edges: [
    { source: "4", target: "5" },
    { source: "5", target: "6" },
  ],
};
test("refresh keeps active and draining listeners distinct and removes expired snapshots", () => {
  const parse = (names, draining = true) =>
    parseConfig(
      JSON.stringify({
        configs: [
          {
            dynamic_listeners: names.map((name) => ({
              name,
              active_state: { listener: { name } },
              ...(draining ? { draining_state: { listener: { name } } } : {}),
            })),
          },
        ],
      }),
    );
  const before = parse(["http"]);
  const after = parse(["inserted", "http"]);
  for (const state of ["active", "draining"]) {
    const selected = before.nodes.find(
      (n) => n.kind === "listener" && n.state === state,
    );
    const retained = retainRefreshView(before, after, {
      listener: selected.id,
      selected,
      detailsOpen: true,
    });
    assert.equal(retained.selected.label, "http");
    assert.equal(retained.selected.state, state);
    assert.equal(retained.listener, retained.selected.id);
  }
  const selected = before.nodes.find(
    (n) => n.kind === "listener" && n.state === "draining",
  );
  assert.deepEqual(
    retainRefreshView(before, parse(["inserted", "http"], false), {
      listener: selected.id,
      selected,
      detailsOpen: true,
    }),
    {
      listener: "",
      chain: "",
      selected: null,
      detailsOpen: false,
    },
  );
});
test("refresh retains resource selection after IDs shift and contents change", () => {
  const state = retainRefreshView(previous, next, {
    listener: "1",
    chain: "2",
    selected: previous.nodes[2],
    detailsOpen: true,
  });
  assert.equal(state.listener, "4");
  assert.equal(state.chain, "5");
  assert.equal(state.selected.id, "6");
  assert.equal(state.detailsOpen, true);
});
test("removed resources are cleared without accidentally selecting reused IDs", () => {
  const state = retainRefreshView(
    previous,
    { nodes: [node("1", "listener", "other")], edges: [] },
    {
      listener: "1",
      chain: "2",
      selected: previous.nodes[2],
      detailsOpen: true,
    },
  );
  assert.deepEqual(state, {
    listener: "",
    chain: "",
    selected: null,
    detailsOpen: false,
  });
});
test("duplicate filter chain names stay under the selected listener", () => {
  const model = {
    nodes: [...next.nodes, node("7", "filter_chain", "chain")],
    edges: next.edges,
  };
  assert.equal(
    retainRefreshView(previous, model, { listener: "1", chain: "2" }).chain,
    "5",
  );
});
