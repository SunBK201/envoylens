import test from "node:test";
import assert from "node:assert/strict";
import { sortedResources } from "../src/resource-sort.js";
test("navigation sorts names naturally without changing source order", () => {
  const nodes = ["service10", "service2", "Alpha"].map((label) => ({
    kind: "cluster",
    label,
  }));
  assert.deepEqual(
    sortedResources(
      [...nodes, { kind: "listener", label: "First" }],
      "cluster",
    ).map((n) => n.label),
    ["Alpha", "service2", "service10"],
  );
  assert.equal(nodes[0].label, "service10");
});
test("endpoint addresses and ports use numeric ordering", () => {
  const nodes = ["10.0.0.10:80", "10.0.0.2:100", "10.0.0.2:20"].map(
    (label) => ({ kind: "endpoint", label }),
  );
  assert.deepEqual(
    sortedResources(nodes, "endpoint").map((n) => n.label),
    ["10.0.0.2:20", "10.0.0.2:100", "10.0.0.10:80"],
  );
});

test("descending order reverses natural order without mutating input", () => {
  const nodes = ["service2", "service10", "service1"].map((label) => ({
    kind: "cluster",
    label,
  }));
  assert.deepEqual(
    sortedResources(nodes, "cluster", "desc").map((n) => n.label),
    ["service10", "service2", "service1"],
  );
  assert.deepEqual(
    nodes.map((n) => n.label),
    ["service2", "service10", "service1"],
  );
  assert.deepEqual(sortedResources(nodes, "endpoint", "desc"), []);
});
