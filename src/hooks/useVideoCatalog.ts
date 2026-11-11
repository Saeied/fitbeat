"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchVideoCatalog,
  normalizeCatalog,
  type VideoCatalogEntry,
} from "@/lib/nakama/mediaCatalog";

export type VideoCatalogStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export type UseVideoCatalogState = {
  status: VideoCatalogStatus;
  videos: VideoCatalogEntry[];
  errorMessage: string | null;
  retry: () => void;
};

/** TV refreshMediaCatalog — only after pairing (showMainApp). */
export function useVideoCatalog(enabled: boolean): UseVideoCatalogState {
  const [status, setStatus] = useState<VideoCatalogStatus>("idle");
  const [videos, setVideos] = useState<VideoCatalogEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setVideos([]);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const list = await fetchVideoCatalog();
        if (cancelled) return;
        const normalized = normalizeCatalog(list);
        setVideos(normalized);
        setStatus(normalized.length ? "ready" : "empty");
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "بارگذاری فهرست ناموفق بود";
        console.error("[VIDEO_CATALOG] fetch failed", error);
        setVideos([]);
        setErrorMessage(message);
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return {
    status,
    videos,
    errorMessage,
    retry,
  };
}
