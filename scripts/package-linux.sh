#!/usr/bin/env bash
# Pacotes do Linux (specs/004-linux-macos, T019, contracts/release.md): .deb, .rpm e AppImage
# a partir do binário do `wails build`. Saída em dist/.
#
# Uso: scripts/package-linux.sh <versão> <amd64|arm64>
#   BIN          binário (padrão: build/bin/shellvault)
#   NFPM         nfpm (padrão: nfpm no PATH)
#   APPIMAGETOOL appimagetool (padrão: appimagetool no PATH)
set -euo pipefail

VERSION="${1:?versão, ex.: 0.4.0}"
ARCH="${2:?arquitetura: amd64 ou arm64}"
case "$ARCH" in
  amd64) RPM_ARCH=x86_64 ;;
  arm64) RPM_ARCH=aarch64 ;;
  *) echo "arquitetura desconhecida: $ARCH" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BIN="${BIN:-build/bin/shellvault}"
NFPM="${NFPM:-nfpm}"
APPIMAGETOOL="${APPIMAGETOOL:-appimagetool}"
OUT="$ROOT/dist"
[ -x "$BIN" ] || { echo "binário não encontrado: $BIN" >&2; exit 1; }
mkdir -p "$OUT"

export VERSION ARCH
mkdir -p "$OUT/.stage"
install -m 0755 "$BIN" "$OUT/.stage/openhost"
"$NFPM" package --config build/linux/nfpm.yaml --packager deb --target "$OUT/openhost_${VERSION}_${ARCH}.deb"
"$NFPM" package --config build/linux/nfpm.yaml --packager rpm --target "$OUT/openhost-${VERSION}-1.${RPM_ARCH}.rpm"

# AppImage: .desktop e ícone na raiz, AppRun que confere o WebKitGTK e o binário em usr/bin.
APPDIR="$(mktemp -d)/OpenHost.AppDir"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/icons/hicolor/512x512/apps"
install -m 0755 "$BIN" "$APPDIR/usr/bin/openhost"
install -m 0755 build/linux/AppRun "$APPDIR/AppRun"
install -m 0644 build/linux/openhost.desktop "$APPDIR/openhost.desktop"
install -m 0644 build/linux/icons/512x512/openhost.png "$APPDIR/openhost.png"
install -m 0644 build/linux/icons/512x512/openhost.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/openhost.png"
ln -s openhost.png "$APPDIR/.DirIcon"
# Sem FUSE (contêineres e CI), o appimagetool roda extraído.
APPIMAGE_EXTRACT_AND_RUN=1 ARCH="$RPM_ARCH" "$APPIMAGETOOL" --no-appstream "$APPDIR" "$OUT/OpenHost-${VERSION}-${RPM_ARCH}.AppImage"
rm -rf "$(dirname "$APPDIR")" "$OUT/.stage"

ls -l "$OUT"
