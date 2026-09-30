// Presentation identities must not merge distinct snapshots merely by name.
export function resourceKey(node) {
  return JSON.stringify([
    node.kind,
    node.state,
    node.path,
    node.path?.startsWith("$") ? "" : node.id,
  ]);
}
export const configField = (value, key) =>
  value?.[key] ?? value?.[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];

export function adjacency(edges, reverse = false) {
  const map = new Map();
  for (const edge of edges) {
    const from = reverse ? edge.target : edge.source;
    const to = reverse ? edge.source : edge.target;
    if (!map.has(from)) map.set(from, []);
    map.get(from).push(to);
  }
  return map;
}
export function reachable(start, links) {
  const ids = new Set(start ? [start] : []),
    queue = [...ids];
  for (let i = 0; i < queue.length; i++)
    for (const id of links.get(queue[i]) || [])
      if (!ids.has(id)) {
        ids.add(id);
        queue.push(id);
      }
  return ids;
}

export function buildRoutingIndex(model) {
  const byKey = new Map(),
    byId = new Map(),
    canonicalId = new Map();
  for (const original of model.nodes) {
    const key = resourceKey(original);
    if (!byKey.has(key)) byKey.set(key, { ...original, routingKey: key });
    const node = byKey.get(key);
    byId.set(node.id, node);
    canonicalId.set(original.id, node.id);
  }
  const edges = [],
    seen = new Set();
  for (const edge of model.edges) {
    const source = canonicalId.get(edge.source),
      target = canonicalId.get(edge.target);
    const key = JSON.stringify([source, target, edge.label]);
    if (!seen.has(key)) {
      seen.add(key);
      edges.push({ ...edge, source, target });
    }
  }
  const forward = adjacency(edges),
    reverse = adjacency(edges, true);
  const entries = new Map(),
    configs = [];
  for (const node of byId.values()) {
    if (node.kind !== "route_config") continue;
    const config = {
      key: node.routingKey,
      node,
      hosts: [],
      routes: [],
      ownerIds: [...(reverse.get(node.id) || [])],
    };
    entries.set(config.key, config);
    configs.push(config);
    for (const id of forward.get(node.id) || []) {
      const child = byId.get(id);
      if (child.kind !== "virtual_host") continue;
      const host = {
        key: child.routingKey,
        node: child,
        configKey: config.key,
        routes: [],
      };
      entries.set(host.key, host);
      config.hosts.push(host);
      for (const routeId of forward.get(id) || []) {
        const routeNode = byId.get(routeId);
        if (routeNode.kind !== "route") continue;
        const route = {
          key: routeNode.routingKey,
          node: routeNode,
          configKey: config.key,
          hostKey: host.key,
          order: host.routes.length + 1,
        };
        // Search the original conditions/actions, not just a shortened card label.
        route.search = [
          node.label,
          child.label,
          JSON.stringify(child.detail.domains || []),
          routeNode.label,
          JSON.stringify(routeNode.detail),
        ]
          .join(" ")
          .toLowerCase();
        host.routes.push(route);
        config.routes.push(route);
        entries.set(route.key, route);
      }
    }
  }
  return {
    model,
    byKey,
    byId,
    canonicalId,
    nodes: [...byId.values()],
    edges,
    forward,
    reverse,
    entries,
    configs,
  };
}

// Scope before deduplication so a shared RDS table cannot pull in another inlet.
export function routingScope(index, listener = "", chain = "") {
  const forward = adjacency(index.model.edges),
    reverse = adjacency(index.model.edges, true);
  let ids = listener
    ? reachable(listener, forward)
    : new Set(index.model.nodes.map((n) => n.id));
  if (chain) {
    const relevant = new Set([
      ...reachable(chain, forward),
      ...reachable(chain, reverse),
    ]);
    ids = new Set([...ids].filter((id) => relevant.has(id)));
  }
  const canonical = new Set([...ids].map((id) => index.canonicalId.get(id)));
  const seen = new Set(),
    edges = [];
  for (const edge of index.model.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const source = index.canonicalId.get(edge.source),
      target = index.canonicalId.get(edge.target);
    const key = JSON.stringify([source, target, edge.label]);
    if (!seen.has(key)) {
      seen.add(key);
      edges.push({ ...edge, source, target });
    }
  }
  return {
    nodes: index.nodes.filter((n) => canonical.has(n.id)),
    edges,
    ids: canonical,
    configs: index.configs.filter((c) => canonical.has(c.node.id)),
  };
}

