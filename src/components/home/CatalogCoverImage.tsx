"use client";
import { useCallback, useEffect, useState } from "react";
import { legacyRasterCoverFallback, preferWebpCoverUrl } from "@/lib/nakama/gridCoverUrl";

type CatalogCoverImageProps = {
  coverUrl: string;
  className?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  alt?: string;
};

export function CatalogCoverImage({
  coverUrl,
  className,
  loading = "lazy",
  fetchPriority,
  alt = "",
}: CatalogCoverImageProps) {
  const [src, setSrc] = useState(() => preferWebpCoverUrl(coverUrl));

  useEffect(() => {
    setSrc(preferWebpCoverUrl(coverUrl));
  }, [coverUrl]);

  const handleError = useCallback(() => {
    setSrc((current) => {
      const legacy = legacyRasterCoverFallback(current);
      if (legacy) return legacy;
      return current !== coverUrl ? coverUrl : current;
    });
  }, [coverUrl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static Apache URLs; export build has unoptimized images
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={handleError}
      {...(fetchPriority ? { fetchPriority } : {})}
    />
  );
}
