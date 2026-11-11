import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function nakamaMediaRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const patterns: NonNullable<
    NonNullable<NextConfig["images"]>["remotePatterns"]
  > = [];

  for (const raw of [
    process.env.NEXT_PUBLIC_NAKAMA_MEDIA_HTTP_URL,
    process.env.NEXT_PUBLIC_NAKAMA_HTTP_URL,
  ]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      const protocol = url.protocol.replace(":", "") as "http" | "https";
      if (
        patterns.some(
          (pattern) =>
            pattern.hostname === url.hostname && pattern.protocol === protocol,
        )
      ) {
        continue;
      }
      patterns.push({
        protocol,
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: "/**",
      });
    } catch {
      // ignore invalid env URLs
    }
  }

  return patterns;
}

function apacheMediaRewrites() {
  const media = process.env.NEXT_PUBLIC_NAKAMA_MEDIA_HTTP_URL;
  if (!media) return [];
  try {
    const origin = new URL(media).origin;
    return [
      {
        source: "/dance_Content",
        destination: `${origin}/dance_Content/`,
        basePath: false as const,
      },
      {
        source: "/dance_Content/",
        destination: `${origin}/dance_Content/`,
        basePath: false as const,
      },
      {
        source: "/dance_Content/:path*",
        destination: `${origin}/dance_Content/:path*`,
        basePath: false as const,
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  allowedDevOrigins: ["192.168.20.20"],
  experimental: {
    lightningCssFeatures: {
      include: [
        "colors",
        "nesting",
        "media-queries",
        "vendor-prefixes",
        "selectors",
      ],
      // Physical RTL conversion is done in PostCSS. Lightning CSS assumes LTR.
      exclude: ["logical-properties"],
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: nakamaMediaRemotePatterns(),
  },
  async rewrites() {
    return { beforeFiles: apacheMediaRewrites() };
  },
};

export default nextConfig;
