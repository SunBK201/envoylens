import test from "node:test";
import assert from "node:assert/strict";
import { semanticField } from "../src/envoy-semantics.js";
test("Envoy fields use semantic labels instead of JSON types", () => {
  assert.equal(
    semanticField("filter_chains", [{}]).label,
    "Candidate filter chains",
  );
  assert.equal(semanticField("trafficDirection", "INBOUND").content, "INBOUND");
  assert.equal(
    semanticField("lb_policy", "ROUND_ROBIN").content,
    "ROUND_ROBIN",
  );
  assert.equal(
    semanticField("name", 80, "socket_options").label,
    "Option number",
  );
  assert.equal(
    semanticField("0", { name: "inbound" }, "filter_chains", 0).label,
    "Filter chain 1",
  );
});
test("semantic view keeps unknown fields and falsy values without inventing defaults", () => {
  assert.equal(semanticField("custom_thing", "abc").label, "custom_thing");
  assert.equal(semanticField("port_value", 0).content, "0");
  assert.equal(semanticField("transparent", false).content, "No");
  assert.equal(semanticField("cluster", null).content, "Not set");
  assert.equal(
    semanticField("typed_config", {}).content,
    "No additional configuration",
  );
  assert.equal(
    semanticField("@type", "type.googleapis.com/envoy.extensions.Router")
      .content,
    "Router",
  );
});
