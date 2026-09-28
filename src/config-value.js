export function describeValue(value) {
  if (value === null) return { type: "null", text: "null", expandable: false };
  if (Array.isArray(value))
    return {
      type: "array",
      text: `${value.length} items`,
      expandable: value.length > 0,
    };
  if (typeof value === "object")
    return {
      type: "object",
      text: `${Object.keys(value).length} fields`,
      expandable: Object.keys(value).length > 0,
    };
  const type =
    { string: "string", number: "number", boolean: "boolean" }[typeof value] ||
    typeof value;
  return {
    type,
    text: typeof value === "string" ? JSON.stringify(value) : String(value),
    expandable: false,
  };
}
