#!/usr/bin/env node
/**
 * Verify HTTP Range support and TV-friendly headers for dance MP4 files.
 * Usage: node scripts/verify-video-range.mjs [videoUrl] [720Url] [480Url]
 */
const defaultUrl =
  process.env.VIDEO_TEST_URL ||
  "http://85.198.11.216/dance_Content/video_001/video_001.mp4";

const urls = process.argv.slice(2).filter(Boolean);
if (!urls.length) urls.push(defaultUrl);

async function probe(url) {
  const headRes = await fetch(url, { method: "HEAD" });
  const acceptRanges = headRes.headers.get("accept-ranges");
  const contentEncoding = headRes.headers.get("content-encoding");
  const rangeRes = await fetch(url, {
    headers: { Range: "bytes=0-1048575" },
  });
  const buf = await rangeRes.arrayBuffer();
  const firstChunk = Buffer.from(buf);
  const fastStart = firstChunk.includes(Buffer.from("moov"));

  const head = {
    status: headRes.status,
    acceptRanges,
    contentType: headRes.headers.get("content-type"),
    contentLength: headRes.headers.get("content-length"),
    cacheControl: headRes.headers.get("cache-control"),
    contentEncoding,
    etag: headRes.headers.get("etag"),
    lastModified: headRes.headers.get("last-modified"),
  };

  const range = {
    status: rangeRes.status,
    contentRange: rangeRes.headers.get("content-range"),
    contentLength: rangeRes.headers.get("content-length"),
    bytesReceived: buf.byteLength,
    fastStart,
  };

  const ok =
    head.status === 200 &&
    acceptRanges?.includes("bytes") &&
    range.status === 206 &&
    buf.byteLength > 0 &&
    fastStart &&
    !contentEncoding;

  return { url, head, range, ok };
}

async function main() {
  console.log("Video range verification\n");

  let allOk = true;
  for (const url of urls) {
    const result = await probe(url);
    console.log(`URL: ${url}`);
    console.log("HEAD", result.head);
    console.log("RANGE", result.range);
    console.log(result.ok ? "✓ OK\n" : "✗ FAIL\n");
    if (!result.ok) allOk = false;
  }

  if (allOk) {
    console.log("All probes passed.");
    process.exit(0);
  }

  console.error("One or more probes failed.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
