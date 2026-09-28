import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createApp, adminURL } from "../server.js";
const start = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
test("Admin URLs restrict scheme, credentials and path", () => {
  assert.equal(
    adminURL("localhost:9901").toString(),
    "http://localhost:9901/config_dump?include_eds",
  );
  for (const u of [
    "file:///etc/passwd",
    "https://a:b@host",
    "http://host/quitquitquit",
  ])
    assert.throws(() => adminURL(u));
});
test("read-only Admin request and proxy protections", async (t) => {
  let requested;
  const upstream = createServer((req, res) => {
    requested = { method: req.method, url: req.url };
    res.setHeader("Content-Type", "application/json");
    res.end('{"configs":[]}');
  });
  const upstreamURL = await start(upstream);
  t.after(() => upstream.close());
  const server = createServer(createApp());
  const base = await start(server);
  t.after(() => server.close());
  const call = (headers = {}, address = upstreamURL) =>
    fetch(`${base}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ address }),
    });
  assert.equal((await call()).status, 403);
  assert.equal(
    (await call({ "X-EnvoyLens": "1", Origin: "https://untrusted.example" }))
      .status,
    403,
  );
  assert.equal(
    await new Promise((resolve) => {
      const req = request(
        `${base}/api/config`,
        {
          method: "POST",
          headers: { Host: "untrusted.example", "X-EnvoyLens": "1" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.end();
    }),
    403,
  );
  assert.equal(
    (await call({ "X-EnvoyLens": "1" }, "http://host/quitquitquit")).status,
    400,
  );
  const res = await call({ "X-EnvoyLens": "1", Origin: base });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).text, '{"configs":[]}');
  assert.deepEqual(requested, {
    method: "GET",
    url: "/config_dump?include_eds",
  });
});
test("Admin redirect and upstream failure return visible errors", async (t) => {
  const upstream = createServer((req, res) => {
    res.writeHead(302, { Location: "http://127.0.0.1/" });
    res.end();
  });
  const upstreamURL = await start(upstream);
  t.after(() => upstream.close());
  const server = createServer(createApp());
  const base = await start(server);
  t.after(() => server.close());
  const res = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-EnvoyLens": "1" },
    body: JSON.stringify({ address: upstreamURL }),
  });
  assert.equal(res.status, 502);
  assert((await res.json()).error.includes("Unable to read"));
});

test("Admin responses above the former 20 MB limit are accepted", async (t) => {
  const payload = '{"configs":[]}' + " ".repeat(20 * 1024 * 1024);
  const upstream = createServer((req, res) => res.end(payload));
  const upstreamURL = await start(upstream);
  t.after(() => upstream.close());
  const server = createServer(createApp());
  const base = await start(server);
  t.after(() => server.close());
  const res = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-EnvoyLens": "1" },
    body: JSON.stringify({ address: upstreamURL }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).text.length, payload.length);
});
