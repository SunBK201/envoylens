import test from "node:test";
import assert from "node:assert/strict";
import { describeValue } from "../src/config-value.js";
test("tree values preserve false, zero, empty strings and null", () => {
  assert.deepEqual(describeValue(false), {
    type: "boolean",
    text: "false",
    expandable: false,
  });
  assert.equal(describeValue(0).text, "0");
  assert.equal(describeValue("").text, '""');
  assert.deepEqual(describeValue(null), {
    type: "null",
    text: "null",
    expandable: false,
  });
});
test("tree containers distinguish arrays and objects, including empty containers", () => {
  assert.deepEqual(describeValue([]), {
    type: "array",
    text: "0 items",
    expandable: false,
  });
  assert.deepEqual(describeValue({}), {
    type: "object",
    text: "0 fields",
    expandable: false,
  });
  assert.equal(describeValue([false, null]).expandable, true);
  assert.equal(describeValue({ key: 1 }).text, "1 fields");
});
