#!/usr/bin/env bash
# Requires a freshly built dist/ (npm ci && npm run build).
set -euo pipefail

cd "$(dirname "$0")/.."
version="${1:?Usage: bash scripts/build-release.sh v1.2.3}"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$ ]]; then
  echo "Expected a version such as v1.2.3 or v1.2.3-rc.1" >&2
  exit 1
fi
[[ -f dist/index.html ]] || { echo "Run npm run build first" >&2; exit 1; }

out="$PWD/output/releases/$version"
# Never mix fresh artifacts with leftovers from a previous attempt.
mkdir -p "$(dirname "$out")"
[[ ! -e "$out" ]] || { echo "Output already exists: $out" >&2; exit 1; }
mkdir "$out"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

for os in linux darwin windows; do
  for arch in amd64 arm64; do
    name="envoylens_${version}_${os}_${arch}"
    package="$staging/$name"
    mkdir "$package"
    binary=envoylens
    [[ "$os" != windows ]] || binary=envoylens.exe
    CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build \
      -trimpath -ldflags="-s -w" -o "$package/$binary" .
    cp LICENSE README.md README.zh-CN.md "$package/"
    if [[ "$os" == windows ]]; then
      (cd "$staging" && zip -qr "$out/$name.zip" "$name")
    else
      tar -czf "$out/$name.tar.gz" -C "$staging" "$name"
    fi
  done
done
(cd "$out" && shasum -a 256 ./*.tar.gz ./*.zip > checksums.txt)
echo "Release packages: $out"
