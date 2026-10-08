import { t as translateUI } from "./i18n.js";
const get = (o, k) =>
  o?.[k] ?? o?.[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
const list = (o, k) => (Array.isArray(get(o, k)) ? get(o, k) : []);
const format = (v) =>
  Array.isArray(v)
    ? v.map(format).join(", ")
    : v !== null && typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const lifecycleStates = {
  active: ["Active", "Current configuration available to serve traffic."],
  warming: [
    "Warming",
    "Configuration preparing to serve traffic; not active yet.",
  ],
  draining: [
    "Draining",
    "Previous configuration draining before removal; not the current active configuration.",
  ],
};
// Count against the complete snapshot, not a filtered navigation or graph view.
export function duplicateLifecycleIds(nodes) {
  const groups = new Map();
  for (const n of nodes) {
    if (!["listener", "cluster"].includes(n.kind)) continue;
    const key = JSON.stringify([n.kind, n.label]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n.id);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}
export function lifecycleLabel(n, duplicateIds) {
  if (!["listener", "cluster"].includes(n?.kind)) return "";
  if (duplicateIds && !duplicateIds.has(n.id)) return "";
  return translateUI(lifecycleStates[n.state]?.[0] || "");
}
export function lifecycleDescription(n) {
  if (!lifecycleLabel(n)) return "";
  return translateUI(lifecycleStates[n.state][1]);
}
export function originLabel(n) {
  return n.origin === "bootstrap"
    ? "Bootstrap"
    : n.origin === "xds"
      ? "xDS"
      : "";
}
// Only the Listener's explicit enum identifies direction; names and ports do not.
export function trafficDirection(n) {
  if (n?.kind !== "listener") return null;
  const raw = get(n.detail, "traffic_direction");
  if (raw === "INBOUND" || raw === 1)
    return {
      value: "INBOUND",
      label: translateUI("Inbound"),
      description: translateUI(
        "Incoming traffic (traffic_direction: INBOUND).",
      ),
    };
  if (raw === "OUTBOUND" || raw === 2)
    return {
      value: "OUTBOUND",
      label: translateUI("Outbound"),
      description: translateUI(
        "Outgoing traffic (traffic_direction: OUTBOUND).",
      ),
    };
  if (raw == null || raw === "UNSPECIFIED" || raw === 0)
    return {
      value: "UNSPECIFIED",
      label: translateUI("Unspecified"),
      description: translateUI(
        "Traffic direction is unspecified; not inferred from the listener name or port.",
      ),
    };
  return {
    value: "UNKNOWN",
    label: translateUI("Unknown"),
    description: translateUI("Unrecognized traffic_direction: {0}", [
      format(raw),
    ]),
  };
}
export function nodeFields(n) {
  const d = n.detail || {},
    fields = [];
  const add = (key, v) => {
    if (v !== undefined && v !== null && v !== "")
      fields.push({ key, value: format(v) });
  };
  const match = (m) => {
    for (const key of ["path", "prefix", "path_separated_prefix", "safe_regex"])
      if (get(m, key) !== undefined) {
        add(key, get(m, key)?.regex ?? get(m, key));
        return;
      }
    add("match", m);
  };
  const target = (a) => {
    if (a?.cluster !== undefined) add("cluster", a.cluster);
    else if (get(a, "weighted_clusters"))
      add(
        "weighted_clusters",
        list(get(a, "weighted_clusters"), "clusters")
          .map((c) => `${c.name}: ${c.weight?.value ?? c.weight ?? "?"}`)
          .join(" / "),
      );
    else if (get(a, "cluster_header"))
      add("cluster_header", get(a, "cluster_header"));
    else if (get(a, "cluster_specifier_plugin"))
      add("cluster_specifier_plugin", get(a, "cluster_specifier_plugin"));
  };
  switch (n.kind) {
    case "target_group":
      add("clusters", d.clusters);
      add("resources", d.resources);
      break;
    case "listener": {
      const socket = get(d.address, "socket_address");
      add("address", socket?.address ?? d.address?.pipe?.path);
      add("port_value", get(socket, "port_value"));
      add("traffic_direction", get(d, "traffic_direction"));
      add(
        "filter_chains",
        list(d, "filter_chains").length +
          (get(d, "default_filter_chain") ? 1 : 0),
      );
      break;
    }
    case "filter_chain":
      add("filters", list(d, "filters").length);
      add("transport_socket", get(d, "transport_socket")?.name);
      for (const [key, v] of Object.entries(get(d, "filter_chain_match") || {}))
        add(key, v);
      if (fields.length === 1)
        add(
          "match",
          n.path?.endsWith("default_filter_chain")
            ? translateUI("Fallback chain")
            : translateUI("No explicit match"),
        );
      break;
    case "match":
      for (const key of [
        "destination_port",
        "server_names",
        "transport_protocol",
        "application_protocols",
        "prefix_ranges",
        "source_prefix_ranges",
        "source_type",
        "source_ports",
      ])
        add(key, get(d, key));
      if (!fields.length) add("match", n.label);
      break;
    case "network_filter":
    case "http_filter":
    case "listener_filter": {
      const t = get(d, "typed_config") || d.config || {};
      add("type", t["@type"]?.split(".").pop());
      add("stat_prefix", get(t, "stat_prefix"));
      add("codec_type", get(t, "codec_type"));
      target(t);
      add(
        "route_config",
        get(t, "route_config")?.name ?? get(t.rds, "route_config_name"),
      );
      for (const key of [
        "timeout",
        "idle_timeout",
        "delay",
        "abort",
        "disabled",
        "pass_through_mode",
        "http_service",
        "grpc_service",
        "config_discovery",
      ])
        add(key, get(t, key) ?? get(d, key));
      const existing = new Set(fields.map((f) => f.key));
      for (const [key, v] of Object.entries(t)) {
        if (
          key === "@type" ||
          existing.has(key) ||
          [
            "route_config",
            "routeConfig",
            "http_filters",
            "httpFilters",
          ].includes(key)
        )
          continue;
        add(
          key,
          /secret|password|credential|token|private.?key/i.test(key)
            ? translateUI("Configured (see details)")
            : Array.isArray(v)
              ? translateUI("{0} items", [v.length])
              : v && typeof v === "object"
                ? translateUI("{0} fields", [Object.keys(v).length])
                : v,
        );
      }
      if (fields.length < 2)
        add(
          "config_fields",
          Object.keys(t).filter((k) => k !== "@type").length,
        );
      break;
    }
    case "route_config":
      if (n.state === "unresolved") {
        add("route_config_name", get(d, "route_config_name"));
        add("status", translateUI("Unresolved reference"));
        break;
      }
      add("virtual_hosts", list(d, "virtual_hosts").length);
      add(
        "routes",
        list(d, "virtual_hosts").reduce(
          (sum, v) => sum + list(v, "routes").length,
          0,
        ),
      );
      add("validate_clusters", get(d, "validate_clusters"));
      break;
    case "virtual_host":
      add("domains", d.domains);
      add("routes", list(d, "routes").length);
      add("require_tls", get(d, "require_tls"));
      break;
    case "route":
      match(d.match || {});
      if (d.route) {
        add("timeout", d.route.timeout ?? translateUI("Not configured"));
        add("prefix_rewrite", get(d.route, "prefix_rewrite"));
      }
      if (get(d, "direct_response")) {
        add("status", get(d, "direct_response").status);
        add("action", translateUI("Direct response"));
      }
      if (d.redirect) {
        add("action", translateUI("Redirect"));
        add("redirect", d.redirect);
      }
      break;
    case "cluster":
      if (n.state === "unresolved") {
        add("status", translateUI("Unresolved reference"));
        break;
      }
      add(
        "type",
        d.type ??
          get(d, "cluster_type")?.name ??
          translateUI("STATIC (default)"),
      );
      add(
        "lb_policy",
        get(d, "lb_policy") ?? translateUI("ROUND_ROBIN (default)"),
      );
      add("connect_timeout", get(d, "connect_timeout"));
      break;
    case "endpoint": {
      const socket = get(d.endpoint?.address, "socket_address");
      add("cluster", n.clusterName);
      add("address", socket?.address ?? d.endpoint?.address?.pipe?.path);
      add("port_value", get(socket, "port_value") ?? get(socket, "named_port"));
      break;
    }
    case "action":
      for (const [key, v] of Object.entries(d)) add(key, v);
      break;
    case "dynamic":
      add("target", typeof n.detail === "object" ? d : n.detail);
      add("resolution", translateUI("Determined at runtime"));
      break;
  }
  return fields.slice(0, 3);
}
export function summary(n) {
  return nodeFields(n)
    .map((f) => `${f.key}: ${f.value}`)
    .join("\n");
}

export const fieldLabels = {
  address: "Address",
  port_value: "Port",
  traffic_direction: "Direction",
  filter_chains: "Filter chains",
  filters: "Filters",
  transport_socket: "Transport",
  match: "Match",
  destination_port: "Destination port",
  server_names: "Server names",
  transport_protocol: "Transport protocol",
  application_protocols: "Application protocols",
  prefix_ranges: "Destination ranges",
  source_prefix_ranges: "Source ranges",
  source_type: "Source type",
  source_ports: "Source ports",
  type: "Type",
  stat_prefix: "Stats prefix",
  codec_type: "Codec",
  cluster: "Target cluster",
  weighted_clusters: "Weighted clusters",
  cluster_header: "Cluster header",
  route_config: "Route configuration",
  route_config_name: "Route name",
  timeout: "Timeout",
  idle_timeout: "Idle timeout",
  delay: "Delay injection",
  abort: "Fault injection",
  disabled: "Disabled",
  pass_through_mode: "Pass-through",
  config_fields: "Config fields",
  virtual_hosts: "Virtual hosts",
  routes: "Routes",
  validate_clusters: "Validate clusters",
  domains: "Domains",
  require_tls: "TLS requirement",
  path: "Exact path",
  prefix: "Path prefix",
  safe_regex: "Regex match",
  lb_policy: "Load balancing",
  connect_timeout: "Connect timeout",
  status: "Status",
  action: "Action",
  arguments: "Arguments",
  headers: "Headers",
};
