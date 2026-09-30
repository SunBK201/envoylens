export function intersectsViewport(bounds, viewport) {
  return (
    bounds.left <= viewport.right &&
    bounds.right >= viewport.left &&
    bounds.top <= viewport.bottom &&
    bounds.bottom >= viewport.top
  );
}

export function visibleGraph(graph, connections, viewport) {
  return {
    nodes: graph.nodes.filter((node) =>
      intersectsViewport(
        {
          left: node.x,
          top: node.y,
          right: node.x + graph.geometry.cardWidth,
          bottom: node.y + graph.geometry.cardHeight,
        },
        viewport,
      ),
    ),
    // Keep crossing edges even if both endpoint cards are outside the viewport.
    connections: connections.filter((edge) =>
      intersectsViewport(edge.bounds, viewport),
    ),
  };
}
