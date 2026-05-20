#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/ndi-monitor}"
SYSTEM_USER="${SYSTEM_USER:-ndi-monitor}"
ALLOW_STUB_BACKEND="${ALLOW_STUB_BACKEND:-0}"
BOOT_CMDLINE="${BOOT_CMDLINE:-/boot/cmdline.txt}"

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

ensure_group() {
  if ! getent group "$1" >/dev/null 2>&1; then
    groupadd --system "$1"
  fi
}

prepare_pnpm() {
  require_command node
  require_command corepack
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@10.7.1 --activate >/dev/null
}

configure_user() {
  local groups=()
  local group_list=""

  for group in video audio render; do
    ensure_group "${group}"
    groups+=("${group}")
  done
  group_list="$(IFS=,; printf '%s' "${groups[*]}")"

  if ! id -u "${SYSTEM_USER}" >/dev/null 2>&1; then
    useradd --system --home /var/lib/ndi-receiver --shell /usr/sbin/nologin \
      --groups "${group_list}" "${SYSTEM_USER}"
    return
  fi

  usermod --append --groups "${group_list}" "${SYSTEM_USER}"
}

build_project() {
  prepare_pnpm
  require_command cmake
  require_command g++
  require_command rsync

  cd "${PROJECT_ROOT}"
  CI=1 corepack pnpm install --force
  corepack pnpm build

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

copy_ndi_runtime() {
  local sdk_dir="${NDI_SDK_DIR:-/opt/ndi_sdk}"
  local sdk_lib_dir=""

  if [[ ! -d "${sdk_dir}" ]]; then
    if [[ "${ALLOW_STUB_BACKEND}" == "1" ]]; then
      echo "NDI SDK directory not found, skipping runtime copy for stub build: ${sdk_dir}"
      return
    fi
    echo "NDI SDK directory not found: ${sdk_dir}" >&2
    exit 1
  fi

  case "$(uname -m)" in
    aarch64)
      sdk_lib_dir="${sdk_dir}/lib/aarch64-rpi4-linux-gnueabi"
      ;;
    x86_64)
      sdk_lib_dir="${sdk_dir}/lib/x86_64-linux-gnu"
      ;;
    *)
      echo "unsupported runtime architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac

  if [[ ! -d "${sdk_lib_dir}" ]]; then
    echo "NDI runtime library directory not found: ${sdk_lib_dir}" >&2
    exit 1
  fi

  install -d "${INSTALL_ROOT}/lib"
  rsync -a "${sdk_lib_dir}/" "${INSTALL_ROOT}/lib/"
}

install_files() {
  install -d "${INSTALL_ROOT}"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "runtime" \
    --exclude "node_modules" \
    --exclude "apps/receiver/build/CMakeFiles" \
    "${PROJECT_ROOT}/" "${INSTALL_ROOT}/"

  install -d -m 0750 /etc/ndi-receiver /var/lib/ndi-receiver /var/log/ndi-receiver
  copy_ndi_runtime
  if [[ ! -f /etc/ndi-receiver/config.yaml ]]; then
    install -m 0640 "${PROJECT_ROOT}/config/default.yaml" /etc/ndi-receiver/config.yaml
  fi

  sed "s|@NODE_BIN@|${NODE_BIN}|g" \
    "${PROJECT_ROOT}/systemd/ndi-web.service" \
    > /etc/systemd/system/ndi-web.service
  chmod 0644 /etc/systemd/system/ndi-web.service
  install -m 0644 "${PROJECT_ROOT}/systemd/ndi-standby.service" /etc/systemd/system/ndi-standby.service
  install -m 0644 "${PROJECT_ROOT}/systemd/ndi-monitor.tmpfiles.conf" /etc/tmpfiles.d/ndi-monitor.conf

  systemd-tmpfiles --create /etc/tmpfiles.d/ndi-monitor.conf
  chown -R "${SYSTEM_USER}:${SYSTEM_USER}" /etc/ndi-receiver /var/lib/ndi-receiver /var/log/ndi-receiver
}

configure_appliance_console() {
  if [[ -f "${BOOT_CMDLINE}" ]]; then
    local current_cmdline new_cmdline token
    current_cmdline="$(tr '\n' ' ' < "${BOOT_CMDLINE}")"
    new_cmdline=""
    for token in ${current_cmdline}; do
      if [[ "${token}" == "console=tty1" ]]; then
        continue
      fi
      new_cmdline+="${token} "
    done

    for token in quiet loglevel=3 vt.global_cursor_default=0; do
      if [[ " ${new_cmdline} " != *" ${token} "* ]]; then
        new_cmdline+="${token} "
      fi
    done

    if [[ ! -f "${BOOT_CMDLINE}.ndi-monitor.bak" ]]; then
      cp "${BOOT_CMDLINE}" "${BOOT_CMDLINE}.ndi-monitor.bak"
    fi
    printf '%s\n' "${new_cmdline% }" > "${BOOT_CMDLINE}"
  fi

  systemctl disable --now getty@tty1.service >/dev/null 2>&1 || true
  systemctl enable ndi-standby.service >/dev/null
}

install_runtime_dependencies() {
  cd "${INSTALL_ROOT}"
  CI=1 corepack pnpm install --prod --force --ignore-scripts
}

enable_service() {
  systemctl daemon-reload
  systemctl restart ndi-standby.service
  systemctl enable ndi-web.service
  systemctl restart ndi-web.service
}

main() {
  require_root
  require_command node
  NODE_BIN="$(command -v node)"
  require_command install
  configure_user
  build_project
  install_files
  install_runtime_dependencies
  configure_appliance_console
  enable_service
  echo "ndi-monitor installed at ${INSTALL_ROOT}"
}

main "$@"
