#!/usr/bin/env bash
# Crea .claude/oficina-motor.local.json (fuera del repo) con la identidad y capacidades de ESTA computadora.
# Uso: bash oficina/motor.sh "<Nombre del motor>" <id-persona> [id-motor]
cd "$(dirname "$0")/.." || exit 1
OUT=".claude/oficina-motor.local.json"
NAME="$1"; OWNER="$2"; ID="${3:-}"
if [ -z "$NAME" ]; then read -r -p "Nombre del motor (ej. Mac de José): " NAME; fi
if [ -z "$OWNER" ]; then read -r -p "id de la persona dueña (ej. jose): " OWNER; fi
if [ -z "$ID" ]; then ID=$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[áàä]/a/g; s/[éèë]/e/g; s/[íìï]/i/g; s/[óòö]/o/g; s/[úùü]/u/g; s/ñ/n/g; s/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//'); fi
caps='"negocio"'
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then caps="$caps,\"git\""; fi
if command -v node >/dev/null 2>&1 && { [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; }; then caps="$caps,\"web\""; fi
if [ -d "$HOME/Library/Caches/ms-playwright" ] || [ -d "$HOME/.cache/ms-playwright" ]; then caps="$caps,\"e2e\""; fi
if command -v ffmpeg >/dev/null 2>&1; then caps="$caps,\"video\""; fi
printf '{"id": "%s", "name": "%s", "owner": "%s", "areas": ["*"], "capabilities": [%s]}\n' "$ID" "$NAME" "$OWNER" "$caps" > "$OUT"
echo "Identidad escrita en $OUT:"; cat "$OUT"
