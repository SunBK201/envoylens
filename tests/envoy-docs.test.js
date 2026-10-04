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

test("custom roots preserve resource paths and anchors", () => {
  for (const base of [
    "https://example.com/docs/latest",
    "http://docs.internal/envoy/v1.20.0/",
  ]) {
    assert.equal(
      envoyReference({ kind: "cluster" }, base).url,
      base.replace(/\/+$/, "") +
        "/api-v3/config/cluster/v3/cluster.proto.html#envoy-v3-api-msg-config-cluster-v3-cluster",
    );
    assert(
      envoyReference({ kind: "unknown" }, base).url.endsWith(
        "/api-v3/api.html",
      ),
    );
    assert(
      envoyReference(
        { kind: "http_filter", detail: { name: "envoy.filters.http.router" } },
        base,
      ).url.startsWith(base),
    );
  }
});

test("settings normalize, validate, persist, notify, and recover", async () => {
  const {
    normalizeDocsBase,
    readDocsBase,
    saveDocsBase,
    getDocsBase,
    subscribeDocsBase,
    ENVOY_DOCS_KEY,
  } = await import("../src/envoy-docs.js");
  assert.equal(
    normalizeDocsBase("  https://example.com/docs///  "),
    "https://example.com/docs/",
  );
  assert.equal(normalizeDocsBase(" "), ENVOY_DOCS_BASE);
  for (const value of [
    "javascript:alert(1)",
    "file:///tmp/docs",
    "/docs",
    "https://u:p@example.com/",
    "https://example.com/?x=1",
    "https://example.com/#api",
  ]) {
    assert.throws(() => normalizeDocsBase(value));
    assert.equal(readDocsBase({ getItem: () => value }), ENVOY_DOCS_BASE);
  }
  assert.equal(
    readDocsBase({
      getItem() {
        throw Error();
      },
    }),
    ENVOY_DOCS_BASE,
  );
  let saved;
  let notifications = 0;
  const unsubscribe = subscribeDocsBase(() => notifications++);
  const storage = {
    setItem(key, value) {
      assert.equal(key, ENVOY_DOCS_KEY);
      saved = value;
    },
    getItem() {
      return saved;
    },
  };
  try {
    saveDocsBase("https://example.com/docs", storage);
    assert.equal(getDocsBase(), "https://example.com/docs/");
    assert.equal(readDocsBase(storage), getDocsBase());
    assert(envoyReference({ kind: "listener" }).url.startsWith(getDocsBase()));
    assert.equal(notifications, 1);
    assert.throws(
      () =>
        saveDocsBase("https://other.com", {
          setItem() {
            throw Error();
          },
        }),
      /Unable to save/,
    );
    assert.equal(getDocsBase(), "https://example.com/docs/");
    saveDocsBase("", storage);
    assert.equal(getDocsBase(), ENVOY_DOCS_BASE);
  } finally {
    unsubscribe();
    saveDocsBase("", storage);
  }
});

test("documentation home URLs resolve to their containing directory", async () => {
  const { normalizeDocsBase } = await import("../src/envoy-docs.js");
  assert.equal(
    normalizeDocsBase("http://10.74.67.57:8077/index.html"),
    "http://10.74.67.57:8077/",
  );
  assert.equal(
    normalizeDocsBase("https://example.com/envoy/v1.20.0/index.html"),
    "https://example.com/envoy/v1.20.0/",
  );
  assert.equal(
    envoyReference({ kind: "cluster" }, "http://10.74.67.57:8077/index.html")
      .url,
    "http://10.74.67.57:8077/api-v3/config/cluster/v3/cluster.proto.html#envoy-v3-api-msg-config-cluster-v3-cluster",
  );
});
