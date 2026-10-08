import React from "react";
import { t } from "./i18n";
import { lifecycleLabel, lifecycleDescription } from "./node-fields";

export default function ResourceState({ node, duplicateIds }) {
  const label = lifecycleLabel(node, duplicateIds);
  if (!label) return null;
  return (
    <span
      className={`resource-state resource-state-${node.state}`}
      data-resource-state={node.state}
      aria-label={t("Lifecycle state: {0}", [label])}
      title={[lifecycleDescription(node), node.path].filter(Boolean).join("\n")}
    >
      {label}
    </span>
  );
}
