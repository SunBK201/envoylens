import React, { useLayoutEffect, useRef, useState } from "react";

// Fixed-height rows keep large routing tables bounded without dropping records.
export default function VirtualRows({
  items,
  rowHeight,
  activeKey,
  renderRow,
  label,
  table = false,
  active = true,
}) {
  const scroller = useRef(null),
    savedTop = useRef(0),
    locatedKey = useRef(null);
  const [window, setWindow] = useState({ start: 0, end: 20 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!active) return;
    el.scrollTop = savedTop.current;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!el.clientHeight) return;
      savedTop.current = el.scrollTop;
      const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - 5);
      const end = Math.min(
        items.length,
        Math.ceil((el.scrollTop + el.clientHeight) / rowHeight) + 5,
      );
      setWindow((old) =>
        old.start === start && old.end === end ? old : { start, end },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    el.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [items, rowHeight, active]);
  useLayoutEffect(() => {
    const el = scroller.current;
    const index = items.findIndex((item) => item.key === activeKey);
    if (
      !active ||
      index < 0 ||
      !el.clientHeight ||
      locatedKey.current === activeKey
    )
      return;
    locatedKey.current = activeKey;
    if (
      index * rowHeight < el.scrollTop ||
      (index + 1) * rowHeight > el.scrollTop + el.clientHeight
    )
      el.scrollTop = Math.max(0, index * rowHeight - el.clientHeight / 3);
  }, [activeKey, items, active, rowHeight]);
  const start = Math.min(window.start, Math.max(0, items.length - 1));
  const end = Math.min(items.length, Math.max(start + 1, window.end));
  return (
    <div
      className="routing-virtual-scroll"
      ref={scroller}
      role={table ? "rowgroup" : "group"}
      aria-label={label}
    >
      <div aria-hidden="true" style={{ height: start * rowHeight }} />
      {items.slice(start, end).map((item, i) => (
        <div
          key={item.key}
          style={{ height: rowHeight }}
          role={table ? "row" : undefined}
          aria-rowindex={table ? start + i + 2 : undefined}
        >
          {renderRow(item, start + i)}
        </div>
      ))}
      <div
        aria-hidden="true"
        style={{ height: (items.length - end) * rowHeight }}
      />
    </div>
  );
}
