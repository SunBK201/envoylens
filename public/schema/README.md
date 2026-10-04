# Public Envoy API documentation schema

Generated exclusively from the public [Envoy v1.20.0 sources](https://github.com/envoyproxy/envoy/tree/96701cb24611b0f3aac1cc0dd8bf8589fbdf8e9e/api/envoy), at immutable commit `96701cb24611b0f3aac1cc0dd8bf8589fbdf8e9e`.

- Includes public message fields, enum values, and upstream proto comments.
- Hover links use the official Envoy documentation website and exact field anchors from the vendored v1.20.0 Sphinx inventory (`scripts/data/envoy-v1.20.0.objects.inv`). Fields absent from that inventory keep their text without an invented documentation link.
- Does not incorporate downstream extensions, deployment metadata, or local annotations.
- Used for documentation lookup, **not** complete JSON Schema validation.
- Imported non-Envoy APIs are opaque unless they are supported Protobuf well-known types.
- Public API comments retain their upstream language; they are not automatically translated.
- Envoy sources are Apache-2.0 licensed; see the accompanying `LICENSE`.

## Reproduce

With a public Envoy Git checkout containing the pinned commit:

```sh
npm ci
npm run schema:generate -- /path/to/envoy
npm test
```

The generator reads only the pinned commit's Git objects, never working-tree proto files. `provenance.json` records the upstream source list and SHA-256 hashes of the schema, generator, and official documentation inventory. Tests verify these hashes and reference integrity to reject unreviewed manual changes. To update, review the public source commit in the generator, regenerate, and commit the updated provenance together with the schema. Never replace the asset with a private schema snapshot.
