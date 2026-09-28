import { t } from "./i18n";
import React, { useMemo, useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { jsonTokens } from "./json-tokens";
import { jsonLineTree } from "./json-lines";

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

function CodeLine({ number, depth, toggle, children }) {
  return (
    <span className="json-code-line">
      <span className="json-gutter" contentEditable={false}>
        <span
          className="json-line-number"
          aria-hidden="true"
          data-line={number}
        />
        <span className="json-fold-slot">{toggle}</span>
      </span>
      <span className="json-line-content">
        <span className="json-indent">{"  ".repeat(depth)}</span>
        {children}
        {"\n"}
      </span>
    </span>
  );
}

function JsonBranch({ branch }) {
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
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(true), [branch]);
  const expandable = children.length > 0;
  const start = array ? "[" : "{";
  const end = array ? "]" : "}";
  const suffix = comma ? "," : "";
  return (
    <>
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
              onClick={() => setOpen((current) => !current)}
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
                  onClick={() => setOpen(true)}
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
      {expandable && open && (
        <>
          {children.map((child, index) => (
            <JsonBranch key={index} branch={child} />
          ))}
          <CodeLine number={endLine} depth={depth}>
            {end}
            {suffix}
          </CodeLine>
        </>
      )}
    </>
  );
}

export default function JsonCode({ value }) {
  const branch = useMemo(() => jsonLineTree(value), [value]);
  return (
    <code
      className="json-code"
      style={{ "--json-line-digits": String(branch.endLine).length }}
    >
      <JsonBranch branch={branch} />
    </code>
  );
}
