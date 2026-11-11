#!/usr/bin/env bash
# Encode TV-friendly H.264/AAC variants with faststart (progressive MP4).
# Usage: ./scripts/encode-tv-variants.sh input.mp4 output_basename
# Example: ./scripts/encode-tv-variants.sh video_001.mp4 video_001
#
# Nested layout (matches client catalog + Apache):
#   video_001/video_001.mp4
#   video_001/720/video_001.mp4
#   video_001/480/video_001.mp4
#
# Optional flat suffix copies (legacy): set FLAT_SUFFIX=1

set -euo pipefail

INPUT="${1:?input mp4 required}"
BASE="${2:?output basename required}"

mkdir -p "${BASE}/720" "${BASE}/480"

encode_variant() {
  local scale="$1"
  local profile="$2"
  local level="$3"
  local bv="$4"
  local maxrate="$5"
  local bufsize="$6"
  local abr="$7"
  local out="$8"

  ffmpeg -y -i "$INPUT" \
    -c:v libx264 -profile:v "$profile" -level "$level" -pix_fmt yuv420p \
    -c:a aac -b:a "$abr" -ac 2 -ar 48000 \
    -vf "scale=-2:${scale}" -r 30 -b:v "$bv" -maxrate "$maxrate" -bufsize "$bufsize" \
    -movflags +faststart "$out"
}

encode_variant 1080 main 4.0 5M 6M 10M 128k "${BASE}/${BASE}.mp4"
encode_variant 720 main 3.1 3M 4M 6M 128k "${BASE}/720/${BASE}.mp4"
encode_variant 480 baseline 3.0 1500k 2M 3M 96k "${BASE}/480/${BASE}.mp4"

if [[ "${FLAT_SUFFIX:-0}" == "1" ]]; then
  cp "${BASE}/${BASE}.mp4" "${BASE}.mp4"
  cp "${BASE}/720/${BASE}.mp4" "${BASE}_720p.mp4"
  cp "${BASE}/480/${BASE}.mp4" "${BASE}_480p.mp4"
  echo "Flat suffix copies: ${BASE}.mp4 ${BASE}_720p.mp4 ${BASE}_480p.mp4"
fi

echo "Done (nested): ${BASE}/${BASE}.mp4 ${BASE}/720/${BASE}.mp4 ${BASE}/480/${BASE}.mp4"
