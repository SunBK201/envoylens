// Local, read-only documentation lookup, not a JSON Schema validator.
export const schemaTypes = {
  listener: "envoy.config.listener.v3.Listener",
  filter_chain: "envoy.config.listener.v3.FilterChain",
  match: "envoy.config.listener.v3.FilterChainMatch",
  listener_filter: "envoy.config.listener.v3.ListenerFilter",
  network_filter: "envoy.config.listener.v3.Filter",
  http_filter:
    "envoy.extensions.filters.network.http_connection_manager.v3.HttpFilter",
  cluster: "envoy.config.cluster.v3.Cluster",
  endpoint: "envoy.config.endpoint.v3.LbEndpoint",
  route_config: "envoy.config.route.v3.RouteConfiguration",
  virtual_host: "envoy.config.route.v3.VirtualHost",
  route: "envoy.config.route.v3.Route",
  dynamic: "envoy.config.route.v3.RouteAction",
};

export function fieldDocumentation(schema, root, path, rootType) {
  const definition = (name) => schema.definitions?.[name];
  const typed = (value) =>
    typeof value?.["@type"] === "string"
      ? value["@type"].split("/").at(-1)
      : null;
  const ref = (url) =>
    url?.startsWith("#/")
      ? url
          .slice(2)
          .split("/")
          .reduce(
            (s, k) => s?.[k.replace(/~1/g, "/").replace(/~0/g, "~")],
            schema,
          )
      : null;
  function matches(rule, value) {
    if (!rule || typeof rule !== "object") return rule === true;
    if (rule.required?.some((k) => !Object.hasOwn(value ?? {}, k)))
      return false;
    if (Object.hasOwn(rule, "const") && rule.const !== value) return false;
    if (rule.enum && !rule.enum.includes(value)) return false;
    if (
      rule.type &&
      ![]
        .concat(rule.type)
        .some((type) =>
          type === "array"
            ? Array.isArray(value)
            : type === "null"
              ? value === null
              : type === "integer"
                ? Number.isInteger(value)
                : type === "object"
                  ? value !== null &&
                    typeof value === "object" &&
                    !Array.isArray(value)
                  : typeof value === type,
        )
    )
      return false;
    return (
      !rule.properties ||
      Object.entries(rule.properties).every(
        ([k, r]) => !Object.hasOwn(value ?? {}, k) || matches(r, value[k]),
      )
    );
  }
  function expand(s, value, seen = new Set()) {
    if (!s || typeof s !== "object" || seen.has(s)) return [];
    const next = new Set(seen).add(s);
    // Any has thousands of conditional branches; resolve its discriminator directly.
    if (s === definition("google.protobuf.Any")) {
      const type = typed(value);
      return type ? expand(definition(type), value, next) : [s];
    }
    const result = [s];
    if (s.$ref) result.push(...expand(ref(s.$ref), value, next));
    for (const part of s.allOf ?? []) result.push(...expand(part, value, next));
    for (const part of [...(s.anyOf ?? []), ...(s.oneOf ?? [])]) {
      if (matches(part, value)) result.push(...expand(part, value, next));
    }
    if (s.if)
      result.push(
        ...expand(matches(s.if, value) ? s.then : s.else, value, next),
      );
    return result;
  }
  let current = root;
  let candidates = [
    typed(root)
      ? definition(typed(root))
      : rootType
        ? definition(rootType)
        : schema,
  ];
  let owner = rootType || typed(root) || "";
  for (const key of path) {
    const type = typed(current);
    if (type) {
      candidates = [definition(type)];
      owner = type;
    }
    const parts = candidates.flatMap((s) => expand(s, current));
    const next = [];
    for (const part of parts) {
      if (part.$ref?.startsWith("#/definitions/"))
        owner = part.$ref.slice("#/definitions/".length);
      const child = Array.isArray(current)
        ? part.items
        : (part.properties?.[key] ??
          (typeof part.additionalProperties === "object"
            ? part.additionalProperties
            : null));
      if (child) next.push(child);
    }
    candidates = next;
    current = current?.[key];
    if (!candidates.length) return null;
  }
  const parts = candidates.flatMap((s) => expand(s, current));
  const description = parts.find((s) => s.markdownDescription || s.description);
  if (!description) return null;
  return {
    name: String(path.at(-1) ?? ""),
    owner,
    description: description.markdownDescription || description.description,
    types: [
      ...new Set(parts.flatMap((s) => (s.type ? [].concat(s.type) : []))),
    ],
    enum: [...new Set(parts.flatMap((s) => s.enum ?? []))],
    default: parts.find((s) => Object.hasOwn(s, "default"))?.default,
  };
}
