#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

git_pull_repo() {
  if [[ ! -d "${PROJECT_ROOT}/.git" ]]; then
    echo "no git repository at ${PROJECT_ROOT}, skipping git pull"
    return 0
  fi

  if [[ "${SKIP_GIT_PULL:-0}" == "1" ]]; then
    echo "SKIP_GIT_PULL=1 set, skipping git pull"
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    echo "git not installed, skipping git pull" >&2
    return 0
  fi

  local repo_owner
  repo_owner="$(stat -c '%U' "${PROJECT_ROOT}/.git")"

  echo "pulling latest changes in ${PROJECT_ROOT} (as ${repo_owner})"
  if [[ "${repo_owner}" == "root" ]] || ! command -v sudo >/dev/null 2>&1; then
    git -C "${PROJECT_ROOT}" pull --ff-only
  else
    sudo -u "${repo_owner}" git -C "${PROJECT_ROOT}" pull --ff-only
  fi
}

git_pull_repo
systemctl stop ndi-web.service || true
"${PROJECT_ROOT}/install.sh"
echo "ndi-monitor updated"
