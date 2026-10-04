import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { formatConfiguration } from "../src/config-format.js";

test("YAML view preserves Envoy fields and scalar types without mutation", () => {
  const value = {
    name: "inbound|17001||",
    "@type": "type.googleapis.com/envoy.config.listener.v3.Listener",
    filters: [{ typed_config: { enabled: true, port_value: 17001 } }],
    strings: ["true", "null", "123", "01", "", "a: b", "#comment"],
    empty: {},
    list: [],
    missing: null,
    body: "first line\nsecond line\n",
    regex: "^/" + "x".repeat(150) + "$",
  };
  const before = structuredClone(value);
  const text = formatConfiguration(value, "yaml");
  assert.deepEqual(parse(text), value);
  assert.deepEqual(value, before);
  assert.ok(text.includes(value.regex));
  assert.ok(text.indexOf("name:") < text.indexOf('"@type":'));
});

test("JSON and semantic view copying retains formatted JSON", () => {
  const value = { name: "example", enabled: false };
  for (const mode of [undefined, "json", "tree"]) {
    assert.equal(
      formatConfiguration(value, mode),
      JSON.stringify(value, null, 2),
    );
  }
});

test("YAML supports primitive and empty configuration values", () => {
  for (const value of [null, true, 0, "123", [], {}]) {
    assert.deepEqual(parse(formatConfiguration(value, "yaml")), value);
  }
});
