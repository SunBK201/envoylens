import { t } from "./i18n";
import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Radio,
  Network,
  Server,
  GitBranch,
  Layers,
  Filter,
  Globe,
  Clock,
  ShieldCheck,
  HeartPulse,
  RotateCw,
  SlidersHorizontal,
  MapPin,
  FileText,
  Tag,
  Plug,
  Search,
  Copy,
  Check,
} from "lucide-react";
import JsonCode from "./JsonCode";
import YamlCode from "./YamlCode";
import { formatConfiguration } from "./config-format";
import { semanticField } from "./envoy-semantics";

const semanticIcons = [
  [/^(listeners|listener_filters)$/, Radio],
  [/^(filter_chains|default_filter_chain)$/, Layers],
  [
    /^(filter_chain_match|match|headers|query_parameters|safe_regex|regex)$/,
    Search,
  ],
  [/^(filters|http_filters)$/, Filter],
  [
    /^(routes|route|route_config|rds|redirect|direct_response|request_mirror_policies)$/,
    GitBranch,
  ],
  [
    /^(clusters|cluster|cluster_name|weighted_clusters|cluster_header|eds_cluster_config)$/,
    Network,
  ],
  [/^(endpoints|endpoint|lb_endpoints|load_assignment)$/, Server],
  [/^(virtual_hosts|domains|server_names|host_rewrite_literal)$/, Globe],
  [/timeout$|^duration$/, Clock],
  [
    /tls|certificate|private_key|validation_context|transport_socket/,
    ShieldCheck,
  ],
  [/^health_/, HeartPulse],
  [/retry|retries/, RotateCw],
  [/^(locality|region|zone|sub_zone)$/, MapPin],
  [
    /^(address|socket_address|port_value|destination_port|protocol|pipe|socket_options)$/,
    Plug,
  ],
  [/^(access_log|stat_prefix|body|path)$/, FileText],
  [/^(name|@type|type|route_config_name)$/, Tag],
];

function fieldIcon(name, parent, index) {
  const key = String(index === undefined ? name : parent).replace(
    /[A-Z]/g,
    (letter) => `_${letter.toLowerCase()}`,
  );
  return (
    semanticIcons.find(([pattern]) => pattern.test(key))?.[1] ||
    SlidersHorizontal
  );
}

function ConfigRow({ name, value, depth = 0, parent = "", index }) {
  const [open, setOpen] = useState(depth === 0);
  const info = semanticField(name, value, parent, index);
  const Icon = fieldIcon(name, parent, index);
  return (
    <>
      <tr
        className={info.expandable ? "config-expandable-row" : undefined}
        onClick={
          info.expandable ? () => setOpen((current) => !current) : undefined
        }
      >
        <th scope="row">
          <div
            className="config-field"
            style={{ paddingLeft: Math.min(depth, 8) * 10 }}
          >
            {info.expandable ? (
              <button
                type="button"
                aria-label={`${open ? "Collapse" : "Expand"} ${info.label}`}
                aria-expanded={open}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen((current) => !current);
                }}
              >
                {open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            ) : (
              <span className="config-leaf-spacer" aria-hidden="true" />
            )}
            <span title={name}>
              <span className="config-semantic-label">
                <Icon
                  className="config-semantic-icon"
                  size={15}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                <span>{info.label}</span>
              </span>
              {info.description && (
                <small className="config-description">{info.description}</small>
              )}
            </span>
          </div>
        </th>
        <td
          className={`config-value ${value !== null && typeof value === "object" ? "config-count" : ""}`}
        >
          {info.content}
        </td>
      </tr>
      {open &&
        info.expandable &&
        Object.entries(value).map(([key, child]) => (
          <ConfigRow
            key={key}
            name={key}
            parent={index !== undefined ? parent : name}
            index={Array.isArray(value) ? Number(key) : undefined}
            value={child}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

export default function ConfigViewer({ value, onCopy, copied = false }) {
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem("envoylens-config-view");
      return ["tree", "json", "yaml"].includes(saved) ? saved : "json";
    } catch {
      return "json";
    }
  });
  const yaml = useMemo(
    () => (mode === "yaml" ? formatConfiguration(value, "yaml") : ""),
    [value, mode],
  );
  function selectMode(next) {
    setMode(next);
    try {
      localStorage.setItem("envoylens-config-view", next);
    } catch {
      // Keep the current view usable when browser storage is unavailable.
    }
  }
  const entries =
    value !== null && typeof value === "object" ? Object.entries(value) : null;
  return (
    <div className="config-viewer">
      {onCopy && (
        <div className="code-heading">
          {t("Configuration")}
          <button
            title={t("Copy configuration")}
            aria-label={t("Copy configuration")}
            onClick={() =>
              onCopy(mode === "yaml" ? yaml : formatConfiguration(value))
            }
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}
      <div
        className="config-view-switch"
        role="group"
        aria-label={t("Configuration view")}
      >
        <button
          aria-pressed={mode === "tree"}
          onClick={() => selectMode("tree")}
        >
          {t("Semantic view")}
        </button>
        <button
          aria-pressed={mode === "json"}
          onClick={() => selectMode("json")}
        >
          {t("JSON view")}
        </button>
        <button
          aria-pressed={mode === "yaml"}
          onClick={() => selectMode("yaml")}
        >
          {t("YAML view")}
        </button>
      </div>
      {mode === "tree" ? (
        <div className="config-table-scroll">
          <table
            className="config-table"
            aria-label="Envoy configuration table"
          >
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Configuration</th>
              </tr>
            </thead>
            <tbody>
              {entries?.length ? (
                entries.map(([key, child]) => (
                  <ConfigRow
                    key={key}
                    name={key}
                    index={Array.isArray(value) ? Number(key) : undefined}
                    value={child}
                  />
                ))
              ) : (
                <ConfigRow name="Configuration" value={value} />
              )}
            </tbody>
          </table>
        </div>
      ) : mode === "yaml" ? (
        <pre className="config-json" aria-label={t("YAML configuration")}>
          <YamlCode text={yaml} />
        </pre>
      ) : (
        <pre className="config-json" aria-label={t("Raw JSON configuration")}>
          <JsonCode value={value} />
        </pre>
      )}
    </div>
  );
}
