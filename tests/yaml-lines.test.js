import test from "node:test";
import assert from "node:assert/strict";
import { yamlLineRows, yamlVisibleRows } from "../src/yaml-lines.js";
import { formatConfiguration } from "../src/config-format.js";
import { jsonRowWindow } from "../src/json-lines.js";

test("YAML rows retain original text, tokens and line numbers", () => {
  for (const value of [
    null,
    {},
    [],
    "text",
    { a: [{ b: true }], body: " x\n   y\n\n", empty: {} },
  ]) {
    const text = formatConfiguration(value, "yaml");
    const rows = yamlLineRows(text);
    assert.equal(rows.map((row) => row.text).join("\n") + "\n", text);
    rows.forEach((row, index) => {
      assert.equal(row.number, index + 1);
      assert.equal(row.tokens.map((token) => token.text).join(""), row.text);
    });
  }
});

test("nested folds preserve line numbers and child folding state", () => {
  const rows = yamlLineRows(
    "outer:\n  child:\n    x: 1\n    y: 2\n  sibling: 3\nlast: 4\n",
  );
  assert.equal(rows[0].endLine, 5);
  assert.equal(rows[1].endLine, 4);
  const collapsed = new Set([1, 2]);
  assert.deepEqual(
    yamlVisibleRows(rows, collapsed).map((row) => row.number),
    [1, 6],
  );
  collapsed.delete(1);
  assert.deepEqual(
    yamlVisibleRows(rows, collapsed).map((row) => row.number),
    [1, 2, 5, 6],
  );
  collapsed.clear();
  assert.equal(yamlVisibleRows(rows, collapsed).length, 6);
});

test("sequence items and multiline scalar folds stop before siblings", () => {
  const rows = yamlLineRows(
    "items:\n  - nested:\n      x: 1\n    other: 2\n  - name: second\nbody: |-\n  first\n  second\nlast: {}\n",
  );
  assert.equal(rows[0].endLine, 5);
  assert.equal(rows[1].endLine, 4);
  assert.equal(rows[5].endLine, 8);
  assert.equal(rows[8].endLine, undefined);
  assert.deepEqual(
    yamlVisibleRows(rows, new Set([2, 6])).map((row) => row.number),
    [1, 2, 5, 6, 9],
  );
});

test("large YAML uses the same bounded viewport as JSON", () => {
  const text = formatConfiguration(
    { items: Array.from({ length: 10000 }, (_, id) => ({ id })) },
    "yaml",
  );
  const rows = yamlLineRows(text);
  assert.equal(rows.length, 10001);
  const window = jsonRowWindow(rows.length, 100000, 600);
  assert.ok(window.start > 0);
  assert.ok(window.end - window.start < 70);
  assert.equal(yamlVisibleRows(rows, new Set([1])).length, 1);
});
