import { adminURL } from "./admin-url.js";

export async function fetchAdminConfig(address, includeEds = false) {
  // Validate before either request; never probe arbitrary Admin paths.
  const url = adminURL(address, includeEds);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw Error(`Admin returned HTTP ${response.status}`);
    const text = await response.text();
    // A reachable address may serve an HTML login page instead of a dump.
    if (!Array.isArray(JSON.parse(text)?.configs))
      throw Error("Unrecognized Envoy bootstrap or config_dump structure");
    return { text, url: url.toString(), fetchedAt: new Date().toISOString() };
  } catch {
    // CORS, mixed content, network errors and timeouts fall back to the proxy.
  } finally {
    clearTimeout(timer);
  }

  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-EnvoyLens": "1" },
    body: JSON.stringify({ address, includeEds }),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
