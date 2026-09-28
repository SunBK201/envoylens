import test from "node:test";
import assert from "node:assert/strict";
import { nodeFields, summary } from "../src/node-fields.js";
const fields = (kind, detail, extra = {}) =>
  Object.fromEntries(
    nodeFields({ kind, detail, ...extra }).map((f) => [f.key, f.value]),
  );
test("listener key fields include address, port and direction", () => {
  assert.deepEqual(
    fields("listener", {
      address: { socketAddress: { address: "0.0.0.0", portValue: 15006 } },
      trafficDirection: "INBOUND",
    }),
    { address: "0.0.0.0", port_value: "15006", traffic_direction: "INBOUND" },
  );
});
test("match shows at most three conditions while preserving full values", () => {
  const f = fields("match", {
    destination_port: 8080,
    server_names: ["a", "b"],
    transport_protocol: "tls",
    application_protocols: ["h2"],
  });
  assert.deepEqual(f, {
    destination_port: "8080",
    server_names: "a, b",
    transport_protocol: "tls",
  });
});
test("route displays path and explicit timeout instead of weighted targets", () => {
  assert.deepEqual(
    fields("route", {
      match: { prefix: "/" },
      route: {
        weightedClusters: {
          clusters: [
            { name: "a", weight: 90 },
            { name: "b", weight: 10 },
          ],
        },
        timeout: "0s",
      },
    }),
    { prefix: "/", timeout: "0s" },
  );
});
test("cluster shows timeout and discovery policy without losing numeric zero", () => {
  assert.deepEqual(
    fields("cluster", {
      type: "ORIGINAL_DST",
      lb_policy: "CLUSTER_PROVIDED",
      connect_timeout: "2s",
    }),
    {
      type: "ORIGINAL_DST",
      lb_policy: "CLUSTER_PROVIDED",
      connect_timeout: "2s",
    },
  );
  assert.equal(fields("cluster", { type: 0 }).type, "0");
});
test("HCM, TCP and HTTP filters expose meaningful typed configuration", () => {
  assert.deepEqual(
    fields("network_filter", {
      typed_config: {
        "@type": "type.googleapis.com/envoy.HttpConnectionManager",
        stat_prefix: "inbound",
        codec_type: "AUTO",
      },
    }),
    {
      type: "HttpConnectionManager",
      stat_prefix: "inbound",
      codec_type: "AUTO",
    },
  );
  assert.equal(
    fields("network_filter", { typed_config: { cluster: "upstream" } }).cluster,
    "upstream",
  );
  assert.equal(
    fields("http_filter", { typed_config: { disabled: false } }).disabled,
    "false",
  );
  assert.equal(
    fields("http_filter", { typed_config: { token: "sensitive" } }).token,
    "Configured (see details)",
  );
});
test("unresolved clusters never claim a discovery type", () => {
  assert.deepEqual(fields("cluster", {}, { state: "unresolved" }), {
    status: "Unresolved reference",
  });
});
test("summaries preserve complete long values for search and tooltips", () => {
  const name = "very-long-host.example.internal";
  assert(
    summary({
      kind: "virtual_host",
      detail: { domains: [name], routes: [] },
    }).includes(name),
  );
});

test("route hides all target variants and preserves rewrite and timeout", () => {
  for (const target of [
    { cluster: "backend" },
    { cluster_header: "x-cluster" },
    { clusterSpecifierPlugin: "plugin" },
  ]) {
    assert.deepEqual(
      fields("route", {
        match: { path: "/api" },
        route: { ...target, timeout: "2.5s", prefixRewrite: "/" },
      }),
      { path: "/api", timeout: "2.5s", prefix_rewrite: "/" },
    );
  }
});

test("route does not invent timeout defaults or add timeout to direct responses", () => {
  assert.deepEqual(
    fields("route", {
      match: { prefix: "/" },
      route: { cluster: "backend" },
    }),
    { prefix: "/", timeout: "Not configured" },
  );
  assert.equal(fields("route", { route: { timeout: 0 } }).timeout, "0");
  assert.deepEqual(
    fields("route", {
      match: { path: "/health" },
      directResponse: { status: 200 },
    }),
    { path: "/health", status: "200", action: "Direct response" },
  );
  assert.equal(
    fields("route", { redirect: { https_redirect: true } }).timeout,
    undefined,
  );
});
