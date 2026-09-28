import test from "node:test";
import assert from "node:assert/strict";
import { routeConnection, segmentHitsCard } from "../src/edge-routing.js";
const cards = [
  { id: "s", x: 0, y: 186, width: 242, height: 158 },
  { id: "block", x: 310, y: 186, width: 242, height: 158 },
  { id: "t", x: 620, y: 186, width: 242, height: 158 },
];
const input = {
  sx: 242,
  sy: 265,
  tx: 620,
  ty: 265,
  sourceId: "s",
  targetId: "t",
  cards,
  gutter: 68,
};
test("clear adjacent nodes keep a straight or smooth connection", () => {
  const result = routeConnection({ ...input, tx: 310, targetId: "block" });
  assert.equal(result.detour, false);
  assert(result.path.includes(" L "));
});
test("skipped-column edge routes around intermediate card with rounded corners", () => {
  const result = routeConnection(input);
  assert.equal(result.detour, true);
  assert(result.path.includes(" Q "));
  for (let i = 1; i < result.points.length; i++)
    for (const card of cards)
      assert.equal(
        segmentHitsCard(result.points[i - 1], result.points[i], card),
        false,
      );
  assert(result.caption.x + result.caption.width / 2 < 620);
});
test("routing avoids multiple blockers in different rows", () => {
  const extra = [
    ...cards,
    { id: "upper", x: 310, y: 0, width: 242, height: 158 },
    { id: "lower", x: 310, y: 372, width: 242, height: 158 },
  ];
  const result = routeConnection({ ...input, cards: extra });
  assert(result.detour);
  for (let i = 1; i < result.points.length; i++)
    for (const card of extra)
      assert.equal(
        segmentHitsCard(result.points[i - 1], result.points[i], card),
        false,
      );
});
