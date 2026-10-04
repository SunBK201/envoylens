const VIEWS = new Set(["graph", "routes", "list", "raw"]);
const STORAGE_KEY = "envoylens-active-view";

export function readViewRoute(hash, storage) {
  if (hash) {
    const view = hash.slice(2).split(/[/?]/)[0];
    return hash.startsWith("#/") && VIEWS.has(view) ? view : "graph";
  }
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return VIEWS.has(saved) ? saved : "graph";
  } catch {
    return "graph";
  }
}

export function writeViewRoute(
  browser,
  view,
  { replace = false, path = "", params = "" } = {},
) {
  if (!VIEWS.has(view)) return;
  const hash = `#/${view}${path ? `/${path}` : ""}${params ? `?${params}` : ""}`;
  if (browser.location.hash !== hash) {
    browser.history[replace ? "replaceState" : "pushState"](
      browser.history.state,
      "",
      `${browser.location.pathname}${browser.location.search}${hash}`,
    );
  }
  try {
    browser.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Navigation must work even when browser storage is unavailable.
  }
}

// Human-readable, reversible references. Only duplicate names need a suffix.
const referenceCache = new WeakMap();
function resourceReferences(index) {
  if (referenceCache.has(index)) return referenceCache.get(index);
  const groups = new Map(),
    byId = new Map(),
    byReference = new Map();
  for (const node of index.byId.values()) {
    const entry = index.entries.get(node.routingKey);
    const names = [];
    if (entry?.configKey)
      names.push(index.entries.get(entry.configKey).node.label);
    if (entry?.hostKey) names.push(index.entries.get(entry.hostKey).node.label);
    names.push(node.label);
    const ref = [
      node.kind.replaceAll("_", "-"),
      ...names.map(encodeURIComponent),
    ].join("/");
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(node);
  }
  for (const [ref, nodes] of groups) {
    nodes.sort((a, b) => {
      const left = JSON.stringify([a.state, a.path]);
      const right = JSON.stringify([b.state, b.path]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    nodes.forEach((node, i) => {
      const unique = nodes.length === 1 ? ref : `${ref}/${i + 1}`;
      byId.set(node.id, unique);
      byReference.set(unique, node);
    });
  }
  const result = { byId, byReference };
  referenceCache.set(index, result);
  return result;
}
const shortSnapshot = (identity) =>
  identity
    .split(":")
    .map((part) => Number(part).toString(36))
    .join("-");

export function resourceRouteLocation(index, identity, state) {
  const view = state.view || "graph";
  const refs = resourceReferences(index);
  const reference = (node) => refs.byId.get(node?.id) || "";
  const entry = (key) => index.entries.get(key);
  const chosen =
    (view === "graph" || view === "routes") &&
    (entry(state.selection?.route) ||
      entry(state.selection?.host) ||
      entry(state.selection?.config));
  const main = view === "routes" ? chosen?.node : state.selected;
  const path = reference(main);
  const params = new URLSearchParams();
  const scope = (key, kind, id) => {
    const ref = reference(index.byId.get(id));
    if (ref) params.set(key, ref.slice(kind.length + 1));
  };
  scope("listener", "listener", state.listener);
  scope("chain", "filter-chain", state.chain);
  // The deepest route identifies its owning VirtualHost and route config.
  if (chosen && reference(chosen.node) !== path)
    params.set("at", reference(chosen.node));
  const focused =
    view === "graph" ? reference(entry(state.focusedRoute)?.node) : "";
  if (focused) params.set("focus", focused === path ? "1" : focused);
  for (const key of view === "graph" ? state.expanded || [] : []) {
    const ref = reference(entry(key)?.node);
    if (ref) params.append("expand", ref.slice("virtual-host/".length));
  }
  // Resource links open details by default; route-workbench links do not.
  if (main && view !== "routes" && !state.detailsOpen)
    params.set("details", "0");
  if (path || params.size) params.set("s", shortSnapshot(identity));
  return { path, params: params.toString() };
}

export function restoreResourceRoute(hash, index, identity) {
  const params = new URLSearchParams(hash.split("?").slice(1).join("?"));
  const empty = {
    selected: null,
    listener: "",
    chain: "",
    detailsOpen: false,
    selection: {},
    focusedRoute: "",
    expanded: [],
  };
  if (params.get("s") !== shortSnapshot(identity)) return empty;
  const refs = resourceReferences(index);
  const find = (ref, kind) => {
    // Re-encode each segment so copied Unicode and percent-escape case normalize.
    let normalized;
    try {
      normalized = ref
        .split("/")
        .map((part) => encodeURIComponent(decodeURIComponent(part)))
        .join("/");
    } catch {
      return null;
    }
    const node = refs.byReference.get(normalized);
    return node && (!kind || node.kind === kind) ? node : null;
  };
  const scoped = (key, kind) => {
    const value = params.get(key);
    return value ? find(`${kind.replaceAll("_", "-")}/${value}`, kind) : null;
  };
  const path = hash.split("?")[0].split("/").slice(2).join("/");
  const main = find(path);
  const isWorkbench = readViewRoute(hash) === "routes";
  const chosen = find(params.get("at") || "") || main;
  const chosenEntry = index.entries.get(chosen?.routingKey);
  const focus = params.get("focus");
  const focused = find(focus === "1" ? path : focus || "", "route");
  const listener = scoped("listener", "listener");
  let chain = scoped("chain", "filter_chain");
  if (listener && chain) {
    const seen = new Set([listener.id]),
      queue = [listener.id];
    for (let i = 0; i < queue.length; i++)
      for (const id of index.forward.get(queue[i]) || [])
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
    if (!seen.has(chain.id)) chain = null;
  }
  return {
    selected: isWorkbench ? null : main,
    listener: listener?.id || "",
    chain: chain?.id || "",
    detailsOpen: Boolean(main && !isWorkbench && params.get("details") !== "0"),
    selection: chosenEntry
      ? {
          config: chosenEntry.configKey || chosenEntry.key,
          host:
            chosenEntry.hostKey ||
            (chosen.kind === "virtual_host" ? chosenEntry.key : ""),
          route: chosen.kind === "route" ? chosenEntry.key : "",
        }
      : {},
    focusedRoute: focused?.routingKey || "",
    expanded: [
      ...new Set(
        params
          .getAll("expand")
          .map(
            (value) =>
              find(`virtual-host/${value}`, "virtual_host")?.routingKey,
          )
          .filter(Boolean),
      ),
    ],
  };
}
