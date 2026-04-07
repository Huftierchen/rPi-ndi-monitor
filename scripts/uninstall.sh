#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/ndi-monitor}"
PURGE="${PURGE:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

systemctl disable --now ndi-web.service || true
rm -f /etc/systemd/system/ndi-web.service
rm -f /etc/tmpfiles.d/ndi-monitor.conf
systemctl daemon-reload

rm -rf "${INSTALL_ROOT}"

if [[ "${PURGE}" == "1" ]]; then
  rm -rf /etc/ndi-receiver /var/lib/ndi-receiver /var/log/ndi-receiver
fi

echo "ndi-monitor uninstalled"
