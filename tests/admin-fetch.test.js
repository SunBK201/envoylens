import test from "node:test";
import assert from "node:assert/strict";
import { fetchAdminConfig } from "../src/admin-fetch.js";

const dump = '{"configs":[]}';
const proxied = {
  text: dump,
  url: "http://admin:9901/config_dump?include_eds",
};

test("direct Admin success does not call the backend", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, proxied.url);
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.equal(options.mode, "cors");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return new Response(dump);
  });
  assert.equal((await fetchAdminConfig("admin:9901")).text, dump);
  assert.equal(mock.mock.callCount(), 1);
});

for (const [name, direct] of [
  [
    "CORS or network rejection",
    () => {
      throw new TypeError("Failed to fetch");
    },
  ],
  ["HTTP failure", () => new Response("unavailable", { status: 503 })],
  ["invalid JSON", () => new Response("<html>login</html>")],
  ["non-dump JSON", () => new Response('{"error":"login required"}')],
  [
    "body read failure",
    () => ({
      ok: true,
      text: async () => {
        throw Error("connection reset");
      },
    }),
  ],
]) {
  test(`${name} falls back to the backend once`, async (t) => {
    const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
      if (url !== "/api/config") return direct();
      assert.equal(options.method, "POST");
      assert.equal(options.headers["X-EnvoyLens"], "1");
      assert.deepEqual(JSON.parse(options.body), { address: "admin:9901" });
      return Response.json(proxied);
    });
    assert.deepEqual(await fetchAdminConfig("admin:9901"), proxied);
    assert.equal(mock.mock.callCount(), 2);
  });
}

test("10-second direct timeout aborts the request and falls back", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/config") return Response.json(proxied);
    signal = options.signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  });
  const pending = fetchAdminConfig("admin:9901");
  t.mock.timers.tick(9999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, proxied);
  assert.equal(signal.aborted, true);
  assert.equal(mock.mock.callCount(), 2);
});

test("backend failure remains visible after direct failure", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url !== "/api/config") throw new TypeError("Failed to fetch");
    return Response.json(
      { error: "Unable to read Admin: offline" },
      { status: 502 },
    );
  });
  await assert.rejects(
    fetchAdminConfig("admin:9901"),
    /Unable to read Admin: offline/,
  );
});

test("invalid addresses do not trigger direct or backend requests", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () =>
    assert.fail("unexpected fetch"),
  );
  for (const address of [
    "file:///etc/passwd",
    "http://a:b@admin",
    "http://admin/quitquitquit",
  ])
    await assert.rejects(fetchAdminConfig(address));
  assert.equal(mock.mock.callCount(), 0);
});
