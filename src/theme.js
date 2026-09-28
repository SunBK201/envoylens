export const THEME_KEY = "envoylens-theme";
export function readTheme(storage) {
  try {
    const value = storage.getItem(THEME_KEY);
    return ["light", "dark", "system"].includes(value) ? value : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(preference, systemDark, root, storage) {
  root.dataset.theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  try {
    storage.setItem(THEME_KEY, preference);
  } catch {
    /* Private browsing may disable storage. */
  }
}
