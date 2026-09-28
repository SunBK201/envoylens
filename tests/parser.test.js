import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/parser.js";
import { sample } from "../src/sample.js";
const parse = (o) => parseConfig(JSON.stringify(o));
const listener = (typed_config) => ({
  name: "http",
  filter_chains: [
    {
      filters: [
        { name: "envoy.filters.network.http_connection_manager", typed_config },
      ],
    },
  ],
});
const rc = {
  name: "rds",
  virtual_hosts: [
    {
      name: "api",
      domains: ["*"],
      routes: [{ match: { prefix: "/" }, route: { cluster: "backend" } }],
    },
  ],
};
const dump = {
  configs: [
    {
      dynamic_listeners: [
        {
          name: "http",
          active_state: {
            listener: listener({ rds: { route_config_name: "rds" } }),
          },
          warming_state: { listener: { name: "warming" } },
        },
      ],
    },
    { dynamic_route_configs: [{ route_config: rc }] },
    {
      dynamic_active_clusters: [{ cluster: { name: "backend", type: "EDS" } }],
    },
  ],
};
test("YAML bootstrap: weighted routes, HTTP filters and response action", () => {
  const m = parseConfig(sample);
  assert.equal(m.format, "Bootstrap");
  assert.equal(m.nodes.filter((n) => n.kind === "cluster").length, 2);
  assert.equal(m.nodes.filter((n) => n.kind === "route").length, 2);
  assert.equal(m.warnings.length, 0);
  assert(m.edges.some((e) => e.label === "Weight 90"));
  assert(m.edges.some((e) => e.label === "Use routes"));
  assert(m.nodes.some((n) => n.kind === "match"));
  assert(m.nodes.some((n) => n.kind === "action"));
});
test("JSON and YAML produce identical normalized graph", () => {
  const m = parseConfig(sample);
  assert.deepEqual(parse(m.raw), m);
});
test("config_dump resolves RDS and preserves warming state", () => {
  const m = parse(dump);
  assert.equal(m.format, "Config dump");
  assert(m.nodes.some((n) => n.state === "warming"));
  assert(!m.nodes.some((n) => n.state === "unresolved"));
  assert(m.edges.some((e) => e.label === "RDS reference"));
});
test("unresolved RDS and cluster references are explicit", () => {
  const m = parse({
    static_resources: {
      listeners: [
        listener({ rds: { route_config_name: "missing" } }),
        listener({ route_config: rc }),
      ],
    },
  });
  assert(m.warnings.some((w) => w.includes("RDS")));
  assert(m.warnings.some((w) => w.includes("backend")));
});
test("protobuf lowerCamelCase supported", () => {
  const m = parse({
    staticResources: {
      listeners: [
        {
          name: "l",
          filterChains: [
            {
              filterChainMatch: { serverNames: ["a"] },
              filters: [
                {
                  name: "envoy.filters.network.http_connection_manager",
                  typedConfig: {
                    routeConfig: {
                      name: "inline",
                      virtualHosts: [
                        {
                          name: "vh",
                          routes: [
                            {
                              route: {
                                weightedClusters: {
                                  clusters: [{ name: "c", weight: 100 }],
                                },
                              },
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
      ],
      clusters: [{ name: "c" }],
    },
  });
  assert(m.edges.some((e) => e.label === "Weight 100"));
  assert.equal(m.warnings.length, 0);
});
test("TCP proxy, default filter chain and listener filters", () => {
  const m = parse({
    static_resources: {
      listeners: [
        {
          name: "tcp",
          listener_filters: [{ name: "envoy.filters.listener.tls_inspector" }],
          default_filter_chain: {
            filters: [
              {
                name: "envoy.filters.network.tcp_proxy",
                typed_config: { cluster: "tcp_upstream" },
              },
            ],
          },
        },
      ],
      clusters: [{ name: "tcp_upstream" }],
    },
  });
  assert(m.nodes.some((n) => n.kind === "listener_filter"));
  assert(m.nodes.some((n) => n.label === "Default filter chain"));
  assert(m.edges.some((e) => e.label === "Forward"));
});
test("dynamic cluster header is not a fixed cluster", () => {
  const m = parse({
    static_resources: {
      listeners: [
        listener({
          route_config: {
            virtual_hosts: [
              { routes: [{ route: { cluster_header: "x-target" } }] },
            ],
          },
        }),
      ],
    },
  });
  assert(m.nodes.some((n) => n.kind === "dynamic"));
  assert(!m.nodes.some((n) => n.kind === "cluster"));
});
test("mirror destinations and redirect action preserved", () => {
  const m = parse({
    static_resources: {
      listeners: [
        listener({
          route_config: {
            virtual_hosts: [
              {
                routes: [
                  {
                    route: {
                      cluster: "c",
                      request_mirror_policies: [{ cluster: "mirror" }],
                    },
                  },
                  { redirect: { https_redirect: true } },
                ],
              },
            ],
          },
        }),
      ],
      clusters: [{ name: "c" }, { name: "mirror" }],
    },
  });
  assert(m.edges.some((e) => e.label === "Mirror"));
  assert(m.nodes.some((n) => n.label === "Redirect"));
});
test("dump sections override bootstrap without duplicate resources", () => {
  const m = parse({
    configs: [
      {
        bootstrap: {
          static_resources: {
            listeners: [{ name: "stale" }],
            clusters: [{ name: "c" }],
          },
        },
      },
      {
        "@type": "type.googleapis.com/envoy.admin.v3.ListenersConfigDump",
        static_listeners: [{ listener: { name: "current" } }],
      },
      { static_clusters: [{ cluster: { name: "c" } }] },
    ],
  });
  assert.equal(m.nodes.filter((n) => n.kind === "listener").length, 1);
  assert(!m.nodes.some((n) => n.label === "stale"));
  assert.equal(m.nodes.filter((n) => n.kind === "cluster").length, 1);
});
test("partial dumps independently fall back to bootstrap clusters", () => {
  const m = parse({
    configs: [
      { bootstrap: { static_resources: { clusters: [{ name: "c" }] } } },
      { static_listeners: [{ listener: { name: "l" } }] },
    ],
  });
  assert(m.nodes.some((n) => n.label === "c"));
});
test("unattached RDS configs stay inspectable", () => {
  const m = parse({
    configs: [{ dynamic_route_configs: [{ route_config: rc }] }],
  });
  assert(m.nodes.some((n) => n.kind === "route"));
});
test("invalid, duplicate keys, aliases and unknown documents fail safely", () => {
  for (const input of [
    "",
    "hello",
    "[]",
    "foo: bar",
    "static_resources: [",
    "node: 1\nnode: 2",
    "node: &a [*a]",
  ])
    assert.throws(() => parseConfig(input));
});
test("empty bootstrap is valid but has a diagnostic", () => {
  const m = parse({ static_resources: {} });
  assert.equal(m.nodes.length, 0);
  assert.equal(m.warnings.length, 1);
});
test("graph always has unique nodes and valid edge endpoints", () => {
  for (const m of [parseConfig(sample), parse(dump)]) {
    const ids = new Set(m.nodes.map((n) => n.id));
    assert.equal(ids.size, m.nodes.length);
    for (const e of m.edges) {
      assert(ids.has(e.source));
      assert(ids.has(e.target));
    }
  }
});

test("listener filters form an ordered chain before match and filter chain", () => {
  const m = parse({
    static_resources: {
      listeners: [
        {
          name: "l",
          listener_filters: [
            { name: "tls_inspector" },
            { name: "http_inspector" },
          ],
          filter_chains: [
            {
              name: "https",
              filter_chain_match: { server_names: ["api.example"] },
              filters: [],
            },
          ],
        },
      ],
    },
  });
  const kinds = [
    "listener",
    "listener_filter",
    "listener_filter",
    "match",
    "filter_chain",
  ];
  let current = m.nodes.find((n) => n.kind === "listener");
  for (let i = 0; i < kinds.length; i++) {
    assert.equal(current.kind, kinds[i]);
    const next = m.edges.filter((e) => e.source === current.id);
    assert.equal(next.length, i === kinds.length - 1 ? 0 : 1);
    if (next.length) current = m.nodes.find((n) => n.id === next[0].target);
  }
  assert.equal(
    m.nodes.filter((n) => n.kind === "listener_filter")[0].label,
    "tls_inspector",
  );
});
test("without listener filters, selection branches only for candidate chains", () => {
  const m = parse({
    static_resources: {
      listeners: [
        {
          name: "l",
          filter_chains: [
            { name: "a", filter_chain_match: { server_names: ["a"] } },
            { name: "b", filter_chain_match: { server_names: ["b"] } },
          ],
          default_filter_chain: { name: "fallback" },
        },
      ],
    },
  });
  const l = m.nodes.find((n) => n.kind === "listener");
  const outgoing = m.edges.filter((e) => e.source === l.id);
  assert.equal(outgoing.length, 3);
  for (const e of outgoing)
    assert.equal(
      m.nodes.find((n) => n.id === e.target).kind,
      e.label === "Fallback selection" ? "filter_chain" : "match",
    );
  const fallback = m.nodes.find((n) => n.label === "fallback");
  assert(
    outgoing.some(
      (e) => e.target === fallback.id && e.label === "Fallback selection",
    ),
  );
  for (const match of m.nodes.filter((n) => n.kind === "match")) {
    const edge = m.edges.find((e) => e.source === match.id);
    assert.equal(
      m.nodes.find((n) => n.id === edge.target).kind,
      "filter_chain",
    );
  }
});

test("HTTP filters form one declared chain with a single inline route edge", () => {
  const m = parseConfig(sample);
  const hcm = m.nodes.find((n) => n.kind === "network_filter");
  const filters = m.nodes.filter((n) => n.kind === "http_filter");
  const rcNode = m.nodes.find((n) => n.kind === "route_config");
  const chain = [hcm, ...filters, rcNode];
  for (let i = 0; i < chain.length - 1; i++) {
    const outgoing = m.edges.filter((e) => e.source === chain[i].id);
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].target, chain[i + 1].id);
  }
  assert.equal(m.edges.filter((e) => e.target === rcNode.id).length, 1);
});
test("resolved and missing RDS use Router, not a parallel HCM edge", () => {
  for (const resolved of [true, false]) {
    const m = parse({
      configs: [
        {
          static_listeners: [
            {
              listener: listener({
                http_filters: [
                  { name: "envoy.filters.http.cors" },
                  { name: "envoy.filters.http.router" },
                ],
                rds: { route_config_name: "rds" },
              }),
            },
          ],
        },
        ...(resolved
          ? [{ dynamic_route_configs: [{ route_config: rc }] }]
          : []),
      ],
    });
    const hcm = m.nodes.find((n) => n.kind === "network_filter");
    const filters = m.nodes.filter((n) => n.kind === "http_filter");
    const route = m.nodes.find((n) => n.kind === "route_config");
    assert.deepEqual(
      m.edges.filter((e) => e.source === hcm.id).map((e) => e.target),
      [filters[0].id],
    );
    assert.deepEqual(
      m.edges.filter((e) => e.source === filters[0].id).map((e) => e.target),
      [filters[1].id],
    );
    assert.deepEqual(
      m.edges.filter((e) => e.target === route.id).map((e) => e.source),
      [filters[1].id],
    );
    assert.equal(route.state === "unresolved", !resolved);
  }
});
test("unknown custom filter does not acquire invented routing behavior", () => {
  const m = parse({
    static_resources: {
      listeners: [
        listener({
          http_filters: [{ name: "custom.filter" }],
          route_config: rc,
        }),
      ],
    },
  });
  const hcm = m.nodes.find((n) => n.kind === "network_filter");
  const route = m.nodes.find((n) => n.kind === "route_config");
  assert.deepEqual(
    m.edges.filter((e) => e.target === route.id).map((e) => e.source),
    [hcm.id],
  );
});

test("inline route repeated in static route dump is not drawn as an orphan", () => {
  const m = parse({
    configs: [
      { static_listeners: [{ listener: listener({ route_config: rc }) }] },
      {
        static_route_configs: [
          {
            route_config: {
              "@type":
                "type.googleapis.com/envoy.config.route.v3.RouteConfiguration",
              ...rc,
            },
          },
        ],
      },
    ],
  });
  assert.equal(m.nodes.filter((n) => n.kind === "route_config").length, 1);
  assert(!m.nodes.some((n) => n.kind === "resource"));
});
test("same name with different route contents is not silently deduplicated", () => {
  const m = parse({
    configs: [
      { static_listeners: [{ listener: listener({ route_config: rc }) }] },
      {
        static_route_configs: [{ route_config: { ...rc, virtual_hosts: [] } }],
      },
    ],
  });
  assert.equal(m.nodes.filter((n) => n.kind === "route_config").length, 2);
});
test("complete dynamic dump does not warn that bootstrap needs a dump", () => {
  const m = parse({
    configs: [
      { bootstrap: { dynamic_resources: { ads_config: {} } } },
      { "@type": "type.googleapis.com/envoy.admin.v3.ListenersConfigDump" },
      { "@type": "type.googleapis.com/envoy.admin.v3.ClustersConfigDump" },
    ],
  });
  assert(!m.warnings.some((w) => w.includes("xDS subscriptions")));
});

test("absent and empty filter chain matches link directly from listener filters", () => {
  for (const match of [undefined, {}]) {
    const m = parse({
      static_resources: {
        listeners: [
          {
            name: "l",
            listener_filters: [{ name: "inspector" }],
            filter_chains: [{ name: "chain", filter_chain_match: match }],
          },
        ],
      },
    });
    assert.equal(m.nodes.filter((n) => n.kind === "match").length, 0);
    const filter = m.nodes.find((n) => n.kind === "listener_filter");
    const chain = m.nodes.find((n) => n.kind === "filter_chain");
    assert(
      m.edges.some((e) => e.source === filter.id && e.target === chain.id),
    );
  }
});

test("inline endpoints connect to their cluster and keep original details", () => {
  const lb = {
    endpoint: {
      address: { socket_address: { address: "127.0.0.1", port_value: 8080 } },
    },
    health_status: "HEALTHY",
  };
  const m = parse({
    static_resources: {
      clusters: [
        {
          name: "backend",
          load_assignment: {
            cluster_name: "backend",
            endpoints: [
              { priority: 1, locality: { zone: "a" }, lb_endpoints: [lb] },
            ],
          },
        },
      ],
    },
  });
  const endpoint = m.nodes.find((n) => n.kind === "endpoint");
  assert.equal(endpoint.label, "127.0.0.1:8080");
  assert.equal(endpoint.clusterName, "backend");
  assert.equal(endpoint.priority, 1);
  assert.deepEqual(endpoint.detail, lb);
  assert(
    m.edges.some(
      (e) =>
        e.target === endpoint.id &&
        m.nodes.find((n) => n.id === e.source).kind === "cluster",
    ),
  );
});

test("endpoint dump takes precedence over inline assignment and supports EDS service names", () => {
  const assignment = {
    cluster_name: "service",
    endpoints: [
      {
        lb_endpoints: [
          { endpoint: { address: { pipe: { path: "/tmp/backend.sock" } } } },
        ],
      },
    ],
  };
  const m = parse({
    configs: [
      {
        dynamic_active_clusters: [
          {
            cluster: {
              name: "backend",
              eds_cluster_config: { service_name: "service" },
              load_assignment: assignment,
            },
          },
        ],
      },
      { dynamic_endpoint_configs: [{ endpoint_config: assignment }] },
    ],
  });
  const endpoints = m.nodes.filter((n) => n.kind === "endpoint");
  assert.equal(endpoints.length, 1);
  assert.equal(endpoints[0].label, "/tmp/backend.sock");
  assert.equal(endpoints[0].state, "active");
  assert.equal(endpoints[0].clusterName, "backend");
});

test("standalone camelCase endpoint dump is inspectable without invented clusters", () => {
  const m = parse({
    configs: [
      {
        staticEndpointConfigs: [
          {
            endpointConfig: {
              clusterName: "orphan",
              endpoints: [
                {
                  lbEndpoints: [
                    {
                      endpoint: {
                        address: {
                          socketAddress: { address: "::1", portValue: 80 },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(m.nodes.filter((n) => n.kind === "endpoint").length, 1);
  assert.equal(m.nodes[0].label, "[::1]:80");
  assert.equal(m.nodes.filter((n) => n.kind === "cluster").length, 0);
});

test("origin follows bootstrap ownership, not configured state or cluster type", () => {
  const m = parse({
    static_resources: {
      listeners: [listener({ route_config: rc })],
      clusters: [{ name: "backend", type: "EDS" }],
    },
  });
  assert.ok(m.nodes.every((n) => n.origin === "bootstrap"));
  assert.equal(m.nodes.find((n) => n.kind === "route").state, "configured");
});

test("inline routes inherit LDS origin while RDS overrides static listener origin", () => {
  const m = parse({
    configs: [
      {
        static_listeners: [
          { listener: listener({ rds: { route_config_name: "rds" } }) },
        ],
        dynamic_listeners: [
          {
            warming_state: {
              listener: listener({ route_config: { ...rc, name: "inline" } }),
            },
          },
        ],
        dynamic_route_configs: [{ route_config: rc }],
        dynamic_active_clusters: [
          { cluster: { name: "backend", type: "STATIC" } },
        ],
      },
    ],
  });
  assert.equal(
    m.nodes.find((n) => n.kind === "listener" && n.state === "static").origin,
    "bootstrap",
  );
  assert.ok(
    m.nodes
      .filter((n) =>
        ["route_config", "route", "virtual_host", "cluster"].includes(n.kind),
      )
      .every((n) => n.origin === "xds"),
  );
});

test("runtime selectors inherit config origin and missing targets remain unknown", () => {
  const m = parse({
    static_resources: {
      listeners: [
        listener({
          route_config: {
            name: "route",
            virtual_hosts: [
              {
                routes: [
                  {
                    match: { prefix: "/" },
                    route: { cluster_header: "target" },
                  },
                  {
                    match: { prefix: "/missing" },
                    route: { cluster: "missing" },
                  },
                ],
              },
            ],
          },
        }),
      ],
    },
  });
  assert.equal(m.nodes.find((n) => n.kind === "dynamic").origin, "bootstrap");
  assert.equal(m.nodes.find((n) => n.kind === "cluster").origin, "unknown");
});

test("EDS endpoints have their own origin independent of the static cluster", () => {
  const endpoints = [
    {
      lb_endpoints: [
        {
          endpoint: {
            address: {
              socket_address: { address: "127.0.0.1", port_value: 80 },
            },
          },
        },
      ],
    },
  ];
  const m = parse({
    configs: [
      {
        static_clusters: [{ cluster: { name: "backend", type: "EDS" } }],
        dynamic_endpoint_configs: [
          { endpoint_config: { cluster_name: "backend", endpoints } },
        ],
      },
    ],
  });
  assert.equal(m.nodes.find((n) => n.kind === "cluster").origin, "bootstrap");
  assert.equal(m.nodes.find((n) => n.kind === "endpoint").origin, "xds");
});

test("unattached static route dumps and unresolved RDS do not imply bootstrap origin", () => {
  const m = parse({
    configs: [
      {
        static_listeners: [
          { listener: listener({ rds: { route_config_name: "rds" } }) },
        ],
        static_route_configs: [{ route_config: rc }],
      },
    ],
  });
  assert.ok(
    m.nodes
      .filter((n) => n.kind === "route_config")
      .every((n) => n.origin === "unknown"),
  );
});

test("configurations above the former 20 MB limit are accepted", () => {
  const text =
    JSON.stringify({ node: { id: "large" } }) + " ".repeat(20 * 1024 * 1024);
  assert.equal(parseConfig(text).raw.node.id, "large");
});

test("graphs above the former 10000-node limit are accepted", () => {
  const m = parse({
    static_resources: {
      listeners: Array.from({ length: 10001 }, (_, i) => ({
        name: `listener-${i}`,
      })),
    },
  });
  assert.equal(m.nodes.length, 10001);
});
