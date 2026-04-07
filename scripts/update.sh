#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

systemctl stop ndi-web.service || true
"${PROJECT_ROOT}/scripts/install.sh"
echo "ndi-monitor updated"
