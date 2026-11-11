import type { VideoIntentStatus } from "@/hooks/useVideoDownloadIntent";
import type { VideoPreloadStatus } from "@/hooks/useVideoPreload";

export type SongListStatusTone = "brand" | "brand-deep" | "brand-semibold";

export function songListActiveStatus(
  active: boolean,
  locked: boolean,
  intentStatus: VideoIntentStatus,
  preloadStatus: VideoPreloadStatus,
  intentError: string | null,
): { line: string | null; tone: SongListStatusTone } {
  if (!active || locked) {
    return { line: null, tone: "brand" };
  }
  if (intentStatus === "sending") {
    return { line: "در حال هماهنگ‌کردن با گوشی…", tone: "brand" };
  }
  if (preloadStatus === "loading") {
    return { line: "در حال بارگذاری ویدیو…", tone: "brand" };
  }
  if (preloadStatus === "ready") {
    return { line: "ویدیو آماده است", tone: "brand-semibold" };
  }
  if (preloadStatus === "error") {
    return { line: "بارگذاری ویدیو ناموفق", tone: "brand-deep" };
  }
  if (intentStatus === "sent") {
    return { line: "در انتظار بارگذاری…", tone: "brand" };
  }
  if (intentStatus === "error") {
    return {
      line: intentError ?? "ارسال به گوشی ناموفق بود",
      tone: "brand-deep",
    };
  }
  return { line: null, tone: "brand" };
}
