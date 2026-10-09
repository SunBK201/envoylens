export function adminURL(input, includeEds = false) {
  const url = new URL(input.includes("://") ? input : `http://${input}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only HTTP/HTTPS Admin addresses without credentials are supported",
    );
  if (url.pathname !== "/" && url.pathname !== "/config_dump")
    throw new Error("Address path must be / or /config_dump");
  url.pathname = "/config_dump";
  url.search = includeEds === true ? "?include_eds" : "";
  url.hash = "";
  return url;
}
