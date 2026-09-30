import test from "node:test";
import assert from "node:assert/strict";
import {
  jsonLineTree,
  jsonVisibleRows,
  jsonRowText,
  jsonRowWindow,
} from "../src/json-lines.js";

test("JSON tree preserves serialized line numbers including empty containers", () => {
  const value = {
    a: [1, { b: true }],
    c: {},
    d: [],
    e: null,
    f: "line\nbreak",
  };
  const tree = jsonLineTree(value);
  assert.equal(tree.startLine, 1);
  assert.equal(tree.endLine, JSON.stringify(value, null, 2).split("\n").length);
  assert.equal(tree.children[0].startLine, 2);
  assert.equal(tree.children[0].endLine, 7);
  assert.equal(tree.children[1].startLine, 8);
  assert.equal(tree.children[0].children[1].children[0].startLine, 5);
  assert.equal(tree.children[0].children[0].name, undefined);
  assert.equal(tree.children.at(-1).comma, false);
});

test("virtual rows reproduce complete JSON without dropping or reordering data", () => {
  const value = {
    items: Array.from({ length: 10000 }, (_, id) => ({
      id,
      empty: [],
      text: "a\nb",
    })),
  };
  const rows = jsonVisibleRows(jsonLineTree(value));
  assert.equal(
    rows.map((row) => jsonRowText(row)).join("\n"),
    JSON.stringify(value, null, 2),
  );
  const middle = jsonRowWindow(rows.length, 200000, 600);
  assert(middle.start > 0);
  assert(middle.end - middle.start < 70);
  assert.deepEqual(jsonRowWindow(0, 0, 600), { start: 0, end: 0 });
  assert.deepEqual(jsonRowWindow(1, 200000, 600), { start: 0, end: 1 });
});

test("folded virtual rows keep original line numbers and nested folding state", () => {
  const tree = jsonLineTree({ a: [{ b: 1 }], z: 2 });
  const outer = tree.children[0],
    inner = outer.children[0];
  const collapsed = new Set([outer.startLine, inner.startLine]);
  let rows = jsonVisibleRows(tree, collapsed);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].branch.startLine, tree.children[1].startLine);
  assert.equal(jsonRowText(rows[1], true), '  "a": [ … ],');
  collapsed.delete(outer.startLine);
  rows = jsonVisibleRows(tree, collapsed);
  assert.equal(rows.length, 6);
  assert(!rows.some(({ branch }) => branch.name === "b"));
  collapsed.clear();
  assert.equal(jsonVisibleRows(tree, collapsed).length, tree.endLine);
});

test("primitive and empty JSON values occupy one line", () => {
  for (const value of [null, true, 42, "text", {}, []]) {
    const tree = jsonLineTree(value);
    assert.equal(tree.startLine, 1);
    assert.equal(tree.endLine, 1);
    assert.deepEqual(tree.children, []);
  }
});
