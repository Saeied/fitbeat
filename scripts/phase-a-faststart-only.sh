#!/usr/bin/env bash
# Phase A: faststart only — no re-encode, no variants.
set -euo pipefail

ROOT="${1:-/var/www/html/dance_Content}"

command -v ffmpeg >/dev/null || { echo "ffmpeg required" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe required" >&2; exit 1; }

faststart_in_place() {
  local input="$1"
  local tmp="${input}.faststart.tmp.mp4"
  local backup="${input}.pre-tv-stability.bak"

  echo "=== Processing: $input ==="
  echo "ORIG_SIZE=$(stat -c '%s' "$input")"
  echo "ORIG_MOov=$(grep -abo moov "$input" | head -1 || true)"

  if [[ ! -e "$backup" ]]; then
    cp -p "$input" "$backup"
    echo "BACKUP_CREATED=$backup"
    echo "BACKUP_SIZE=$(stat -c '%s' "$backup")"
  else
    echo "BACKUP_EXISTS=$backup"
    echo "BACKUP_SIZE=$(stat -c '%s' "$backup")"
  fi

  ffmpeg -hide_banner -loglevel error -y -i "$input" \
    -map 0 -c copy -movflags +faststart "$tmp"

  ffprobe -v error -show_entries format=format_name,duration,size -of default=nw=1 "$tmp"
  ffprobe -v error "$tmp" >/dev/null

  chmod --reference="$backup" "$tmp"
  chown --reference="$backup" "$tmp"
  mv -f "$tmp" "$input"

  echo "NEW_SIZE=$(stat -c '%s' "$input")"
  echo "NEW_MOov=$(grep -abo moov "$input" | head -1 || true)"
  echo "FIRST_MB_MOov=$(head -c 1048576 "$input" | grep -c moov || true)"
  ls -la "$input" "$backup"
  echo "FFPROBE_OK=$input"
  echo ""
}

shopt -s nullglob
files=("$ROOT"/video_00*/video_00*.mp4)
if ((${#files[@]} == 0)); then
  echo "No MP4 files found under $ROOT" >&2
  exit 1
fi

for input in "${files[@]}"; do
  faststart_in_place "$input"
done

echo "Phase A complete: ${#files[@]} file(s)"
