import test from "node:test";
import assert from "node:assert/strict";
import { configIdentity, restoreView, saveView } from "../src/view-storage.js";
const model = {
  nodes: [
    { id: "l", kind: "listener" },
    { id: "a", kind: "filter_chain" },
    { id: "b", kind: "filter_chain" },
  ],
  edges: [{ source: "l", target: "a" }],
};
const storage = () => ({
  value: null,
  getItem() {
    return this.value;
  },
  setItem(k, v) {
    this.value = v;
  },
});
test("restores listener and chain for the same config after reload", () => {
  const s = storage(),
    id = configIdentity("config");
  saveView(s, id, "l", "a");
  assert.deepEqual(restoreView(s, configIdentity("config"), model), {
    listener: "l",
    chain: "a",
  });
  assert.deepEqual(restoreView(s, configIdentity("new config"), model), {
    listener: "",
    chain: "",
  });
});
test("validates resources and chain ownership", () => {
  const s = storage();
  saveView(s, "id", "l", "b");
  assert.deepEqual(restoreView(s, "id", model), { listener: "l", chain: "" });
  saveView(s, "id", "missing", "missing");
  assert.deepEqual(restoreView(s, "id", model), { listener: "", chain: "" });
  saveView(s, "id", "", "a");
  assert.deepEqual(restoreView(s, "id", model), { listener: "", chain: "a" });
});
test("handles corrupt or unavailable storage", () => {
  const s = storage();
  s.value = "{";
  assert.deepEqual(restoreView(s, "id", model), { listener: "", chain: "" });
  const denied = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.deepEqual(restoreView(denied, "id", model), {
    listener: "",
    chain: "",
  });
  assert.doesNotThrow(() => saveView(denied, "id", "l", "a"));
});
