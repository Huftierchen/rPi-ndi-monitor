#!/usr/bin/env bash
set -euo pipefail

TTY_DEVICE="${TTY_DEVICE:-/dev/tty1}"
CONFIG_FILE="${CONFIG_FILE:-/etc/ndi-receiver/config.yaml}"

if [[ ! -w "${TTY_DEVICE}" ]]; then
  exit 0
fi

ip_address="$(hostname -I | awk '{print $1}')"
if [[ -z "${ip_address}" ]]; then
  ip_address="$(hostname)"
fi

source_name="not configured"
if [[ -r "${CONFIG_FILE}" ]]; then
  parsed_source="$(awk -F': ' '/^[[:space:]]*sourceName:/ {print $2; exit}' "${CONFIG_FILE}")"
  if [[ -n "${parsed_source}" ]]; then
    source_name="${parsed_source}"
  fi
fi

cat > "${TTY_DEVICE}" <<EOF
\033c\033[?25l

  NDI Monitor
  ----------- 

  Web UI: http://${ip_address}:8080/
  Source: ${source_name}

  Waiting for receiver start from the browser UI.

EOF
