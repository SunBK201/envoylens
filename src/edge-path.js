/** Horizontal tangents keep cross-row edges smooth without orthogonal elbows. */
export function connectionPath(sourceX, sourceY, targetX, targetY) {
  const centerX = (sourceX + targetX) / 2;
  const centerY = (sourceY + targetY) / 2;
  const path =
    sourceY === targetY
      ? `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} C ${centerX} ${sourceY}, ${centerX} ${targetY}, ${targetX} ${targetY}`;
  return { path, labelX: centerX, labelY: centerY };
}

/** Anchor captions inside the empty column gutter, never across card content. */
export function edgeCaption(sourceX, sourceY, targetX, targetY, gutter) {
  const x = targetX - gutter / 2;
  const centerX = (sourceX + targetX) / 2;
  let low = 0,
    high = 1;
  for (let i = 0; i < 28; i++) {
    const t = (low + high) / 2,
      u = 1 - t;
    const pointX =
      u * u * u * sourceX +
      3 * u * u * t * centerX +
      3 * u * t * t * centerX +
      t * t * t * targetX;
    if (pointX < x) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return {
    x,
    y: sourceY + (targetY - sourceY) * (3 * t * t - 2 * t * t),
    width: gutter - 10,
  };
}

/** Keep edge metadata for routing semantics, but never render captions. */
export function shouldShowEdgeLabel() {
  return false;
}
