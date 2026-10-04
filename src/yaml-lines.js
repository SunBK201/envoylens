import { LineCounter, parseDocument, visit, isMap, isSeq } from "yaml";
import { yamlTokens } from "./yaml-tokens.js";

export function yamlLineRows(text) {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter });
  const keyPaths = new Map();
  function collect(node, path = []) {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!pair.key?.range) continue;
        const childPath = [...path, String(pair.key.value)];
        keyPaths.set(pair.key.range[0], childPath);
        collect(pair.value, childPath);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, index) => collect(item, [...path, index]));
    }
  }
  if (!document.errors.length) collect(document.contents);
  const rows = [{ number: 1, text: "", tokens: [] }];
  for (const token of yamlTokens(text, document, keyPaths)) {
    token.text.split("\n").forEach((part, index) => {
      if (index) rows.push({ number: rows.length + 1, text: "", tokens: [] });
      const row = rows.at(-1);
      row.text += part;
      if (part)
        row.tokens.push({
          text: part,
          type: token.type,
          ...(token.path ? { path: token.path } : {}),
        });
    });
  }
  if (text.endsWith("\n")) rows.pop();
  function fold(start, end, label) {
    // Exclude trailing newlines from the folded branch.
    while (end > start && /\s/.test(text[end - 1])) end--;
    const first = lineCounter.linePos(start).line;
    const last = lineCounter.linePos(Math.max(start, end - 1)).line;
    const row = rows[first - 1];
    if (row && last > first && (!row.endLine || last > row.endLine)) {
      row.endLine = last;
      row.label = String(label);
    }
  }
  if (!document.errors.length)
    visit(document, {
      Pair(_, pair) {
        if (pair.key?.range && pair.value?.range)
          fold(pair.key.range[0], pair.value.range[1], pair.key.value);
      },
      Node(key, node) {
        // On shared header lines, prefer the entire sequence item over its first field.
        if (typeof key === "number" && node.range)
          fold(node.range[0], node.range[1], `[${key}]`);
      },
    });
  return rows;
}

export function yamlVisibleRows(rows, collapsed = new Set()) {
  const visible = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    visible.push(row);
    if (row.endLine && collapsed.has(row.number)) index = row.endLine - 1;
  }
  return visible;
}
