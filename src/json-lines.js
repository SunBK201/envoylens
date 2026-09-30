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

// Flatten only expanded branches. Folding state belongs to the document, not to
// mounted rows, so scrolling offscreen must not reset a branch's state.
export function jsonVisibleRows(branch, collapsed = new Set()) {
  const rows = [];
  function visit(branch) {
    rows.push({ branch, closing: false });
    if (!branch.children.length || collapsed.has(branch.startLine)) return;
    for (const child of branch.children) visit(child);
    rows.push({ branch, closing: true });
  }
  visit(branch);
  return rows;
}

export function jsonRowText({ branch, closing }, collapsed = false) {
  const { depth, name, array, children, value, comma } = branch;
  const suffix = comma ? "," : "";
  const end = array ? "]" : "}";
  if (closing) return "  ".repeat(depth) + end + suffix;
  const prefix =
    "  ".repeat(depth) +
    (name === undefined ? "" : `${JSON.stringify(name)}: `);
  if (!children.length) return prefix + (JSON.stringify(value) ?? "") + suffix;
  return prefix + (array ? "[" : "{") + (collapsed ? ` … ${end}${suffix}` : "");
}

export const JSON_ROW_HEIGHT = 22;
export function jsonRowWindow(length, scrollTop, height, overscan = 20) {
  const start = Math.max(
    0,
    Math.min(length - 1, Math.floor(scrollTop / JSON_ROW_HEIGHT) - overscan),
  );
  const end = Math.min(
    length,
    Math.max(
      start + 1,
      Math.ceil((scrollTop + height) / JSON_ROW_HEIGHT) + overscan,
    ),
  );
  return { start, end };
}
