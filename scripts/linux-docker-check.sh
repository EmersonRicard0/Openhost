#!/usr/bin/env bash
# Validação do Linux em Docker (specs/004-linux-macos, T020):
#   1. compila no ubuntu:22.04 (-tags webkit2_41) o binário de release e o de abertura (smoke) e
#      gera .deb, .rpm e AppImage dos dois;
#   2. instala o .deb no ubuntu:22.04 e no ubuntu:24.04 e o .rpm no fedora:39; em cada um roda o
#      teste de abertura com o binário instalado, confere as bibliotecas do binário de release e
#      que desinstalar não apaga ~/.config/ShellVault;
#   3. roda o teste de abertura pelo AppImage no ubuntu:22.04.
#
# Uso: scripts/linux-docker-check.sh [versão]   (padrão: a de wails.json)
# Saída: dist/linux-check/ com os pacotes e o log de cada etapa.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-$(sed -n 's/.*"productVersion": *"\([^"]*\)".*/\1/p' wails.json)}"
GO_VERSION="$(sed -n 's/^go \([0-9.]*\).*/\1/p' go.mod)"
NODE_VERSION=24.11.1
WAILS_VERSION=v2.17.0
NFPM_VERSION=v2.43.0
OUT="dist/linux-check"
mkdir -p "$OUT"

# No Git Bash do Windows o Docker precisa do caminho no formato do Windows e sem conversão.
export MSYS_NO_PATHCONV=1
HOST_ROOT="$ROOT"
if command -v cygpath >/dev/null 2>&1; then HOST_ROOT="$(cygpath -w "$ROOT")"; fi

NODE_SETUP="curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | tar -xJ -C /opt && export PATH=/opt/node-v${NODE_VERSION}-linux-x64/bin:\$PATH"

log() { printf '\n== %s ==\n' "$*"; }

log "build no ubuntu:22.04 (Go ${GO_VERSION}, Wails ${WAILS_VERSION})"
# Volumes nomeados guardam módulos do Go e cache de build entre execuções.
docker run --rm -v "${HOST_ROOT}:/src:ro" -v "${HOST_ROOT}/${OUT}:/out"   -v openhost-gomod:/root/go/pkg/mod -v openhost-gocache:/root/.cache ubuntu:22.04 bash -euo pipefail -c "
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl xz-utils git build-essential pkg-config file libgtk-3-dev libwebkit2gtk-4.1-dev >/dev/null
  curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz | tar -xz -C /usr/local
  export PATH=/usr/local/go/bin:/root/go/bin:\$PATH
  ${NODE_SETUP}
  go install github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}
  go install github.com/goreleaser/nfpm/v2/cmd/nfpm@${NFPM_VERSION}
  curl -fsSL -o /usr/local/bin/appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x /usr/local/bin/appimagetool

  # Cópia sem node_modules, binários e saídas do Windows.
  mkdir /work && cd /src
  git config --global --add safe.directory /src
  git ls-files -z --cached --others --exclude-standard | xargs -0 -I{} cp --parents {} /work/ 2>/dev/null || true
  cd /work

  # O main.go embute frontend/dist: vet e testes só depois do build.
  wails build -tags webkit2_41 -trimpath -ldflags '-s -w'
  go vet -tags webkit2_41 ./...
  go test -tags webkit2_41 ./internal/... 2>&1 | grep -v 'no test files'
  VITE_SMOKE=1 wails build -tags 'smoke webkit2_41' -o shellvault-smoke

  BIN=build/bin/shellvault scripts/package-linux.sh ${VERSION} amd64
  mkdir -p /out/release /out/smoke
  cp dist/* /out/release/
  rm -rf dist
  BIN=build/bin/shellvault-smoke scripts/package-linux.sh ${VERSION} amd64
  cp dist/* /out/smoke/
  cp -r scripts /out/scripts
  mkdir -p /out/frontend/src/app && cp frontend/src/app/smoke-secrets.json /out/frontend/src/app/
" 2>&1 | tee "$OUT/build.log"

# Instala o pacote de abertura, roda o teste, troca pelo de release, confere bibliotecas e remove.
check_pkg() {
  local image="$1" kind="$2"
  local slug="${image//[:.]/-}"
  log "${image}: ${kind}"
  local install remove deps
  if [ "$kind" = deb ]; then
    deps="export DEBIAN_FRONTEND=noninteractive; apt-get update -qq; apt-get install -y -qq curl xz-utils xvfb xauth >/dev/null"
    install="apt-get install -y -qq"
    remove="dpkg -r openhost"
  else
    deps="dnf install -y -q curl xz xorg-x11-server-Xvfb xauth which findutils >/dev/null"
    install="dnf install -y -q"
    remove="rpm -e openhost"
  fi
  docker run --rm -v "${HOST_ROOT}/${OUT}:/out:ro" "$image" bash -euo pipefail -c "
    ${deps}
    ${NODE_SETUP}
    cp -r /out/scripts /out/frontend /tmp/ && cd /tmp
    ${install} /out/smoke/*.${kind} >/dev/null
    xvfb-run -a node scripts/smoke.mjs /usr/bin/openhost
    ${remove} >/dev/null

    ${install} /out/release/*.${kind} >/dev/null
    test -f /usr/share/applications/openhost.desktop
    test -f /usr/share/icons/hicolor/512x512/apps/openhost.png
    test -f /usr/share/doc/openhost/copyright
    if ldd /usr/bin/openhost | grep 'not found'; then echo 'bibliotecas faltando' >&2; exit 1; fi
    mkdir -p ~/.config/ShellVault && echo cofre > ~/.config/ShellVault/marca
    ${remove} >/dev/null
    test ! -e /usr/bin/openhost
    grep -q cofre ~/.config/ShellVault/marca
    echo 'pacote ok: instala, abre, desinstala e mantém ~/.config/ShellVault'
  " 2>&1 | tee "$OUT/${slug}-${kind}.log"
}

check_pkg ubuntu:22.04 deb
check_pkg ubuntu:24.04 deb
check_pkg fedora:39 rpm

log "ubuntu:22.04: AppImage"
docker run --rm -v "${HOST_ROOT}/${OUT}:/out:ro" ubuntu:22.04 bash -euo pipefail -c "
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl xz-utils xvfb xauth >/dev/null
  ${NODE_SETUP}
  cp -r /out/scripts /out/frontend /tmp/ && cd /tmp
  cp /out/smoke/*.AppImage /tmp/openhost.AppImage && chmod +x /tmp/openhost.AppImage

  # Sem WebKitGTK: o AppRun explica e sai com 1.
  set +e; APPIMAGE_EXTRACT_AND_RUN=1 /tmp/openhost.AppImage 2>/tmp/err; code=\$?; set -e
  test \$code -eq 1 && grep -q 'WebKitGTK 4.1' /tmp/err

  apt-get install -y -qq libwebkit2gtk-4.1-0 >/dev/null
  APPIMAGE_EXTRACT_AND_RUN=1 xvfb-run -a node scripts/smoke.mjs /tmp/openhost.AppImage
  echo 'AppImage ok'
" 2>&1 | tee "$OUT/ubuntu-22-04-appimage.log"

log "tudo certo"
ls -l "$OUT/release"
