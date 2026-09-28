import test from "node:test";
import assert from "node:assert/strict";
import { envoyReference, ENVOY_DOCS_BASE } from "../src/envoy-docs.js";

test("resource documentation uses pinned 1.20 pages and anchors", () => {
  for (const kind of [
    "listener",
    "filter_chain",
    "match",
    "cluster",
    "endpoint",
    "route_config",
    "virtual_host",
    "route",
    "action",
    "dynamic",
  ]) {
    const ref = envoyReference({ kind });
    assert(ref.url.startsWith(ENVOY_DOCS_BASE));
    assert(ref.url.includes("#envoy-v3-api-msg-"));
    assert.equal(ref.note, "");
  }
  assert(
    envoyReference({ kind: "filter_chain" }).url.endsWith(
      "config-listener-v3-filterchain",
    ),
  );
});
test("known extension types override filter wrapper docs", () => {
  const ref = envoyReference({
    kind: "http_filter",
    detail: {
      typedConfig: {
        "@type":
          "type.googleapis.com/envoy.extensions.filters.http.jwt_authn.v3.JwtAuthentication",
      },
    },
  });
  assert(ref.url.includes("jwt_authn/v3/config.proto"));
  assert.equal(ref.note, "");
  assert(
    envoyReference({
      kind: "http_filter",
      detail: { name: "envoy.filters.http.router" },
    }).url.includes("router/v3/router.proto"),
  );
});
test("custom extension types get explicit generic fallback, not invented links", () => {
  const ref = envoyReference({
    kind: "http_filter",
    detail: {
      name: "envoy.filters.http.router",
      typed_config: { "@type": "type.googleapis.com/custom.Router" },
    },
  });
  assert(ref.note);
  assert(ref.url.includes("http_connection_manager.proto"));
  assert(!ref.url.includes("custom"));
  assert.equal(envoyReference(null), null);
});
