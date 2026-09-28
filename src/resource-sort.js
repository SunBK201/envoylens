const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
export function sortedResources(nodes, kind, direction = "asc") {
  const sorted = nodes
    .filter((node) => node.kind === kind)
    .sort(
      (a, b) =>
        collator.compare(a.label || "", b.label || "") ||
        collator.compare(a.clusterName || "", b.clusterName || "") ||
        collator.compare(a.state || "", b.state || "") ||
        collator.compare(a.path || "", b.path || ""),
    );
  return direction === "desc" ? sorted.reverse() : sorted;
}
