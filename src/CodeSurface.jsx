import React, { useRef, useState, useLayoutEffect } from "react";
import { jsonRowWindow } from "./json-lines";

export function CodeLine({ number, depth, indent, toggle, children }) {
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
        <span className="json-indent">{indent ?? "  ".repeat(depth)}</span>
        {children}
        {"\n"}
      </span>
    </span>
  );
}

export function useCodeWindow(rows) {
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
  return { code, start, end };
}
