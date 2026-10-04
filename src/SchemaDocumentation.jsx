import React, { cloneElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fieldDocumentation } from "./schema-docs";
import { t } from "./i18n";
import "./schema-docs.css";

let schemaRequest;
function loadSchema() {
  if (!schemaRequest)
    schemaRequest = fetch(`${import.meta.env.BASE_URL}schema/envoy-schema.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Schema unavailable");
        return response.json();
      })
      .catch((error) => {
        schemaRequest = null;
        throw error;
      });
  return schemaRequest;
}

// Render only links and inline code. Never inject schema HTML.
function DocumentationText({ text }) {
  return text
    .split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`]+`)/g)
    .map((part, i) => {
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link)
        return (
          <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>
        );
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i}>{part.slice(1, -1)}</code>;
      return part;
    });
}

export default function SchemaDocumentation({ value, schemaType, children }) {
  const [hover, setHover] = useState(null);
  const active = useRef(null);
  const timer = useRef(null);
  const showTimer = useRef(null);
  function close() {
    clearTimeout(timer.current);
    clearTimeout(showTimer.current);
    showTimer.current = null;
    active.current = null;
    setHover(null);
  }
  useEffect(() => {
    close();
    const onScroll = (event) => {
      // Keyboard focus may scroll a field into view before the hover delay ends.
      if (showTimer.current && active.current === document.activeElement)
        return;
      if (!event.target?.closest?.(".schema-documentation")) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer.current);
      clearTimeout(showTimer.current);
      active.current = null;
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [value, schemaType]);
  function leave() {
    clearTimeout(timer.current);
    timer.current = setTimeout(close, 200);
  }
  function enter(event) {
    const target = event.target.closest("[data-schema-path]");
    if (!target) return;
    clearTimeout(timer.current);
    if (active.current === target) return;
    close();
    active.current = target;
    const path = JSON.parse(target.dataset.schemaPath);
    showTimer.current = setTimeout(async () => {
      showTimer.current = null;
      const rect = target.getBoundingClientRect();
      const width = Math.min(460, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 18;
      const above = rect.top - 18;
      const placeBelow = below >= 300 || below >= above;
      const position = {
        maxHeight: Math.max(40, Math.min(300, placeBelow ? below : above)),
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(placeBelow
          ? { top: rect.bottom + 6 }
          : { bottom: window.innerHeight - rect.top + 6 }),
      };
      try {
        const schema = await loadSchema();
        if (active.current !== target || !target.isConnected) return;
        const doc = fieldDocumentation(schema, value, path, schemaType);
        setHover({ doc, position });
      } catch {
        if (active.current === target) setHover({ error: true, position });
      }
    }, 250);
  }
  return (
    <>
      {cloneElement(children, {
        onMouseOver: enter,
        onFocus: enter,
        onMouseOut: leave,
        onBlur: leave,
      })}
      {hover &&
        createPortal(
          <aside
            className="schema-documentation"
            role="tooltip"
            style={hover.position}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={leave}
            onFocus={() => clearTimeout(timer.current)}
            onBlur={leave}
          >
            {hover.doc ? (
              <>
                <strong>{hover.doc.name}</strong>
                <small>{hover.doc.owner}</small>
                {!!hover.doc.types.length && (
                  <div>{hover.doc.types.join(" | ")}</div>
                )}
                {!!hover.doc.enum.length && (
                  <div>{hover.doc.enum.join(" · ")}</div>
                )}
                {hover.doc.default !== undefined && (
                  <div>
                    {t("Default")}: {JSON.stringify(hover.doc.default)}
                  </div>
                )}
                <div className="schema-documentation-text">
                  <DocumentationText text={hover.doc.description} />
                </div>
              </>
            ) : (
              <span>
                {t(
                  hover.error
                    ? "Unable to load field documentation. Hover again to retry."
                    : "No schema documentation for this field.",
                )}
              </span>
            )}
          </aside>,
          document.body,
        )}
    </>
  );
}
