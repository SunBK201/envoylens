import { parseDocument, visit } from "yaml";

// Use YAML scalar ranges rather than regexes so quoted keys, URLs and block
// strings are classified correctly. Keep the serialized text exactly intact.
export function yamlTokens(text, document = parseDocument(text), keyPaths) {
  if (document.errors.length) return [{ text, type: "plain" }];
  const ranges = [];
  visit(document, {
    Scalar(key, node) {
      if (!node.range) return;
      const [start, end] = node.range;
      const type =
        key === "key"
          ? "key"
          : node.value === null
            ? "null"
            : typeof node.value;
      ranges.push({ start, end, type, path: keyPaths?.get(start) });
    },
  });
  ranges.sort((a, b) => a.start - b.start);
  const tokens = [];
  let end = 0;
  for (const range of ranges) {
    if (range.start > end)
      tokens.push({ text: text.slice(end, range.start), type: "plain" });
    tokens.push({
      text: text.slice(range.start, range.end),
      type: range.type,
      ...(range.path ? { path: range.path } : {}),
    });
    end = range.end;
  }
  if (end < text.length) tokens.push({ text: text.slice(end), type: "plain" });
  return tokens;
}
