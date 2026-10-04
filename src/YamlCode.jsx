import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { t } from "./i18n";
import { CodeLine, useCodeWindow } from "./CodeSurface";
import { JSON_ROW_HEIGHT } from "./json-lines";
import { yamlLineRows, yamlVisibleRows } from "./yaml-lines";

import SchemaDocumentation from "./SchemaDocumentation";
const EMPTY_COLLAPSED = new Set();

export default function YamlCode({ text, value, schemaType }) {
  const allRows = useMemo(() => yamlLineRows(text), [text]);
  const [folding, setFolding] = useState({
    rows: null,
    collapsed: EMPTY_COLLAPSED,
  });
  const collapsed =
    folding.rows === allRows ? folding.collapsed : EMPTY_COLLAPSED;
  const rows = useMemo(
    () => yamlVisibleRows(allRows, collapsed),
    [allRows, collapsed],
  );
  const { code, start, end } = useCodeWindow(rows);
  const maxColumns = useMemo(
    () =>
      rows.reduce(
        (max, row) =>
          Math.max(max, row.text.length + (collapsed.has(row.number) ? 4 : 0)),
        0,
      ),
    [rows, collapsed],
  );
  function toggle(number) {
    setFolding((current) => {
      const next = new Set(current.rows === allRows ? current.collapsed : []);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return { rows: allRows, collapsed: next };
    });
  }
  return (
    <SchemaDocumentation value={value} schemaType={schemaType}>
      <code
        ref={code}
        className="json-code yaml-code"
        style={{
          "--json-line-digits": String(allRows.length).length,
          minWidth: `max(100%, calc(${maxColumns + String(allRows.length).length + 4}ch + 36px))`,
          paddingTop: start * JSON_ROW_HEIGHT,
          paddingBottom: (rows.length - end) * JSON_ROW_HEIGHT,
        }}
      >
        {rows.slice(start, end).map((row) => {
          const open = !collapsed.has(row.number);
          const indent = row.text.match(/^ */)[0].length;
          let skip = indent;
          return (
            <CodeLine
              key={row.number}
              number={row.number}
              indent={" ".repeat(indent)}
              toggle={
                row.endLine && (
                  <button
                    type="button"
                    className="json-fold-toggle"
                    aria-label={`${open ? t("Collapse") : t("Expand")} ${row.label}`}
                    aria-expanded={open}
                    onClick={() => toggle(row.number)}
                  >
                    {open ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                )
              }
            >
              {row.tokens.map((token, index) => {
                const content = token.text.slice(skip);
                skip = Math.max(0, skip - token.text.length);
                return token.type === "plain" ? (
                  content
                ) : (
                  <span
                    key={index}
                    className={`json-${token.type}`}
                    data-schema-path={
                      token.path ? JSON.stringify(token.path) : undefined
                    }
                    tabIndex={token.path ? 0 : undefined}
                  >
                    {content}
                  </span>
                );
              })}
              {!open && (
                <button
                  type="button"
                  className="json-fold-summary"
                  aria-label={t("Expand {0}", [row.label])}
                  title={t("Click to expand")}
                  onClick={() => toggle(row.number)}
                >
                  {" … "}
                </button>
              )}
            </CodeLine>
          );
        })}
      </code>
    </SchemaDocumentation>
  );
}
