#!/usr/bin/env bash
# Run on the Apache host. Makes existing MP4s progressive and creates TV variants.
# Usage: sudo bash prepare-tv-media-server.sh [/var/www/html/dance_Content]
set -euo pipefail

ROOT="${1:-/var/www/html/dance_Content}"

command -v ffmpeg >/dev/null || {
  echo "ffmpeg is required" >&2
  exit 1
}
command -v ffprobe >/dev/null || {
  echo "ffprobe is required" >&2
  exit 1
}
[[ -d "$ROOT" ]] || {
  echo "media root not found: $ROOT" >&2
  exit 1
}

faststart_in_place() {
  local input="$1"
  local tmp="${input}.faststart.tmp.mp4"
  local backup="${input}.pre-tv-stability.bak"

  ffmpeg -hide_banner -loglevel error -y -i "$input" \
    -map 0 -c copy -movflags +faststart "$tmp"
  ffprobe -v error "$tmp" >/dev/null

  if [[ ! -e "$backup" ]]; then
    cp -p "$input" "$backup"
  fi
  chmod --reference="$input" "$tmp"
  chown --reference="$input" "$tmp"
  mv -f "$tmp" "$input"
}

encode_variant() {
  local input="$1"
  local height="$2"
  local output="$3"
  local tmp="${output}.tmp.mp4"
  local profile level bitrate maxrate bufsize audio

  if [[ "$height" == "720" ]]; then
    profile="main"; level="3.1"; bitrate="3M"; maxrate="4M"; bufsize="6M"; audio="128k"
  else
    profile="baseline"; level="3.0"; bitrate="1500k"; maxrate="2M"; bufsize="3M"; audio="96k"
  fi

  mkdir -p "$(dirname "$output")"
  ffmpeg -hide_banner -loglevel error -y -i "$input" \
    -map 0:v:0 -map 0:a:0? \
    -c:v libx264 -profile:v "$profile" -level "$level" -pix_fmt yuv420p \
    -vf "scale=-2:${height}" -r 30 -b:v "$bitrate" \
    -maxrate "$maxrate" -bufsize "$bufsize" \
    -c:a aac -b:a "$audio" -ac 2 -ar 48000 \
    -movflags +faststart "$tmp"
  ffprobe -v error "$tmp" >/dev/null
  mv -f "$tmp" "$output"
}

processed=0
while IFS= read -r -d '' input; do
  dir="$(dirname "$input")"
  base="$(basename "$input")"
  echo "Preparing: $input"

  faststart_in_place "$input"
  [[ -f "$dir/720/$base" ]] || encode_variant "$input" 720 "$dir/720/$base"
  [[ -f "$dir/480/$base" ]] || encode_variant "$input" 480 "$dir/480/$base"
  processed=$((processed + 1))
done < <(
  find "$ROOT" -mindepth 2 -maxdepth 2 -type f -name '*.mp4' \
    ! -name '*.tmp.mp4' -print0
)

echo "Prepared $processed source video(s) under $ROOT"
