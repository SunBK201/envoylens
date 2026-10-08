import React from "react";
import { ArrowDownLeft, ArrowUpRight, Minus, CircleHelp } from "lucide-react";
import { t } from "./i18n";
import { trafficDirection } from "./node-fields";

const icons = {
  INBOUND: ArrowDownLeft,
  OUTBOUND: ArrowUpRight,
  UNSPECIFIED: Minus,
  UNKNOWN: CircleHelp,
};

export default function TrafficDirection({ node }) {
  const direction = trafficDirection(node);
  if (!direction) return null;
  const Icon = icons[direction.value];
  return (
    <span
      className={`traffic-direction traffic-direction-${direction.value.toLowerCase()}`}
      data-traffic-direction={direction.value}
      aria-label={t("Traffic direction: {0}", [direction.label])}
      title={direction.description}
    >
      <Icon size={12} aria-hidden="true" />
      {direction.label}
    </span>
  );
}
