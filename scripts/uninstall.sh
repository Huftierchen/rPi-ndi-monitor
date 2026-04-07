#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/ndi-monitor}"
PURGE="${PURGE:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

systemctl disable --now ndi-web.service || true
systemctl disable --now ndi-standby.service || true
rm -f /etc/systemd/system/ndi-web.service
rm -f /etc/systemd/system/ndi-standby.service
rm -f /etc/tmpfiles.d/ndi-monitor.conf
systemctl daemon-reload

if [[ -f /boot/cmdline.txt.ndi-monitor.bak ]]; then
  cp /boot/cmdline.txt.ndi-monitor.bak /boot/cmdline.txt
fi

systemctl enable --now getty@tty1.service || true

rm -rf "${INSTALL_ROOT}"

if [[ "${PURGE}" == "1" ]]; then
  rm -rf /etc/ndi-receiver /var/lib/ndi-receiver /var/log/ndi-receiver
fi

echo "ndi-monitor uninstalled"
