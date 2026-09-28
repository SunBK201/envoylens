import test from "node:test";
import chinese from "../src/locales/zh-CN.json" with { type: "json" };
import assert from "node:assert/strict";
import {
  readLanguage,
  translate,
  nodeLabel,
  setLanguage,
  LANGUAGE_KEY,
} from "../src/i18n.js";

test("language preference is restored before browser language", () => {
  assert.equal(
    readLanguage(
      { getItem: (key) => (key === LANGUAGE_KEY ? "en" : null) },
      "zh-CN",
    ),
    "en",
  );
  assert.equal(readLanguage({ getItem: () => "zh" }, "en-US"), "zh");
  assert.equal(readLanguage({ getItem: () => "invalid" }, "en-GB"), "en");
  assert.equal(readLanguage(null, "zh-TW"), "zh");
  assert.equal(
    readLanguage(
      {
        getItem() {
          throw Error();
        },
      },
      "fr",
    ),
    "en",
  );
});

test("UI messages translate without modifying interpolation values", () => {
  assert.equal(translate("Resources", "en"), "Resources");
  assert.equal(translate("Resources", "zh"), chinese.Resources);
  assert.equal(
    translate("Edit configuration {0}", "en", ["production-cluster"]),
    "Edit configuration production-cluster",
  );
  assert.equal(
    translate("Invalid configuration: bad YAML", "en"),
    "Invalid configuration: bad YAML",
  );
  assert.equal(translate("{0} items", "en", [3]), "3 items");
  assert.equal(translate("user-defined value", "en"), "user-defined value");
});

test("user resource names remain unchanged", () => {
  setLanguage("zh");
  assert.equal(
    nodeLabel({ label: "Inline routes", detail: { name: "Inline routes" } }),
    "Inline routes",
  );
  assert.equal(
    nodeLabel({ label: "Inline routes", detail: {} }),
    chinese["Inline routes"],
  );
  setLanguage("en");
});

test("Chinese templates preserve runtime values and English messages stay unchanged", () => {
  const value = chinese["Inline routes"];
  assert.equal(
    translate("Edit configuration {0}", "zh", [value]),
    chinese["Edit configuration {0}"].replace("{0}", value),
  );
  assert.equal(
    translate("Invalid configuration: bad YAML", "zh"),
    chinese["Invalid configuration: {0}"].replace("{0}", "bad YAML"),
  );
  assert.equal(
    translate("Admin returned HTTP 503", "zh"),
    chinese["Admin returned HTTP {0}"].replace("{0}", "503"),
  );
  assert.equal(translate(value, "en"), value);
});
