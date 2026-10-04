import { t } from "./i18n";
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CodeLine, useCodeWindow } from "./CodeSurface";
import { jsonTokens } from "./json-tokens";
import {
  jsonLineTree,
  jsonVisibleRows,
  jsonRowText,
  JSON_ROW_HEIGHT,
} from "./json-lines";
const EMPTY_COLLAPSED = new Set();

function JsonValue({ value }) {
  const tokens = useMemo(() => jsonTokens(value), [value]);
  return tokens.map((token, index) =>
    token.type === "plain" ? (
      token.text
    ) : (
      <span key={index} className={`json-${token.type}`}>
        {token.text}
      </span>
    ),
  );
}

function JsonRow({ branch, closing, open, onToggle }) {
  const {
    value,
    name,
    depth,
    comma,
    label,
    startLine,
    endLine,
    children,
    array,
  } = branch;
  const expandable = children.length > 0;
  const start = array ? "[" : "{";
  const end = array ? "]" : "}";
  const suffix = comma ? "," : "";
  if (closing)
    return (
      <CodeLine number={endLine} depth={depth}>
        {end}
        {suffix}
      </CodeLine>
    );
  return (
    <CodeLine
      number={startLine}
      depth={depth}
      toggle={
        expandable && (
          <button
            type="button"
            className="json-fold-toggle"
            aria-label={`${open ? t("Collapse") : t("Expand")} ${label}`}
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )
      }
    >
      {name !== undefined && (
        <>
          <span className="json-key">{JSON.stringify(name)}</span>
          {": "}
        </>
      )}
      {expandable ? (
        <>
          {start}
          {!open && (
            <>
              <button
                type="button"
                className="json-fold-summary"
                onClick={onToggle}
                aria-label={t("Expand {0}", [label])}
                title={t("Click to expand")}
              >
                {" "}
                …{" "}
              </button>
              {end}
              {suffix}
            </>
          )}
        </>
      ) : (
        <>
          <JsonValue value={value} />
          {suffix}
        </>
      )}
    </CodeLine>
  );
}

export default function JsonCode({ value }) {
  const branch = useMemo(() => jsonLineTree(value), [value]);
  const [folding, setFolding] = useState({
    branch: null,
    collapsed: EMPTY_COLLAPSED,
  });
  const collapsed =
    folding.branch === branch ? folding.collapsed : EMPTY_COLLAPSED;
  const rows = useMemo(
    () => jsonVisibleRows(branch, collapsed),
    [branch, collapsed],
  );
  const maxColumns = useMemo(
    () =>
      rows.reduce(
        (width, row) =>
          Math.max(
            width,
            jsonRowText(row, collapsed.has(row.branch.startLine)).length,
          ),
        0,
      ),
    [rows, collapsed],
  );
  const { code, start, end } = useCodeWindow(rows);
  function toggle(line) {
    setFolding((current) => {
      const next = new Set(current.branch === branch ? current.collapsed : []);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return { branch, collapsed: next };
    });
  }
  return (
    <code
      ref={code}
      className="json-code"
      style={{
        "--json-line-digits": String(branch.endLine).length,
        minWidth: `max(100%, calc(${maxColumns + String(branch.endLine).length + 4}ch + 36px))`,
        paddingTop: start * JSON_ROW_HEIGHT,
        paddingBottom: (rows.length - end) * JSON_ROW_HEIGHT,
      }}
    >
      {rows.slice(start, end).map(({ branch: row, closing }) => (
        <JsonRow
          key={`${row.startLine}-${closing}`}
          branch={row}
          closing={closing}
          open={!collapsed.has(row.startLine)}
          onToggle={() => toggle(row.startLine)}
        />
      ))}
    </code>
  );
}
