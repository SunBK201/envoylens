import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/parser.js";
import { sample } from "../src/sample.js";
import {
  buildRoutingIndex,
  shouldCollapseRouting,
  ROUTING_COLLAPSE_THRESHOLD,
  routingScope,
  projectRoutingGraph,
  resolveRoutingSelection,
  selectionForEntry,
  matchingRoutes,
  matchingVirtualHosts,
  matchConditions,
  routeDestinations,
  routeDestinationNode,
  retainRoutingState,
} from "../src/routing-model.js";

function fixture() {
  const config = {
    name: "shared",
    virtual_hosts: [
      {
        name: "api",
        domains: ["api.example"],
        routes: [
          {
            name: "weighted",
            match: {
              prefix: "/v1",
              headers: [{ name: "x-team", string_match: { exact: "blue" } }],
            },
            route: {
              weighted_clusters: {
                clusters: [
                  { name: "blue", weight: 7 },
                  { name: "green", weight: 3 },
                ],
              },
              request_mirror_policies: [{ cluster: "shadow" }],
              timeout: "3s",
            },
          },
          {
            name: "redirect",
            match: { path: "/old" },
            redirect: { path_redirect: "/new" },
          },
          {
            name: "direct",
            match: { path: "/health" },
            direct_response: { status: 200 },
          },
          {
            name: "dynamic",
            match: { prefix: "/" },
            route: { cluster_header: "x-upstream" },
          },
        ],
      },
      {
        name: "web",
        domains: ["web.example"],
        routes: [{ match: { prefix: "/" }, route: { cluster: "green" } }],
      },
    ],
  };
  const listener = (name) => ({
    name,
    filter_chains: [
      {
        filters: [
          {
            name: "envoy.filters.network.http_connection_manager",
            typed_config: { rds: { route_config_name: "shared" } },
          },
        ],
      },
    ],
  });
  return {
    configs: [
      {
        dynamic_listeners: ["one", "two"].map((name) => ({
          active_state: { listener: listener(name) },
        })),
      },
      { dynamic_route_configs: [{ route_config: config }] },
      {
        dynamic_active_clusters: ["blue", "green", "shadow", "unused"].map(
          (name) => ({ cluster: { name, type: "EDS" } }),
        ),
      },
    ],
  };
}
function sizedFixture(total = ROUTING_COLLAPSE_THRESHOLD + 1) {
  const input = fixture();
  const hosts =
    input.configs[1].dynamic_route_configs[0].route_config.virtual_hosts;
  hosts[1].routes = Array.from(
    { length: total - hosts.length - hosts[0].routes.length },
    (_, i) => ({ match: { path: `/web/${i}` }, route: { cluster: "green" } }),
  );
  return input;
}

const parse = (input) => parseConfig(JSON.stringify(input));
function checkEdges(graph) {
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.equal(ids.size, graph.nodes.length);
  for (const edge of graph.edges)
    assert(ids.has(edge.source) && ids.has(edge.target));
}

test("shared RDS is indexed once without modifying parser records", () => {
  const model = parse(fixture()),
    before = JSON.stringify(model);
  const index = buildRoutingIndex(model);
  assert.equal(model.nodes.filter((n) => n.kind === "route_config").length, 2);
  assert.equal(index.configs.length, 1);
  assert.equal(index.configs[0].hosts.length, 2);
  assert.equal(index.configs[0].routes.length, 5);
  assert.equal(index.configs[0].ownerIds.length, 2);
  checkEdges(projectRoutingGraph(index, routingScope(index)));
  assert.equal(JSON.stringify(model), before);
});

test("same names in different paths and states are never merged", () => {
  const nodes = [
    {
      id: "a",
      kind: "route_config",
      label: "same",
      path: "$.a",
      state: "active",
      detail: {},
    },
    {
      id: "b",
      kind: "route_config",
      label: "same",
      path: "$.b",
      state: "active",
      detail: {},
    },
    {
      id: "c",
      kind: "route_config",
      label: "same",
      path: "$.a",
      state: "warming",
      detail: {},
    },
    {
      id: "d",
      kind: "route_config",
      label: "same",
      path: "unresolved",
      state: "unresolved",
      detail: {},
    },
    {
      id: "e",
      kind: "route_config",
      label: "same",
      path: "unresolved",
      state: "unresolved",
      detail: {},
    },
  ];
  assert.equal(buildRoutingIndex({ nodes, edges: [] }).configs.length, 5);
});

