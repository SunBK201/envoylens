import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldDocumentation, schemaTypes } from "../src/schema-docs.js";
import { jsonLineTree, jsonVisibleRows } from "../src/json-lines.js";
import { yamlLineRows } from "../src/yaml-lines.js";
import { formatConfiguration } from "../src/config-format.js";

const schema = JSON.parse(
  readFileSync(new URL("../public/schema/envoy-schema.json", import.meta.url)),
);
const listener = {
  name: "test",
  address: {
    socket_address: { address: "0.0.0.0", port_value: 8080, protocol: "TCP" },
  },
  filter_chains: [
    {
      filters: [
        {
          name: "hcm",
          typed_config: {
            "@type":
              "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
            stat_prefix: "ingress",
            route_config: {
              virtual_hosts: [
                {
                  name: "host",
                  domains: ["*"],
                  routes: [
                    { match: { prefix: "/" }, route: { cluster: "backend" } },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  ],
};

test("bootstrap resolves nested paths, allOf descriptions and enum values", () => {
  const root = { static_resources: { listeners: [listener] } };
  const prefix = ["static_resources", "listeners", 0];
  const doc = fieldDocumentation(schema, root, [...prefix, "address"]);
  assert.match(doc.description, /listener should listen/);
  assert.deepEqual(doc.types, ["object"]);
  assert.equal(doc.owner, schemaTypes.listener);
  const protocol = fieldDocumentation(schema, root, [
    ...prefix,
    "address",
    "socket_address",
    "protocol",
  ]);
  assert.deepEqual(protocol.enum, ["TCP", "UDP"]);
});

test("ConfigDump and typed_config resolve by @type including custom URL prefix", () => {
  const root = {
    configs: [
      {
        "@type": "type.googleapis.com/envoy.admin.v3.ListenersConfigDump",
        static_listeners: [
          {
            listener: {
              "@type": "type.googleapis.com/envoy.config.listener.v3.Listener",
              ...listener,
            },
          },
        ],
      },
    ],
  };
  const path = [
    "configs",
    0,
    "static_listeners",
    0,
    "listener",
    "filter_chains",
    0,
    "filters",
    0,
    "typed_config",
    "stat_prefix",
  ];
  const doc = fieldDocumentation(schema, root, path);
  assert.match(doc.owner, /HttpConnectionManager$/);
  assert.ok(doc.description);
  assert.ok(
    fieldDocumentation(
      schema,
      {
        "@type": "custom.example/envoy.config.listener.v3.Listener",
        ...listener,
      },
      ["name"],
    ),
  );
});

test("same field names use explicit resource type and nested context", () => {
  const name = fieldDocumentation(
    schema,
    listener,
    ["name"],
    schemaTypes.listener,
  );
  const cluster = fieldDocumentation(
    schema,
    { name: "test" },
    ["name"],
    schemaTypes.cluster,
  );
  assert.notEqual(name.description, cluster.description);
  const address = fieldDocumentation(
    schema,
    listener,
    ["address", "socket_address", "address"],
    schemaTypes.listener,
  );
  assert.notEqual(
    address.description,
    fieldDocumentation(schema, listener, ["address"], schemaTypes.listener)
      .description,
  );
});

test("unknown extensions and unknown fields never borrow similarly named documentation", () => {
  assert.equal(
    fieldDocumentation(schema, { "@type": "example/Unknown", name: "x" }, [
      "name",
    ]),
    null,
  );
  assert.equal(
    fieldDocumentation(schema, listener, ["unknown"], schemaTypes.listener),
    null,
  );
  const filter = {
    typed_config: { "@type": "example/Unknown", stat_prefix: "x" },
  };
  assert.equal(
    fieldDocumentation(
      schema,
      filter,
      ["typed_config", "stat_prefix"],
      schemaTypes.network_filter,
    ),
    null,
  );
});

test("JSON and YAML field paths agree for arrays, quoted keys, camelCase and multiline strings", () => {
  const root = {
    staticResources: { listeners: [listener] },
    "a.b": [{ "quoted:key": "line one\nline two\n" }],
  };
  const jsonPaths = jsonVisibleRows(jsonLineTree(root))
    .filter((r) => !r.closing && r.branch.name !== undefined)
    .map((r) => r.branch.path);
  const yamlPaths = yamlLineRows(formatConfiguration(root, "yaml")).flatMap(
    (r) => r.tokens.filter((t) => t.path).map((t) => t.path),
  );
  assert.deepEqual(yamlPaths, jsonPaths);
  assert.ok(
    fieldDocumentation(schema, root, [
      "staticResources",
      "listeners",
      0,
      "name",
    ]),
  );
});

test("reference cycles terminate and external refs are not fetched", () => {
  const cyclic = {
    properties: {
      name: { allOf: [{ $ref: "#/definitions/loop" }], description: "local" },
    },
    definitions: { loop: { $ref: "#/definitions/loop" } },
  };
  assert.equal(
    fieldDocumentation(cyclic, { name: "x" }, ["name"]).description,
    "local",
  );
  assert.equal(
    fieldDocumentation({ $ref: "https://invalid.example/schema" }, {}, [
      "name",
    ]),
    null,
  );
});