export function resolveRoutingSelection(index, configs, selection = {}) {
  const config =
    configs.find((c) => c.key === selection.config) ||
    configs.reduce(
      (best, c) => (!best || c.routes.length > best.routes.length ? c : best),
      null,
    );
  const host =
    config?.hosts.find((h) => h.key === selection.host) || config?.hosts[0];
  const route =
    host?.routes.find((r) => r.key === selection.route) || host?.routes[0];
  return {
    config: config?.key || "",
    host: host?.key || "",
    route: route?.key || "",
  };
}
export function selectionForEntry(entry) {
  return {
    config: entry.configKey || entry.key,
    host:
      entry.hostKey || (entry.node.kind === "virtual_host" ? entry.key : ""),
    route: entry.node.kind === "route" ? entry.key : "",
  };
}
// This local filter never matches Route conditions or target cluster names.
export function matchingVirtualHosts(hosts, query) {
  const term = query.trim().toLowerCase();
  return term
    ? hosts.filter((host) =>
        [host.node.label, ...(host.node.detail.domains || [])].some((value) =>
          String(value).toLowerCase().includes(term),
        ),
      )
    : hosts;
}
export function matchingRoutes(config, query) {
  const term = query.trim().toLowerCase();
  return term
    ? config.routes.filter((route) => route.search.includes(term))
    : config.routes;
}

// Count deduplicated routing resources in the current listener/chain scope.
// Unrelated clusters must not make an otherwise small routing table collapse.
export const ROUTING_COLLAPSE_THRESHOLD = 80;
export function shouldCollapseRouting(scope) {
  return (
    scope.configs.reduce(
      (count, config) => count + config.hosts.length + config.routes.length,
      0,
    ) > ROUTING_COLLAPSE_THRESHOLD
  );
}

