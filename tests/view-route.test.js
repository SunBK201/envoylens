import test from "node:test";
import assert from "node:assert/strict";
import { readViewRoute, writeViewRoute } from "../src/view-route.js";
import {
  resourceRouteLocation,
  restoreResourceRoute,
} from "../src/view-route.js";
import { parseConfig } from "../src/parser.js";
import { buildRoutingIndex, selectionForEntry } from "../src/routing-model.js";
import { configIdentity } from "../src/view-storage.js";
import { sample } from "../src/sample.js";

const storage = { getItem: () => "list" };
test("explicit view URLs take priority over stored preferences", () => {
  for (const view of ["graph", "routes", "list", "raw"])
    assert.equal(readViewRoute(`#/${view}`, storage), view);
});
test("empty URLs restore valid preferences, invalid URLs fall back to graph", () => {
  assert.equal(readViewRoute("", storage), "list");
  for (const hash of ["#", "#/unknown", "#raw", "#/RAW"])
    assert.equal(readViewRoute(hash, storage), "graph");
  for (const value of [null, "unknown"])
    assert.equal(readViewRoute("", { getItem: () => value }), "graph");
  assert.equal(
    readViewRoute("", {
      getItem() {
        throw Error();
      },
    }),
    "graph",
  );
});
function browser() {
  const calls = [];
  const saved = [];
  return {
    calls,
    saved,
    location: { pathname: "/lens/", search: "?keep=1", hash: "" },
    history: {
      state: { preserved: true },
      pushState(...args) {
        calls.push(["push", ...args]);
      },
      replaceState(...args) {
        calls.push(["replace", ...args]);
      },
    },
    localStorage: {
      setItem(...args) {
        saved.push(args);
      },
    },
  };
}
test("navigation preserves path, query, and history state and remembers the view", () => {
  const target = browser();
  writeViewRoute(target, "routes");
  assert.deepEqual(target.calls, [
    ["push", { preserved: true }, "", "/lens/?keep=1#/routes"],
  ]);
  assert.deepEqual(target.saved, [["envoylens-active-view", "routes"]]);
});
test("normalization replaces history; repeated and invalid navigation add no entries", () => {
  const target = browser();
  writeViewRoute(target, "raw", { replace: true });
  assert.equal(target.calls[0][0], "replace");
  target.location.hash = "#/raw";
  writeViewRoute(target, "raw");
  writeViewRoute(target, "unknown");
  assert.equal(target.calls.length, 1);
});
test("blocked storage does not prevent navigation", () => {
  const target = browser();
  Object.defineProperty(target, "localStorage", {
    get() {
      throw Error();
    },
  });
  writeViewRoute(target, "list");
  assert.equal(target.calls.length, 1);
});

function resourceHash(view, { path, params }) {
  return `#/${view}${path ? `/${path}` : ""}${params ? `?${params}` : ""}`;
}
const index = buildRoutingIndex(parseConfig(sample));
const identity = configIdentity(sample);
test("resource links round-trip every resource kind without positional IDs", () => {
  for (const node of index.nodes) {
    const location = resourceRouteLocation(index, identity, {
      selected: node,
      detailsOpen: true,
    });
    const hash = resourceHash("graph", location);
    assert.equal(readViewRoute(hash, storage), "graph");
    const restored = restoreResourceRoute(hash, index, identity);
    assert.equal(restored.selected.id, node.id);
    assert.equal(restored.detailsOpen, true);
    assert.ok(location.path.startsWith(node.kind.replaceAll("_", "-") + "/"));
    assert.ok(!hash.includes("%5B") && !hash.includes("static_resources"));
  }
});
test("route context, graph focus, expanded hosts and scope round-trip", () => {
  const route = index.configs[0].routes[1];
  const host = index.entries.get(route.hostKey);
  const state = {
    selected: route.node,
    detailsOpen: false,
    listener: index.nodes.find((n) => n.kind === "listener").id,
    chain: index.nodes.find((n) => n.kind === "filter_chain").id,
    selection: selectionForEntry(route),
    focusedRoute: route.key,
    expanded: [host.key],
  };
  const location = resourceRouteLocation(index, identity, state);
  assert.deepEqual(
    restoreResourceRoute(resourceHash("graph", location), index, identity),
    state,
  );
});
test("missing resources, malformed references and mismatched snapshots fail closed", () => {
  const location = resourceRouteLocation(index, identity, {
    selected: index.nodes[0],
    detailsOpen: true,
  });
  const hash = resourceHash("list", location);
  assert.equal(restoreResourceRoute(hash, index, "99:999").selected, null);
  for (const path of [
    "cluster/missing",
    "cluster/%ZZ",
    "cluster/too/many/segments",
  ]) {
    const missing = resourceHash("list", { ...location, path });
    assert.equal(restoreResourceRoute(missing, index, identity).selected, null);
  }
  assert.equal(
    restoreResourceRoute("#/list/cluster/api_stable", index, identity).selected,
    null,
  );
});
test("Unicode and reserved characters in resource references survive URL encoding", () => {
  for (const label of [
    "集群 /?&# + 中文",
    "100%25",
    "a/b",
    "a%2Fb",
    "a/2",
    "a",
  ]) {
    const node = { ...index.nodes[0], label };
    const custom = { ...index, byId: new Map([[node.id, node]]) };
    const location = resourceRouteLocation(custom, identity, {
      selected: node,
    });
    assert.equal(
      restoreResourceRoute(resourceHash("list", location), custom, identity)
        .selected,
      node,
    );
  }
});
test("navigation writes resource parameters without changing the outer query", () => {
  const target = browser();
  writeViewRoute(target, "list", {
    path: "cluster/api_stable",
    params: "s=abc",
  });
  assert.equal(
    target.calls[0][3],
    "/lens/?keep=1#/list/cluster/api_stable?s=abc",
  );
});

