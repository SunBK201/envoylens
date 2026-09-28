// Parser IDs are positional, so match resource identity rather than reusing IDs.
export function retainRefreshView(previous, next, view) {
  function descendants(id, model) {
    const ids = new Set([id]);
    const queue = [id];
    for (let i = 0; i < queue.length; i++)
      for (const edge of model.edges) {
        if (edge.source === queue[i] && !ids.has(edge.target)) {
          ids.add(edge.target);
          queue.push(edge.target);
        }
      }
    return ids;
  }
  function match(id, scope) {
    const old = previous.nodes.find((node) => node.id === id);
    if (!old) return null;
    const candidates = next.nodes.filter(
      (node) =>
        node.kind === old.kind &&
        node.label === old.label &&
        node.state === old.state &&
        (!scope || scope.has(node.id)),
    );
    if (candidates.length === 1) return candidates[0];
    const same = candidates.filter(
      (node) => JSON.stringify(node.detail) === JSON.stringify(old.detail),
    );
    if (same.length === 1) return same[0];
    return candidates.find((node) => node.path === old.path) || null;
  }
  const listener = match(view.listener);
  const scope = listener ? descendants(listener.id, next) : null;
  const chain = view.listener && !listener ? null : match(view.chain, scope);
  const selected = match(view.selected?.id, scope);
  return {
    listener: listener?.id || "",
    chain: chain?.id || "",
    selected,
    detailsOpen: Boolean(selected && view.detailsOpen),
  };
}