test("scope is applied before shared resource canonicalization", () => {
  const index = buildRoutingIndex(parse(fixture()));
  for (const listener of index.nodes.filter((n) => n.kind === "listener")) {
    const scope = routingScope(index, listener.id);
    assert.equal(scope.nodes.filter((n) => n.kind === "listener").length, 1);
    assert.equal(scope.configs.length, 1);
    const route = scope.configs[0].routes[0];
    const focus = projectRoutingGraph(index, scope, {
      focusedRoute: route.key,
    });
    assert.equal(focus.nodes.filter((n) => n.kind === "listener").length, 1);
    assert.equal(focus.nodes.filter((n) => n.kind === "route").length, 1);
    assert.equal(focus.nodes.filter((n) => n.kind === "cluster").length, 3);
    checkEdges(focus);
  }
});

test("large routing scopes collapse while branch expansion is explicit", () => {
  const index = buildRoutingIndex(parse(sizedFixture())),
    scope = routingScope(index);
  const config = index.configs[0],
    [api, web] = config.hosts;
  const graph = projectRoutingGraph(index, scope);
  assert(!graph.nodes.some((n) => ["virtual_host", "route"].includes(n.kind)));
  const targets = graph.nodes.find((n) => n.configKey === config.key);
  assert.equal(targets.detail.clusters, 3);
  assert(graph.nodes.some((n) => n.id === "other-clusters"));
  const expanded = projectRoutingGraph(index, scope, { expanded: [api.key] });
  assert.equal(expanded.nodes.filter((n) => n.kind === "route").length, 4);
  assert.equal(
    expanded.nodes.filter((n) => n.kind === "virtual_host").length,
    1,
  );
  const both = projectRoutingGraph(index, scope, {
    expanded: [api.key, web.key],
  });
  assert.equal(
    both.nodes.filter((n) => n.kind === "route").length,
    config.routes.length,
  );
  assert(!both.nodes.some((n) => n.configKey));
  checkEdges(graph);
  checkEdges(expanded);
  checkEdges(both);
  // Centering a collapsed config must not reveal all of its descendants.
  assert.deepEqual(
    projectRoutingGraph(index, scope, { revealId: config.node.id }),
    graph,
  );
});

test("selected upstream can be revealed without expanding all its referrers", () => {
  const index = buildRoutingIndex(parse(sizedFixture())),
    scope = routingScope(index);
  const cluster = index.nodes.find(
    (n) => n.kind === "cluster" && n.label === "blue",
  );
  const graph = projectRoutingGraph(index, scope, { revealId: cluster.id });
  assert(graph.nodes.some((n) => n.id === cluster.id));
  assert(!graph.nodes.some((n) => n.kind === "route"));
  assert(graph.edges.some((e) => e.target === cluster.id));
  checkEdges(graph);
});

test("search covers domains and full conditions without changing route priority", () => {
  const index = buildRoutingIndex(parse(fixture())),
    config = index.configs[0];
  assert.deepEqual(
    matchingRoutes(config, "x-team").map((r) => r.order),
    [1],
  );
  assert.deepEqual(
    matchingRoutes(config, "api.example").map((r) => r.order),
    [1, 2, 3, 4],
  );
  assert.equal(
    matchingRoutes(config, "SHADOW")[0].node.detail.name,
    "weighted",
  );
  assert.equal(matchingRoutes(config, "no-such-rule").length, 0);
  const rule = config.routes[0];
  assert(matchConditions(rule.node.detail).includes('"exact":"blue"'));
  assert.deepEqual(selectionForEntry(rule), {
    config: config.key,
    host: config.hosts[0].key,
    route: rule.key,
  });
  assert.equal(resolveRoutingSelection(index, [], {}).config, "");
});

