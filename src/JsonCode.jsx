import { t } from "./i18n";
import React, { useMemo, useState, useRef, useLayoutEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { jsonTokens } from "./json-tokens";
import {
  jsonLineTree,
  jsonVisibleRows,
  jsonRowText,
  jsonRowWindow,
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
  const code = useRef(null);
  const [window, setWindow] = useState({ start: 0, end: 80 });
  useLayoutEffect(() => {
    const scroller = code.current.parentElement;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = Math.max(
        0,
        scroller.getBoundingClientRect().top +
          scroller.clientTop -
          code.current.getBoundingClientRect().top,
      );
      const next = jsonRowWindow(rows.length, top, scroller.clientHeight);
      setWindow((current) =>
        current.start === next.start && current.end === next.end
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    scroller.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", schedule);
    };
  }, [rows]);
  const start = Math.min(window.start, Math.max(0, rows.length - 1));
  const end = Math.min(rows.length, Math.max(start + 1, window.end));
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
