// Tokenize serialized JSON without injecting HTML or changing its text.
export function jsonTokens(value) {
  const text = JSON.stringify(value, null, 2) ?? "";
  const pattern =
    /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  const tokens = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > end)
      tokens.push({ text: text.slice(end, match.index), type: "plain" });
    const token = match[0];
    const type =
      token[0] === '"'
        ? /^\s*:/.test(text.slice(match.index + token.length))
          ? "key"
          : "string"
        : token === "null"
          ? "null"
          : /^(true|false)$/.test(token)
            ? "boolean"
            : "number";
    tokens.push({ text: token, type });
    end = match.index + token.length;
  }
  if (end < text.length) tokens.push({ text: text.slice(end), type: "plain" });
  return tokens;
}
