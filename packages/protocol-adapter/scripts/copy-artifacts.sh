#!/usr/bin/env bash
# Copia los artefactos Semaphore (profundidad 10) vendorizados a apps/web/public/zk/ para que el navegador
# del votante genere la prueba con rutas /zk/semaphore-10.{wasm,zkey} (ver browserArtifacts()).
# Verifica los SHA-256 registrados en src/artifacts.ts antes de copiar.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../artifacts"
DEST="${1:-$HERE/../../../apps/web/public/zk}"
EXPECTED_WASM="1e9e1e3ad9917164bc96c751e32fae724400b92063f5a2cfd22ca64674bf4f96"
EXPECTED_ZKEY="f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a"
check() { local f="$1" want="$2"; local got; got="$(shasum -a 256 "$f" | cut -d' ' -f1)"; [ "$got" = "$want" ] || { echo "SHA-256 mismatch for $f: $got != $want" >&2; exit 1; }; }
check "$SRC/semaphore-10.wasm" "$EXPECTED_WASM"
check "$SRC/semaphore-10.zkey" "$EXPECTED_ZKEY"
mkdir -p "$DEST"
cp "$SRC/semaphore-10.wasm" "$SRC/semaphore-10.zkey" "$DEST/"
echo "copied semaphore-10.{wasm,zkey} -> $DEST (sha256 ok)"
