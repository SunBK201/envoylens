import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const read = (path) => readFileSync(new URL(path, import.meta.url));
const bytes = read("../public/schema/envoy-schema.json");
const schema = JSON.parse(bytes);
const provenance = JSON.parse(read("../public/schema/provenance.json"));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

test("shipped schema and generator match public-source provenance", () => {
  assert.equal(provenance.source, "https://github.com/envoyproxy/envoy");
  assert.equal(provenance.commit, "96701cb24611b0f3aac1cc0dd8bf8589fbdf8e9e");
  assert.equal(sha256(bytes), provenance.schemaSha256);
  assert.equal(
    sha256(read("../scripts/generate-envoy-schema.mjs")),
    provenance.generatorSha256,
  );
  assert.ok(provenance.protoFiles.length > 400);
  assert.ok(
    provenance.protoFiles.every((file) =>
      /^api\/envoy\/[\w/]+\.proto$/.test(file),
    ),
  );
});

test("public schema has no dangling or remote references and no local source links", () => {
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith("#/definitions/"));
      assert.ok(
        Object.hasOwn(
          schema.definitions,
          value.$ref.slice("#/definitions/".length),
        ),
        value.$ref,
      );
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(schema);
  assert.doesNotMatch(
    bytes.toString(),
    /(?:file:\/\/|\/(?:Users|home)\/[^/\s]+\/)/,
  );
});

test("documentation links exist in the pinned official website inventory", () => {
  const inventory = read("../scripts/data/envoy-v1.20.0.objects.inv");
  assert.equal(sha256(inventory), provenance.documentationInventorySha256);
  assert.equal(
    provenance.documentationInventory,
    "https://www.envoyproxy.io/docs/envoy/v1.20.0/objects.inv",
  );
  let start = 0;
  for (let i = 0; i < 4; i++) start = inventory.indexOf(10, start) + 1;
  const urls = new Set(
    inflateSync(inventory.subarray(start))
      .toString()
      .split("\n")
      .map((line) => {
        const [name, , , uri] = line.split(" ");
        return uri
          ? new URL(uri.replace(/\$$/, name), provenance.documentationInventory)
              .href
          : null;
      }),
  );
  let linked = 0;
  function check(doc) {
    assert.ok(doc);
    assert.ok(!doc.includes("[Public API source]"));
    const link = doc.match(/\[Envoy 配置参考\]\(([^)]+)\)$/);
    if (link) {
      assert.ok(urls.has(link[1]), link[1]);
      linked++;
    }
  }
  for (const [name, definition] of Object.entries(schema.definitions)) {
    if (!name.startsWith("envoy.")) continue;
    check(definition.markdownDescription);
    for (const [key, field] of Object.entries(definition.properties ?? {})) {
      if (key !== "@type") check(field.markdownDescription);
      assert.equal(field.properties, undefined);
    }
  }
  assert.ok(linked > 4000);
  assert.match(
    schema.definitions["envoy.config.listener.v3.Listener"].properties.address
      .markdownDescription,
    /api-v3\/config\/listener\/v3\/listener\.proto\.html#envoy-v3-api-field-config-listener-v3-listener-address/,
  );
});