test("common cluster URLs are short, named, and deterministic", () => {
  const selected = index.nodes.find((node) => node.label === "api_stable");
  const location = resourceRouteLocation(index, identity, {
    selected,
    detailsOpen: true,
  });
  const hash = resourceHash("list", location);
  assert.match(hash, /^#\/list\/cluster\/api_stable\?s=[a-z0-9-]+$/);
  assert.ok(hash.length < 60);
  assert.deepEqual(
    resourceRouteLocation(index, identity, { selected, detailsOpen: true }),
    location,
  );
});
test("workbench links include config, VirtualHost and route names only once", () => {
  const route = index.configs[0].routes[1];
  const location = resourceRouteLocation(index, identity, {
    view: "routes",
    selection: selectionForEntry(route),
  });
  assert.equal(location.path, "route/public_routes/api_service/health_check");
  assert.ok(!location.params.includes("at="));
  const restored = restoreResourceRoute(
    resourceHash("routes", location),
    index,
    identity,
  );
  assert.deepEqual(restored.selection, selectionForEntry(route));
  assert.equal(restored.selected, null);
});
test("same-named resources have unambiguous compact suffixes", () => {
  const first = {
    ...index.nodes[0],
    id: "first",
    kind: "cluster",
    label: "same",
    path: "$.a",
  };
  const second = { ...first, id: "second", path: "$.b" };
  const custom = {
    ...index,
    byId: new Map([
      [first.id, first],
      [second.id, second],
    ]),
  };
  for (const [node, suffix] of [
    [first, "1"],
    [second, "2"],
  ]) {
    const location = resourceRouteLocation(custom, identity, {
      selected: node,
      detailsOpen: true,
    });
    assert.equal(location.path, `cluster/same/${suffix}`);
    assert.equal(
      restoreResourceRoute(resourceHash("list", location), custom, identity)
        .selected,
      node,
    );
  }
  assert.equal(
    restoreResourceRoute(
      "#/list/cluster/same?s=" +
        resourceRouteLocation(custom, identity, {
          selected: first,
        }).params.split("s=")[1],
      custom,
      identity,
    ).selected,
    null,
  );
});
test("non-graph links omit unrelated canvas state", () => {
  const route = index.configs[0].routes[1];
  const selected = index.nodes.find((node) => node.label === "api_stable");
  for (const view of ["list", "raw", "routes"]) {
    const location = resourceRouteLocation(index, identity, {
      view,
      selected,
      detailsOpen: true,
      selection: selectionForEntry(route),
      focusedRoute: route.key,
      expanded: [route.hostKey],
    });
    assert.ok(!/[?&]?(at|focus|expand)=/.test(location.params));
  }
});
test("duplicate suffixes remain stable when model iteration order changes", () => {
  const first = {
    ...index.nodes[0],
    id: "first",
    kind: "cluster",
    label: "same",
    path: "$.a",
  };
  const second = { ...first, id: "second", path: "$.b" };
  const a = {
    ...index,
    byId: new Map([
      [first.id, first],
      [second.id, second],
    ]),
  };
  const b = {
    ...index,
    byId: new Map([
      [second.id, second],
      [first.id, first],
    ]),
  };
  assert.deepEqual(
    resourceRouteLocation(a, identity, { selected: first }),
    resourceRouteLocation(b, identity, { selected: first }),
  );
});
