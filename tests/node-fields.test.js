import test from "node:test";
import assert from "node:assert/strict";
import {
  nodeFields,
  summary,
  lifecycleLabel,
  lifecycleDescription,
  originLabel,
  duplicateLifecycleIds,
  trafficDirection,
} from "../src/node-fields.js";
import { setLanguage } from "../src/i18n.js";
const fields = (kind, detail, extra = {}) =>
  Object.fromEntries(
    nodeFields({ kind, detail, ...extra }).map((f) => [f.key, f.value]),
  );
test("listener traffic direction reads snake/camel enum strings and numeric values", () => {
  setLanguage("en");
  for (const [raw, expected] of [
    ["INBOUND", "INBOUND"],
    [1, "INBOUND"],
    ["OUTBOUND", "OUTBOUND"],
    [2, "OUTBOUND"],
    ["UNSPECIFIED", "UNSPECIFIED"],
    [0, "UNSPECIFIED"],
    [undefined, "UNSPECIFIED"],
    [99, "UNKNOWN"],
    ["FUTURE_DIRECTION", "UNKNOWN"],
    [null, "UNSPECIFIED"],
  ]) {
    for (const key of ["traffic_direction", "trafficDirection"]) {
      assert.equal(
        trafficDirection({ kind: "listener", detail: { [key]: raw } }).value,
        expected,
      );
    }
  }
  assert.equal(
    trafficDirection({
      kind: "cluster",
      detail: { traffic_direction: "INBOUND" },
    }),
    null,
  );
  assert.equal(trafficDirection(undefined), null);
});
test("direction is independent of listener names, addresses and lifecycle states", () => {
  setLanguage("zh");
  for (const state of ["active", "warming", "draining", "static"]) {
    const node = {
      kind: "listener",
      label: "virtualInbound",
      state,
      detail: {
        address: { socket_address: { address: "0.0.0.0", port_value: 25006 } },
      },
    };
    assert.equal(trafficDirection(node).label, "未定");
    assert.equal(
      trafficDirection({ ...node, detail: { traffic_direction: "OUTBOUND" } })
        .label,
      "出站",
    );
    assert.equal(
      trafficDirection({ ...node, detail: { trafficDirection: 1 } }).label,
      "入站",
    );
  }
  setLanguage("en");
  assert.equal(
    trafficDirection({ kind: "listener", detail: { traffic_direction: 1 } })
      .label,
    "Inbound",
  );
});
test("lifecycle badges are only shown for duplicate resources of the same kind and name", () => {
  setLanguage("en");
  const nodes = [
    { id: "l1", kind: "listener", label: "http", state: "active" },
    { id: "l2", kind: "listener", label: "http", state: "draining" },
    { id: "l3", kind: "listener", label: "unique", state: "active" },
    { id: "l4", kind: "listener", label: "warming-only", state: "warming" },
    { id: "c1", kind: "cluster", label: "http", state: "active" },
    { id: "c2", kind: "cluster", label: "backend", state: "active" },
    { id: "c3", kind: "cluster", label: "backend", state: "warming" },
    { id: "r1", kind: "route", label: "unique", state: "active" },
  ];
  const duplicateIds = duplicateLifecycleIds(nodes);
  assert.deepEqual([...duplicateIds], ["l1", "l2", "c2", "c3"]);
  assert.deepEqual(
    nodes.map((n) => lifecycleLabel(n, duplicateIds)),
    ["Active", "Draining", "", "", "", "Active", "Warming", ""],
  );
  // Selecting or filtering to one snapshot must not hide its distinguishing badge.
  assert.equal(lifecycleLabel(nodes[0], duplicateIds), "Active");
  // A refresh that removes the old snapshot also removes the active badge.
  const refreshed = nodes.filter((n) => n.id !== "l2" && n.id !== "c3");
  const refreshedIds = duplicateLifecycleIds(refreshed);
  assert.equal(refreshedIds.size, 0);
  assert(refreshed.every((n) => lifecycleLabel(n, refreshedIds) === ""));
  assert.equal(duplicateLifecycleIds([]).size, 0);
});
test("runtime resource lifecycle labels are separate from origin and discovery type", () => {
  setLanguage("en");
  for (const kind of ["listener", "cluster"]) {
    for (const [state, label] of [
      ["active", "Active"],
      ["warming", "Warming"],
      ["draining", "Draining"],
    ]) {
      const n = { kind, state, origin: "xds", detail: { type: "EDS" } };
      assert.equal(lifecycleLabel(n), label);
      assert(lifecycleDescription(n));
      assert.equal(originLabel(n), "xDS");
    }
  }
  for (const n of [
    undefined,
    { kind: "listener", state: "static" },
    { kind: "listener", state: "configured" },
    { kind: "cluster", state: "unresolved" },
    { kind: "route", state: "active" },
  ]) {
    assert.equal(lifecycleLabel(n), "");
    assert.equal(lifecycleDescription(n), "");
  }
});
test("runtime resource lifecycle labels support Chinese without changing names", () => {
  setLanguage("zh");
  for (const state of ["active", "warming", "draining"]) {
    const n = { kind: "listener", state, label: "127.0.0.1_17111" };
    assert.notEqual(lifecycleLabel(n), state);
    assert.match(lifecycleLabel(n), /[\u4e00-\u9fff]/);
    assert.match(lifecycleDescription(n), /[\u4e00-\u9fff]/);
    assert.equal(n.label, "127.0.0.1_17111");
  }
  setLanguage("en");
});
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