test("destination links focus their own outgoing graph nodes", () => {
  const index = buildRoutingIndex(parse(fixture()));
  const routes = index.configs[0].hosts[0].routes;
  const targets = routes.map((route) =>
    routeDestinations(route.node.detail).map((destination) =>
      routeDestinationNode(index, route, destination),
    ),
  );
  assert.deepEqual(
    targets[0].map((node) => node.label),
    ["blue", "green", "shadow"],
  );
  assert.equal(targets[1][0].label, "Redirect");
  assert.equal(targets[2][0].label, "Direct response 200");
  assert.equal(targets[3][0].kind, "dynamic");
  routes.forEach((route, i) => {
    const graph = projectRoutingGraph(index, routingScope(index), {
      focusedRoute: route.key,
    });
    for (const target of targets[i])
      assert(graph.nodes.some((node) => node.id === target.id));
  });
  assert.equal(
    routeDestinationNode(index, routes[0], { kind: "cluster", name: "unused" }),
    routes[0].node,
  );
  assert.equal(
    routeDestinationNode(index, routes[0], { kind: "unknown" }),
    routes[0].node,
  );
});

test("missing upstream references remain navigable", () => {
  const input = fixture();
  input.configs[2].dynamic_active_clusters = [];
  const index = buildRoutingIndex(parse(input));
  const route = index.configs[0].routes[0];
  const target = routeDestinationNode(
    index,
    route,
    routeDestinations(route.node.detail)[0],
  );
  assert.equal(target.label, "blue");
  assert.equal(target.state, "unresolved");
});

test("actions preserve weights, mirrors, dynamic targets and protobuf casing", () => {
  const routes =
    fixture().configs[1].dynamic_route_configs[0].route_config.virtual_hosts[0]
      .routes;
  assert.deepEqual(
    routeDestinations(routes[0]).map((d) => d.label),
    ["Weight 7", "Weight 3", "Mirror"],
  );
  assert.equal(routeDestinations(routes[1])[0].label, "Redirect");
  assert.equal(routeDestinations(routes[2])[0].name, "200");
  assert.equal(routeDestinations(routes[3])[0].label, "Dynamic target");
  assert.equal(
    routeDestinations({ directResponse: { status: 204 } })[0].name,
    "204",
  );
  assert.equal(
    routeDestinations({
      route: {
        weightedClusters: { clusters: [{ name: "a", weight: { value: 25 } }] },
        requestMirrorPolicies: [{ cluster: "b" }],
      },
    })[0].label,
    "Weight 25",
  );
});

test("refresh retains semantic selections after array insertions and route reorder", () => {
  const input = fixture(),
    old = buildRoutingIndex(parse(input));
  const config = old.configs[0],
    host = config.hosts[0],
    route = host.routes[0];
  input.configs[1].dynamic_route_configs[0].route_config.virtual_hosts.reverse();
  input.configs[1].dynamic_route_configs[0].route_config.virtual_hosts[1].routes.reverse();
  input.configs[2].dynamic_active_clusters.unshift({
    cluster: { name: "new", type: "EDS" },
  });
  const next = buildRoutingIndex(parse(input));
  const state = retainRoutingState(old, next, {
    selection: selectionForEntry(route),
    expanded: [host.key],
    focusedRoute: route.key,
    keepBranches: true,
  });
  assert.equal(next.entries.get(state.selection.host).node.label, "api");
  assert.equal(
    next.entries.get(state.focusedRoute).node.detail.name,
    "weighted",
  );
  assert.equal(next.entries.get(state.focusedRoute).order, 4);
  assert.equal(state.expanded[0], state.selection.host);
  const empty = buildRoutingIndex({ nodes: [], edges: [] });
  const removed = retainRoutingState(next, empty, state);
  assert.deepEqual(removed.expanded, []);
  assert.equal(removed.focusedRoute, "");
});

test("TCP-only configurations retain their actual upstream edges", () => {
  const model = parse({
    static_resources: {
      listeners: [
        {
          name: "tcp",
          filter_chains: [
            {
              filters: [
                {
                  name: "envoy.filters.network.tcp_proxy",
                  typed_config: { cluster: "upstream" },
                },
              ],
            },
          ],
        },
      ],
      clusters: [{ name: "upstream", type: "STATIC" }],
    },
  });
  const index = buildRoutingIndex(model),
    graph = projectRoutingGraph(index, routingScope(index));
  const cluster = graph.nodes.find((n) => n.kind === "cluster");
  assert(cluster);
  assert(graph.edges.some((e) => e.target === cluster.id));
  checkEdges(graph);
});

