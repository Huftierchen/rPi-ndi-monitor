#!/usr/bin/env bash
set -euo pipefail

TTY_DEVICE="${TTY_DEVICE:-/dev/tty1}"
CONFIG_FILE="${CONFIG_FILE:-/etc/ndi-receiver/config.yaml}"
DEFAULT_PORT="${DEFAULT_PORT:-8080}"
LEFT_MARGIN="${LEFT_MARGIN:-4}"
COLUMN_GAP="${COLUMN_GAP:-6}"

if [[ ! -w "${TTY_DEVICE}" ]]; then
  exit 0
fi

# Stop kernel/boot log messages from bleeding into the standby screen.
dmesg --console-off 2>/dev/null || true
if [[ -w /proc/sys/kernel/printk ]]; then
  printf '1 4 1 7\n' > /proc/sys/kernel/printk 2>/dev/null || true
fi
setterm --msg off --cursor off --blank 0 --powersave off >"${TTY_DEVICE}" 2>/dev/null || true

# Best-effort: load a slightly larger console font. Silently keep the default if
# none of these are installed.
for font in \
  Uni3-TerminusBold24x12 \
  Uni2-TerminusBold24x12 \
  Uni3-Terminus24x12 \
  Uni2-Terminus24x12 \
  Uni3-TerminusBold20x10 \
  Uni2-Terminus20x10; do
  if setfont "${font}" -C "${TTY_DEVICE}" 2>/dev/null; then
    break
  fi
done

read_yaml_section_value() {
  local section="$1"
  local key="$2"
  local file="$3"
  awk -v section="${section}" -v key="${key}" '
    /^[^[:space:]].*:[[:space:]]*$/ {
      in_section = ($0 == section ":")
      next
    }
    in_section && $0 ~ "^[[:space:]]+" key ":[[:space:]]*" {
      sub("^[[:space:]]+" key ":[[:space:]]*", "", $0)
      gsub(/^"/, "", $0)
      gsub(/"$/, "", $0)
      print
      exit
    }
  ' "${file}"
}

hostname_short="$(hostname -s 2>/dev/null || hostname)"
hostname_fqdn="$(hostname -f 2>/dev/null || hostname)"

ipv4_address=""
ipv6_address=""
if command -v ip >/dev/null 2>&1; then
  ipv4_address="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4; exit}' | cut -d/ -f1)"
  ipv6_address="$(ip -6 -o addr show scope global 2>/dev/null | awk '{print $4; exit}' | cut -d/ -f1)"
fi
if [[ -z "${ipv4_address}" ]]; then
  ipv4_address="$(hostname -I 2>/dev/null | awk '{for (i = 1; i <= NF; ++i) if ($i ~ /\./ && $i !~ /^127\./) { print $i; exit }}')"
fi

server_port="${DEFAULT_PORT}"
device_name="${hostname_short}"
source_name="not configured"

if [[ -r "${CONFIG_FILE}" ]]; then
  parsed_source="$(read_yaml_section_value "receiver" "sourceName" "${CONFIG_FILE}")"
  if [[ -n "${parsed_source}" ]]; then
    source_name="${parsed_source}"
  fi

  parsed_port="$(read_yaml_section_value "server" "port" "${CONFIG_FILE}")"
  if [[ -n "${parsed_port}" ]]; then
    server_port="${parsed_port}"
  fi

  parsed_device_name="$(read_yaml_section_value "device" "name" "${CONFIG_FILE}")"
  if [[ -n "${parsed_device_name}" ]]; then
    device_name="${parsed_device_name}"
  fi
fi

if [[ -n "${ipv4_address}" ]]; then
  url_host="${ipv4_address}"
elif [[ -n "${ipv6_address}" ]]; then
  url_host="[${ipv6_address}]"
else
  url_host="${hostname_fqdn}"
fi
web_ui_url="http://${url_host}:${server_port}/"

info_lines=(
  "NDI Monitor Appliance"
  ""
  "Device    : ${device_name}"
  "Hostname  : ${hostname_short}"
  "FQDN      : ${hostname_fqdn}"
)
if [[ -n "${ipv4_address}" ]]; then
  info_lines+=("IPv4      : ${ipv4_address}")
fi
if [[ -n "${ipv6_address}" ]]; then
  info_lines+=("IPv6      : ${ipv6_address}")
fi
info_lines+=("Web UI    : ${web_ui_url}")
info_lines+=("Source    : ${source_name}")

qr_lines=()
if command -v qrencode >/dev/null 2>&1; then
  # qrencode -t ASCII emits "##" for dark modules and "  " for light modules,
  # 2 chars per module. We turn each pair into an ANSI-coloured cell so the
  # result is a real solid block on the Linux console regardless of which
  # console font is loaded:
  #   dark module  -> two spaces on the default (dark) background
  #   light module -> two spaces on a white background
  # That produces a phone-scannable black-on-white QR with a clean quiet zone.
  esc_reset=$'\033[0m'
  esc_light=$'\033[47m'
  while IFS= read -r raw_line; do
    ansi_line=""
    i=0
    len=${#raw_line}
    while (( i < len )); do
      pair="${raw_line:i:2}"
      if [[ "${pair}" == "##" ]]; then
        ansi_line+="${esc_reset}  "
      else
        ansi_line+="${esc_light}  "
      fi
      i=$(( i + 2 ))
    done
    ansi_line+="${esc_reset}"
    qr_lines+=("${ansi_line}")
  done < <(qrencode -m 2 -t ASCII "${web_ui_url}" 2>/dev/null || true)
fi

term_cols="$(tput cols 2>/dev/null || echo 80)"

left_width=0
for line in "${info_lines[@]}"; do
  if (( ${#line} > left_width )); then
    left_width=${#line}
  fi
done

printf -v left_margin '%*s' "${LEFT_MARGIN}" ''
printf -v column_gap '%*s' "${COLUMN_GAP}" ''

max_rows=${#info_lines[@]}
if (( ${#qr_lines[@]} > max_rows )); then
  max_rows=${#qr_lines[@]}
fi

{
  printf '\033c\033[?25l'
  printf '\n'

  for (( i = 0; i < max_rows; ++i )); do
    left="${info_lines[$i]-}"
    right="${qr_lines[$i]-}"
    printf '%s%-*s%s%s\n' "${left_margin}" "${left_width}" "${left}" "${column_gap}" "${right}"
  done

  printf '\n'

  hint_lines=(
    "Scan the QR code or open the Web UI URL from any browser in the LAN."
    "When the receiver is idle or stopped, this standby screen remains on HDMI."
  )
  for hint in "${hint_lines[@]}"; do
    pad=$(( (term_cols - ${#hint}) / 2 ))
    if (( pad < 0 )); then
      pad=0
    fi
    printf '%*s%s\n' "${pad}" '' "${hint}"
  done

  printf '\n'
} > "${TTY_DEVICE}"

if command -v qrencode >/dev/null 2>&1; then
  exit 0
fi

# qrencode is missing — surface a clear hint at the bottom of the screen so
# operators can install it without checking logs.
{
  printf '  QR support unavailable: install the package `qrencode`.\n\n'
} > "${TTY_DEVICE}"

exit 0
