const KEY = "envoylens-nav-groups";
export const DEFAULT_NAV_GROUPS = {
  listener: true,
  filter_chain: false,
  cluster: false,
  endpoint: false,
};
export function readNavGroups(storage) {
  const result = { ...DEFAULT_NAV_GROUPS };
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    for (const kind of Object.keys(result)) {
      if (typeof saved?.[kind] === "boolean") result[kind] = saved[kind];
    }
  } catch {}
  return result;
}
export function saveNavGroups(storage, groups) {
  try {
    storage.setItem(KEY, JSON.stringify(groups));
  } catch {}
}
