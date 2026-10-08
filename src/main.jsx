import { schemaTypes } from "./schema-docs";
import {
  t,
  nodeLabel,
  getLanguage,
  setLanguage,
  subscribeLanguage,
} from "./i18n";
import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Network,
  LayoutGrid,
  Upload,
  FileCode2,
  FolderCog,
  Trash2,
  Pencil,
  Radio,
  Search,
  ChevronRight,
  Layers,
  Server,
  ArrowUpRight,
  X,
  RefreshCw,
  Download,
  GitBranch,
  List,
  PanelLeftClose,
  ArrowDownAZ,
  ArrowUpAZ,
  Braces,
  Monitor,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";
import "./style.css";
import "./floating-shell.css";
import { readTheme, applyTheme } from "./theme";
import {
  readViewRoute,
  writeViewRoute,
  resourceRouteLocation,
  restoreResourceRoute,
} from "./view-route";
import { parseConfig } from "./parser";
import { fetchAdminConfig } from "./admin-fetch";
import {
  originLabel,
  lifecycleLabel,
  duplicateLifecycleIds,
} from "./node-fields";
import ResourceState from "./ResourceState";
import { configIdentity, restoreView, saveView } from "./view-storage";
import { sample } from "./sample";
import RelationshipGraph, { summary } from "./RelationshipGraph";
import ConfigViewer from "./ConfigViewer";
import RouteWorkbench, { RouteGraphControls } from "./RouteWorkbench";
import {
  buildRoutingIndex,
  routingScope,
  shouldCollapseRouting,
  resolveRoutingSelection,
  projectRoutingGraph,
  selectionForEntry,
  retainRoutingState,
} from "./routing-model";
import "./routing.css";
import {
  envoyReference,
  ENVOY_DOCS_BASE,
  getDocsBase,
  subscribeDocsBase,
  saveDocsBase,
} from "./envoy-docs";
import { retainRefreshView } from "./refresh-view";
import { sortedResources } from "./resource-sort";
import {
  navigationSearchText,
  filterNavigationResources,
} from "./navigation-search";
import { readNavGroups, saveNavGroups } from "./nav-groups";
import JsonCode from "./JsonCode";
import ResizableInspector from "./ResizableInspector";
import {
  readLastConfig,
  configStorageError,
  saveConfig,
  readConfigLibrary,
  activateConfig,
  removeConfig,
  renameConfig,
} from "./config-storage";
const meta = {
  listener: ["Listener", "#6f9466"],
  listener_filter: ["Listener filter", "#9a9870"],
  filter_chain: ["Filter Chain", "#a78b62"],
  match: ["Filter Chain Match", "#c29132"],
  network_filter: ["Network Filter", "#0f766e"],
  http_filter: ["HTTP Filter", "#749646"],
  route_config: ["Route config", "#cc7d44"],
  virtual_host: ["VirtualHost", "#c09249"],
  route: ["Route", "#d38a36"],
  cluster: ["Cluster", "#be185d"],
  endpoint: ["Endpoint", "#a38369"],
  action: ["Response", "#92958a"],
  dynamic: ["Dynamic", "#ba8870"],
  resource: ["Resource", "#92958a"],
  target_group: ["Target summary", "#a38369"],
};
const short = (s) =>
  s?.replace(/^envoy\.filters\.(network|http|listener)\./, "") || "Unnamed";
