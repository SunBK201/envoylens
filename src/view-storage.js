const KEY = "envoylens-relationship-view";
export function configIdentity(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}
export function restoreView(storage, identity, model) {
  const empty = { listener: "", chain: "" };
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    if (!saved || saved.identity !== identity) return empty;
    const listener =
      model.nodes.find((n) => n.id === saved.listener && n.kind === "listener")
        ?.id || "";
    let chain =
      model.nodes.find((n) => n.id === saved.chain && n.kind === "filter_chain")
        ?.id || "";
    if (listener && chain) {
      const reachable = new Set([listener]);
      const queue = [listener];
      for (let i = 0; i < queue.length; i++)
        for (const edge of model.edges) {
          if (edge.source === queue[i] && !reachable.has(edge.target)) {
            reachable.add(edge.target);
            queue.push(edge.target);
          }
        }
      if (!reachable.has(chain)) chain = "";
    }
    return { listener, chain };
  } catch {
    return empty;
  }
}
export function saveView(storage, identity, listener, chain) {
  try {
    storage.setItem(KEY, JSON.stringify({ identity, listener, chain }));
  } catch {
    /* Browser storage may be unavailable. */
  }
}
