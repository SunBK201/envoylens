// Local configuration library with a legacy-compatible active snapshot. Never enable polling here.
const DATABASE = "envoylens";
const STORE = "snapshots";
let queue = Promise.resolve();

// randomUUID is secure-context-only; the Go server also supports HTTP LAN access.
function snapshotId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4),
    hex.slice(4, 6),
    hex.slice(6, 8),
    hex.slice(8, 10),
    hex.slice(10),
  ]
    .map((part) => part.join(""))
    .join("-");
}

export function configStorageError(error) {
  if (error?.name === "QuotaExceededError")
    return "Configuration parsed, but browser storage is full. Export your configuration before removing unused snapshots.";
  if (["SecurityError", "NotAllowedError"].includes(error?.name))
    return "Configuration parsed, but browser storage is disabled. Check this site's storage permissions.";
  return `Configuration parsed, but saving failed ({0}). It remains available until you close or reload this page.`.replace(
    "{0}",
    error?.name || "UnknownError",
  );
}
function transaction(mode, action) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new DOMException("Browser storage is unavailable", "NotAllowedError"),
      );
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Browser storage is in use by another page"));
    request.onsuccess = () => {
      const db = request.result;
      let tx, op;
      try {
        tx = db.transaction(STORE, mode);
        op = action(tx.objectStore(STORE));
      } catch (error) {
        if (tx) tx.abort();
        db.close();
        reject(error);
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve(op.result);
      };
      tx.onabort = () => {
        db.close();
        reject(
          tx.error || op.error || new Error("Browser storage operation failed"),
        );
      };
      tx.onerror = () => {};
    };
  });
}
function ordered(mode, action) {
  const operation = queue.then(() => transaction(mode, action));
  queue = operation.catch(() => {});
  return operation;
}
export function readLastConfig() {
  return ordered("readonly", (store) => store.get("last"));
}
export function saveLastConfig(snapshot) {
  return ordered("readwrite", (store) =>
    store.put({ ...snapshot, version: 1 }, "last"),
  );
}
export function clearLastConfig() {
  return ordered("readwrite", (store) => store.delete("last"));
}

// Library and active snapshot are committed together to avoid partial switches.
export function saveConfig(snapshot, { activate = true } = {}) {
  return ordered("readwrite", (store) => {
    const result = { result: null };
    const request = store.get("library");
    request.onsuccess = () => {
      const items = request.result || [];
      const existing = items.find((item) =>
        snapshot.id
          ? item.id === snapshot.id
          : snapshot.remote
            ? item.remote === snapshot.remote
            : item.text === snapshot.text && item.source === snapshot.source,
      );
      const item = {
        ...snapshot,
        id: existing?.id || snapshot.id || snapshotId(),
        name: snapshot.name?.trim() || existing?.name || snapshot.source,
        version: 1,
      };
      const next = existing
        ? items.map((entry) => (entry.id === item.id ? item : entry))
        : [...items, item];
      store.put(next, "library");
      if (activate) store.put(item, "last");
      result.result = { item, items: next };
    };
    return result;
  });
}
export function readConfigLibrary() {
  return ordered("readwrite", (store) => {
    const result = { result: [] };
    const request = store.get("library");
    request.onsuccess = () => {
      if (request.result) {
        result.result = request.result;
        return;
      }
      const legacy = store.get("last");
      legacy.onsuccess = () => {
        const saved = legacy.result;
        if (!saved || typeof saved.text !== "string") return;
        const item = { ...saved, id: snapshotId(), name: saved.source };
        store.put([item], "library");
        store.put(item, "last");
        result.result = [item];
      };
    };
    return result;
  });
}
export function activateConfig(id) {
  return ordered("readwrite", (store) => {
    const result = { result: null };
    const request = store.get("library");
    request.onsuccess = () => {
      const item = (request.result || []).find((entry) => entry.id === id);
      if (item) {
        store.put(item, "last");
        result.result = item;
      }
    };
    return result;
  });
}
export function removeConfig(id) {
  return ordered("readwrite", (store) => {
    const result = { result: [] };
    const request = store.get("library");
    request.onsuccess = () => {
      result.result = (request.result || []).filter((entry) => entry.id !== id);
      store.put(result.result, "library");
      const active = store.get("last");
      active.onsuccess = () => {
        if (active.result?.id === id) store.delete("last");
      };
    };
    return result;
  });
}
export function renameConfig(id, name) {
  return ordered("readwrite", (store) => {
    const result = { result: [] };
    const request = store.get("library");
    request.onsuccess = () => {
      result.result = (request.result || []).map((item) =>
        item.id === id ? { ...item, name: name.trim() || item.name } : item,
      );
      store.put(result.result, "library");
      const active = store.get("last");
      active.onsuccess = () => {
        if (active.result?.id === id)
          store.put(
            result.result.find((item) => item.id === id),
            "last",
          );
      };
    };
    return result;
  });
}
