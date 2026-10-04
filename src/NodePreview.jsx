import { schemaTypes } from "./schema-docs";
import { t, nodeLabel } from "./i18n";
import React, { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import JsonCode from "./JsonCode";
import { ArrowUpRight } from "lucide-react";
import { envoyReference, subscribeDocsBase, getDocsBase } from "./envoy-docs";

export default function NodePreview({
  node,
  rect,
  kind,
  onEnter,
  onLeave,
  onClose,
}) {
  const docsBase = useSyncExternalStore(subscribeDocsBase, getDocsBase);
  const reference = envoyReference(node, docsBase);
  const width = Math.min(420, window.innerWidth - 24);
  const height = Math.min(360, window.innerHeight - 24);
  let left = rect.right + 12;
  if (left + width > window.innerWidth - 12) left = rect.left - width - 12;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  const top = Math.max(
    12,
    Math.min(rect.top, window.innerHeight - height - 12),
  );
  return createPortal(
    <aside
      className="node-preview"
      aria-label={t("Node preview")}
      style={{ left, top, width, maxHeight: height }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="node-preview-heading">
        <span>{kind}</span>
        <button aria-label={t("Close preview")} onClick={onClose}>
          ×
        </button>
      </div>
      <strong className="node-preview-name">{nodeLabel(node)}</strong>
      {reference && (
        <div className="envoy-reference">
          <a href={reference.url} target="_blank" rel="noopener noreferrer">
            {t("Envoy reference")}
            <ArrowUpRight size={14} />
          </a>
          {reference.note && <small>{t(reference.note)}</small>}
        </div>
      )}
      <pre>
        <JsonCode value={node.detail} schemaType={schemaTypes[node.kind]} />
      </pre>
    </aside>,
    document.body,
  );
}
