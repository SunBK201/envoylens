import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Focus,
  ChevronDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import { t, nodeLabel } from "./i18n";
import {
  matchingRoutes,
  matchingVirtualHosts,
  matchConditions,
  routeDestinations,
  routeDestinationNode,
} from "./routing-model";
import ConfigViewer from "./ConfigViewer";
import VirtualRows from "./VirtualRows";

export function RoutingPicker({ index, configs, selection, onChange }) {
  if (configs.length <= 1) return null;
  return (
    <label className="routing-config-picker">
      <span>RouteConfig</span>
      <select
        aria-label={t("Select routing table")}
        value={selection.config}
        onPointerDown={(event) => {
          event.currentTarget.dataset.pointerSelection = "true";
        }}
        onKeyDown={(event) => {
          delete event.currentTarget.dataset.pointerSelection;
        }}
        onBlur={(event) => {
          delete event.currentTarget.dataset.pointerSelection;
        }}
        onChange={(event) => {
          onChange({ config: event.target.value, host: "", route: "" });
          if (event.currentTarget.dataset.pointerSelection)
            event.currentTarget.blur();
        }}
      >
        {configs.map((config) => (
          <option key={config.key} value={config.key}>
            {nodeLabel(config.node)} · {t("{0} routes", [config.routes.length])}{" "}
            · {config.node.path}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RouteGraphControls({
  index,
  configs,
  selection,
  onChange,
  expanded,
  canCollapse,
  hostSelected,
  keepBranches,
  onKeepBranches,
  onExpand,
  onCollapse,
  onBrowse,
  focusedRoute,
  onReturn,
}) {
  const config = index.entries.get(selection.config);
  if (!config || !configs.length) return null;
  return (
    <section
      className="routing-graph-controls"
      aria-label={t("Routing graph controls")}
    >
      {focusedRoute ? (
        <>
          <span>
            {t("Focused route")}:{" "}
            {nodeLabel(index.entries.get(focusedRoute)?.node)}
          </span>
          <button onClick={onReturn}>
            <ArrowLeft size={14} />
            {t("Return to previous graph")}
          </button>
          <button onClick={onBrowse}>{t("Browse routes")}</button>
        </>
      ) : (
        <>
          <RoutingPicker {...{ index, configs, selection, onChange }} />
          <label className="routing-host-picker">
            <span>VirtualHost</span>
            <select
              aria-label={
                canCollapse
                  ? t("Select virtual host to expand")
                  : t("Locate VirtualHost")
              }
              value={hostSelected ? selection.host : ""}
              onPointerDown={(event) => {
                event.currentTarget.dataset.pointerSelection = "true";
              }}
              onKeyDown={(event) => {
                delete event.currentTarget.dataset.pointerSelection;
              }}
              onBlur={(event) => {
                delete event.currentTarget.dataset.pointerSelection;
              }}
              onChange={(event) => {
                onChange({ ...selection, host: event.target.value, route: "" });
                onExpand(event.target.value);
                if (event.currentTarget.dataset.pointerSelection)
                  event.currentTarget.blur();
              }}
            >
              <option value="" disabled>
                {config.hosts.length
                  ? t("Select a VirtualHost…")
                  : t("No virtual hosts")}
              </option>
              {config.hosts.map((host) => (
                <option key={host.key} value={host.key}>
                  {nodeLabel(host.node)} · {host.routes.length}
                </option>
              ))}
            </select>
          </label>
          {canCollapse && (
            <>
              <label className="routing-keep">
                <input
                  type="checkbox"
                  checked={keepBranches}
                  onChange={(event) => onKeepBranches(event.target.checked)}
                />
                {t("Keep other branches")}
              </label>
              {!!expanded.length && (
                <button onClick={onCollapse}>
                  {t("Collapse all branches")}
                </button>
              )}
            </>
          )}
          <button className="routing-primary" onClick={onBrowse}>
            {t("Browse routes")}
            <ArrowUpRight size={14} />
          </button>
        </>
      )}
    </section>
  );
}

export default function RouteWorkbench({
  index,
  configs,
  selection,
  onChange,
  query,
  onQueryChange,
  onShowGraph,
  onSelect,
  onBack,
  active,
  context,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const workbenchRef = useRef(null),
    hostDrag = useRef(null);
  const [hostWidth, setHostWidth] = useState(() => {
    try {
      const saved = Number(
        window.localStorage.getItem("envoylens-routing-host-width"),
      );
      return Number.isFinite(saved) && saved >= 160
        ? Math.min(520, saved)
        : 240;
    } catch {
      return 240;
    }
  });
  const [containerWidth, setContainerWidth] = useState(0);
  const [resizingHosts, setResizingHosts] = useState(false);
  // Keep room for the rule table and preserve the preferred width on small screens.
  const hostMax = Math.max(
    160,
    Math.min(520, containerWidth ? containerWidth - 320 : 520),
  );
  const displayedHostWidth = Math.min(hostWidth, hostMax);
  useLayoutEffect(() => {
    if (!active) {
      hostDrag.current = null;
      setResizingHosts(false);
      return;
    }
    const el = workbenchRef.current;
    const measure = () => {
      if (el.clientWidth) setContainerWidth(el.clientWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "envoylens-routing-host-width",
        String(hostWidth),
      );
    } catch {
      // Resizing still works when browser storage is unavailable.
    }
  }, [hostWidth]);
  function resizeHosts(width) {
    setHostWidth(Math.round(Math.max(160, Math.min(hostMax, width))));
  }
  function finishHostResize(event) {
    hostDrag.current = null;
    setResizingHosts(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const config = index.entries.get(selection.config);
  const [hostSearch, setHostSearch] = useState({ configKey: "", query: "" });
  const hostQuery =
    hostSearch.configKey === config?.key ? hostSearch.query : "";
  function setHostQuery(value) {
    setHostSearch({ configKey: config?.key || "", query: value });
  }
  const routes = useMemo(
    () => (config ? matchingRoutes(config, query) : []),
    [config, query],
  );
  const hosts = useMemo(() => {
    if (!config) return [];
    const candidates = matchingVirtualHosts(config.hosts, hostQuery);
    if (!query.trim()) return candidates;
    const keys = new Set(routes.map((route) => route.hostKey));
    return candidates.filter(
      (host) =>
        keys.has(host.key) ||
        [host.node.label, JSON.stringify(host.node.detail.domains)]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
  }, [config, routes, query, hostQuery]);
  const host = hosts.find((host) => host.key === selection.host) || hosts[0];
  const visibleRoutes = useMemo(
    () => routes.filter((route) => route.hostKey === host?.key),
    [routes, host],
  );
  const route =
    visibleRoutes.find((route) => route.key === selection.route) ||
    visibleRoutes[0];
  const searchResults = useMemo(
    () =>
      query.trim()
        ? configs
            .map((item) => ({
              config: item,
              count: matchingRoutes(item, query).length,
            }))
            .filter((item) => item.count)
        : [],
    [configs, query],
  );
  useEffect(() => {
    if (!active || !host || !route) return;
    if (selection.host !== host.key || selection.route !== route.key)
      onChange({ config: config.key, host: host.key, route: route.key });
  }, [active, config, host, route, selection.host, selection.route]);
  function chooseHost(host) {
    onChange({ config: config.key, host: host.key, route: "" });
  }
  function chooseRoute(route) {
    onChange({
      config: route.configKey,
      host: route.hostKey,
      route: route.key,
    });
    onSelect(route.node, false);
  }
  return (
    <section
      ref={workbenchRef}
      className={`route-workbench ${resizingHosts ? "is-resizing-hosts" : ""}`}
      style={{ "--routing-host-width": `${displayedHostWidth}px` }}
      aria-label={t("Route workbench")}
    >
      <div className="routing-workbench-header">
        <button
          onClick={onBack}
          aria-keyshortcuts="Escape"
          title={t("Back to graph (Esc)")}
        >
          <ArrowLeft size={15} />
          {t("Back to graph")}
        </button>
        <span className="routing-context" title={context}>
          {context || t("All resources")}
        </span>
        {!!configs.length && (
          <RoutingPicker {...{ index, configs, selection, onChange }} />
        )}
      </div>
      {!config ? (
        <div className="routing-empty">
          {t("No routing tables in this scope")}
        </div>
      ) : (
        <>
          <div className="routing-summary">
            <strong>{nodeLabel(config.node)}</strong>
            <span>
              {t("{0} virtual hosts · {1} routes", [
                config.hosts.length,
                config.routes.length,
              ])}
            </span>
            <span>{t("{0} direct references", [config.ownerIds.length])}</span>
            {config.node.state === "unresolved" && (
              <strong>{t("Unresolved reference")}</strong>
            )}
          </div>
          {!!query.trim() && (
            <div
              className="routing-search-results"
              aria-label={t("Routing search results")}
            >
              <span>{t("Matching routing tables")}</span>
              {searchResults.map(({ config: item, count }) => (
                <button
                  key={item.key}
                  className={item.key === config.key ? "is-selected" : ""}
                  title={item.node.path}
                  onClick={() =>
                    onChange({ config: item.key, host: "", route: "" })
                  }
                >
                  {nodeLabel(item.node)} · {count}
                </button>
              ))}
              {!searchResults.length && <span>{t("No matching routes")}</span>}
              <button onClick={() => onQueryChange("")}>
                {t("Clear search")}
              </button>
            </div>
          )}
          <div className="routing-workbench-body">
            <aside
              className="routing-host-list"
              id="routing-host-sidebar"
              aria-label={t("Virtual host navigation")}
            >
              <div className="routing-list-heading">
                <strong>VirtualHosts</strong>
                <span>
                  {hosts.length}/{config.hosts.length}
                </span>
              </div>
              <div className="routing-host-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={t("Search VirtualHosts")}
                  placeholder={t("Search name or domain…")}
                  value={hostQuery}
                  onChange={(event) => setHostQuery(event.target.value)}
                />
                {hostQuery && (
                  <button
                    onClick={() => setHostQuery("")}
                    aria-label={t("Clear VirtualHost search")}
                    title={t("Clear VirtualHost search")}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
              {!hosts.length && (
                <div className="routing-host-empty" role="status">
                  {t("No matching VirtualHosts")}
                </div>
              )}
              <VirtualRows
                items={hosts}
                rowHeight={68}
                activeKey={host?.key}
                active={active}
                label={t("Virtual host navigation")}
                renderRow={(item) => (
                  <button
                    className={`routing-host-row ${host?.key === item.key ? "is-selected" : ""}`}
                    aria-pressed={host?.key === item.key}
                    onClick={() => chooseHost(item)}
                    title={[
                      item.node.label,
                      ...(item.node.detail.domains || []),
                    ].join("\n")}
                  >
                    <span>
                      <strong>{nodeLabel(item.node)}</strong>
                      <small>
                        {(item.node.detail.domains || []).join(", ") ||
                          t("No domains")}
                      </small>
                    </span>
                    <b>{item.routes.length}</b>
                  </button>
                )}
              />
            </aside>
            <div
              className="routing-host-resize-handle"
              role="separator"
              aria-label={t("Resize VirtualHost navigation")}
              aria-orientation="vertical"
              aria-controls="routing-host-sidebar"
              aria-valuemin={160}
              aria-valuemax={hostMax}
              aria-valuenow={displayedHostWidth}
              tabIndex={0}
              title={t(
                "Drag to resize; use arrow keys to adjust; double-click to reset",
              )}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                hostDrag.current = {
                  x: event.clientX,
                  width: displayedHostWidth,
                  pointerId: event.pointerId,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                setResizingHosts(true);
              }}
              onPointerMove={(event) => {
                const drag = hostDrag.current;
                if (drag && drag.pointerId === event.pointerId)
                  resizeHosts(drag.width + event.clientX - drag.x);
              }}
              onPointerUp={finishHostResize}
              onPointerCancel={finishHostResize}
              onLostPointerCapture={() => {
                hostDrag.current = null;
                setResizingHosts(false);
              }}
              onDoubleClick={() => resizeHosts(240)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                resizeHosts(
                  event.key === "Home"
                    ? 160
                    : event.key === "End"
                      ? hostMax
                      : displayedHostWidth +
                        (event.key === "ArrowRight" ? 10 : -10),
                );
              }}
            />
            <div className="routing-rules">
              {!host ? (
                <div className="routing-empty">
                  <p>
                    {hostQuery.trim()
                      ? t("No matching VirtualHosts")
                      : t("No matching routes")}
                  </p>
                  {hostQuery && (
                    <button onClick={() => setHostQuery("")}>
                      {t("Clear VirtualHost search")}
                    </button>
                  )}
                  {query && (
                    <button onClick={() => onQueryChange("")}>
                      {t("Clear search")}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="routing-rule-heading">
                    <div>
                      <strong title={host.node.label}>
                        {nodeLabel(host.node)}
                      </strong>
                      <small>{t("Routes stay in configuration order")}</small>
                    </div>
                    <span>
                      {visibleRoutes.length}/{host.routes.length}
                    </span>
                  </div>
                  <div
                    className="routing-table"
                    role="table"
                    aria-label={t("Routing rules")}
                    aria-rowcount={visibleRoutes.length + 1}
                    aria-colcount={4}
                  >
                    <div className="routing-table-heading" role="row">
                      <span role="columnheader">#</span>
                      <span role="columnheader">{t("Match conditions")}</span>
                      <span role="columnheader">
                        {t("Destination or action")}
                      </span>
                      <span role="columnheader">{t("Timeout")}</span>
                    </div>
                    <VirtualRows
                      items={visibleRoutes}
                      rowHeight={100}
                      activeKey={route?.key}
                      active={active}
                      table
                      label={t("Route rows")}
                      renderRow={(item) => {
                        const destinations = routeDestinations(
                          item.node.detail,
                        );
                        const conditions = t(matchConditions(item.node.detail));
                        return (
                          <div
                            className={`routing-rule-row ${route?.key === item.key ? "is-selected" : ""}`}
                          >
                            <span role="cell">{item.order}</span>
                            <span role="cell">
                              <button
                                aria-label={t("Show route {0} in graph", [
                                  item.order,
                                ])}
                                onClick={() => onShowGraph(item)}
                                title={`${t("Show in graph")} · ${conditions}`}
                              >
                                <span>{conditions}</span>
                              </button>
                            </span>
                            <span role="cell" className="routing-destinations">
                              {destinations.map((d, i) => (
                                <button
                                  key={i}
                                  onClick={() =>
                                    onShowGraph(
                                      item,
                                      routeDestinationNode(index, item, d),
                                    )
                                  }
                                  title={`${t("Show in graph")} · ${t(d.label)}: ${d.name}`}
                                >
                                  <span>
                                    <em>{t(d.label)}</em> {d.name}
                                  </span>
                                </button>
                              ))}
                            </span>
                            <span role="cell">
                              {item.node.detail.route?.timeout ?? "—"}
                            </span>
                          </div>
                        );
                      }}
                    />
                  </div>
                  {route && (
                    <div
                      className={`routing-detail ${detailsOpen ? "is-open" : ""}`}
                    >
                      <div className="routing-detail-heading">
                        <strong>{t("Route {0}", [route.order])}</strong>
                        <button
                          className="routing-primary"
                          onClick={() => {
                            chooseRoute(route);
                            onShowGraph(route);
                          }}
                        >
                          <Focus size={14} />
                          {t("Show in graph")}
                        </button>
                        <button
                          onClick={() => {
                            chooseRoute(route);
                            setDetailsOpen(!detailsOpen);
                          }}
                          aria-expanded={detailsOpen}
                        >
                          {detailsOpen ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronUp size={14} />
                          )}
                          {t("Configuration details")}
                        </button>
                      </div>
                      {detailsOpen && active && (
                        <div className="routing-detail-content">
                          <div className="routing-source-path">
                            {route.node.path}
                          </div>
                          <ConfigViewer
                            key={route.key}
                            value={route.node.detail}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="routing-footnote">
            {t(
              "Static configuration relationships, not observed request matches",
            )}
          </div>
        </>
      )}
    </section>
  );
}
