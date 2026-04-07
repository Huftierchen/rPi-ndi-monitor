#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/ndi-monitor}"
SYSTEM_USER="${SYSTEM_USER:-ndi-monitor}"
ALLOW_STUB_BACKEND="${ALLOW_STUB_BACKEND:-0}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "run as root" >&2
    exit 1
  fi
}

prepare_pnpm() {
  require_command node
  require_command corepack
  corepack prepare pnpm@10.7.1 --activate >/dev/null
}

configure_user() {
  if ! id -u "${SYSTEM_USER}" >/dev/null 2>&1; then
    useradd --system --home /var/lib/ndi-receiver --shell /usr/sbin/nologin \
      --groups video,audio,render "${SYSTEM_USER}"
  fi
}

build_project() {
  prepare_pnpm
  require_command cmake
  require_command g++
  require_command rsync

  cd "${PROJECT_ROOT}"
  pnpm install
  pnpm --filter @ndi-monitor/web build

  local cmake_args=("-S" "apps/receiver" "-B" "apps/receiver/build")
  if [[ -n "${NDI_SDK_DIR:-}" ]]; then
    cmake_args+=("-DNDI_SDK_DIR=${NDI_SDK_DIR}")
  fi
  if [[ "${ALLOW_STUB_BACKEND}" == "1" ]]; then
    cmake_args+=("-DRECEIVER_ALLOW_STUB_BACKEND=ON")
  else
    cmake_args+=("-DRECEIVER_ALLOW_STUB_BACKEND=OFF")
  fi

  cmake "${cmake_args[@]}"
  cmake --build apps/receiver/build -j"$(nproc)"
}

install_files() {
  install -d "${INSTALL_ROOT}"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "runtime" \
    --exclude "node_modules" \
    --exclude "apps/receiver/build/CMakeFiles" \
    "${PROJECT_ROOT}/" "${INSTALL_ROOT}/"

  install -d /etc/ndi-receiver /var/lib/ndi-receiver /var/log/ndi-receiver
  if [[ ! -f /etc/ndi-receiver/config.yaml ]]; then
    install -m 0640 "${PROJECT_ROOT}/config/default.yaml" /etc/ndi-receiver/config.yaml
  fi

  install -m 0644 "${PROJECT_ROOT}/systemd/ndi-web.service" /etc/systemd/system/ndi-web.service
  install -m 0644 "${PROJECT_ROOT}/systemd/ndi-monitor.tmpfiles.conf" /etc/tmpfiles.d/ndi-monitor.conf

  systemd-tmpfiles --create /etc/tmpfiles.d/ndi-monitor.conf
  chown -R "${SYSTEM_USER}:${SYSTEM_USER}" /var/lib/ndi-receiver /var/log/ndi-receiver
}

enable_service() {
  systemctl daemon-reload
  systemctl enable --now ndi-web.service
}

main() {
  require_root
  require_command install
  configure_user
  build_project
  install_files
  enable_service
  echo "ndi-monitor installed at ${INSTALL_ROOT}"
}

main "$@"
