import { nodeLabel } from "./i18n.js";
import { lifecycleLabel, trafficDirection } from "./node-fields.js";

const field = (object, key) =>
  object?.[key] ??
  object?.[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];

function addressText(detail) {
  const address = detail?.address || detail?.endpoint?.address;
  const socket = field(address, "socket_address");
  const host = socket?.address;
  const port = field(socket, "port_value") ?? field(socket, "named_port");
  return [
    host,
    field(socket, "port_value"),
    field(socket, "named_port"),
    host !== undefined && port !== undefined ? `${host}:${port}` : "",
    typeof host === "string" && host.includes(":") && port !== undefined
      ? `[${host}]:${port}`
      : "",
    address?.pipe?.path,
  ];
}

// Index navigation metadata only, not nested route tables or entire dumps.
export function navigationSearchText(node, owner) {
  const detail = node.detail || {};
  const match = field(detail, "filter_chain_match");
  const serverNames = field(match, "server_names");
  return [
    node.label,
    nodeLabel(node),
    node.kind,
    node.kind?.replaceAll("_", " "),
    node.clusterName,
    node.state,
    lifecycleLabel(node),
    trafficDirection(node)?.value,
    trafficDirection(node)?.label,
    detail.name,
    ...addressText(detail),
    node.kind === "cluster" && node.state !== "unresolved"
      ? (detail.type ?? field(detail, "cluster_type")?.name ?? "STATIC")
      : "",
    Array.isArray(serverNames) ? serverNames.join(" ") : serverNames,
    field(match, "destination_port"),
    field(match, "transport_protocol"),
    owner?.label,
    owner && nodeLabel(owner),
    owner?.state,
    lifecycleLabel(owner),
    ...addressText(owner?.detail),
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();
}

export function filterNavigationResources(groups, index, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return groups;
  return Object.fromEntries(
    Object.entries(groups).map(([kind, nodes]) => [
      kind,
      nodes.filter((node) =>
        terms.every((term) => index.get(node.id)?.includes(term)),
      ),
    ]),
  );
}
