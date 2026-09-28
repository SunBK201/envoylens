import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NAV_GROUPS,
  readNavGroups,
  saveNavGroups,
} from "../src/nav-groups.js";
test("navigation defaults to listeners expanded only", () => {
  assert.deepEqual(readNavGroups({ getItem: () => null }), {
    listener: true,
    filter_chain: false,
    cluster: false,
    endpoint: false,
  });
});
test("navigation expansion survives reload", () => {
  let value;
  const storage = {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
  const groups = {
    listener: false,
    filter_chain: true,
    cluster: true,
    endpoint: true,
  };
  saveNavGroups(storage, groups);
  assert.deepEqual(readNavGroups(storage), groups);
});
test("invalid preferences and unavailable storage safely use defaults", () => {
  for (const value of ["{", "null", '"bad"'])
    assert.deepEqual(
      readNavGroups({ getItem: () => value }),
      DEFAULT_NAV_GROUPS,
    );
  assert.deepEqual(
    readNavGroups({ getItem: () => '{"listener":false,"cluster":"true"}' }),
    { ...DEFAULT_NAV_GROUPS, listener: false },
  );
  const denied = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.deepEqual(readNavGroups(denied), DEFAULT_NAV_GROUPS);
  assert.doesNotThrow(() => saveNavGroups(denied, DEFAULT_NAV_GROUPS));
});
