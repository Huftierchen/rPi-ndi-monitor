#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

systemctl stop ndi-web.service || true
"${PROJECT_ROOT}/scripts/install.sh"
echo "ndi-monitor updated"
