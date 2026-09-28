import { parseDocument } from "yaml";
const field = (o, k) =>
  o?.[k] ?? o?.[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
const arr = (o, k) => {
  const v = field(o, k);
  return Array.isArray(v) ? v : [];
};
// Origin is independent of lifecycle state and Cluster discovery type.
function configOrigin(path) {
  if (
    /\.(dynamic_listeners|dynamic_active_clusters|dynamic_warming_clusters|dynamic_route_configs|dynamic_endpoint_configs)\[/.test(
      path,
    )
  )
    return "xds";
  if (/\.(static_resources\.|static_listeners\[|static_clusters\[)/.test(path))
    return "bootstrap";
  // Static route/endpoint dump entries can be inline in an xDS resource.
  return "unknown";
}
export function parseConfig(text) {
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length)
    throw new Error(`Invalid configuration: ${doc.errors[0].message}`);
  const raw = doc.toJS({ maxAliasCount: 100 });
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Provide an Envoy bootstrap or config_dump object");
  try {
    JSON.stringify(raw);
  } catch {
    throw new Error(
      "Configuration contains circular aliases or excessive nesting",
    );
  }
  const dump = Array.isArray(raw.configs);
  if (
    !dump &&
    !["static_resources", "dynamic_resources", "admin", "node"].some(
      (k) => field(raw, k) !== undefined,
    )
  )
    throw new Error("Unrecognized Envoy bootstrap or config_dump structure");
  const nodes = [],
    edges = [],
    warnings = [];
  const listeners = new Map(),
    clusters = new Map(),
    assignments = new Map(),
    routes = new Map();
  const addResource = (map, obj, state, path) => {
    if (obj) map.set(path, { obj, state, path });
  };
  function bootstrap(b, path, includeListeners = true, includeClusters = true) {
    const s = field(b, "static_resources");
    if (includeListeners)
      arr(s, "listeners").forEach((o, i) =>
        addResource(
          listeners,
          o,
          "static",
          `${path}.static_resources.listeners[${i}]`,
        ),
      );
    if (includeClusters)
      arr(s, "clusters").forEach((o, i) =>
        addResource(
          clusters,
          o,
          "static",
          `${path}.static_resources.clusters[${i}]`,
        ),
      );
    if (
      field(b, "dynamic_resources") &&
      (!dump || includeListeners || includeClusters)
    )
      warnings.push(
        "Bootstrap xDS subscriptions are not runtime snapshots; retrieve dynamic resources from Admin config_dump.",
      );
  }
  if (!dump) bootstrap(raw, "$");
  // Dump sections are authoritative; bootstrap is retained as raw detail, not duplicated.
  if (dump) {
    raw.configs.forEach((c, i) => {
      const p = `$.configs[${i}]`;
      arr(c, "static_listeners").forEach((x, j) =>
        addResource(
          listeners,
          x.listener,
          "static",
          `${p}.static_listeners[${j}].listener`,
        ),
      );
      arr(c, "dynamic_listeners").forEach((x, j) => {
        for (const state of ["active", "warming", "draining"])
          addResource(
            listeners,
            field(x, `${state}_state`)?.listener,
            state,
            `${p}.dynamic_listeners[${j}].${state}_state.listener`,
          );
        if (field(x, "error_state"))
          warnings.push(
            `Listener ${x.name} failed its latest update; see the raw configuration.`,
          );
      });
      for (const [key, state] of [
        ["static_clusters", "static"],
        ["dynamic_active_clusters", "active"],
        ["dynamic_warming_clusters", "warming"],
      ])
        arr(c, key).forEach((x, j) =>
          addResource(clusters, x.cluster, state, `${p}.${key}[${j}].cluster`),
        );
      for (const [key, state] of [
        ["static_endpoint_configs", "static"],
        ["dynamic_endpoint_configs", "active"],
      ])
        arr(c, key).forEach((entry, j) => {
          const obj = field(entry, "endpoint_config");
          if (obj)
            assignments.set(field(obj, "cluster_name"), {
              obj,
              state,
              path: `${p}.${key}[${j}].endpoint_config`,
            });
        });
      for (const key of ["static_route_configs", "dynamic_route_configs"])
        arr(c, key).forEach((x, j) =>
          addResource(
            routes,
            field(x, "route_config"),
            "active",
            `${p}.${key}[${j}].route_config`,
          ),
        );
    });
    const hasListenerDump = raw.configs.some(
      (c) =>
        field(c, "static_listeners") ||
        field(c, "dynamic_listeners") ||
        String(c["@type"]).includes("ListenersConfigDump"),
    );
    const hasClusterDump = raw.configs.some(
      (c) =>
        field(c, "static_clusters") ||
        field(c, "dynamic_active_clusters") ||
        String(c["@type"]).includes("ClustersConfigDump"),
    );
    raw.configs.forEach((c, i) => {
      if (c.bootstrap)
        bootstrap(
          c.bootstrap,
          `$.configs[${i}].bootstrap`,
          !hasListenerDump,
          !hasClusterDump,
        );
    });
  }
  function node(kind, label, detail, path, state = "configured", extra = {}) {
    const id = `n${nodes.length}`;
    const origin = state === "unresolved" ? "unknown" : configOrigin(path);
    nodes.push({ id, kind, label, detail, path, state, origin, ...extra });
    return id;
  }
  const edge = (source, target, label = "Contains") =>
    edges.push({ id: `e${edges.length}`, source, target, label });
  const clusterIds = new Map();
  for (const { obj, state, path } of clusters.values()) {
    const id = node("cluster", obj.name || "Unnamed cluster", obj, path, state);
    if (state !== "warming" || !clusterIds.has(obj.name))
      clusterIds.set(obj.name, id);
  }
  const usedAssignments = new Set();
  function addEndpoints(assignment, clusterId, clusterName) {
    const { obj, state, path } = assignment;
    const origin = path.includes(".static_endpoint_configs[")
      ? nodes.find((n) => n.id === clusterId)?.origin || "unknown"
      : configOrigin(path);
    arr(obj, "endpoints").forEach((locality, i) => {
      arr(locality, "lb_endpoints").forEach((lb, j) => {
        const address = lb.endpoint?.address;
        const socket = field(address, "socket_address");
        const host = socket?.address;
        const port = field(socket, "port_value") ?? field(socket, "named_port");
        const label = host
          ? `${host.includes(":") ? `[${host}]` : host}${port !== undefined ? `:${port}` : ""}`
          : address?.pipe?.path ||
            field(lb, "endpoint_name") ||
            `Endpoint ${i + 1}.${j + 1}`;
        const id = node(
          "endpoint",
          label,
          lb,
          `${path}.endpoints[${i}].lb_endpoints[${j}]`,
          state,
          {
            origin,
            clusterName,
            locality: locality.locality,
            priority: locality.priority,
          },
        );
        if (clusterId) edge(clusterId, id);
      });
    });
  }
  for (const { obj, state, path } of clusters.values()) {
    const clusterId = nodes.find(
      (n) => n.kind === "cluster" && n.path === path,
    )?.id;
    const serviceName =
      field(field(obj, "eds_cluster_config"), "service_name") || obj.name;
    const snapshot = state !== "warming" ? assignments.get(serviceName) : null;
    const inline = field(obj, "load_assignment");
    if (snapshot) {
      addEndpoints(snapshot, clusterId, obj.name);
      usedAssignments.add(serviceName);
    } else if (inline) {
      addEndpoints(
        { obj: inline, state, path: `${path}.load_assignment` },
        clusterId,
        obj.name,
      );
    }
  }
  for (const [name, assignment] of assignments) {
    if (!usedAssignments.has(name)) addEndpoints(assignment, null, name);
  }
  const missing = new Map();
  function target(from, name, label = "Forward") {
    let id = clusterIds.get(name);
    if (!id) {
      if (!missing.has(name)) {
        missing.set(
          name,
          node(
            "cluster",
            name || "Unknown cluster",
            {},
            "Not present in the input configuration",
            "unresolved",
          ),
        );
        warnings.push(`Unresolved cluster reference: ${name}`);
      }
      id = missing.get(name);
    }
    edge(from, id, label);
  }
  function action(from, a) {
    if (a.cluster) target(from, a.cluster);
    for (const c of arr(field(a, "weighted_clusters"), "clusters"))
      target(from, c.name, `Weight ${c.weight?.value ?? c.weight ?? "?"}`);
    for (const mirror of arr(a, "request_mirror_policies"))
      if (mirror.cluster) target(from, mirror.cluster, "Mirror");
    for (const key of [
      "cluster_header",
      "cluster_specifier_plugin",
      "inline_cluster_specifier_plugin",
    ])
      if (field(a, key)) {
        const id = node(
          "dynamic",
          `Runtime selection · ${key}`,
          field(a, key),
          "Runtime",
          "dynamic",
          { origin: nodes.find((n) => n.id === from)?.origin || "unknown" },
        );
        edge(from, id, "Dynamic target");
      }
  }
  const renderedRoutes = new Set();
  function routeFingerprint(rc) {
    const stable = (value) =>
      Array.isArray(value)
        ? value.map(stable)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, stable(value[key])]),
            )
          : value;
    const { "@type": ignored, ...config } = rc;
    return JSON.stringify(stable(config));
  }
  function routeConfig(parent, rc, path, relation = "Route configuration") {
    renderedRoutes.add(routeFingerprint(rc));
    const id = node("route_config", rc.name || "Inline routes", rc, path);
    edge(parent, id, relation);
    arr(rc, "virtual_hosts").forEach((vh, i) => {
      const vp = `${path}.virtual_hosts[${i}]`,
        vid = node("virtual_host", vh.name || "Virtual host", vh, vp);
      edge(id, vid, (vh.domains || []).join(", "));
      arr(vh, "routes").forEach((r, j) => {
        const m = r.match || {},
          label =
            r.name ||
            m.prefix ||
            m.path ||
            field(m, "safe_regex")?.regex ||
            `Route ${j + 1}`;
        const rid = node("route", label, r, `${vp}.routes[${j}]`);
        edge(vid, rid, "Match");
        if (r.route) action(rid, r.route);
        if (field(r, "direct_response") || r.redirect) {
          const aid = node(
            "action",
            r.redirect
              ? "Redirect"
              : `Direct response ${field(r, "direct_response").status}`,
            r.redirect || field(r, "direct_response"),
            `${vp}.routes[${j}]`,
          );
          edge(rid, aid, "Response");
        }
      });
    });
    return id;
  }
  for (const { obj: l, state, path } of listeners.values()) {
    const socket = field(l.address, "socket_address");
    const lid = node(
      "listener",
      l.name ||
        (socket
          ? `Listener ${socket.address}:${field(socket, "port_value")}`
          : "Unnamed listener"),
      l,
      path,
      state,
    );
    const chains = arr(l, "filter_chains").map((c, i) => [
      c,
      `${path}.filter_chains[${i}]`,
    ]);
    if (field(l, "default_filter_chain"))
      chains.push([
        field(l, "default_filter_chain"),
        `${path}.default_filter_chain`,
      ]);
    let listenerTail = lid;
    arr(l, "listener_filters").forEach((f, i) => {
      const id = node(
        "listener_filter",
        f.name,
        f,
        `${path}.listener_filters[${i}]`,
        state,
      );
      edge(listenerTail, id, `Listener filter #${i + 1}`);
      listenerTail = id;
    });
    chains.forEach(([c, cp], i) => {
      const cid = node(
        "filter_chain",
        c.name ||
          (cp.endsWith("default_filter_chain")
            ? "Default filter chain"
            : `Filter chain ${i + 1}`),
        c,
        cp,
        state,
      );
      const match = field(c, "filter_chain_match");
      const fallback = cp.endsWith("default_filter_chain");
      if (match && Object.keys(match).length) {
        const mid = node(
          "match",
          fallback ? "Fallback when no chain matches" : "Connection match",
          match,
          `${cp}.filter_chain_match`,
          state,
        );
        edge(
          listenerTail,
          mid,
          fallback ? "Fallback selection" : "Match selection",
        );
        edge(mid, cid, "Selected chain");
      } else {
        edge(
          listenerTail,
          cid,
          fallback ? "Fallback selection" : "Selected chain",
        );
      }
      arr(c, "filters").forEach((f, j) => {
        const fp = `${cp}.filters[${j}]`,
          fid = node(
            "network_filter",
            f.name || "Network filter",
            f,
            fp,
            state,
          );
        edge(cid, fid, `Network filter #${j + 1}`);
        const t = field(f, "typed_config") || f.config || {};
        let routerId;
        let httpTail = fid;
        arr(t, "http_filters").forEach((hf, k) => {
          const hid = node(
            "http_filter",
            hf.name || "HTTP filter",
            hf,
            `${fp}.typed_config.http_filters[${k}]`,
            state,
          );
          edge(httpTail, hid, `HTTP #${k + 1}`);
          httpTail = hid;
          if (
            hf.name === "envoy.filters.http.router" ||
            hf.name === "envoy.router"
          )
            routerId = hid;
        });
        // Show the declared decoder chain, not a guarantee of runtime execution.
        // Without a known Router, keep the route dependency on its owning HCM.
        const routeParent = routerId || fid;
        const rc = field(t, "route_config");
        if (rc) {
          routeConfig(
            routeParent,
            rc,
            `${fp}.typed_config.route_config`,
            routerId ? "Use routes" : "Route configuration",
          );
        }
        if (t.rds) {
          const name = field(t.rds, "route_config_name");
          const r = [...routes.values()].find(
            (r) =>
              r.obj.name === name && r.path.includes(".dynamic_route_configs["),
          );
          if (r) {
            routeConfig(routeParent, r.obj, r.path, "RDS reference");
          } else {
            const rid = node(
              "route_config",
              name || "RDS",
              t.rds,
              `${fp}.typed_config.rds`,
              "unresolved",
            );
            edge(routeParent, rid, "Unresolved RDS");
            warnings.push(`Unresolved RDS reference: ${name}`);
          }
        }
        if (field(t, "scoped_routes"))
          warnings.push(
            `Listener ${l.name} uses scoped_routes; only the raw configuration is currently available.`,
          );
        if (
          String(f.name).includes("tcp_proxy") ||
          String(t["@type"]).includes("TcpProxy")
        )
          action(fid, t);
        if (field(f, "config_discovery"))
          warnings.push(
            `Dynamic filter ${f.name} uses ECDS; only subscription details are currently available.`,
          );
      });
    });
    if (field(l, "filter_chain_matcher"))
      warnings.push(
        `Listener ${l.name} uses the matcher API; inspect details for the actual matching rules.`,
      );
  }
  // Keep unattached RDS resources discoverable.
  for (const r of routes.values())
    if (
      !nodes.some((n) => n.kind === "route_config" && n.path === r.path) &&
      !(
        r.path.includes(".static_route_configs[") &&
        renderedRoutes.has(routeFingerprint(r.obj))
      )
    ) {
      const root = node("resource", "Standalone RDS resource", {}, r.path);
      routeConfig(root, r.obj, r.path);
    }
  if (nodes.some((n) => n.state === "warming" || n.state === "draining"))
    warnings.push(
      "Warming / draining resources describe lifecycle state and may not accept new requests.",
    );
  if (!nodes.length)
    warnings.push(
      "No drawable Listener, Route, or Cluster found; inspect the full raw configuration.",
    );
  return {
    raw,
    nodes,
    edges,
    warnings: [...new Set(warnings)],
    format: dump ? "Config dump" : "Bootstrap",
  };
}
