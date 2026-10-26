#!/usr/bin/env bash
# Imagem .dmg do macOS (specs/004-linux-macos, T025, contracts/release.md), sem assinatura da
# Apple: OpenHost.app universal, link para /Applications e o LEIA-ME da primeira abertura.
#
# Uso: scripts/package-macos.sh <versão>
#   APP  pacote .app (padrão: build/bin/OpenHost.app, de `wails build -platform darwin/universal`)
# Saída: dist/OpenHost-<versão>-macos-universal.dmg
set -euo pipefail

VERSION="${1:?versão, ex.: 0.4.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP="${APP:-build/bin/OpenHost.app}"
OUT="$ROOT/dist"
DMG="$OUT/OpenHost-${VERSION}-macos-universal.dmg"
MAX_BYTES=$((40 * 1024 * 1024))

[ -d "$APP" ] || { echo "app não encontrado: $APP" >&2; exit 1; }
EXE="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"

# Universal: as duas arquiteturas no mesmo binário.
ARCHS="$(lipo -archs "$EXE")"
for arch in x86_64 arm64; do
  case " $ARCHS " in *" $arch "*) ;; *) echo "falta $arch no binário ($ARCHS)" >&2; exit 1 ;; esac
done

PLIST_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
[ "$PLIST_VERSION" = "$VERSION" ] || { echo "Info.plist diz $PLIST_VERSION, esperado $VERSION" >&2; exit 1; }

STAGE="$(mktemp -d)/OpenHost"
mkdir -p "$STAGE" "$OUT"
cp -R "$APP" "$STAGE/OpenHost.app"
ln -s /Applications "$STAGE/Applications"
cp "build/darwin/LEIA-ME — primeira abertura.txt" "$STAGE/"

rm -f "$DMG"
hdiutil create -volname OpenHost -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG" >/dev/null
rm -rf "$(dirname "$STAGE")"

SIZE="$(stat -f %z "$DMG")"
if [ "$SIZE" -gt "$MAX_BYTES" ]; then
  echo "dmg com $((SIZE / 1024 / 1024)) MB passa do limite de 40 MB (SC-406)" >&2
  exit 1
fi
echo "ok: $DMG ($((SIZE / 1024 / 1024)) MB, $ARCHS)"
