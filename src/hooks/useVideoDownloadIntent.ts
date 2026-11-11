"use client";

import { useCallback, useRef, useState } from "react";
import { sendVideoDownloadIntent } from "@/lib/nakama/sessionNotifications";

export type VideoIntentStatus = "idle" | "sending" | "sent" | "error";

export type UseVideoDownloadIntentState = {
  status: VideoIntentStatus;
  videoId: string | null;
  errorMessage: string | null;
  send: (videoId: string | number) => Promise<void>;
  reset: () => void;
};

export function useVideoDownloadIntent(): UseVideoDownloadIntentState {
  const [status, setStatus] = useState<VideoIntentStatus>("idle");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generationRef = useRef(0);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setStatus("idle");
    setVideoId(null);
    setErrorMessage(null);
  }, []);

  const send = useCallback(async (id: string | number) => {
    const generation = generationRef.current;
    setStatus("sending");
    setVideoId(String(id));
    setErrorMessage(null);
    try {
      await sendVideoDownloadIntent(id);
      if (generation !== generationRef.current) {
        console.log(
          "[VIDEO_SYNC][VideoDownloadIntent] send ignored — flow epoch changed",
          { videoId: id },
        );
        return;
      }
      setStatus("sent");
    } catch (error) {
      if (generation !== generationRef.current) return;
      setStatus("error");
      const raw =
        error instanceof Error ? error.message : "ارسال به گوشی ناموفق بود";
      setErrorMessage(
        /subscription_required/i.test(raw)
          ? "برای تماشای این ویدیو اشتراک تهیه کنید."
          : raw,
      );
      throw error;
    }
  }, []);

  return { status, videoId, errorMessage, send, reset };
}
