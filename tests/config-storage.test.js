import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  readLastConfig,
  saveLastConfig,
  clearLastConfig,
} from "../src/config-storage.js";
test("last successful snapshot survives a new read and replacement", async () => {
  await clearLastConfig();
  assert.equal(await readLastConfig(), undefined);
  const first = {
    text: "static_resources: {}",
    source: "upload.yaml",
    remote: "",
    savedAt: "2026-09-28T00:00:00Z",
  };
  await saveLastConfig(first);
  assert.deepEqual(await readLastConfig(), { ...first, version: 1 });
  await saveLastConfig({
    ...first,
    text: '{"configs":[]}',
    source: "Paste configuration",
  });
  assert.equal((await readLastConfig()).source, "Paste configuration");
  await clearLastConfig();
  assert.equal(await readLastConfig(), undefined);
});
test("queued saves and clear keep invocation order", async () => {
  const first = saveLastConfig({ text: "first", source: "one" });
  const second = saveLastConfig({ text: "second", source: "two" });
  await Promise.all([first, second]);
  assert.equal((await readLastConfig()).text, "second");
  const pending = saveLastConfig({ text: "third", source: "three" });
  const clear = clearLastConfig();
  await Promise.all([pending, clear]);
  assert.equal(await readLastConfig(), undefined);
});
test("stores large snapshots without localStorage size limits and never polling state", async () => {
  const text = " ".repeat(6 * 1024 * 1024) + '{"configs":[]}';
  await saveLastConfig({
    text,
    source: "Admin",
    remote: "http://127.0.0.1:9901",
  });
  const saved = await readLastConfig();
  assert.equal(saved.text, text);
  assert.equal(saved.remote, "http://127.0.0.1:9901");
  assert.equal(saved.auto, undefined);
  await clearLastConfig();
});