// Return a view projection only. The parser model and raw JSON remain untouched.
export function projectRoutingGraph(
  index,
  scope,
  { expanded = [], focusedRoute = "", revealId = "" } = {},
) {
  const forward = adjacency(scope.edges),
    reverse = adjacency(scope.edges, true);
  const focus = index.entries.get(focusedRoute);
  if (focus?.node.kind === "route" && scope.ids.has(focus.node.id)) {
    const ids = new Set([
      ...reachable(focus.node.id, forward),
      ...reachable(focus.node.id, reverse),
    ]);
    return {
      nodes: scope.nodes.filter((n) => ids.has(n.id)),
      edges: scope.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }
  if (!shouldCollapseRouting(scope))
    return { nodes: scope.nodes, edges: scope.edges };

  const visible = new Set(),
    summaryNodes = [],
    summaryEdges = [];
  const hiddenKinds = new Set(["virtual_host", "route", "cluster", "endpoint"]);
  const routeChildren = new Set();
  for (const config of scope.configs)
    for (const id of reachable(config.node.id, forward))
      if (id !== config.node.id) routeChildren.add(id);
  for (const node of scope.nodes)
    if (
      !hiddenKinds.has(node.kind) &&
      !(routeChildren.has(node.id) && ["action", "dynamic"].includes(node.kind))
    )
      visible.add(node.id);
  for (const key of expanded) {
    const host = index.entries.get(key);
    if (host?.node.kind === "virtual_host" && scope.ids.has(host.node.id))
      for (const id of reachable(host.node.id, forward)) visible.add(id);
  }
  // TCP dependencies remain real edges, rather than being hidden with HTTP rules.
  for (const edge of scope.edges) {
    const target = index.byId.get(edge.target);
    if (
      visible.has(edge.source) &&
      ["cluster", "endpoint"].includes(target.kind)
    )
      for (const id of reachable(target.id, forward)) visible.add(id);
  }
  const revealed = index.byId.get(index.canonicalId.get(revealId) || revealId);
  if (
    revealed &&
    ["cluster", "endpoint"].includes(revealed.kind) &&
    scope.ids.has(revealed.id)
  ) {
    for (const id of reachable(revealed.id, forward)) visible.add(id);
    if (revealed.kind === "endpoint")
      for (const id of reverse.get(revealed.id) || []) visible.add(id);
  }
  const summarized = new Set();
  function addSummary(id, label, members, owner) {
    if (!members.length) return;
    const clusters = members.filter((n) => n.kind === "cluster");
    const node = {
      id,
      kind: "target_group",
      label,
      state: "summary",
      origin: "unknown",
      path: "Presentation summary",
      configKey: owner?.key,
      members: members.map((n) => n.id),
      detail: {
        clusters: clusters.length,
        resources: members.length,
        targets: members.map((n) => ({
          name: n.label,
          kind: n.kind,
          state: n.state,
        })),
      },
    };
    summaryNodes.push(node);
    for (const n of members) summarized.add(n.id);
    if (owner)
      summaryEdges.push({
        id: `edge:${id}`,
        source: owner.node.id,
        target: id,
        label: "Summarized dependencies",
      });
  }
  for (const config of scope.configs) {
    const targets = new Set();
    for (const host of config.hosts) {
      if (expanded.includes(host.key)) continue;
      for (const id of reachable(host.node.id, forward))
        if (["cluster", "action", "dynamic"].includes(index.byId.get(id)?.kind))
          targets.add(id);
    }
    addSummary(
      `targets:${config.key}`,
      "Collapsed route targets",
      [...targets].map((id) => index.byId.get(id)),
      config,
    );
    // A directly selected cluster can still be located without expanding all its referring routes.
    if (revealed && targets.has(revealed.id))
      summaryEdges.push({
        id: `reveal:${config.key}:${revealed.id}`,
        source: config.node.id,
        target: revealed.id,
        label: "Summarized dependencies",
      });
  }
  addSummary(
    "other-clusters",
    "Other upstream resources",
    scope.nodes.filter(
      (n) =>
        (n.kind === "cluster" ||
          (n.kind === "endpoint" &&
            !(reverse.get(n.id) || []).some(
              (id) => index.byId.get(id)?.kind === "cluster",
            ))) &&
        !visible.has(n.id) &&
        !summarized.has(n.id),
    ),
  );
  const nodes = [
    ...scope.nodes.filter((n) => visible.has(n.id)),
    ...summaryNodes,
  ];
  return {
    nodes,
    edges: [
      ...scope.edges.filter(
        (e) => visible.has(e.source) && visible.has(e.target),
      ),
      ...summaryEdges,
    ],
  };
}

export function matchConditions(route) {
  return (
    Object.entries(route.match || {})
      .map(
        ([key, value]) =>
          `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      )
      .join(" AND ") || "No match conditions"
  );
}
export function routeDestinations(route) {
  const action = route.route;
  if (action) {
    const result = [];
    if (action.cluster)
      result.push({ name: action.cluster, kind: "cluster", label: "Forward" });
    const weighted = configField(action, "weighted_clusters");
    for (const c of weighted?.clusters || [])
      result.push({
        name: c.name,
        kind: "cluster",
        label: `Weight ${c.weight?.value ?? c.weight ?? "?"}`,
      });
    for (const mirror of configField(action, "request_mirror_policies") || [])
      result.push({
        name: mirror.cluster || JSON.stringify(mirror),
        kind: "mirror",
        label: "Mirror",
      });
    for (const key of [
      "cluster_header",
      "cluster_specifier_plugin",
      "inline_cluster_specifier_plugin",
    ])
      if (configField(action, key))
        result.push({
          name: JSON.stringify(configField(action, key)),
          kind: "dynamic",
          label: "Dynamic target",
        });
    return result;
  }
  const direct = configField(route, "direct_response");
  if (direct)
    return [
      { name: String(direct.status), kind: "action", label: "Direct response" },
    ];
  if (route.redirect)
    return [
      {
        name: JSON.stringify(route.redirect),
        kind: "action",
        label: "Redirect",
      },
    ];
  if (configField(route, "filter_action"))
    return [
      {
        name: JSON.stringify(configField(route, "filter_action")),
        kind: "action",
        label: "Filter action",
      },
    ];
  return [{ name: "", kind: "unknown", label: "See raw configuration" }];
}

// Resolve only actual outgoing relationships, never an unrelated same-name node.
export function routeDestinationNode(index, route, destination) {
  const targets = (index.forward.get(route.node.id) || []).map((id) =>
    index.byId.get(id),
  );
  const target = targets.find((node) => {
    if (["cluster", "mirror"].includes(destination.kind))
      return node.kind === "cluster" && node.label === destination.name;
    if (destination.kind === "dynamic")
      return (
        node.kind === "dynamic" &&
        JSON.stringify(node.detail) === destination.name
      );
    return destination.kind === "action" && node.kind === "action";
  });
  return target || route.node;
}

export function retainRoutingState(previous, next, state) {
  const cache = new Map();
  function match(key) {
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    const old = previous.entries.get(key);
    if (!old) return null;
    let candidates;
    if (old.node.kind === "route_config")
      candidates = next.configs.filter(
        (c) =>
          c.node.label === old.node.label && c.node.state === old.node.state,
      );
    else if (old.node.kind === "virtual_host")
      candidates =
        match(old.configKey)?.hosts.filter(
          (h) => h.node.label === old.node.label,
        ) || [];
    else
      candidates =
        match(old.hostKey)?.routes.filter((r) =>
          old.node.detail.name
            ? r.node.detail.name === old.node.detail.name
            : JSON.stringify(r.node.detail.match) ===
              JSON.stringify(old.node.detail.match),
        ) || [];
    const exact = candidates.filter(
      (c) => JSON.stringify(c.node.detail) === JSON.stringify(old.node.detail),
    );
    const result =
      candidates.length === 1
        ? candidates[0]
        : exact.length === 1
          ? exact[0]
          : candidates.find((c) => c.node.path === old.node.path) || null;
    cache.set(key, result);
    return result;
  }
  return {
    ...state,
    selection: {
      config: match(state.selection.config)?.key || "",
      host: match(state.selection.host)?.key || "",
      route: match(state.selection.route)?.key || "",
    },
    expanded: state.expanded.map((key) => match(key)?.key).filter(Boolean),
    focusedRoute: match(state.focusedRoute)?.key || "",
  };
}
