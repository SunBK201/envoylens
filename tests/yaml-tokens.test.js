import test from "node:test";
import assert from "node:assert/strict";
import { formatConfiguration } from "../src/config-format.js";
import { yamlTokens } from "../src/yaml-tokens.js";

test("YAML highlighting preserves text and distinguishes keys and scalar types", () => {
  const text = formatConfiguration(
    {
      "@type": "type.googleapis.com/envoy.config.listener.v3.Listener",
      port: 15001,
      enabled: false,
      missing: null,
      strings: ["true", "123", "null", "https://example.com/a#b"],
    },
    "yaml",
  );
  const tokens = yamlTokens(text);
  assert.equal(tokens.map((token) => token.text).join(""), text);
  for (const [text, type] of [
    ['"@type"', "key"],
    ["15001", "number"],
    ["false", "boolean"],
    ["null", "null"],
    ['"true"', "string"],
    ['"123"', "string"],
    ['"null"', "string"],
    ["https://example.com/a#b", "string"],
  ])
    assert.ok(
      tokens.some((token) => token.text === text && token.type === type),
    );
});

test("block strings and HTML stay literal without changing whitespace", () => {
  const text = formatConfiguration(
    {
      body: "first: true\n# not a comment\n<script>alert(1)</script>\n",
      nested: [{ "a: b": 'a\\b\n"x"' }],
      empty: {},
      list: [],
    },
    "yaml",
  );
  const tokens = yamlTokens(text);
  assert.equal(tokens.map((token) => token.text).join(""), text);
  assert.ok(
    tokens.some(
      (token) =>
        token.type === "string" && token.text.includes("# not a comment"),
    ),
  );
});

test("empty input, root scalars and malformed YAML remain intact", () => {
  for (const text of [
    "",
    "null\n",
    "true\n",
    "0\n",
    '"123"\n',
    "{}\n",
    "[]\n",
    "a: [\n",
  ]) {
    assert.equal(
      yamlTokens(text)
        .map((token) => token.text)
        .join(""),
      text,
    );
  }
});
