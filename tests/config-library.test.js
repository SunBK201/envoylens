import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  saveLastConfig,
  readLastConfig,
  readConfigLibrary,
  saveConfig,
  activateConfig,
  removeConfig,
  renameConfig,
} from "../src/config-storage.js";

test("migrates the legacy snapshot without losing content", async () => {
  await saveLastConfig({
    text: "legacy",
    source: "old.json",
    remote: "",
    savedAt: "today",
  });
  const items = await readConfigLibrary();
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "legacy");
  assert.equal(items[0].name, "old.json");
  assert(items[0].id);
  assert.equal((await readLastConfig()).id, items[0].id);
});
test("keeps paste, upload and multiple Admin configurations and switches the active snapshot", async () => {
  const pasted = await saveConfig({
    text: "paste",
    source: "Paste configuration",
    name: "Test",
  });
  const uploaded = await saveConfig({ text: "upload", source: "file.yaml" });
  const admin = await saveConfig({
    text: "admin",
    source: "url",
    remote: "http://localhost:9901",
  });
  await saveConfig({
    text: "admin2",
    source: "url2",
    remote: "http://localhost:9902",
  });
  const items = await readConfigLibrary();
  for (const id of [pasted.item.id, uploaded.item.id, admin.item.id])
    assert(items.some((item) => item.id === id));
  await activateConfig(pasted.item.id);
  assert.equal((await readLastConfig()).name, "Test");
  assert.equal(await activateConfig("missing"), null);
  assert.equal((await readLastConfig()).id, pasted.item.id);
});
test("Admin refresh updates in place and preserves the custom name", async () => {
  const first = await saveConfig({
    text: "v1",
    source: "url",
    remote: "http://host:9901",
    name: "Production",
  });
  const refreshed = await saveConfig({
    text: "v2",
    source: "url",
    remote: "http://host:9901",
  });
  assert.equal(refreshed.item.id, first.item.id);
  assert.equal(refreshed.item.name, "Production");
  assert.equal(refreshed.items.length, first.items.length);
  assert.equal((await readLastConfig()).text, "v2");
  assert.equal((await readLastConfig()).auto, undefined);
});
test("rename and deletion affect only the chosen configuration", async () => {
  const first = await saveConfig({ text: "a", source: "a" });
  const second = await saveConfig({ text: "b", source: "b" });
  await renameConfig(second.item.id, "Renamed");
  assert.equal((await readLastConfig()).name, "Renamed");
  await removeConfig(first.item.id);
  assert.equal((await readLastConfig()).id, second.item.id);
  const items = await removeConfig(second.item.id);
  assert(
    !items.some(
      (item) => item.id === first.item.id || item.id === second.item.id,
    ),
  );
  assert.equal(await readLastConfig(), undefined);
  assert((await readConfigLibrary()).length > 0);
});

test("editing an existing inactive config preserves its ID and active selection", async () => {
  const first = await saveConfig({
    text: "original",
    source: "edit.yaml",
    name: "Before",
  });
  const current = await saveConfig({ text: "current", source: "current.yaml" });
  const before = await readConfigLibrary();
  const result = await saveConfig(
    {
      ...first.item,
      text: "edited",
      name: "After",
      remote: "http://new-host:9901",
    },
    { activate: false },
  );
  assert.equal(result.item.id, first.item.id);
  assert.equal(result.items.length, before.length);
  assert.equal(result.item.text, "edited");
  assert.equal(result.item.name, "After");
  assert.equal((await readLastConfig()).id, current.item.id);
  assert.equal(
    result.items.find((item) => item.id === current.item.id).text,
    "current",
  );
});
test("editing the active config updates the restored snapshot", async () => {
  const result = await saveConfig({ text: "old", source: "active-edit.yaml" });
  await saveConfig({ ...result.item, text: "new" });
  assert.equal((await readLastConfig()).text, "new");
  assert.equal((await readLastConfig()).id, result.item.id);
});

test("HTTP origins without randomUUID can save, update and restore snapshots", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const getRandomValues = globalThis.crypto.getRandomValues.bind(
    globalThis.crypto,
  );
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues },
  });
  try {
    const first = await saveConfig({ text: "http-one", source: "http.json" });
    const second = await saveConfig({ text: "http-two", source: "http2.json" });
    assert.match(
      first.item.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.notEqual(first.item.id, second.item.id);
    await saveConfig({ ...first.item, text: "http-updated" });
    assert.equal((await readLastConfig()).text, "http-updated");
    assert.equal((await readLastConfig()).id, first.item.id);
    assert(
      (await readConfigLibrary()).some((item) => item.id === second.item.id),
    );
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});

test("Admin snapshots preserve each configuration's includeEds choice", async () => {
  const enabled = await saveConfig({
    text: "eds",
    source: "eds",
    remote: "http://eds:9901",
    includeEds: true,
  });
  const disabled = await saveConfig({
    text: "no-eds",
    source: "no-eds",
    remote: "http://no-eds:9901",
    includeEds: false,
  });
  assert.equal((await readLastConfig()).includeEds, false);
  await activateConfig(enabled.item.id);
  assert.equal((await readLastConfig()).includeEds, true);
  await saveConfig({ ...enabled.item, text: "refreshed" });
  assert.equal((await readLastConfig()).includeEds, true);
  await activateConfig(disabled.item.id);
  assert.equal((await readLastConfig()).includeEds, false);
});

test("editing includeEds updates the saved choice without changing the active configuration", async () => {
  const first = await saveConfig({
    text: "first",
    source: "first",
    remote: "http://first:9901",
    includeEds: false,
  });
  const second = await saveConfig({
    text: "second",
    source: "second",
    remote: "http://second:9901",
    includeEds: false,
  });
  const edited = await saveConfig(
    { ...first.item, includeEds: true },
    { activate: false },
  );
  assert.equal(edited.item.id, first.item.id);
  assert.equal(edited.item.includeEds, true);
  assert.equal((await readLastConfig()).id, second.item.id);
  assert.equal((await readLastConfig()).includeEds, false);
  await activateConfig(first.item.id);
  assert.equal((await readLastConfig()).includeEds, true);
  await saveConfig({ ...edited.item, includeEds: false });
  assert.equal((await readLastConfig()).includeEds, false);
});
