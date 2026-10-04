// Generate documentation exclusively from immutable, public upstream Git objects.
// Never read proto files from the source checkout's working tree.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";
import { inflateSync } from "node:zlib";

const commit = "96701cb24611b0f3aac1cc0dd8bf8589fbdf8e9e";
const source = "https://github.com/envoyproxy/envoy";
const docsBase = "https://www.envoyproxy.io/docs/envoy/v1.20.0/";
const inventory = readFileSync(
  new URL("./data/envoy-v1.20.0.objects.inv", import.meta.url),
);
let inventoryStart = 0;
for (let line = 0; line < 4; line++)
  inventoryStart = inventory.indexOf(10, inventoryStart) + 1;
const docs = new Map();
for (const line of inflateSync(inventory.subarray(inventoryStart))
  .toString()
  .split("\n")) {
  const [name, domain, , uri] = line.split(" ");
  if (domain === "std:label" && name.startsWith("envoy_v3_api_")) {
    docs.set(name, new URL(uri.replace(/\$$/, name), docsBase).href);
  }
}
const repo = process.argv[2];
if (!repo)
  throw new Error(
    "Usage: node scripts/generate-envoy-schema.mjs /path/to/public/envoy/checkout",
  );
const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
if (git("rev-parse", `${commit}^{commit}`).trim() !== commit)
  throw new Error("Pinned upstream commit is unavailable");
const files = git("ls-tree", "-r", "--name-only", commit, "api/envoy")
  .trim()
  .split("\n")
  .filter((p) => p.endsWith(".proto"))
  .sort();
const root = new protobuf.Root();
for (const file of files) {
  protobuf.parse.filename = file;
  protobuf.parse(git("show", `${commit}:${file}`), root, {
    keepCase: true,
    alternateCommentMode: true,
  });
}
const definitions = {};
const scalar = {
  string: { type: "string" },
  bytes: { type: "string" },
  bool: { type: "boolean" },
  double: { type: "number" },
  float: { type: "number" },
  int32: { type: "integer" },
  uint32: { type: "integer" },
  sint32: { type: "integer" },
  fixed32: { type: "integer" },
  sfixed32: { type: "integer" },
  int64: { type: ["string", "integer"] },
  uint64: { type: ["string", "integer"] },
  sint64: { type: ["string", "integer"] },
  fixed64: { type: ["string", "integer"] },
  sfixed64: { type: ["string", "integer"] },
};
const external = {
  "google.protobuf.Any": { type: "object", additionalProperties: true },
  "google.protobuf.Struct": { type: "object", additionalProperties: true },
  "google.protobuf.Value": {},
  "google.protobuf.ListValue": { type: "array", items: {} },
  "google.protobuf.Duration": { type: "string" },
  "google.protobuf.Timestamp": { type: "string" },
  "google.protobuf.FieldMask": { type: "string" },
  "google.protobuf.Empty": { type: "object" },
};
for (const [wrapper, primitive] of Object.entries({
  String: "string",
  Bytes: "bytes",
  Bool: "bool",
  Double: "double",
  Float: "float",
  Int32: "int32",
  UInt32: "uint32",
  Int64: "int64",
  UInt64: "uint64",
})) {
  external[`google.protobuf.${wrapper}Value`] = scalar[primitive];
}
function text(comment = "") {
  return (comment || "")
    .replace(/\[#.*?\]/g, "")
    .replace(/:(?:ref|relref|doc):`([^`]+)`/g, (_, value) =>
      value.replace(/\s*<[^>]+>$/, ""),
    )
    .trim();
}
function description(node, fallback) {
  const kind =
    node instanceof protobuf.Field
      ? "field"
      : node instanceof protobuf.Enum
        ? "enum"
        : "msg";
  const name = node.fullName.replace(/^\.envoy\./, "").toLowerCase();
  const url = docs.get(`envoy_v3_api_${kind}_${name}`);
  const body = text(node.comment) || fallback;
  // Only emit links present in the official inventory; hidden/legacy APIs have no invented URLs.
  return url ? `${body}\n\n[Envoy 配置参考](${url})` : body;
}
const ref = (name) => ({ $ref: `#/definitions/${name}` });
function fieldSchema(field) {
  let schema = scalar[field.type];
  if (!schema) {
    const target = field.parent.lookup(field.type, [
      protobuf.Type,
      protobuf.Enum,
    ]);
    const name = target
      ? target.fullName.slice(1)
      : field.type.replace(/^\./, "");
    if (!target && !external[name]) {
      // Imported APIs are deliberately opaque, never inferred from private data.
      external[name] = {};
    }
    schema = ref(name);
  }
  if (field.map) schema = { type: "object", additionalProperties: schema };
  else if (field.repeated) schema = { type: "array", items: schema };
  return {
    ...(schema.$ref ? { allOf: [schema] } : schema),
    markdownDescription: description(field, `Field \`${field.name}\`.`),
  };
}
function collect(namespace) {
  for (const node of namespace.nestedArray ?? []) {
    const name = node.fullName.slice(1);
    if (node instanceof protobuf.Type) {
      const properties = {};
      for (const field of node.fieldsArray) {
        properties[field.name] = fieldSchema(field);
        const camel =
          field.options?.json_name ||
          field.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (camel !== field.name)
          properties[camel] = { ...properties[field.name], doNotSuggest: true };
      }
      properties["@type"] = {
        type: "string",
        const: `type.googleapis.com/${name}`,
        description: "Concrete Protobuf Any message type.",
      };
      definitions[name] = {
        type: "object",
        properties,
        additionalProperties: true,
        markdownDescription: description(node, `Message \`${name}\`.`),
      };
    } else if (node instanceof protobuf.Enum) {
      definitions[name] = {
        anyOf: [
          { type: "string", enum: Object.keys(node.values) },
          { type: "integer" },
        ],
        markdownDescription: description(node, `Enum \`${name}\`.`),
      };
    }
    collect(node);
  }
}
collect(root);
Object.assign(definitions, external);
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Envoy v1.20.0 public API documentation",
  description:
    "Generated from public upstream API sources. For documentation lookup, not complete configuration validation. Imported non-Envoy messages may be opaque.",
  type: "object",
  if: { required: ["configs"] },
  then: ref("envoy.admin.v3.ConfigDump"),
  else: ref("envoy.config.bootstrap.v3.Bootstrap"),
  definitions: Object.fromEntries(
    Object.entries(definitions).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  ),
};
const output = new URL("../public/schema/", import.meta.url);
mkdirSync(output, { recursive: true });
const data = JSON.stringify(schema, null, 2) + "\n";
const hash = (data) => createHash("sha256").update(data).digest("hex");
writeFileSync(new URL("envoy-schema.json", output), data);
writeFileSync(new URL("LICENSE", output), git("show", `${commit}:LICENSE`));
const provenance = {
  source,
  version: "v1.20.0",
  commit,
  schemaSha256: hash(data),
  generatorSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  documentationInventory: `${docsBase}objects.inv`,
  documentationInventorySha256: hash(inventory),
  protoFiles: files,
};
writeFileSync(
  new URL("provenance.json", output),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  `Generated ${Object.keys(definitions).length} public definitions from ${files.length} upstream proto files.`,
);
