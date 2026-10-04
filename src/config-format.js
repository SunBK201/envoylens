import { stringify } from "yaml";

// Preserve scalar types and key order; avoid wrapping long URLs and regexes.
export function formatConfiguration(value, mode = "json") {
  return mode === "yaml"
    ? stringify(value, {
        indent: 2,
        lineWidth: 0,
        aliasDuplicateObjects: false,
      })
    : JSON.stringify(value, null, 2);
}
