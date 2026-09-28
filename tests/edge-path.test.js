import test from "node:test";
import assert from "node:assert/strict";
import { connectionPath } from "../src/edge-path.js";
test("same-row chain uses a straight horizontal segment", () => {
  assert.deepEqual(connectionPath(290, 50, 370, 50), {
    path: "M 290 50 L 370 50",
    labelX: 330,
    labelY: 50,
  });
});
test("cross-row branches use cubic curves with horizontal tangents", () => {
  assert.deepEqual(connectionPath(290, 50, 370, 220), {
    path: "M 290 50 C 330 50, 330 220, 370 220",
    labelX: 330,
    labelY: 135,
  });
  assert.equal(
    connectionPath(290, 220, 370, 50).path,
    "M 290 220 C 330 220, 330 50, 370 50",
  );
});
test("shared target connections have finite geometry", () => {
  for (const y of [0, 170, 340])
    assert(!connectionPath(290, y, 1110, 170).path.includes("NaN"));
});

test("labels fit inside the target gutter, including long skipping edges", async () => {
  const { edgeCaption } = await import("../src/edge-path.js");
  for (const target of [310, 930]) {
    const label = edgeCaption(242, 65, target, 223, 68);
    assert(label.x - label.width / 2 > target - 68);
    assert(label.x + label.width / 2 < target);
    assert(label.y >= 65 && label.y <= 223);
  }
});

test("all connection labels are hidden", async () => {
  const { shouldShowEdgeLabel } = await import("../src/edge-path.js");
  for (const label of [
    "Match selection",
    "Selected chain",
    "Match",
    "Forward",
    "Response",
    "Use routes",
    "Route configuration",
    "*",
    "HTTP #2",
    "Network filter #1",
    "Listener filter #3",
    "",
  ])
    assert.equal(shouldShowEdgeLabel(label), false, label);
  for (const label of [
    "Weight 30",
    "Mirror",
    "Fallback selection",
    "RDS reference",
    "Unresolved RDS",
    "Dynamic target",
    "example.com",
  ])
    assert.equal(shouldShowEdgeLabel(label), false, label);
});
