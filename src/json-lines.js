// Keep original JSON line numbers stable when branches are folded.
export function jsonLineTree(value) {
  let line = 0;
  function visit(value, name, depth, comma, label) {
    const startLine = ++line;
    const entries =
      value !== null && typeof value === "object" ? Object.entries(value) : [];
    const array = Array.isArray(value);
    const children = entries.map(([key, child], index) =>
      visit(
        child,
        array ? undefined : key,
        depth + 1,
        index < entries.length - 1,
        array ? `${label}[${key}]` : key,
      ),
    );
    const endLine = children.length ? ++line : startLine;
    return {
      value,
      name,
      depth,
      comma,
      label,
      startLine,
      endLine,
      children,
      array,
    };
  }
  return visit(value, undefined, 0, false, "root");
}
