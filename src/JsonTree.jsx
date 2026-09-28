import React from "react";
import { t } from "./i18n";
export default function JsonTree({ value, name, depth = 0 }) {
  const object = value !== null && typeof value === "object";
  if (!object)
    return (
      <div className="json-leaf">
        {name !== undefined && (
          <>
            <span className="json-key">{JSON.stringify(name)}</span>:{" "}
          </>
        )}
        <span className={`json-${value === null ? "null" : typeof value}`}>
          {JSON.stringify(value)}
        </span>
      </div>
    );
  const entries = Object.entries(value),
    array = Array.isArray(value);
  return (
    <details className="json-branch" open={depth < 3}>
      <summary>
        {name !== undefined && (
          <span className="json-key">{JSON.stringify(name)}: </span>
        )}
        {array ? "[" : "{"} <small>{t("{0} items", [entries.length])}</small>{" "}
        {array ? "]" : "}"}
      </summary>
      <div>
        {entries.map(([key, item]) => (
          <JsonTree key={key} name={key} value={item} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}