test("demo remains navigable and chooses the largest routing table", () => {
  const index = buildRoutingIndex(parseConfig(sample));
  const selection = resolveRoutingSelection(index, index.configs);
  assert(index.entries.has(selection.route));
  checkEdges(projectRoutingGraph(index, routingScope(index)));
});

test("VirtualHost search matches names and domains independently of route search", () => {
  const index = buildRoutingIndex(parse(fixture()));
  const hosts = index.configs[0].hosts;
  assert.deepEqual(matchingVirtualHosts(hosts, " API "), [hosts[0]]);
  assert.deepEqual(matchingVirtualHosts(hosts, "WEB.EXAMPLE"), [hosts[1]]);
  assert.deepEqual(matchingVirtualHosts(hosts, "example"), hosts);
  assert.strictEqual(matchingVirtualHosts(hosts, "  "), hosts);
  assert.deepEqual(matchingVirtualHosts(hosts, "x-team"), []);
  assert.deepEqual(matchingVirtualHosts(hosts, "shadow"), []);
  assert.deepEqual(matchingVirtualHosts([], "api"), []);
  assert.equal(index.configs[0].routes.length, 5);
});

test("small routing scopes remain fully visible even when a host is selected", () => {
  const index = buildRoutingIndex(parse(fixture())),
    scope = routingScope(index);
  assert.equal(shouldCollapseRouting(scope), false);
  for (const expanded of [[], [index.configs[0].hosts[0].key]]) {
    const graph = projectRoutingGraph(index, scope, { expanded });
    assert.deepEqual(graph.nodes, scope.nodes);
    assert.deepEqual(graph.edges, scope.edges);
    assert.equal(graph.nodes.filter((n) => n.kind === "route").length, 5);
    assert(!graph.nodes.some((n) => n.kind === "target_group"));
  }
});

test("automatic collapse uses a strict threshold after resource deduplication", () => {
  for (const count of [
    ROUTING_COLLAPSE_THRESHOLD - 1,
    ROUTING_COLLAPSE_THRESHOLD,
    ROUTING_COLLAPSE_THRESHOLD + 1,
  ]) {
    const model = parse(sizedFixture(count));
    const index = buildRoutingIndex(model),
      scope = routingScope(index);
    assert.equal(
      scope.configs.reduce(
        (sum, c) => sum + c.hosts.length + c.routes.length,
        0,
      ),
      count,
    );
    assert.equal(
      shouldCollapseRouting(scope),
      count > ROUTING_COLLAPSE_THRESHOLD,
    );
    const graph = projectRoutingGraph(index, scope);
    assert.equal(
      graph.nodes.some((n) => n.kind === "route"),
      count <= ROUTING_COLLAPSE_THRESHOLD,
    );
    checkEdges(graph);
  }
});

test("narrowing a large input to a small listener restores the full routing graph", () => {
  const input = sizedFixture();
  input.configs[0].dynamic_listeners.push({
    active_state: {
      listener: {
        name: "small",
        filter_chains: [
          {
            filters: [
              {
                name: "envoy.filters.network.http_connection_manager",
                typed_config: {
                  route_config: {
                    name: "small-routes",
                    virtual_hosts: [
                      {
                        name: "small-host",
                        domains: ["small.example"],
                        routes: [
                          {
                            match: { prefix: "/" },
                            route: { cluster: "green" },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    },
  });
  const index = buildRoutingIndex(parse(input));
  assert.equal(shouldCollapseRouting(routingScope(index)), true);
  const listener = index.nodes.find(
    (n) => n.kind === "listener" && n.label === "small",
  );
  const scope = routingScope(index, listener.id);
  assert.equal(shouldCollapseRouting(scope), false);
  const graph = projectRoutingGraph(index, scope);
  assert.equal(graph.nodes.filter((n) => n.kind === "virtual_host").length, 1);
  assert.equal(graph.nodes.filter((n) => n.kind === "route").length, 1);
  assert(!graph.nodes.some((n) => n.kind === "target_group"));
  checkEdges(graph);
});
