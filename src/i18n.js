import chinese from "./locales/zh-CN.json" with { type: "json" };

export const LANGUAGE_KEY = "envoylens-language";
export function readLanguage(storage, browserLanguage = "zh") {
  try {
    const saved = storage?.getItem(LANGUAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* Storage may be disabled. */
  }
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}
let language = "en";
if (typeof window !== "undefined") {
  try {
    language = readLanguage(window.localStorage, window.navigator.language);
  } catch {
    language = readLanguage(null, window.navigator.language);
  }
}
const listeners = new Set();
export const getLanguage = () => language;
export const subscribeLanguage = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function setLanguage(next) {
  if (next !== "zh" && next !== "en") return;
  language = next;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, next);
  } catch {}
  if (typeof document !== "undefined")
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  for (const listener of listeners) listener();
}
const dynamicMessages = Object.entries(chinese)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => ({
    value,
    pattern: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("([\\s\\S]*?)") +
        "$",
    ),
  }));
function interpolate(text, args) {
  return text.replace(/\{(\d+)\}/g, (match, index) =>
    args[index] === undefined ? match : String(args[index]),
  );
}
export function translate(text, locale, args = []) {
  if (typeof text !== "string") return text;
  if (locale !== "zh") return interpolate(text, args);
  if (chinese[text]) return interpolate(chinese[text], args);
  for (const { pattern, value } of dynamicMessages) {
    const match = text.match(pattern);
    if (match) return interpolate(value, match.slice(1));
  }
  return interpolate(text, args);
}
export const t = (text, args) => translate(text, language, args);
// Resource names and the original JSON are user data, not UI messages.
export function nodeLabel(node) {
  const detail = node?.detail;
  const match = detail?.match;
  const userLabel = [
    detail?.name,
    match?.path,
    match?.prefix,
    match?.safe_regex?.regex,
    match?.safeRegex?.regex,
  ];
  return userLabel.includes(node?.label) ? node?.label : t(node?.label);
}
