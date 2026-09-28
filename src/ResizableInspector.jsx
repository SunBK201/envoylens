import { t } from "./i18n";
import React, { useRef, useState, useEffect } from "react";

const KEY = "envoylens-details-size";
export default function ResizableInspector({ children }) {
  const panel = useRef(null);
  const drag = useRef(null);
  const [size, setSize] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved &&
        Number.isFinite(saved.width) &&
        Number.isFinite(saved.height) &&
        saved.width >= 320 &&
        saved.height >= 240
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (size) localStorage.setItem(KEY, JSON.stringify(size));
      else localStorage.removeItem(KEY);
    } catch {}
  }, [size]);
  function resize(width, height) {
    const rect = panel.current.getBoundingClientRect();
    setSize({
      width: Math.max(320, Math.min(window.innerWidth - 24, width)),
      height: Math.max(
        240,
        Math.min(window.innerHeight - rect.top - 14, height),
      ),
    });
  }
  function finish(e) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
    <aside
      ref={panel}
      className="inspector resizable-inspector"
      style={
        size
          ? { width: size.width, height: size.height, bottom: "auto" }
          : undefined
      }
    >
      <div className="inspector-content">{children}</div>
      <button
        className="inspector-resize"
        aria-label={t("Resize configuration details")}
        title={t(
          "Drag to resize; use arrow keys to adjust; double-click to reset",
        )}
        onDoubleClick={() => setSize(null)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const rect = panel.current.getBoundingClientRect();
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            width: rect.width,
            height: rect.height,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (start?.id !== e.pointerId) return;
          resize(
            start.width + start.x - e.clientX,
            start.height + e.clientY - start.y,
          );
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={(e) => {
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
            ].includes(e.key)
          )
            return;
          e.preventDefault();
          if (e.key === "Home") {
            setSize(null);
            return;
          }
          const rect = panel.current.getBoundingClientRect();
          resize(
            rect.width +
              (e.key === "ArrowLeft" ? 10 : e.key === "ArrowRight" ? -10 : 0),
            rect.height +
              (e.key === "ArrowDown" ? 10 : e.key === "ArrowUp" ? -10 : 0),
          );
        }}
      />
    </aside>
  );
}