function address(o) {
  const a = o.address?.socket_address || o.address?.socketAddress;
  return a
    ? `${a.address}:${a.port_value ?? a.portValue}`
    : "Configuration resource";
}
function Graph(props) {
  return <RelationshipGraph {...props} meta={meta} />;
}
function App() {
  const docsBase = useSyncExternalStore(subscribeDocsBase, getDocsBase);
  const [docsDraft, setDocsDraft] = useState(docsBase);
  const [docsError, setDocsError] = useState("");

  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguage,
    () => "zh",
  );
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  const [theme, setTheme] = useState(() =>
    readTheme({ getItem: (key) => window.localStorage.getItem(key) }),
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      applyTheme(theme, media.matches, document.documentElement, {
        setItem: (key, value) => window.localStorage.setItem(key, value),
      });
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  const [model, setModel] = useState(() => parseConfig(sample)),
    [source, setSource] = useState("Demo configuration"),
    [text, setText] = useState(""),
    [modal, setModal] = useState(false),
    [tab, setTab] = useState("paste"),
    [addressValue, setAddress] = useState("http://127.0.0.1:15000"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [detailsOpen, setDetailsOpen] = useState(false),
    [query, setQuery] = useState(""),
    [listener, setListener] = useState(""),
    [chain, setChain] = useState(""),
    [viewReady, setViewReady] = useState(false),
    [view, setView] = useState(() =>
      readViewRoute(window.location.hash, {
        getItem: (key) => window.localStorage.getItem(key),
      }),
    ),
    [auto, setAuto] = useState(false),
    [remote, setRemote] = useState(""),
    [updated, setUpdated] = useState(""),
    [copied, setCopied] = useState(false),
    [storageMessage, setStorageMessage] = useState("");
  const pendingLocation = useRef({ hash: window.location.hash, initial: true });
  const replaceLocation = useRef(true);
  const previousRouteModel = useRef(null);
  const [locationRevision, setLocationRevision] = useState(0);
  useEffect(() => {
    const syncFromLocation = () => {
      pendingLocation.current = { hash: window.location.hash, initial: false };
      setLocationRevision((value) => value + 1);
    };
    window.addEventListener("hashchange", syncFromLocation);
    return () => window.removeEventListener("hashchange", syncFromLocation);
  }, []);
  const [library, setLibrary] = useState([]);
  const [activeConfigId, setActiveConfigId] = useState("");
  const [importName, setImportName] = useState("");
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [routing, setRouting] = useState({
    selection: {},
    expanded: [],
    focusedRoute: "",
    keepBranches: true,
  });
  const routingIndex = useMemo(() => buildRoutingIndex(model), [model]);
  const routeScope = useMemo(
    () => routingScope(routingIndex, listener, chain),
    [routingIndex, listener, chain],
  );
  const routingSelection = useMemo(
    () =>
      resolveRoutingSelection(
        routingIndex,
        routeScope.configs,
        routing.selection,
      ),
    [routingIndex, routeScope, routing.selection],
  );
  const graphViewport = useRef(null),
    graphReturn = useRef(null),
    graphSelection = useRef(null);
  if (view === "graph" && !routing.focusedRoute)
    graphSelection.current = selected;
  const [restoreGraphViewport, setRestoreGraphViewport] = useState(null);
  const currentView = useRef(null);
  currentView.current = {
    activeConfigId,
    model,
    routingIndex,
    listener,
    chain,
    selected,
    detailsOpen,
    remote,
  };
  const busyRef = useRef(false),
    generation = useRef(0),
    storageVersion = useRef(0),
    [side, setSide] = useState(true);
  const [navWidth, setNavWidth] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem("envoylens-nav-width"));
      return Number.isFinite(saved) && saved >= 160
        ? Math.min(520, saved)
        : 180;
    } catch {
      return 180;
    }
  });
  const [navHeight, setNavHeight] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem("envoylens-nav-height"));
      return Number.isFinite(saved) && saved >= 160 ? saved : null;
    } catch {
      return null;
    }
  });
  const navHeightDrag = useRef(null);
  const [resizingNavHeight, setResizingNavHeight] = useState(false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  // The dock starts 64px below the viewport top; allow resizing to the bottom.
  const navHeightMax = Math.max(160, windowHeight - 64);
  const displayedNavHeight =
    navHeight === null ? undefined : Math.min(navHeight, navHeightMax);
  const resizeNavHeight = (height) =>
    setNavHeight(Math.max(160, Math.min(navHeightMax, height)));
  useEffect(() => {
    try {
      if (navHeight === null)
        window.localStorage.removeItem("envoylens-nav-height");
      else
        window.localStorage.setItem("envoylens-nav-height", String(navHeight));
    } catch {}
  }, [navHeight]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const navMax = Math.max(160, Math.min(520, windowWidth - 180));
  const displayedNavWidth = Math.min(navWidth, navMax);
  const navDrag = useRef(null);
  const [resizingNav, setResizingNav] = useState(false);
  useEffect(() => {
    const resize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("envoylens-nav-width", String(navWidth));
    } catch {}
  }, [navWidth]);
  function resizeNav(width) {
    setNavWidth(Math.max(160, Math.min(navMax, width)));
  }
  const [identity, setIdentity] = useState(() => configIdentity(sample));
  useEffect(() => {
    if (viewReady)
      saveView(
        { setItem: (key, value) => window.localStorage.setItem(key, value) },
        identity,
        listener,
        chain,
      );
  }, [viewReady, identity, listener, chain]);
  const [navGroups, setNavGroups] = useState(() =>
    readNavGroups({
      getItem: (key) => window.localStorage.getItem(key),
    }),
  );
  const [navQuery, setNavQuery] = useState("");
  const [searchNavGroups, setSearchNavGroups] = useState({});
  const navSearchInput = useRef(null);
  const navSearching = Boolean(navQuery.trim());
  function changeNavQuery(value) {
    setNavQuery(value);
    setSearchNavGroups({});
  }
  function navGroupOpen(kind) {
    return navSearching ? (searchNavGroups[kind] ?? true) : navGroups[kind];
  }
  useEffect(() => {
    saveNavGroups(
      { setItem: (key, value) => window.localStorage.setItem(key, value) },
      navGroups,
    );
  }, [navGroups]);
  function toggleNavGroup(event, kind) {
    event.preventDefault();
    if (navSearching) {
      setSearchNavGroups((current) => ({
        ...current,
        [kind]: !(current[kind] ?? true),
      }));
      return;
    }
    setNavGroups((current) => ({ ...current, [kind]: !current[kind] }));
  }
  const [sortDirection, setSortDirection] = useState(() => {
    try {
      return localStorage.getItem("envoylens-nav-sort") === "desc"
        ? "desc"
        : "asc";
    } catch {
      return "asc";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("envoylens-nav-sort", sortDirection);
    } catch {}
  }, [sortDirection]);
  const duplicateIds = useMemo(
    () => duplicateLifecycleIds(model.nodes),
    [model],
  );
  const navigation = useMemo(() => {
    const groups = Object.fromEntries(
      ["listener", "filter_chain", "cluster", "endpoint"].map((kind) => [
        kind,
        sortedResources(model.nodes, kind, sortDirection),
      ]),
    );
    const owners = new Map(
      groups.filter_chain.map((node) => [
        node.id,
        groups.listener.find((owner) => node.path.startsWith(`${owner.path}.`)),
      ]),
    );
    const index = new Map(
      Object.values(groups).flatMap((nodes) =>
        nodes.map((node) => [
          node.id,
          navigationSearchText(node, owners.get(node.id)),
        ]),
      ),
    );
    return { groups, owners, index };
  }, [model, sortDirection, language]);
  const navigationResources = useMemo(
    () =>
      filterNavigationResources(navigation.groups, navigation.index, navQuery),
    [navigation, navQuery],
  );
  const navMatchCount = Object.values(navigationResources).reduce(
    (sum, nodes) => sum + nodes.length,
    0,
  );
  function navCount(kind) {
    return navSearching
      ? `${navigationResources[kind].length}/${navigation.groups[kind].length}`
      : navigation.groups[kind].length;
  }
  function orderedResources(kind) {
    return navGroupOpen(kind) ? navigationResources[kind] : [];
  }
  function resetRoutingGraph() {
    setRouting((current) => ({ ...current, expanded: [], focusedRoute: "" }));
    graphReturn.current = null;
    setRestoreGraphViewport(null);
  }
  function changeListener(id) {
    resetRoutingGraph();
    setCanvasRevision((value) => value + 1);
    setFocusTarget(null);
    setListener(id);
    setChain("");
    setSelected(null);
    setDetailsOpen(false);
  }
  const [focusTarget, setFocusTarget] = useState(null);
  function navigateCluster(node) {
    resetRoutingGraph();
    setListener("");
    setChain("");
    setQuery("");
    setView("graph");
    selectResource(node);
    setFocusTarget({ id: node.id });
  }
  function navigateFilterChain(node) {
    resetRoutingGraph();
    setListener("");
    setChain(node.id);
    setQuery("");
    setView("graph");
    selectResource(node);
    setFocusTarget({ id: node.id });
  }
  function selectResource(node, openDetails = true) {
    node =
      routingIndex.byId.get(routingIndex.canonicalId.get(node?.id)) || node;
    setSelected(node);
    setDetailsOpen(Boolean(node) && openDetails);
  }
  function toggleResourceDetails(node) {
    node =
      routingIndex.byId.get(routingIndex.canonicalId.get(node?.id)) || node;
    const next = selected?.id === node.id && detailsOpen ? null : node;
    setSelected(next);
    setDetailsOpen(Boolean(next));
  }
  const graphModel = useMemo(
    () =>
      projectRoutingGraph(routingIndex, routeScope, {
        ...routing,
        revealId: focusTarget?.id,
      }),
    [
      routingIndex,
      routeScope,
      routing.expanded,
      routing.focusedRoute,
      focusTarget,
    ],
  );
  useEffect(() => {
    // Wait for IndexedDB restoration; the initial demo is not the linked snapshot.
    if (!viewReady) return;
    const pending = pendingLocation.current;
    if (pending) {
      pendingLocation.current = null;
      replaceLocation.current = true;
      previousRouteModel.current = model;
      setView(
        readViewRoute(pending.hash, {
          getItem: (key) => window.localStorage.getItem(key),
        }),
      );
      // Bare initial URLs retain legacy local Listener/Filter Chain preferences.
      if (
        !pending.initial ||
        pending.hash.includes("?") ||
        pending.hash.split("/").length > 2
      ) {
        const restored = restoreResourceRoute(
          pending.hash,
          routingIndex,
          identity,
        );
        setSelected(restored.selected);
        setDetailsOpen(restored.detailsOpen);
        setListener(restored.listener);
        setChain(restored.chain);
        setRouting((current) => ({
          ...current,
          selection: restored.selection,
          focusedRoute: restored.focusedRoute,
          expanded: restored.expanded,
        }));
        setQuery("");
        setFocusTarget(restored.selected ? { id: restored.selected.id } : null);
        graphReturn.current = null;
        setRestoreGraphViewport(null);
        setCanvasRevision((value) => value + 1);
      }
      // Ensure a second render even when the requested view is already active.
      setLocationRevision((value) => value + 1);
      return;
    }
    const location = resourceRouteLocation(routingIndex, identity, {
      view,
      selected,
      detailsOpen,
      listener,
      chain,
      selection: view === "routes" ? routingSelection : routing.selection,
      focusedRoute: routing.focusedRoute,
      expanded: routing.expanded,
    });
    writeViewRoute(window, view, {
      ...location,
      replace: replaceLocation.current || previousRouteModel.current !== model,
    });
    replaceLocation.current = false;
    previousRouteModel.current = model;
  }, [
    viewReady,
    locationRevision,
    view,
    model,
    identity,
    routingIndex,
    selected,
    detailsOpen,
    listener,
    chain,
    routingSelection,
    routing.selection,
    routing.focusedRoute,
    routing.expanded,
  ]);
  function changeRoutingSelection(selection) {
    setRouting((current) => ({ ...current, selection }));
  }
  function browseRoutes(entry) {
    if (entry) changeRoutingSelection(selectionForEntry(entry));
    setDetailsOpen(false);
    setView("routes");
  }
  function handleGraphNodeClick(node) {
    if (node.configKey) {
      browseRoutes(routingIndex.entries.get(node.configKey));
      return;
    }
    const entry = routingIndex.entries.get(node.routingKey);
    if (entry) changeRoutingSelection(selectionForEntry(entry));
    toggleResourceDetails(node);
  }
  function expandHost(key) {
    setRouting((current) => ({
      ...current,
      focusedRoute: "",
      expanded: [
        ...(current.keepBranches
          ? current.expanded.filter((item) => item !== key)
          : []),
        key,
      ],
    }));
    graphReturn.current = null;
    const node = routingIndex.entries.get(key)?.node;
    setFocusTarget(node ? { id: node.id } : null);
    setRestoreGraphViewport(null);
    setDetailsOpen(false);
  }
  function showRouteInGraph(entry, target = entry.node) {
    if (!routing.focusedRoute)
      graphReturn.current = {
        expanded: routing.expanded,
        selected: graphSelection.current,
        viewport: graphViewport.current && { ...graphViewport.current },
      };
    setRouting((current) => ({
      ...current,
      selection: selectionForEntry(entry),
      focusedRoute: entry.key,
    }));
    selectResource(target, false);
    setFocusTarget({ id: target.id });
    setRestoreGraphViewport(null);
    setView("graph");
  }
  function returnToPreviousGraph() {
    const previous = graphReturn.current;
    setRouting((current) => ({
      ...current,
      focusedRoute: "",
      expanded: previous?.expanded || current.expanded,
    }));
    setFocusTarget(null);
    setSelected(previous?.selected || null);
    setDetailsOpen(false);
    setRestoreGraphViewport(
      previous?.viewport ? { ...previous.viewport } : null,
    );
    graphReturn.current = null;
  }
  function locateSearchResult(node) {
    const entry = routingIndex.entries.get(node.routingKey);
    if (entry) browseRoutes(entry);
    else {
      selectResource(node);
      setFocusTarget({ id: node.id });
    }
  }
  function install(content, name, options = {}) {
    setFocusTarget(null);
    const m = parseConfig(content);
    setModel(m);
    setIdentity(configIdentity(content));
    setSource(name);
    if (options.preserveView) {
      const nextIndex = buildRoutingIndex(m);
      setRouting((current) =>
        retainRoutingState(
          currentView.current.routingIndex,
          nextIndex,
          current,
        ),
      );
      if (graphReturn.current) {
        graphReturn.current.expanded = retainRoutingState(
          currentView.current.routingIndex,
          nextIndex,
          {
            selection: {},
            expanded: graphReturn.current.expanded,
            focusedRoute: "",
          },
        ).expanded;
        graphReturn.current.selected = null;
      }
      const current = currentView.current;
      const retained = retainRefreshView(current.model, m, current);
      setListener(retained.listener);
      setChain(retained.chain);
      setSelected(retained.selected);
      setDetailsOpen(retained.detailsOpen);
    } else {
      setRouting({
        selection: {},
        expanded: [],
        focusedRoute: "",
        keepBranches: true,
      });
      graphReturn.current = null;
      setRestoreGraphViewport(null);
      setCanvasRevision((value) => value + 1);
      setSelected(null);
      setDetailsOpen(false);
      const previousView = options.restore
        ? restoreView(
            { getItem: (key) => window.localStorage.getItem(key) },
            configIdentity(content),
            m,
          )
        : { listener: "", chain: "" };
      setListener(previousView.listener);
      setChain(previousView.chain);
      setQuery("");
    }
    setViewReady(true);
    setError("");
    setModal(false);
    const savedAt = options.savedAt || new Date().toISOString();
    setUpdated(new Date(savedAt).toLocaleTimeString("zh-CN"));
    if (!options.restore) {
      const version = ++storageVersion.current;
      setStorageMessage("Saving…");
      saveConfig({
        id: options.preserveView
          ? currentView.current.activeConfigId
          : undefined,
        name: options.preserveView ? undefined : importName,
        text: content,
        source: name,
        remote: options.remote || "",
        savedAt,
      })
        .then(({ item, items }) => {
          if (version !== storageVersion.current) return;
          setLibrary(items);
          setActiveConfigId(item.id);
          setImportName("");

          setStorageMessage("Saved in this browser");
        })
        .catch((error) => {
          if (version === storageVersion.current) {
            setStorageMessage("Not saved in this browser");
            setError(configStorageError(error));
          }
        });
    }
  }
  function loadLocal(content, name) {
    generation.current++;
    try {
      install(content, name);
      setAuto(false);
      setRemote("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function fetchAdmin(addr = addressValue) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const gen = ++generation.current;
    try {
      const data = await fetchAdminConfig(addr);
      if (gen !== generation.current) return;
      install(data.text, addr, {
        remote: addr,
        preserveView: currentView.current.remote === addr,
      });
      setRemote(addr);
    } catch (e) {
      if (gen === generation.current) {
        setError(e.message);
        setAuto(false);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    const gen = generation.current;
    readConfigLibrary()
      .then((items) => {
        if (!cancelled && gen === generation.current) setLibrary(items);
        return readLastConfig();
      })
      .then((saved) => {
        if (cancelled || gen !== generation.current) return;
        if (!saved) {
          const previousView = restoreView(
            { getItem: (key) => window.localStorage.getItem(key) },
            configIdentity(sample),
            parseConfig(sample),
          );
          setListener(previousView.listener);
          setChain(previousView.chain);
          setViewReady(true);
          return;
        }

        setActiveConfigId(saved.id || "");
        if (
          saved.version !== 1 ||
          typeof saved.text !== "string" ||
          typeof saved.source !== "string"
        )
          throw new Error("Invalid snapshot");
        install(saved.text, saved.source, {
          restore: true,
          savedAt: saved.savedAt,
        });
        setRemote(typeof saved.remote === "string" ? saved.remote : "");
        if (saved.remote) setAddress(saved.remote);
        setAuto(false);
        setStorageMessage("Restored the last configuration (local snapshot)");
      })
      .catch(() => {
        if (!cancelled && gen === generation.current) {
          setStorageMessage(
            "Could not restore the configuration. Please import it again.",
          );
          setViewReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function switchConfig(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    try {
      parseConfig(item.text);
      generation.current++;
      ++storageVersion.current;
      setAuto(false);
      install(item.text, item.source, { restore: true, savedAt: item.savedAt });
      setActiveConfigId(id);
      setRemote(item.remote || "");
      if (item.remote) setAddress(item.remote);

      await activateConfig(id);
      setStorageMessage("Switched to saved snapshot");
    } catch (error) {
      setError(`Switch failed: ${error.message}`);
    }
  }
  async function deleteSavedConfig(id) {
    const current = id === activeConfigId;
    if (current) {
      generation.current++;
      ++storageVersion.current;
      setAuto(false);
    }
    try {
      setLibrary(await removeConfig(id));
      if (current) {
        setActiveConfigId("");
      }
      setStorageMessage(
        "Saved configuration deleted; the current graph is retained",
      );
    } catch {
      setError("Delete failed. Check browser storage permissions.");
    }
  }
  function editSavedConfig(item) {
    generation.current++;
    setAuto(false);
    setEditing({ ...item });
    setError("");
    setModal("edit");
  }
  async function saveEditedConfig() {
    if (!editing || savingEdit) return;
    try {
      parseConfig(editing.text);
      const remoteAddress = (editing.remote || "").trim();
      if (remoteAddress) {
        const url = new URL(remoteAddress);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error(
            "Admin address must use HTTP/HTTPS and must not contain credentials.",
          );
      }
      setSavingEdit(true);
      setError("");
      const isCurrent = currentView.current.activeConfigId === editing.id;
      generation.current++;
      ++storageVersion.current;
      const { item, items } = await saveConfig(
        {
          ...editing,
          name: editing.name.trim() || editing.source,
          remote: remoteAddress,
          savedAt: new Date().toISOString(),
        },
        { activate: isCurrent },
      );
      setLibrary(items);
      if (isCurrent) {
        install(item.text, item.source, {
          restore: true,
          preserveView: true,
          savedAt: item.savedAt,
        });
        setRemote(item.remote);
        if (item.remote) setAddress(item.remote);
      }
      setEditing(null);
      setModal("manage");
      setStorageMessage("Configuration changes saved");
    } catch (error) {
      setError(`Save failed: ${error.message}`);
    } finally {
      setSavingEdit(false);
    }
  }
  async function renameSavedConfig(id, name) {
    try {
      setLibrary(await renameConfig(id, name));
    } catch {
      setError("Rename failed. Check browser storage permissions.");
    }
  }
  useEffect(() => {
    if (!auto || !remote) return;
    const timer = setInterval(() => fetchAdmin(remote), 10000);
    return () => clearInterval(timer);
  }, [auto, remote]);
  async function upload(file) {
    if (!file) return;
    try {
      const content = await file.text();
      loadLocal(content, file.name);
    } catch (e) {
      setError(e.message);
    }
  }
  const counts = useMemo(() => {
    const result = Object.fromEntries(
      Object.keys(meta).map((kind) => [kind, 0]),
    );
    for (const node of model.nodes)
      result[node.kind] = (result[node.kind] || 0) + 1;
    return result;
  }, [model]);
  useEffect(() => {
    if (!modal) return;
    const dialog = document.querySelector("[role=dialog]");
    const previous = document.activeElement;
    dialog?.querySelector("button")?.focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        if (savingEdit) return;
        setModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = [
        ...dialog.querySelectorAll("button:not(:disabled),input,textarea"),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [modal, savingEdit]);
  useEffect(() => {
    if ((view !== "routes" && !detailsOpen && !selected) || modal) return;
    const handler = (event) => {
      if (
        event.key === "Escape" &&
        !event.isComposing &&
        !event.defaultPrevented
      ) {
        if (event.repeat) return;
        if (view === "routes") {
          event.preventDefault();
          setView("graph");
        } else if (detailsOpen) setDetailsOpen(false);
        else setSelected(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [detailsOpen, selected, modal, view]);
  const resourceGroups = useMemo(() => {
    if (view !== "list") return [];
    const groups = new Map(Object.keys(meta).map((kind) => [kind, []]));
    const term = query.trim().toLowerCase();
    for (const node of model.nodes) {
      if (
        term &&
        !(node.label + " " + JSON.stringify(node.detail))
          .toLowerCase()
          .includes(term)
      )
        continue;
      if (!groups.has(node.kind)) groups.set(node.kind, []);
      groups.get(node.kind).push(node);
    }
    return [...groups].filter(([, nodes]) => nodes.length);
  }, [model, query, view]);
  const details = selected?.detail ?? model.raw;
  const reference = envoyReference(selected, docsBase);
  useEffect(() => {
    if (!viewReady) {
      document.title = "EnvoyLens";
      return;
    }
    const page = {
      graph: "Graph",
      routes: "Route workbench",
      list: "Resources",
      raw: "Full configuration",
    }[view];
    const resource =
      detailsOpen && selected
        ? selected
        : view === "graph"
          ? selected ||
            model.nodes.find((node) => node.id === (chain || listener))
          : null;
    document.title = [
      "EnvoyLens",
      t(page),
      resource ? nodeLabel(resource) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [
    viewReady,
    view,
    detailsOpen,
    selected,
    model,
    chain,
    listener,
    language,
  ]);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(model.raw, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "envoy-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="app">
      <div className="workspace">
        <main>
          <section
            className={`explorer floating-shell ${side ? "nav-open" : "nav-closed"} ${resizingNav ? "resizing-nav" : ""} ${resizingNavHeight ? "resizing-nav-height" : ""}`}
            style={{ "--nav-width": `${displayedNavWidth}px` }}
          >
            <div className="explorer-header">
              <div className="source">
                <span className="compact-brand">
                  Envoy<span>Lens</span>
                </span>
                {!activeConfigId && (
                  <>
                    <span className="source-dot" />
                    <strong title={source}>{t(source)}</strong>
                  </>
                )}
                {source === "Demo configuration" && (
                  <span className="demo-tag">DEMO</span>
                )}
              </div>
              <div className="toolbar">
                <div className="view-tabs">
                  <button
                    className={view === "graph" ? "active" : ""}
                    onClick={() => setView("graph")}
                  >
                    <GitBranch size={15} aria-hidden="true" />
                    {t("Graph")}
                  </button>
                  <button
                    className={view === "routes" ? "active" : ""}
                    onClick={() => browseRoutes()}
                  >
                    <Layers size={15} aria-hidden="true" />
                    {t("Browse routes")}
                  </button>
                  <button
                    className={view === "list" ? "active" : ""}
                    onClick={() => setView("list")}
                  >
                    <List size={15} aria-hidden="true" />
                    {t("Resources")}
                  </button>
                  <button
                    className={view === "raw" ? "active" : ""}
                    onClick={() => setView("raw")}
                  >
                    <Braces size={15} />
                    {t("Full configuration")}
                  </button>
                </div>
                <div className="search">
                  <Search size={15} />
                  <input
                    data-resource-search="true"
                    aria-label={t("Search resources")}
                    placeholder={t("Search names or configuration fields…")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      aria-label={t("Clear search")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {selected && view !== "routes" && (
                  <button
                    className="details-toggle"
                    aria-expanded={detailsOpen}
                    onClick={() => setDetailsOpen(!detailsOpen)}
                    title={nodeLabel(selected)}
                  >
                    {detailsOpen ? t("Hide details") : t("Show details")}
                  </button>
                )}
              </div>
              <div className="source-actions">
                {remote && (
                  <>
                    <label
                      className="auto"
                      title={t(
                        "Refresh the current Admin configuration every 10 seconds",
                      )}
                    >
                      <input
                        type="checkbox"
                        aria-label={t("Auto-refresh every 10 seconds")}
                        checked={auto}
                        onChange={(e) => setAuto(e.target.checked)}
                      />
                      10s
                    </label>
                    <button
                      title={t("Refresh Admin configuration")}
                      disabled={busy}
                      onClick={() => fetchAdmin(remote)}
                    >
                      <RefreshCw size={15} />
                    </button>
                  </>
                )}
                {library.length > 0 && (
                  <div className="saved-config-sizing">
                    <span className="saved-config-measure" aria-hidden="true">
                      {library.find((item) => item.id === activeConfigId)
                        ?.name || t("Select a saved configuration")}
                    </span>
                    <select
                      className="saved-config-switch"
                      aria-label={t("Switch configuration")}
                      title={
                        library.find((item) => item.id === activeConfigId)
                          ?.name || t("Switch configuration")
                      }
                      value={activeConfigId}
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
                        switchConfig(event.target.value);
                        if (event.currentTarget.dataset.pointerSelection)
                          event.currentTarget.blur();
                      }}
                    >
                      <option value="" disabled>
                        {t("Select a saved configuration")}
                      </option>
                      {library.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {storageMessage && (
                  <span
                    className="storage-status"
                    role="status"
                    title={t(
                      "Configurations are saved only in this browser. They may contain sensitive data and are not uploaded to third parties.",
                    )}
                  >
                    {t(storageMessage)}
                  </span>
                )}
                {updated && (
                  <small>
                    {updated}
                    {t("Loaded")}
                  </small>
                )}
                <button
                  title={t("Download current configuration")}
                  onClick={download}
                >
                  <Download size={16} />
                </button>
                <button
                  title={t("Manage configurations")}
                  className="manage-config-button"
                  aria-label={t("Manage configurations")}
                  onClick={() => {
                    setError("");
                    setModal("manage");
                  }}
                >
                  <FolderCog size={17} />
                </button>
                <button
                  className="primary compact-import"
                  onClick={() => {
                    setError("");
                    setText("");
                    setModal(true);
                  }}
                >
                  <Upload size={14} />
                  {t("Import")}
                </button>
              </div>
            </div>
            {error && !modal && (
              <div className="error" role="alert">
                {t(error)}
              </div>
            )}
            <div className="canvas-layout">
              {side && (
                <div
                  className="nav-dock"
                  style={{ height: displayedNavHeight }}
                >
                  <aside
                    className="resource-nav"
                    style={
                      displayedNavHeight === undefined
                        ? undefined
                        : { height: "100%" }
                    }
                    aria-label={t("Resource navigation")}
                  >
                    <div className="nav-title">
                      {t("Resource navigation")}
                      <div className="nav-heading-actions">
                        <button
                          aria-label={
                            sortDirection === "asc"
                              ? t("Ascending; switch to descending")
                              : t("Descending; switch to ascending")
                          }
                          title={
                            sortDirection === "asc"
                              ? t("Sorted ascending; click for descending")
                              : t("Sorted descending; click for ascending")
                          }
                          onClick={() =>
                            setSortDirection((current) =>
                              current === "asc" ? "desc" : "asc",
                            )
                          }
                        >
                          {sortDirection === "asc" ? (
                            <ArrowDownAZ size={16} />
                          ) : (
                            <ArrowUpAZ size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => setSide(false)}
                          aria-label={t("Collapse navigation")}
                        >
                          <PanelLeftClose size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="nav-search">
                      <Search size={14} aria-hidden="true" />
                      <input
                        ref={navSearchInput}
                        type="search"
                        value={navQuery}
                        onChange={(event) => changeNavQuery(event.target.value)}
                        placeholder={t("Filter resources…")}
                        aria-label={t("Filter navigation resources")}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Escape" &&
                            view !== "routes" &&
                            navQuery &&
                            !event.isComposing
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            changeNavQuery("");
                          }
                        }}
                      />
                      {navQuery && (
                        <button
                          type="button"
                          aria-label={t("Clear navigation search")}
                          onClick={() => {
                            changeNavQuery("");
                            navSearchInput.current?.focus();
                          }}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {navSearching && (
                      <p className="nav-search-status" role="status">
                        {navMatchCount
                          ? t("{0} matching resources", [navMatchCount])
                          : t("No matching resources")}
                      </p>
                    )}
                    <button
                      className={
                        !listener && !chain ? "nav-item active" : "nav-item"
                      }
                      onClick={() => changeListener("")}
                    >
                      <LayoutGrid size={16} aria-hidden="true" />
                      {t("All resources")}
                      <span>{model.nodes.length}</span>
                    </button>
                    <details
                      className="nav-group"
                      open={navGroupOpen("listener")}
                      hidden={
                        navSearching && !navigationResources.listener.length
                      }
                    >
                      <summary
                        className="nav-section"
                        onClick={(event) => toggleNavGroup(event, "listener")}
                        title={t(
                          "Counts include all listener lifecycle states, not just unique names.",
                        )}
                      >
                        <Radio size={18} strokeWidth={2.2} aria-hidden="true" />
                        LISTENERS <span>{navCount("listener")}</span>
                      </summary>
                      {orderedResources("listener").map((n) => (
                        <button
                          key={n.id}
                          title={[nodeLabel(n), lifecycleLabel(n, duplicateIds)]
                            .filter(Boolean)
                            .join(" · ")}
                          className={`nav-item listener-item ${listener === n.id ? "active" : ""}`}
                          onClick={() => {
                            changeListener(n.id);
                          }}
                        >
                          <Radio size={16} aria-hidden="true" />
                          <div>
                            <span className="resource-name-line">
                              <span className="resource-name">
                                {nodeLabel(n)}
                              </span>
                              <ResourceState
                                node={n}
                                duplicateIds={duplicateIds}
                              />
                            </span>
                            <small>{address(n.detail)}</small>
                          </div>
                        </button>
                      ))}
                    </details>
                    <details
                      className="nav-group"
                      open={navGroupOpen("filter_chain")}
                      hidden={
                        navSearching && !navigationResources.filter_chain.length
                      }
                    >
                      <summary
                        className="nav-section"
                        onClick={(event) =>
                          toggleNavGroup(event, "filter_chain")
                        }
                      >
                        <Layers size={15} aria-hidden="true" />
                        FILTER CHAINS <span>{navCount("filter_chain")}</span>
                      </summary>
                      {orderedResources("filter_chain").map((n) => {
                        const owner = navigation.owners.get(n.id);
                        return (
                          <button
                            key={n.id}
                            title={[n.label, owner?.label]
                              .filter(Boolean)
                              .join(" · ")}
                            className={`nav-item listener-item ${chain === n.id || selected?.id === n.id ? "active" : ""}`}
                            onClick={() => navigateFilterChain(n)}
                          >
                            <Layers size={16} aria-hidden="true" />
                            <div>
                              {nodeLabel(n)}
                              {owner && (
                                <small className="resource-name-line">
                                  <span className="resource-name">
                                    {nodeLabel(owner)}
                                  </span>
                                  <ResourceState
                                    node={owner}
                                    duplicateIds={duplicateIds}
                                  />
                                </small>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </details>
                    <details
                      className="nav-group"
                      open={navGroupOpen("cluster")}
                      hidden={
                        navSearching && !navigationResources.cluster.length
                      }
                    >
                      <summary
                        className="nav-section"
                        onClick={(event) => toggleNavGroup(event, "cluster")}
                      >
                        <Network size={15} aria-hidden="true" />
                        CLUSTERS <span>{navCount("cluster")}</span>
                      </summary>
                      {orderedResources("cluster").map((n) => (
                        <button
                          key={n.id}
                          title={[nodeLabel(n), lifecycleLabel(n, duplicateIds)]
                            .filter(Boolean)
                            .join(" · ")}
                          className={`nav-item listener-item ${selected?.id === n.id ? "active" : ""}`}
                          onClick={() => navigateCluster(n)}
                        >
                          <Network size={16} aria-hidden="true" />
                          <div>
                            <span className="resource-name-line">
                              <span className="resource-name">
                                {nodeLabel(n)}
                              </span>
                              <ResourceState
                                node={n}
                                duplicateIds={duplicateIds}
                              />
                            </span>
                            {n.state !== "unresolved" && (
                              <small>
                                {n.detail.type ??
                                  (
                                    n.detail.cluster_type ??
                                    n.detail.clusterType
                                  )?.name ??
                                  t("STATIC (default)")}
                              </small>
                            )}
                          </div>
                        </button>
                      ))}
                    </details>
                    <details
                      className="nav-group"
                      open={navGroupOpen("endpoint")}
                      hidden={
                        navSearching && !navigationResources.endpoint.length
                      }
                    >
                      <summary
                        className="nav-section"
                        onClick={(event) => toggleNavGroup(event, "endpoint")}
                      >
                        <Server size={15} aria-hidden="true" />
                        ENDPOINTS <span>{navCount("endpoint")}</span>
                      </summary>
                      {orderedResources("endpoint").map((n) => (
                        <button
                          key={n.id}
                          title={nodeLabel(n)}
                          className={`nav-item listener-item ${selected?.id === n.id ? "active" : ""}`}
                          onClick={() => navigateCluster(n)}
                        >
                          <Server size={16} aria-hidden="true" />
                          <div>{nodeLabel(n)}</div>
                        </button>
                      ))}
                    </details>
                    {!navSearching && (
                      <>
                        <div className="nav-section">{t("Legend")}</div>
                        <div className="legend">
                          {[
                            "listener",
                            "filter_chain",
                            "match",
                            "network_filter",
                            "http_filter",
                            "route",
                            "cluster",
                            "endpoint",
                          ].map((k) => (
                            <div key={k}>
                              <i style={{ background: meta[k][1] }} />
                              {meta[k][0]}
                              <span
                                className="legend-count"
                                title={t(
                                  "Resource count in this configuration",
                                )}
                              >
                                {counts[k] ?? 0}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </aside>
                  <div
                    className="nav-height-resize-handle"
                    role="separator"
                    aria-label={t("Resize resource navigation height")}
                    aria-orientation="horizontal"
                    aria-valuemin={160}
                    aria-valuemax={navHeightMax}
                    aria-valuenow={displayedNavHeight}
                    tabIndex={0}
                    title={t(
                      "Drag to resize height; use up/down arrow keys; double-click to reset",
                    )}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      navHeightDrag.current = {
                        id: e.pointerId,
                        y: e.clientY,
                        height:
                          e.currentTarget.parentElement.getBoundingClientRect()
                            .height,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setResizingNavHeight(true);
                    }}
                    onPointerMove={(e) => {
                      const start = navHeightDrag.current;
                      if (start?.id === e.pointerId)
                        resizeNavHeight(start.height + e.clientY - start.y);
                    }}
                    onPointerUp={(e) => {
                      navHeightDrag.current = null;
                      setResizingNavHeight(false);
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                      navHeightDrag.current = null;
                      setResizingNavHeight(false);
                    }}
                    onLostPointerCapture={() => {
                      navHeightDrag.current = null;
                      setResizingNavHeight(false);
                    }}
                    onDoubleClick={() => setNavHeight(null)}
                    onKeyDown={(e) => {
                      if (
                        !["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
                      )
                        return;
                      e.preventDefault();
                      const height =
                        e.currentTarget.parentElement.getBoundingClientRect()
                          .height;
                      if (e.key === "Home") setNavHeight(null);
                      else
                        resizeNavHeight(
                          e.key === "End"
                            ? navHeightMax
                            : height + (e.key === "ArrowDown" ? 10 : -10),
                        );
                    }}
                  />
                  <div
                    className="nav-resize-handle"
                    role="separator"
                    aria-label={t("Resize resource navigation")}
                    aria-orientation="vertical"
                    aria-valuemin={160}
                    aria-valuemax={navMax}
                    aria-valuenow={displayedNavWidth}
                    tabIndex={0}
                    title={t(
                      "Drag to resize; use arrow keys to adjust; double-click to reset",
                    )}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      navDrag.current = {
                        x: e.clientX,
                        width: displayedNavWidth,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setResizingNav(true);
                    }}
                    onPointerMove={(e) => {
                      if (navDrag.current)
                        resizeNav(
                          navDrag.current.width + e.clientX - navDrag.current.x,
                        );
                    }}
                    onPointerUp={(e) => {
                      navDrag.current = null;
                      setResizingNav(false);
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onLostPointerCapture={() => {
                      navDrag.current = null;
                      setResizingNav(false);
                    }}
                    onPointerCancel={() => {
                      navDrag.current = null;
                      setResizingNav(false);
                    }}
                    onDoubleClick={() => resizeNav(180)}
                    onKeyDown={(e) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          e.key,
                        )
                      )
                        return;
                      e.preventDefault();
                      resizeNav(
                        e.key === "Home"
                          ? 160
                          : e.key === "End"
                            ? navMax
                            : displayedNavWidth +
                              (e.key === "ArrowRight" ? 10 : -10),
                      );
                    }}
                  />
                </div>
              )}
              <div className="canvas">
                {!side && (
                  <button className="expand" onClick={() => setSide(true)}>
                    {t("Show navigation")}
                  </button>
                )}
                <div className="routing-graph-view" hidden={view !== "graph"}>
                  <Graph
                    model={graphModel}
                    duplicateIds={duplicateIds}
                    searchNodes={routeScope.nodes}
                    routingIndex={routingIndex}
                    onLocate={locateSearchResult}
                    active={view === "graph"}
                    viewportState={graphViewport}
                    restoreViewport={restoreGraphViewport}
                    selected={selected}
                    onSelect={selectResource}
                    onNodeClick={handleGraphNodeClick}
                    focusTarget={focusTarget}
                    resetKey={canvasRevision}
                    query={query}
                    listener={listener}
                    chain={chain}
                  />
                  <RouteGraphControls
                    index={routingIndex}
                    configs={routeScope.configs}
                    selection={routingSelection}
                    onChange={changeRoutingSelection}
                    expanded={routing.expanded}
                    canCollapse={shouldCollapseRouting(routeScope)}
                    hostSelected={
                      Boolean(routing.selection.host) &&
                      routing.selection.host === routingSelection.host
                    }
                    keepBranches={routing.keepBranches}
                    onKeepBranches={(value) =>
                      setRouting((current) => ({
                        ...current,
                        keepBranches: value,
                      }))
                    }
                    onExpand={expandHost}
                    onCollapse={() => {
                      resetRoutingGraph();
                      changeRoutingSelection({
                        config: routingSelection.config,
                        host: "",
                        route: "",
                      });
                      setFocusTarget(null);
                    }}
                    onBrowse={() => browseRoutes()}
                    focusedRoute={routing.focusedRoute}
                    onReturn={returnToPreviousGraph}
                  />
                </div>
                <div
                  hidden={view !== "routes"}
                  className="routing-workbench-view"
                >
                  <RouteWorkbench
                    index={routingIndex}
                    configs={routeScope.configs}
                    selection={routingSelection}
                    onChange={changeRoutingSelection}
                    query={query}
                    onQueryChange={setQuery}
                    onShowGraph={showRouteInGraph}
                    onSelect={selectResource}
                    onBack={() => setView("graph")}
                    active={view === "routes"}
                    context={
                      model.nodes.find(
                        (node) => node.id === (chain || listener),
                      )?.label
                    }
                  />
                </div>
                {view === "raw" ? (
                  <pre
                    className="raw-view"
                    aria-label={t("Full JSON configuration")}
                  >
                    <JsonCode value={model.raw} />
                  </pre>
                ) : view === "list" ? (
                  <div className="resource-list">
                    {resourceGroups.map(([kind, nodes]) => (
                      <details
                        className="resource-group"
                        key={kind}
                        open
                        aria-label={meta[kind]?.[0] || kind}
                      >
                        <summary className="resource-group-heading">
                          <ChevronRight
                            className="resource-group-chevron"
                            size={16}
                          />
                          <i
                            style={{
                              background: (meta[kind] || meta.resource)[1],
                            }}
                          />
                          {meta[kind]?.[0] || kind}
                          <b>{nodes.length}</b>
                        </summary>
                        {nodes.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => toggleResourceDetails(n)}
                          >
                            <strong>{nodeLabel(n)}</strong>
                            <ResourceState
                              node={n}
                              duplicateIds={duplicateIds}
                            />
                            <small
                              title={t(
                                "Configuration origin, independent of lifecycle state or cluster type",
                              )}
                            >
                              {originLabel(n)}
                            </small>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                      </details>
                    ))}
                    {!resourceGroups.length && (
                      <p className="resource-list-empty">
                        {t("No matching resources")}
                      </p>
                    )}
                  </div>
                ) : null}
                {!model.nodes.length && view === "graph" && (
                  <div className="empty">
                    {t(
                      "No graph resources found. Open Full configuration to inspect the input.",
                    )}
                  </div>
                )}
              </div>
              {selected && detailsOpen && view !== "routes" && (
                <ResizableInspector>
                  <div className="inspector-heading">
                    <span
                      className="detail-kind"
                      style={{ color: meta[selected.kind]?.[1] }}
                    >
                      {meta[selected.kind]?.[0]}
                    </span>
                    <button
                      onClick={() => setDetailsOpen(false)}
                      aria-label={t("Close details")}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <h2>{nodeLabel(selected)}</h2>
                  <ResourceState node={selected} duplicateIds={duplicateIds} />
                  {reference && (
                    <div className="envoy-reference">
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("Envoy reference")}
                        <ArrowUpRight size={14} />
                      </a>
                      {reference.note && <small>{t(reference.note)}</small>}
                    </div>
                  )}
                  {routingIndex.entries.has(
                    selected.routingKey ||
                      routingIndex.byId.get(
                        routingIndex.canonicalId.get(selected.id),
                      )?.routingKey,
                  ) && (
                    <button
                      className="routing-inspector-link"
                      onClick={() =>
                        browseRoutes(
                          routingIndex.entries.get(
                            selected.routingKey ||
                              routingIndex.byId.get(
                                routingIndex.canonicalId.get(selected.id),
                              )?.routingKey,
                          ),
                        )
                      }
                    >
                      {t("Browse routes")}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                  <ConfigViewer
                    key={selected.id}
                    value={details}
                    schemaType={schemaTypes[selected.kind]}
                    copied={copied}
                    onCopy={async (text) => {
                      try {
                        await navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {
                        setError(
                          "Clipboard unavailable. Copy the configuration manually.",
                        );
                      }
                    }}
                  />
                  <div className="related">
                    <strong>{t("Related resources")}</strong>
                    {model.edges
                      .filter(
                        (e) =>
                          e.source === selected.id || e.target === selected.id,
                      )
                      .map((e) => {
                        const n = model.nodes.find(
                          (n) =>
                            n.id ===
                            (e.source === selected.id ? e.target : e.source),
                        );
                        return (
                          <button key={e.id} onClick={() => selectResource(n)}>
                            {e.source === selected.id ? "→" : "←"}{" "}
                            {short(nodeLabel(n))}
                            <ChevronRight size={12} />
                          </button>
                        );
                      })}
                  </div>
                </ResizableInspector>
              )}
            </div>
            <div className="appearance-controls">
              <button
                title={t("Documentation settings")}
                aria-label={t("Documentation settings")}
                onClick={() => {
                  setDocsDraft(docsBase);
                  setDocsError("");
                  setModal("docs");
                }}
              >
                <BookOpen size={17} />
              </button>
              <button
                className="language-toggle"
                title={t("Change language")}
                aria-label={t("Change language")}
                onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
              >
                {language === "zh" ? "EN" : "ZH"}
              </button>
              <button
                className="theme-toggle"
                aria-label={t("Appearance: {0}", [
                  t(
                    theme === "system"
                      ? "System; switch to light"
                      : theme === "light"
                        ? "Light; switch to dark"
                        : "Dark; switch to system",
                  ),
                ])}
                title={t("Current: {0}; switch to {1}", [
                  t(
                    theme === "system"
                      ? "System"
                      : theme === "light"
                        ? "Light"
                        : "Dark",
                  ),
                  t(
                    theme === "system"
                      ? "Light"
                      : theme === "light"
                        ? "Dark"
                        : "System",
                  ),
                ])}
                onClick={() =>
                  setTheme((current) =>
                    current === "system"
                      ? "light"
                      : current === "light"
                        ? "dark"
                        : "system",
                  )
                }
              >
                {theme === "system" ? (
                  <Monitor size={17} />
                ) : theme === "light" ? (
                  <Sun size={17} />
                ) : (
                  <Moon size={17} />
                )}
              </button>
            </div>
          </section>
        </main>
      </div>
      {modal && (
        <div
          className={`modal-backdrop ${modal === "manage" ? "config-manager-backdrop" : ""}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy && !savingEdit)
              setModal(false);
          }}
        >
          <section
            className={`modal ${modal === "manage" ? "config-manager-panel" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="modal-title">
              <div>
                <h2 id="import-title">
                  {modal === "docs"
                    ? t("Documentation settings")
                    : modal === "manage"
                      ? t("Manage configurations")
                      : modal === "edit"
                        ? t("Edit Envoy configuration")
                        : t("Import Envoy configuration")}
                </h2>
                <p>
                  {modal === "docs"
                    ? t(
                        "Use a versioned Envoy documentation root or a compatible mirror. Resource paths are appended automatically.",
                      )
                    : modal === "manage"
                      ? t(
                          "Switch, rename, edit, or delete saved configurations.",
                        )
                      : t(
                          "Connect to a live instance or inspect an offline configuration.",
                        )}
                </p>
              </div>
              <button
                onClick={() => setModal(false)}
                disabled={savingEdit}
                aria-label={
                  modal === "docs"
                    ? t("Close documentation settings")
                    : modal === "manage"
                      ? t("Close configuration manager")
                      : modal === "edit"
                        ? t("Close editor")
                        : t("Close import")
                }
              >
                <X size={20} />
              </button>
            </div>
            {modal === "docs" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  try {
                    saveDocsBase(docsDraft);
                    setModal(false);
                  } catch (error) {
                    setDocsError(error.message);
                  }
                }}
              >
                <label className="field-label" htmlFor="docs-base">
                  {t("Documentation base URL")}
                </label>
                <input
                  id="docs-base"
                  style={{ width: "100%" }}
                  value={docsDraft}
                  placeholder={ENVOY_DOCS_BASE}
                  onChange={(event) => {
                    setDocsDraft(event.target.value);
                    setDocsError("");
                  }}
                />
                <p>
                  {t(
                    "Saved in this browser. Leave blank to use the default. The selected documentation must support the existing API paths.",
                  )}
                </p>
                {docsError && <p role="alert">{t(docsError)}</p>}
                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => {
                      setDocsDraft(ENVOY_DOCS_BASE);
                      setDocsError("");
                    }}
                  >
                    {t("Restore default")}
                  </button>
                  <button type="submit" className="primary">
                    {t("Save")}
                  </button>
                </div>
              </form>
            ) : modal === "manage" ? (
              <>
                <section
                  className="saved-config-library"
                  aria-label={t("Saved configurations")}
                >
                  <h3>{t("Saved configurations")}</h3>
                  <div className="saved-config-items">
                    {library.map((item) => (
                      <div
                        className={`saved-config-item ${activeConfigId === item.id ? "is-current" : ""}`}
                        key={item.id}
                      >
                        <div>
                          <input
                            aria-label={t("Configuration name: {0}", [
                              item.name,
                            ])}
                            defaultValue={item.name}
                            key={`${item.id}:${item.name}`}
                            onBlur={(event) => {
                              if (event.target.value.trim() !== item.name)
                                renameSavedConfig(item.id, event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                event.currentTarget.blur();
                            }}
                          />
                          <small title={item.remote || item.source}>
                            {item.remote
                              ? `Admin · ${item.remote}`
                              : item.source}
                          </small>
                        </div>
                        <button onClick={() => switchConfig(item.id)}>
                          {activeConfigId === item.id
                            ? t("Current")
                            : t("Switch")}
                        </button>
                        <button
                          title={t("Edit configuration")}
                          aria-label={t("Edit configuration {0}", [item.name])}
                          onClick={() => editSavedConfig(item)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={t("Delete configuration {0}", [
                            item.name,
                          ])}
                          onClick={() => deleteSavedConfig(item.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!library.length && (
                    <p className="config-manager-empty">
                      {t("No saved configurations. Import one to get started.")}
                    </p>
                  )}
                  <p>
                    {t(
                      "Saved only in this browser. Switching Admin configurations loads a saved snapshot without connecting or enabling polling.",
                    )}
                  </p>
                </section>
                {error && (
                  <div className="error" role="alert">
                    {t(error)}
                  </div>
                )}
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setText("");
                    setModal(true);
                  }}
                >
                  <Upload size={15} />
                  {t("Import configuration")}
                </button>
              </>
            ) : modal === "edit" && editing ? (
              <>
                <label className="field-label" htmlFor="edit-config-name">
                  {t("Configuration name")}
                </label>
                <input
                  className="import-config-name"
                  id="edit-config-name"
                  value={editing.name}
                  disabled={savingEdit}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
                <label className="field-label" htmlFor="edit-config-admin">
                  {t("Admin address (optional)")}
                </label>
                <input
                  className="import-config-name"
                  id="edit-config-admin"
                  value={editing.remote || ""}
                  disabled={savingEdit}
                  placeholder={t("Leave blank for an offline configuration")}
                  onChange={(e) =>
                    setEditing({ ...editing, remote: e.target.value })
                  }
                />
                <label className="field-label" htmlFor="edit-config-text">
                  {t("Configuration")}
                  <span>JSON / YAML</span>
                </label>
                <textarea
                  id="edit-config-text"
                  value={editing.text}
                  disabled={savingEdit}
                  spellCheck={false}
                  onChange={(e) =>
                    setEditing({ ...editing, text: e.target.value })
                  }
                />
                <p className="edit-config-note">
                  {t(
                    "Changes affect the local copy only, not Envoy. Future Admin refreshes overwrite this snapshot. Auto-refresh is paused while editing.",
                  )}
                </p>
                {error && (
                  <div className="error" role="alert">
                    {t(error)}
                  </div>
                )}
                <div className="modal-footer">
                  <button
                    disabled={savingEdit}
                    onClick={() => {
                      setEditing(null);
                      setError("");
                      setModal("manage");
                    }}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    className="primary"
                    disabled={savingEdit}
                    onClick={saveEditedConfig}
                  >
                    {savingEdit ? t("Saving…") : t("Save changes")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="import-name">
                  {t("Configuration name (optional)")}
                </label>
                <input
                  id="import-name"
                  className="import-config-name"
                  value={importName}
                  onChange={(event) => setImportName(event.target.value)}
                  placeholder={t("For example: staging sidecar")}
                />
                <div className="import-tabs">
                  {[
                    ["paste", t("Paste configuration"), FileCode2],
                    ["upload", t("Upload file"), Upload],
                    ["admin", t("Admin address"), Radio],
                  ].map(([id, label, Icon]) => (
                    <button
                      key={id}
                      className={tab === id ? "active" : ""}
                      onClick={() => {
                        setTab(id);
                        setError("");
                      }}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                {tab === "paste" ? (
                  <>
                    <label className="field-label" htmlFor="config-text">
                      {t("Configuration")}
                      <span>{t("Auto-detect JSON / YAML")}</span>
                    </label>
                    <textarea
                      id="config-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      spellCheck="false"
                      placeholder={t("Paste bootstrap or config_dump…")}
                    />
                  </>
                ) : tab === "upload" ? (
                  <label
                    className="dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      upload(e.dataTransfer.files[0]);
                    }}
                  >
                    <Upload size={32} />
                    <strong>{t("Drop a configuration file here")}</strong>
                    <span>
                      {t("Or click to browse · .json / .yaml / .yml")}
                    </span>
                    <input
                      className="file-input-accessible"
                      aria-label={t("Upload configuration file")}
                      type="file"
                      accept=".json,.yaml,.yml"
                      onChange={(e) => upload(e.target.files[0])}
                    />
                    <span className="file-input-label" aria-hidden="true">
                      {t("Upload file")}
                    </span>
                  </label>
                ) : (
                  <div className="admin-form">
                    <label className="field-label" htmlFor="admin-address">
                      {t("Envoy Admin address")}
                    </label>
                    <input
                      id="admin-address"
                      value={addressValue}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="http://127.0.0.1:15000"
                    />
                    <p>
                      {t("The server sends a read-only request to")}
                      <code>/config_dump?include_eds</code>
                      {t(
                        ". Local and remote instances reachable from the server are supported. Auto-refresh is available after connecting.",
                      )}
                    </p>
                    <div className="notice">
                      {t(
                        "Admin responses may contain sensitive data. Connect only to trusted instances. EnvoyLens does not modify Envoy configuration.",
                      )}
                    </div>
                  </div>
                )}
                {error && (
                  <div className="error" role="alert">
                    {t(error)}
                  </div>
                )}
                <div className="modal-footer">
                  <button
                    onClick={() => {
                      loadLocal(sample, "Demo configuration");
                    }}
                  >
                    {t("Load demo")}
                  </button>
                  {tab !== "upload" && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        tab === "admin"
                          ? fetchAdmin()
                          : loadLocal(text, "Paste configuration")
                      }
                    >
                      {busy
                        ? t("Loading…")
                        : tab === "admin"
                          ? t("Connect and save")
                          : t("Parse and save")}
                      <ChevronRight size={15} />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
