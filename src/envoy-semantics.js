const fields = {
  name: ["Name"],
  "@type": ["Extension type"],
  address: ["Address"],
  socket_address: ["Socket address"],
  port_value: ["Port value"],
  protocol: ["Protocol"],
  pipe: ["Pipe"],
  path: ["Path"],
  listener_filters: [
    "Listener filters",
    "Process new connections in configuration order.",
  ],
  filter_chains: [
    "Candidate filter chains",
    "Select a filter chain using connection match criteria.",
  ],
  default_filter_chain: ["Default filter chain"],
  filter_chain_match: ["Connection match"],
  filters: ["Network filters"],
  http_filters: ["HTTP filters"],
  typed_config: ["Extension configuration"],
  destination_port: ["Destination port"],
  prefix_ranges: ["Prefix ranges"],
  source_prefix_ranges: ["Source prefix ranges"],
  source_ports: ["Source ports"],
  source_type: ["Source type"],
  address_prefix: ["Address prefix"],
  prefix_len: ["Prefix len"],
  server_names: ["Server names (SNI)"],
  transport_protocol: ["Transport protocol"],
  application_protocols: ["Application protocols"],
  traffic_direction: ["Traffic direction"],
  transparent: ["Transparent"],
  use_original_dst: ["Use original dst"],
  bind_to_port: ["Bind to port"],
  socket_options: ["Socket options"],
  level: ["Level"],
  int_value: ["Int value"],
  state: ["State"],
  stat_prefix: ["Statistics prefix"],
  route_config: ["Route config"],
  rds: ["Route discovery (RDS)"],
  route_config_name: ["Route config name"],
  config_source: ["Config source"],
  virtual_hosts: ["Virtual hosts"],
  domains: ["Domains"],
  routes: ["Routes", "Match requests in configuration order."],
  match: ["Request match"],
  prefix: ["Prefix"],
  path_separated_prefix: ["Path separated prefix"],
  safe_regex: ["Safe regex"],
  regex: ["Regex"],
  headers: ["Headers"],
  query_parameters: ["Query parameters"],
  route: ["Forwarding action"],
  cluster: ["Target cluster"],
  weighted_clusters: ["Weighted clusters"],
  clusters: ["Clusters"],
  weight: ["Weight"],
  total_weight: ["Total weight"],
  request_mirror_policies: ["Request mirror policies"],
  cluster_header: ["Cluster header"],
  cluster_specifier_plugin: ["Cluster specifier plugin"],
  direct_response: ["Direct response"],
  redirect: ["Redirect"],
  status: ["Status"],
  body: ["Body"],
  timeout: ["Timeout"],
  idle_timeout: ["Idle timeout"],
  connect_timeout: ["Connect timeout"],
  retry_policy: ["Retry policy"],
  retry_on: ["Retry on"],
  num_retries: ["Num retries"],
  per_try_timeout: ["Per try timeout"],
  prefix_rewrite: ["Prefix rewrite"],
  host_rewrite_literal: ["Host rewrite literal"],
  auto_host_rewrite: ["Auto host rewrite"],
  type: ["Discovery type"],
  lb_policy: ["Load balancing policy"],
  load_assignment: ["Endpoint assignment"],
  cluster_name: ["Cluster name"],
  endpoints: ["Endpoints"],
  lb_endpoints: ["Backend endpoints"],
  endpoint: ["Endpoint"],
  locality: ["Locality"],
  region: ["Region"],
  zone: ["Zone"],
  sub_zone: ["Sub zone"],
  priority: ["Priority"],
  load_balancing_weight: ["Load balancing weight"],
  health_status: ["Health status"],
  health_checks: ["Health checks"],
  circuit_breakers: ["Circuit breakers"],
  thresholds: ["Thresholds"],
  max_connections: ["Max connections"],
  max_pending_requests: ["Max pending requests"],
  max_requests: ["Max requests"],
  max_retries: ["Max retries"],
  transport_socket: ["Transport socket"],
  common_tls_context: ["Common tls context"],
  tls_certificates: ["TLS certificates"],
  validation_context: ["Validation context"],
  sni: ["Upstream SNI"],
  alpn_protocols: ["ALPN protocols"],
  access_log: ["Access log"],
  typed_extension_protocol_options: ["Typed extension protocol options"],
  http2_protocol_options: ["HTTP2 protocol options"],
  common_http_protocol_options: ["Common http protocol options"],
  normalize_path: ["Normalize path"],
  use_remote_address: ["Use remote address"],
  xff_num_trusted_hops: ["Trusted XFF hops"],
  codec_type: ["Codec type"],
  pass_through_mode: ["Pass through mode"],
  metadata: ["Metadata"],
  filter_metadata: ["Filter metadata"],
  validate_clusters: ["Validate clusters"],
};
const normalize = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export function semanticField(key, value, parent = "", index) {
  const normalized = normalize(key);
  const object = value !== null && typeof value === "object";
  const expandable = object && Object.keys(value).length > 0;
  const field = fields[normalized];
  let label = field?.[0] || key;
  if (index !== undefined) {
    const names = {
      filter_chains: "Filter chain",
      listener_filters: "Listener filter",
      filters: "Network filter",
      http_filters: "HTTP filter",
      routes: "Route",
      virtual_hosts: "Virtual host",
      lb_endpoints: "Backend endpoint",
      socket_options: "Socket option",
      clusters: "Cluster",
      domains: "Domain",
      server_names: "Server name",
      headers: "Header match",
    };
    label = `${names[normalize(parent)] || "Item"} ${index + 1}`;
  }
  if (normalized === "address" && typeof value === "string")
    label = "IP / host address";
  if (normalized === "name" && normalize(parent) === "socket_options")
    label = "Option number";
  let content;
  if (Array.isArray(value))
    content = value.length ? `${value.length} items` : "No entries configured";
  else if (object)
    content =
      value.name ||
      value.stat_prefix ||
      value.cluster ||
      (expandable ? "Expand configuration" : "No additional configuration");
  else if (value === null) content = "Not set";
  else if (typeof value === "boolean") content = value ? "Yes" : "No";
  else if (normalized === "@type" && typeof value === "string")
    content = value.split("/").at(-1).split(".").at(-1);
  else content = value === "" ? "Not specified" : String(value);
  return {
    label,
    content: String(content),
    description: index === undefined ? field?.[1] || "" : "",
    expandable,
  };
}
