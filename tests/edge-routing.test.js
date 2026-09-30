import test from "node:test";
import assert from "node:assert/strict";
import {
  createCardIndex,
  routeConnection,
  segmentHitsCard,
} from "../src/edge-routing.js";
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

test("spatial card queries match exhaustive bounds checks with varying card sizes", () => {
  const cards = Array.from({ length: 300 }, (_, i) => ({
    id: String(i),
    x: (i % 6) * 400,
    y: Math.floor(i / 6) * 200,
    width: 100 + (i % 4) * 50,
    height: 100 + (i % 3) * 80,
  }));
  const index = createCardIndex(cards);
  for (let i = 0; i < 100; i++) {
    const box = {
      left: i * 23 - 100,
      right: i * 23 + 300,
      top: i * 71,
      bottom: i * 71 + 400,
    };
    const expected = cards.filter(
      (c) =>
        c.x <= box.right &&
        c.x + c.width >= box.left &&
        c.y <= box.bottom &&
        c.y + c.height >= box.top,
    );
    assert.deepEqual(
      index
        .query(box)
        .map((c) => c.id)
        .sort(),
      expected.map((c) => c.id).sort(),
    );
  }
});

test("indexed routing matches full scans and bounds enclose every detour point", () => {
  const extra = [
    ...cards,
    ...Array.from({ length: 1000 }, (_, i) => ({
      id: `extra-${i}`,
      x: 310,
      y: 500 + i * 188,
      width: 242,
      height: 158,
    })),
  ];
  const result = routeConnection({
    ...input,
    cards: extra,
    cardIndex: createCardIndex(extra),
  });
  assert.deepEqual(result, routeConnection({ ...input, cards: extra }));
  assert(result.detour);
  for (const p of result.points) {
    assert(p.x >= result.bounds.left && p.x <= result.bounds.right);
    assert(p.y >= result.bounds.top && p.y <= result.bounds.bottom);
  }
  for (let i = 1; i < result.points.length; i++)
    for (const card of extra)
      assert.equal(
        segmentHitsCard(result.points[i - 1], result.points[i], card),
        false,
      );
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
