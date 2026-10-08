import test from "node:test";
import assert from "node:assert/strict";
import {
  navigationSearchText,
  filterNavigationResources,
} from "../src/navigation-search.js";
import { sortedResources } from "../src/resource-sort.js";
import { setLanguage, t } from "../src/i18n.js";

const listener = {
  id: "listener",
  kind: "listener",
  label: "Ingress",
  detail: {
    name: "Ingress",
    address: { socket_address: { address: "10.0.0.2", port_value: 8080 } },
  },
};
const cluster = {
  id: "cluster",
  kind: "cluster",
  label: "Service[2]",
  detail: { type: "EDS" },
};
const endpoint = {
  id: "endpoint",
  kind: "endpoint",
  label: "10.0.0.8:9000",
  clusterName: "Service[2]",
};
const chain = {
  id: "chain",
  kind: "filter_chain",
  label: "Public",
  detail: {
    filter_chain_match: {
      server_names: ["api.example.test"],
      transport_protocol: "tls",
    },
  },
};
const nodes = [listener, cluster, endpoint, chain];
const groups = Object.fromEntries(
  ["listener", "cluster", "endpoint", "filter_chain"].map((kind) => [
    kind,
    nodes.filter((n) => n.kind === kind),
  ]),
);
const index = new Map(
  nodes.map((node) => [
    node.id,
    navigationSearchText(node, node === chain ? listener : undefined),
  ]),
);
const matchingIds = (query) =>
  Object.values(filterNavigationResources(groups, index, query))
    .flat()
    .map((n) => n.id);

test("listeners can be searched by configured direction in both languages", () => {
  for (const locale of ["en", "zh"]) {
    setLanguage(locale);
    const nodes = ["INBOUND", "OUTBOUND", "UNSPECIFIED"].map((direction) => ({
      ...listener,
      id: direction,
      detail: { ...listener.detail, traffic_direction: direction },
    }));
    const index = new Map(nodes.map((n) => [n.id, navigationSearchText(n)]));
    for (const [value, label] of [
      ["INBOUND", "Inbound"],
      ["OUTBOUND", "Outbound"],
      ["UNSPECIFIED", "Unspecified"],
    ]) {
      for (const query of [value, t(label)]) {
        assert.deepEqual(
          filterNavigationResources(
            { listener: nodes },
            index,
            query,
          ).listener.map((n) => n.id),
          [value],
        );
      }
    }
  }
  setLanguage("en");
});

test("same-name listeners can be filtered by English or translated lifecycle state", () => {
  setLanguage("zh");
  const snapshots = ["active", "draining"].map((state) => ({
    ...listener,
    id: state,
    state,
  }));
  const groups = { listener: snapshots };
  const index = new Map(snapshots.map((n) => [n.id, navigationSearchText(n)]));
  for (const query of ["draining", t("Draining")]) {
    assert.deepEqual(
      filterNavigationResources(groups, index, `Ingress ${query}`).listener.map(
        (n) => n.id,
      ),
      ["draining"],
    );
  }
  assert(navigationSearchText(chain, snapshots[1]).includes(t("Draining")));
  setLanguage("en");
});

test("navigation search is case-insensitive and matches names, addresses and types", () => {
  assert.deepEqual(matchingIds("  sErViCe[2]  "), ["cluster", "endpoint"]);
  assert.deepEqual(matchingIds("EDS"), ["cluster"]);
  assert.deepEqual(matchingIds("10.0.0.8:9000"), ["endpoint"]);
  assert.deepEqual(matchingIds("missing-resource"), []);
});

test("filter chains match their listener context and connection metadata", () => {
  assert.deepEqual(matchingIds("8080"), ["listener", "chain"]);
  assert.deepEqual(matchingIds("10.0.0.2:8080"), ["listener", "chain"]);
  assert.deepEqual(matchingIds("ingress"), ["listener", "chain"]);
  assert.deepEqual(matchingIds("filter chain API.EXAMPLE tls"), ["chain"]);
  assert.deepEqual(matchingIds("ingress 9000"), []);
});

test("empty queries preserve original groups and literal queries are not regular expressions", () => {
  assert.equal(filterNavigationResources(groups, index, " \t\n "), groups);
  assert.deepEqual(matchingIds("[2]"), ["cluster", "endpoint"]);
  assert.deepEqual(matchingIds(".*"), []);
  assert.deepEqual(matchingIds("service[2] cluster"), ["cluster"]);
});

test("filtering retains the current natural sort order without mutating resources", () => {
  const nodes = [2, 10, 1].map((n) => ({
    id: String(n),
    kind: "cluster",
    label: `service${n}`,
  }));
  const index = new Map(nodes.map((n) => [n.id, navigationSearchText(n)]));
  for (const [direction, expected] of [
    ["asc", ["1", "2", "10"]],
    ["desc", ["10", "2", "1"]],
  ]) {
    const groups = { cluster: sortedResources(nodes, "cluster", direction) };
    assert.deepEqual(
      filterNavigationResources(groups, index, "service").cluster.map(
        (n) => n.id,
      ),
      expected,
    );
    assert.equal(groups.cluster.length, 3);
  }
  assert.deepEqual(
    nodes.map((n) => n.id),
    ["2", "10", "1"],
  );
});

test("camelCase addresses, named ports, pipe paths and custom cluster types are searchable", () => {
  assert(
    navigationSearchText({
      kind: "listener",
      detail: { address: { socketAddress: { address: "::1", portValue: 0 } } },
    }).includes("::1 0"),
  );
  assert(
    navigationSearchText({
      kind: "endpoint",
      detail: {
        endpoint: { address: { socketAddress: { namedPort: "HTTP" } } },
      },
    }).includes("http"),
  );
  assert(
    navigationSearchText({
      kind: "listener",
      detail: { address: { pipe: { path: "/tmp/envoy.sock" } } },
    }).includes("/tmp/envoy.sock"),
  );
  assert(
    navigationSearchText({
      kind: "cluster",
      detail: { clusterType: { name: "CustomDiscovery" } },
    }).includes("customdiscovery"),
  );
  assert(
    !navigationSearchText({ kind: "cluster", state: "unresolved" }).includes(
      "static",
    ),
  );
});

test("indexing does not walk or stringify large nested resource configurations", () => {
  const node = {
    ...listener,
    detail: {
      ...listener.detail,
      get filter_chains() {
        throw Error("Nested configuration must not be scanned");
      },
    },
  };
  assert(navigationSearchText(node).includes("ingress"));
  assert.doesNotThrow(() =>
    navigationSearchText({
      kind: "filter_chain",
      detail: { filter_chain_match: { server_names: "unexpected-string" } },
    }),
  );
});
