import test from "node:test";
import assert from "node:assert/strict";
import { jsonTokens } from "../src/json-tokens.js";
test("highlighting preserves exact JSON and classifies key/value tokens", () => {
  const value = {
    name: "listener",
    port: 15001,
    enabled: false,
    missing: null,
    items: [true, -2.5, 1e30],
  };
  const tokens = jsonTokens(value);
  assert.equal(
    tokens.map((t) => t.text).join(""),
    JSON.stringify(value, null, 2),
  );
  for (const [text, type] of [
    ['"name"', "key"],
    ['"listener"', "string"],
    ["15001", "number"],
    ["false", "boolean"],
    ["null", "null"],
    ["1e+30", "number"],
  ])
    assert(tokens.some((t) => t.text === text && t.type === type));
});
test("escaped quotes and HTML remain literal text, not markup", () => {
  for (const value of [
    { 'a"b': "</span><script>alert(1)</script>", path: 'a\\b\n"x"' },
    [],
    {},
    null,
    "a:b",
    0,
  ]) {
    assert.equal(
      jsonTokens(value)
        .map((t) => t.text)
        .join(""),
      JSON.stringify(value, null, 2),
    );
  }
});
