import test from "node:test";
import assert from "node:assert/strict";
import { readTheme, applyTheme, THEME_KEY } from "../src/theme.js";
test("theme defaults to system and restores only valid preferences", () => {
  for (const value of [null, "invalid"])
    assert.equal(readTheme({ getItem: () => value }), "system");
  for (const value of ["light", "dark", "system"])
    assert.equal(readTheme({ getItem: () => value }), value);
  assert.equal(
    readTheme({
      getItem() {
        throw Error();
      },
    }),
    "system",
  );
});
test("theme follows system only when requested and persists preference", () => {
  const root = { dataset: {} },
    storage = {
      setItem(k, v) {
        this[k] = v;
      },
    };
  for (const [pref, systemDark, expected] of [
    ["system", true, "dark"],
    ["system", false, "light"],
    ["dark", false, "dark"],
    ["light", true, "light"],
  ]) {
    applyTheme(pref, systemDark, root, storage);
    assert.equal(root.dataset.theme, expected);
    assert.equal(storage[THEME_KEY], pref);
  }
});
test("theme still switches when storage is unavailable", () => {
  const root = { dataset: {} };
  applyTheme("dark", false, root, {
    setItem() {
      throw Error();
    },
  });
  assert.equal(root.dataset.theme, "dark");
});
