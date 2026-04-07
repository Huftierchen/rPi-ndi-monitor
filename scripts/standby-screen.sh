#!/usr/bin/env bash
set -euo pipefail

TTY_DEVICE="${TTY_DEVICE:-/dev/tty1}"
CONFIG_FILE="${CONFIG_FILE:-/etc/ndi-receiver/config.yaml}"
DEFAULT_PORT="${DEFAULT_PORT:-8080}"

if [[ ! -w "${TTY_DEVICE}" ]]; then
  exit 0
fi

read_yaml_value() {
  local key="$1"
  local file="$2"
  awk -F': *' -v key="${key}" '$1 ~ "^[[:space:]]*" key "$" {print $2; exit}' "${file}" \
    | sed -e 's/^"//' -e 's/"$//'
}

hostname_short="$(hostname -s 2>/dev/null || hostname)"
hostname_fqdn="$(hostname -f 2>/dev/null || hostname)"
bonjour_host="${hostname_short}.local"

ip_address="$(hostname -I | awk '{for (i = 1; i <= NF; ++i) if ($i !~ /^127\./) { print $i; exit }}')"
if [[ -z "${ip_address}" ]]; then
  ip_address="${hostname_fqdn}"
fi

server_port="${DEFAULT_PORT}"
device_name="${hostname_short}"
source_name="not configured"

if [[ -r "${CONFIG_FILE}" ]]; then
  parsed_source="$(read_yaml_value "sourceName" "${CONFIG_FILE}")"
  if [[ -n "${parsed_source}" ]]; then
    source_name="${parsed_source}"
  fi

  parsed_port="$(read_yaml_value "port" "${CONFIG_FILE}")"
  if [[ -n "${parsed_port}" ]]; then
    server_port="${parsed_port}"
  fi

  parsed_device_name="$(read_yaml_value "name" "${CONFIG_FILE}")"
  if [[ -n "${parsed_device_name}" ]]; then
    device_name="${parsed_device_name}"
  fi
fi

web_ui_url="http://${ip_address}:${server_port}/"
bonjour_url="http://${bonjour_host}:${server_port}/"

{
  printf '\033c\033[?25l'
  printf '\n'
  printf '  ================================================================\n'
  printf '  NDI Monitor Appliance\n'
  printf '  ================================================================\n'
  printf '\n'
  printf '  Device    : %s\n' "${device_name}"
  printf '  Hostname  : %s\n' "${hostname_short}"
  printf '  FQDN      : %s\n' "${hostname_fqdn}"
  printf '  Bonjour   : %s\n' "${bonjour_host}"
  printf '  IP        : %s\n' "${ip_address}"
  printf '  Web UI    : %s\n' "${web_ui_url}"
  printf '  Source    : %s\n' "${source_name}"
  printf '\n'
  printf '  Scan the QR code or open the Web UI URL from any browser in the LAN.\n'
  printf '  When the receiver is idle or stopped, this standby screen remains on HDMI.\n'
  printf '\n'

  if command -v qrencode >/dev/null 2>&1; then
    qrencode -m 1 -t ANSIUTF8 "${web_ui_url}" || true
    printf '\n'
  else
    printf '  QR support unavailable: install the package `qrencode`.\n'
    printf '\n'
  fi

  printf '  Alternate URL: %s\n' "${bonjour_url}"
  printf '\n'
} > "${TTY_DEVICE}"

exit 0
