import test from "node:test";
import assert from "node:assert/strict";
import { jsonLineTree } from "../src/json-lines.js";

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

test("primitive and empty JSON values occupy one line", () => {
  for (const value of [null, true, 42, "text", {}, []]) {
    const tree = jsonLineTree(value);
    assert.equal(tree.startLine, 1);
    assert.equal(tree.endLine, 1);
    assert.deepEqual(tree.children, []);
  }
});
