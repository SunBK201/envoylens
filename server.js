import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { adminURL } from "./src/admin-url.js";
export { adminURL } from "./src/admin-url.js";
export function createApp() {
  const app = express();
  app.use("/api", (req, res, next) => {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(req.hostname))
      return res.status(403).json({ error: "Only local access is allowed" });
    const origin = req.headers.origin;
    if (origin && origin !== `${req.protocol}://${req.headers.host}`)
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed" });
    if (req.headers["x-envoylens"] !== "1")
      return res.status(403).json({ error: "Missing request identifier" });
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  app.post("/api/config", async (req, res) => {
    let url;
    try {
      if (typeof req.body?.address !== "string")
        throw Error("Enter an Admin address");
      if (
        req.body.includeEds !== undefined &&
        typeof req.body.includeEds !== "boolean"
      )
        throw Error("includeEds must be a boolean");
      url = adminURL(req.body.address, req.body.includeEds);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw Error(`Admin returned HTTP ${response.status}`);
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      res.set("Cache-Control", "no-store").json({
        text: Buffer.concat(chunks).toString("utf8"),
        url: url.toString(),
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      res.status(502).json({
        error:
          e.name === "AbortError"
            ? "Connection timed out (10 seconds). Check the Admin address and network."
            : `Unable to read Admin: ${e.message}`,
      });
    } finally {
      clearTimeout(timer);
    }
  });
  app.use((err, req, res, next) =>
    res.status(err.status || 500).json({
      error:
        err.status === 413
          ? "Request body too large"
          : "Invalid request format",
    }),
  );
  return app;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(fileURLToPath(new URL("./dist", import.meta.url))));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  const port = Number(process.env.PORT || 4173);
  app.listen(port, "127.0.0.1", () =>
    console.log(`EnvoyLens: http://127.0.0.1:${port}`),
  );
}
