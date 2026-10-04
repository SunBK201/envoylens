# EnvoyLens

English | [简体中文](README.zh-CN.md)

EnvoyLens is a visual explorer for Envoy bootstrap configurations and Admin config dumps. Inspect resource details and dependencies without reading an entire configuration by hand.

Import JSON or YAML from an Admin endpoint, pasted text, or a local file. Explore a graph, a grouped resource list, or the complete JSON configuration, and save multiple configurations in your browser.

## Features

- **Dependency graph** for Listeners, Listener filters, Filter chains, matches, Network filters, HTTP filters, routes, clusters, and endpoints.
- **Resource navigation** with collapsible groups, counts, ascending/descending name sorting, and a resizable sidebar.
- **Configuration details** with highlighted, foldable JSON and line numbers, plus a compact semantic view with icons.
- **Resource origins** labeled `Bootstrap` or `xDS` when known, independently of lifecycle state and cluster discovery type.
- **Configuration library** to switch, rename, edit, delete, and export saved configurations.
- **Interactive canvas** with dragging, trackpad pinch zoom, fit-to-view, search, hover previews, and dependency highlighting.
- **Appearance** with light, dark, and system themes; saved view and navigation preferences.
- **Envoy 1.20 reference links** in details and previews, with generic references for unmapped extensions.

## Quick start

### Build a standalone Go binary

Build requirements: **Node.js 22.12+**, npm, and **Go 1.22+**.

```sh
npm ci
npm run build:go
./bin/envoylens
```

The binary embeds the frontend and Admin proxy. Copy it to a machine with the same OS and architecture; **Node.js, npm, and an external dist directory are not needed at runtime**.

By default, it listens on **`0.0.0.0:4173`**. Open [EnvoyLens locally](http://127.0.0.1:4173), or use the server's IP address from another device.

### Listening address

```sh
# Local access only
./bin/envoylens -addr 127.0.0.1:4173

# Custom port on all IPv4 interfaces
./bin/envoylens -addr 0.0.0.0:8080

# IPv6 loopback
./bin/envoylens -addr '[::1]:4173'

./bin/envoylens -h
```

`PORT` sets the default port; an explicit `-addr` overrides it. There is no `-port` flag.

With a wildcard binding, the Admin API accepts IP-based and localhost access. For hostname access, use a hostname resolving to a local listening interface in `-addr` so it matches the API Host check.

### Node.js development

```sh
npm ci
npm run dev
```

The development server supports hot reload and listens on `127.0.0.1:4173`. Unlike the Go binary, the Node server is always loopback-only.

```sh
PORT=4180 npm run dev

# Serve the production frontend with Node
npm run build
npm start
```

## Build and test

```sh
npm test          # JavaScript tests
npm run build     # Frontend assets in dist/
npm run test:go   # Build embedded assets, then run go test
npm run build:go  # Standalone binary in bin/envoylens
```

Go uses `go:embed` for `dist/`. On a fresh checkout, run `npm ci && npm run build` before invoking `go build` or `go test` directly. Rebuild the binary after frontend changes.

### Cross-compilation

```sh
npm run build
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-linux-amd64 .
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-linux-arm64 .
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-darwin-arm64 .
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-windows-amd64.exe .
```

### Custom Envoy reference URL

Use the book icon (Documentation settings) in the bottom-right corner to set a
versioned documentation root or compatible mirror. A home URL ending in `/index.html`
is automatically normalized to its containing directory. Resource details and node previews
update immediately after saving. The setting is stored in the current browser.
Leave the field blank or restore the default and save to use the original v1.20.0 root.
Only HTTP/HTTPS URLs without credentials, query parameters, or fragments are accepted.
Existing API paths and anchors are retained; availability in other versions or mirrors
is not automatically verified.
