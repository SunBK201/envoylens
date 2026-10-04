export const ENVOY_DOCS_BASE = "https://www.envoyproxy.io/docs/envoy/v1.20.0/";
export const ENVOY_DOCS_KEY = "envoylens-docs-base";
export function normalizeDocsBase(value) {
  if (!value.trim()) return ENVOY_DOCS_BASE;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter an absolute HTTP or HTTPS documentation URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP or HTTPS URL without credentials, query parameters, or fragments.",
    );
  url.pathname = url.pathname.replace(/\/index\.html\/?$/, "/");
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url.href;
}
export function readDocsBase(storage) {
  try {
    return normalizeDocsBase(storage?.getItem(ENVOY_DOCS_KEY) || "");
  } catch {
    return ENVOY_DOCS_BASE;
  }
}
let docsBase = ENVOY_DOCS_BASE;
try {
  docsBase = readDocsBase(window.localStorage);
} catch {}
const listeners = new Set();
export const getDocsBase = () => docsBase;
export const subscribeDocsBase = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function saveDocsBase(value, storage) {
  const next = normalizeDocsBase(value);
  try {
    (storage ?? window.localStorage).setItem(ENVOY_DOCS_KEY, next);
  } catch {
    throw new Error(
      "Unable to save the documentation URL. Browser storage may be disabled.",
    );
  }
  docsBase = next;
  for (const listener of listeners) listener();
  return next;
}
const api = (file, message) =>
  `api-v3/${file}.proto.html#envoy-v3-api-msg-${message.toLowerCase().replace(/[._]/g, "-")}`;
const listener = "config/listener/v3/listener_components";
const route = "config/route/v3/route_components";
const hcm =
  "extensions/filters/network/http_connection_manager/v3/http_connection_manager";
const resources = {
  listener: api("config/listener/v3/listener", "config.listener.v3.Listener"),
  filter_chain: api(listener, "config.listener.v3.FilterChain"),
  match: api(listener, "config.listener.v3.FilterChainMatch"),
  listener_filter: api(listener, "config.listener.v3.ListenerFilter"),
  network_filter: api(listener, "config.listener.v3.Filter"),
  http_filter: api(
    hcm,
    "extensions.filters.network.http_connection_manager.v3.HttpFilter",
  ),
  cluster: api("config/cluster/v3/cluster", "config.cluster.v3.Cluster"),
  endpoint: api(
    "config/endpoint/v3/endpoint_components",
    "config.endpoint.v3.LbEndpoint",
  ),
  route_config: api(
    "config/route/v3/route",
    "config.route.v3.RouteConfiguration",
  ),
  virtual_host: api(route, "config.route.v3.VirtualHost"),
  route: api(route, "config.route.v3.Route"),
  dynamic: api(route, "config.route.v3.RouteAction"),
};
// Only known 1.20 extensions get specific links. Never invent URLs for custom types.
const extensions = [
  ["network", "http_connection_manager", "HttpConnectionManager"],
  ["network", "tcp_proxy", "TcpProxy"],
  ["network", "rbac", "RBAC"],
  ["http", "router", "Router"],
  ["http", "cors", "Cors"],
  ["http", "fault", "HTTPFault"],
  ["http", "health_check", "HealthCheck"],
  ["http", "jwt_authn", "JwtAuthentication"],
  ["http", "rbac", "RBAC"],
  ["http", "ext_authz", "ExtAuthz"],
  ["http", "lua", "Lua"],
  ["listener", "http_inspector", "HttpInspector"],
  ["listener", "tls_inspector", "TlsInspector"],
  ["listener", "original_dst", "OriginalDst"],
  ["listener", "proxy_protocol", "ProxyProtocol"],
].map(([category, name, message]) => ({
  name: `envoy.filters.${category}.${name}`,
  type: `envoy.extensions.filters.${category}.${name}.v3.${message}`,
  path: api(
    `extensions/filters/${category}/${name}/v3/${name === "jwt_authn" ? "config" : name}`,
    `extensions.filters.${category}.${name}.v3.${message}`,
  ),
}));
export function envoyReference(node, base = getDocsBase()) {
  if (!node) return null;
  const detail = node.detail || {};
  let path = resources[node.kind];
  let note = "";
  if (
    ["listener_filter", "network_filter", "http_filter"].includes(node.kind)
  ) {
    const config = detail.typed_config ?? detail.typedConfig ?? {};
    const type = (config["@type"] || detail["@type"] || "").split("/").at(-1);
    const extension = extensions.find((entry) =>
      type ? entry.type === type : entry.name === detail.name,
    );
    if (extension) path = extension.path;
    else
      note =
        "No extension-specific Envoy documentation found. Showing the generic filter reference.";
  }
  if (node.kind === "action")
    path = api(
      route,
      node.label === "Redirect"
        ? "config.route.v3.RedirectAction"
        : "config.route.v3.DirectResponseAction",
    );
  if (!path) {
    path = "api-v3/api.html";
    note =
      "No dedicated reference is mapped for this resource. Showing the Envoy API index.";
  }
  return { url: normalizeDocsBase(base) + path, note };
}
