import { t, nodeLabel } from "./i18n";
import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { Scan } from "lucide-react";
import NodePreview from "./NodePreview";
import { layoutGraph, graphGeometry, displayTitle } from "./layout";
import { graphConnections } from "./graph-connections";
import { visibleGraph } from "./graph-viewport";
import { nodeFields, summary, fieldLabels, originLabel } from "./node-fields";
export { summary } from "./node-fields";
const DEFAULT_ZOOM = 0.65;
const CANVAS_PADDING = 160;
// The compact canvas scale is the user-facing 100% baseline.
const ZOOM_STEP = DEFAULT_ZOOM * 0.1;
function reach(start, edges, reverse = false) {
  const seen = new Set([start]),
    queue = [start],
    adj = new Map();
  for (const e of edges) {
    const a = reverse ? e.target : e.source,
      b = reverse ? e.source : e.target;
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  }
  for (let i = 0; i < queue.length; i++)
    for (const id of adj.get(queue[i]) || [])
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
  return seen;
}
export default function RelationshipGraph({
  model,
  searchNodes = model.nodes,
  routingIndex,
  onLocate,
  active = true,
  viewportState,
  restoreViewport,
  selected,
  onSelect,
  onNodeClick,
  focusTarget,
  resetKey,
  query,
  listener,
  chain,
  meta,
}) {
  const [preview, setPreview] = useState(null);
  const previewTimer = useRef(null);
  function cancelPreviewTimer() {
    clearTimeout(previewTimer.current);
  }
  function closePreview() {
    cancelPreviewTimer();
    setPreview(null);
  }
  function queuePreview(node, element) {
    cancelPreviewTimer();
    const rect = element.getBoundingClientRect();
    previewTimer.current = setTimeout(() => setPreview({ node, rect }), 400);
  }
  function leavePreview() {
    cancelPreviewTimer();
    previewTimer.current = setTimeout(() => setPreview(null), 180);
  }
  useEffect(() => {
    closePreview();
    return cancelPreviewTimer;
  }, [model, listener, chain, active]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") closePreview();
    };
    document.addEventListener("keydown", close);
    window.addEventListener("resize", closePreview);
    return () => {
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", closePreview);
    };
  }, []);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [panning, setPanning] = useState(false);
  const pan = useRef(null);
  function startPan(e) {
    if (
      e.pointerType !== "mouse" ||
      e.button !== 0 ||
      e.target.closest("button, input, select, a")
    )
      return;
    const el = e.currentTarget;
    pan.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    setPanning(true);
    e.preventDefault();
  }
  function movePan(e) {
    const start = pan.current;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5)
      start.moved = true;
    e.currentTarget.scrollLeft = start.left - (e.clientX - start.x);
    e.currentTarget.scrollTop = start.top - (e.clientY - start.y);
  }
  function endPan(e) {
    if (pan.current?.id !== e.pointerId) return;
    const start = pan.current;
    const clicked =
      e.type === "pointerup" &&
      !start.moved &&
      Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 5;
    pan.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (clicked) onSelect(null);
  }
  const viewport = useRef(null),
    hitIndex = useRef(-1);
  const surface = useRef(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomAnchor = useRef(null);
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    if (!anchor || !surface.current || !viewport.current) return;
    const rect = surface.current.getBoundingClientRect();
    viewport.current.scrollLeft += rect.left + anchor.x * zoom - anchor.clientX;
    viewport.current.scrollTop += rect.top + anchor.y * zoom - anchor.clientY;
    zoomAnchor.current = null;
  }, [zoom]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let gesture = null;
    function applyPinch(next, clientX, clientY) {
      next = Math.min(1.6, Math.max(0.12, next));
      if (next === zoomRef.current || !surface.current) return;
      const rect = surface.current.getBoundingClientRect();
      // Keep the point under the fingers stationary when scroll bounds allow it.
      if (!zoomAnchor.current)
        zoomAnchor.current = {
          x: (clientX - rect.left) / zoomRef.current,
          y: (clientY - rect.top) / zoomRef.current,
          clientX,
          clientY,
        };
      zoomRef.current = next;
      closePreview();
      setZoom(next);
    }
    function wheel(event) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (gesture) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? el.clientHeight
            : 1;
      applyPinch(
        zoomRef.current * Math.exp(-event.deltaY * unit * 0.01),
        event.clientX,
        event.clientY,
      );
    }
    // WebKit exposes native trackpad pinch as gesture events instead of Ctrl+wheel.
    function start(event) {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      gesture = {
        zoom: zoomRef.current,
        x: event.clientX || rect.left + rect.width / 2,
        y: event.clientY || rect.top + rect.height / 2,
      };
    }
    function change(event) {
      if (!gesture) return;
      event.preventDefault();
      if (Number.isFinite(event.scale) && event.scale > 0)
        applyPinch(gesture.zoom * event.scale, gesture.x, gesture.y);
    }
    function end(event) {
      event.preventDefault();
      gesture = null;
    }
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("gesturestart", start, { passive: false });
    el.addEventListener("gesturechange", change, { passive: false });
    el.addEventListener("gestureend", end, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("gesturestart", start);
      el.removeEventListener("gesturechange", change);
      el.removeEventListener("gestureend", end);
    };
  }, []);
  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
  }, [resetKey]);
  useEffect(() => {
    hitIndex.current = -1;
  }, [query]);
  const graph = useMemo(() => {
    const nodes = model.nodes,
      edges = model.edges;
    const geometry = graphGeometry(nodes, edges);
    const positions = layoutGraph(nodes, edges, geometry);
    const placed = nodes.map((n) => ({
      ...n,
      ...positions.get(n.id),
      x: positions.get(n.id).x + CANVAS_PADDING,
      y: positions.get(n.id).y + CANVAS_PADDING + 34,
    }));
    placed.sort((a, b) => a.x - b.x || a.y - b.y);
    return {
      nodes: placed,
      geometry,
      edges,
      byId: new Map(placed.map((n) => [n.id, n])),
      width: Math.max(
        1,
        ...placed.map((n) => n.x + geometry.cardWidth + CANVAS_PADDING),
      ),
      height: Math.max(
        1,
        ...placed.map((n) => n.y + geometry.cardHeight + CANVAS_PADDING),
      ),
    };
  }, [model]);
  useEffect(() => {
    // Keep the extra drag margin offscreen initially. Small graphs still center.
    // Do not reset this position on Admin refresh or ordinary zoom changes.
    if (focusTarget || !active) return;
    const frame = requestAnimationFrame(() => {
      const el = viewport.current;
      if (!el) return;
      const inset = (CANVAS_PADDING - 32) * zoomRef.current;
      el.scrollTo({
        left: Math.min(
          inset,
          Math.max(0, (el.scrollWidth - el.clientWidth) / 2),
        ),
        top: Math.min(
          inset,
          Math.max(0, (el.scrollHeight - el.clientHeight) / 2),
        ),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [resetKey, listener, chain]);
  const consumedFocus = useRef(null);
  const savedViewport = useRef(null);
  const appliedRestore = useRef(null);
  function recordViewport() {
    if (!active || !viewport.current?.clientWidth) return;
    const state = {
      zoom: zoomRef.current,
      left: viewport.current.scrollLeft,
      top: viewport.current.scrollTop,
    };
    savedViewport.current = state;
    if (viewportState) viewportState.current = state;
  }
  useLayoutEffect(() => {
    if (!active || !viewport.current) return;
    const restore =
      restoreViewport && appliedRestore.current !== restoreViewport;
    const state = restore ? restoreViewport : savedViewport.current;
    if (restore) appliedRestore.current = restoreViewport;
    if (state) {
      setZoom(state.zoom);
      const frame = requestAnimationFrame(() =>
        viewport.current?.scrollTo(state.left, state.top),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [active, restoreViewport]);
  useEffect(() => {
    if (active) recordViewport();
  }, [zoom]);
  useEffect(() => {
    if (!active || !focusTarget || consumedFocus.current === focusTarget)
      return;
    const node = graph.byId.get(focusTarget.id),
      el = viewport.current;
    if (!node || !el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTo({
        left: Math.max(0, node.x * zoomRef.current - el.clientWidth / 3),
        top: Math.max(0, node.y * zoomRef.current - el.clientHeight / 3),
      });
      consumedFocus.current = focusTarget;
      recordViewport();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTarget, graph, active]);
  const connections = useMemo(() => graphConnections(graph), [graph]);
  const [visibleBounds, setVisibleBounds] = useState({
    left: 0,
    top: 0,
    right: 2000,
    bottom: 1400,
  });
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!el || !surface.current) return;
      const rect = el.getBoundingClientRect();
      const origin = surface.current.getBoundingClientRect();
      // Overscan one card in screen space to keep panning smooth.
      const padding = 320;
      const next = {
        left: (rect.left - origin.left - padding) / zoom,
        top: (rect.top - origin.top - padding) / zoom,
        right: (rect.right - origin.left + padding) / zoom,
        bottom: (rect.bottom - origin.top + padding) / zoom,
      };
      setVisibleBounds((current) =>
        Object.keys(next).every((key) => current[key] === next[key])
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    el.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("scroll", schedule);
    };
  }, [graph, zoom, active]);
  const visible = useMemo(
    () => visibleGraph(graph, connections, visibleBounds),
    [graph, connections, visibleBounds],
  );
  const columns = useMemo(() => {
    const map = new Map();
    for (const n of graph.nodes) {
      if (!map.has(n.x)) map.set(n.x, new Set());
      map.get(n.x).add(meta[n.kind]?.[0] || n.kind);
    }
    return [...map].sort((a, b) => a[0] - b[0]);
  }, [graph, meta]);
  const highlighted = useMemo(
    () =>
      selected
        ? new Set([
            ...reach(selected.id, model.edges),
            ...reach(selected.id, model.edges, true),
          ])
        : null,
    [selected, model],
  );
  const hits = useMemo(
    () =>
      query.trim()
        ? searchNodes.filter((n) =>
            (
              routingIndex?.entries.get(n.routingKey)?.search ||
              n.label + " " + n.kind + " " + summary(n)
            )
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
          )
        : [],
    [searchNodes, routingIndex, query],
  );
  const hitIds = new Set(hits.map((n) => n.id));
  function focusNext() {
    if (!hits.length) return;
    const n = hits[++hitIndex.current % hits.length];
    if (onLocate) {
      onLocate(n);
      return;
    }
    onSelect(n);
    viewport.current?.scrollTo({
      left: Math.max(0, n.x * zoom - viewport.current.clientWidth / 3),
      top: Math.max(0, n.y * zoom - viewport.current.clientHeight / 3),
      behavior: "smooth",
    });
  }
  useEffect(() => {
    const handler = (e) => {
      if (
        active &&
        e.key === "Enter" &&
        e.target.getAttribute?.("data-resource-search") === "true"
      )
        focusNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hits, zoom, active, onLocate]);
  return (
    <div className="relationship-graph">
      {preview && (
        <NodePreview
          node={preview.node}
          rect={preview.rect}
          kind={meta[preview.node.kind]?.[0]}
          onEnter={cancelPreviewTimer}
          onLeave={leavePreview}
          onClose={closePreview}
        />
      )}
      <div
        className="relationship-toolbar zoom-toolbar"
        role="group"
        aria-label={t("Canvas zoom")}
      >
        <div className="relationship-zoom">
          <button
            aria-label={t("Zoom in")}
            onClick={() => setZoom((z) => Math.min(1.6, z + ZOOM_STEP))}
          >
            ＋
          </button>
          <button
            aria-label={t("Zoom out")}
            onClick={() => setZoom((z) => Math.max(0.12, z - ZOOM_STEP))}
          >
            −
          </button>
          <button
            aria-label={t("Fit graph")}
            title={t("Fit graph")}
            onClick={() => {
              onSelect(null);
              setZoom(
                Math.max(
                  0.12,
                  Math.min(
                    1,
                    (viewport.current.clientWidth - 20) / graph.width,
                    (viewport.current.clientHeight - 20) / graph.height,
                  ),
                ),
              );
              viewport.current.scrollTo(0, 0);
            }}
          >
            <Scan size={17} />
          </button>
        </div>
      </div>
      <div
        className={`relationship-viewport${panning ? " is-panning" : ""}`}
        ref={viewport}
        onScroll={() => {
          closePreview();
          recordViewport();
        }}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        aria-label={t("Configuration graph canvas")}
        tabIndex={0}
      >
        <div
          className="relationship-content"
          style={{
            width: graph.width * zoom,
            height: graph.height * zoom,
            position: "relative",
          }}
        >
          <div
            className="relationship-surface"
            ref={surface}
            style={{
              width: graph.width,
              height: graph.height,
              transform: `scale(${zoom})`,
            }}
          >
            {columns.map(([x, kinds]) => (
              <div
                className="relationship-column"
                style={{
                  left: x,
                  top: CANVAS_PADDING - 12,
                  width: graph.geometry.cardWidth,
                }}
                key={x}
              >
                {[...kinds].join(" / ")}
              </div>
            ))}
            <svg
              className="relationship-edges"
              width={graph.width}
              height={graph.height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="relationship-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#969a91" />
                </marker>
              </defs>
              {visible.connections.map((e) => {
                const dim =
                  highlighted &&
                  !(highlighted.has(e.source) && highlighted.has(e.target));
                return (
                  <g key={e.id} opacity={dim ? 0.14 : 1}>
                    <path
                      d={e.path}
                      fill="none"
                      stroke="#a8aca3"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeDasharray={
                        /RDS|routes|Mirror/.test(e.label) ? "6 4" : undefined
                      }
                      markerEnd="url(#relationship-arrow)"
                    />
                  </g>
                );
              })}
            </svg>
            {visible.connections
              .filter((e) => e.showLabel)
              .map((e) => (
                <div
                  key={`label-${e.id}`}
                  className="relationship-edge-caption"
                  title={e.label}
                  style={{
                    left: e.caption.x - e.caption.width / 2,
                    top: e.caption.top,
                    width: e.caption.width,
                    opacity:
                      highlighted &&
                      !(highlighted.has(e.source) && highlighted.has(e.target))
                        ? 0.18
                        : 1,
                  }}
                >
                  {e.label}
                </div>
              ))}
            {visible.nodes.map((n) => (
              <button
                key={n.id}
                data-node-id={n.id}
                data-node-kind={n.kind}
                className={`relationship-node ${selected?.id === n.id ? "selected" : ""} ${highlighted && !highlighted.has(n.id) ? "dimmed" : ""} ${hitIds.has(n.id) ? "hit" : ""} ${n.state === "unresolved" ? "missing" : ""}`}
                style={{
                  left: n.x,
                  width: graph.geometry.cardWidth,
                  height: graph.geometry.cardHeight,
                  top: n.y,
                  "--node-color": meta[n.kind]?.[1],
                }}
                onMouseEnter={(event) => queuePreview(n, event.currentTarget)}
                onMouseLeave={leavePreview}
                aria-label={`${meta[n.kind]?.[0]}: ${nodeLabel(n)}`}
                onClick={() => {
                  closePreview();
                  onNodeClick(n);
                }}
              >
                <span className="relationship-kind">
                  <span>{meta[n.kind]?.[0]}</span>
                  <em
                    title={t(
                      "Configuration origin, independent of lifecycle state or cluster type",
                    )}
                  >
                    {originLabel(n)}
                  </em>
                </span>
                <strong>{displayTitle(nodeLabel(n))}</strong>
                <span className="node-fields">
                  {nodeFields(n).map(({ key, value }) => (
                    <span className="node-field" key={key}>
                      <span className="node-field-key" title={key}>
                        {t(fieldLabels[key] || key)}
                      </span>
                      <span className="node-field-value" title={value}>
                        {value}
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
