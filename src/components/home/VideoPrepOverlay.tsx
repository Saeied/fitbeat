"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type KeyboardEventHandler,
} from "react";
import { DanceResultOverlay } from "@/components/home/DanceResultOverlay";
import { LiveScoreOverlay } from "@/components/home/LiveScoreOverlay";
import type { UseDanceResultState } from "@/hooks/useDanceResult";
import type { UseFrameSyncState } from "@/hooks/useFrameSync";
import type { UseLiveScoreState } from "@/hooks/useLiveScore";
import type { UsePlayReadyState } from "@/hooks/usePlayReady";
import type { UseVideoPreloadState } from "@/hooks/useVideoPreload";
import type { UseVideoSyncStartState } from "@/hooks/useVideoSyncStart";
import { useArrowFocusNavigation } from "@/hooks/useArrowFocusNavigation";
import { IoExitOutline } from "react-icons/io5";
import { isTvArrowKey } from "@/lib/tv/arrowKeys";
import { preloadImage } from "@/lib/preloadImage";
import { DANCE_RESULT_BG_URL } from "@/lib/danceResultAssets";
import { CatalogCoverImage } from "@/components/home/CatalogCoverImage";
import type {
  VideoCatalogEntry,
  VideoDifficality,
} from "@/lib/nakama/mediaCatalog";

type VideoPrepOverlayProps = {
  preload: UseVideoPreloadState;
  playReady: UsePlayReadyState;
  videoSync: UseVideoSyncStartState;
  frameSync: UseFrameSyncState;
  liveScore: UseLiveScoreState;
  danceResult: UseDanceResultState;
  linkedPlayerDisplayName?: string;
  linkedPlayerAvatarUrl?: string;
  onBackToSongs: () => void;
};

export function VideoPrepOverlay({
  preload,
  playReady,
  videoSync,
  frameSync,
  liveScore,
  danceResult,
  linkedPlayerDisplayName,
  linkedPlayerAvatarUrl,
  onBackToSongs,
}: VideoPrepOverlayProps) {
  const {
    status,
    video,
    playUrl,
    selectedQuality,
    progress,
    bufferedSeconds,
    requiredBufferSeconds,
    errorMessage,
    preloadMode,
    setVideoNode,
  } = preload;

  useEffect(() => {
    if (status === "idle" || !video) return;
    preloadImage(DANCE_RESULT_BG_URL);
  }, [status, video?.id]);

  if (status === "idle" || !video) return null;

  const counting = videoSync.phase === "countdown";
  const playing = videoSync.phase === "playing";
  const showResults = danceResult.visible;
  const showCover = !playing && !showResults;
  const picking = playReady.phase === "picking";
  const videoPreloading = status === "loading";
  const showPrepBack =
    !counting &&
    !playing &&
    !showResults &&
    (picking ||
      playReady.phase === "announcing" ||
      playReady.phase === "waiting" ||
      playReady.phase === "aborted" ||
      playReady.phase === "confirming" ||
      status === "loading" ||
      status === "error");

  return (
    <div className="video-prep-overlay fixed inset-0 z-40 flex flex-col text-white">
      <div className="video-prep-stage relative flex min-h-0 flex-1 items-center justify-center">
        <div
          className={`relative inline-grid max-h-full max-w-full ${
            showCover ? "video-prep-frame is-covered" : "video-prep-frame"
          }`}
        >
          <video
            ref={setVideoNode}
            className={`col-start-1 row-start-1 max-h-full max-w-full object-contain ${
              videoPreloading ? "video-preload-hidden" : ""
            }`}
            preload={preloadMode}
            playsInline
            muted={!playing || showResults}
            controls={false}
            onPlaying={(event) => {
              if (showResults || !videoSync.isPlaybackAllowed()) {
                event.currentTarget.pause();
                event.currentTarget.muted = true;
                event.currentTarget.volume = 0;
              }
            }}
            onEnded={() => danceResult.onVideoEnded()}
          />
          {showCover ? (
            <div
              className="video-prep-cover z-10 col-start-1 row-start-1"
              aria-hidden
            >
              <div className="video-prep-cover-blur video-prep-cover-blur--heavy" />
              <div className="video-prep-cover-blur video-prep-cover-blur--soft" />
              <div className="video-prep-cover-shade" />
            </div>
          ) : null}
        </div>
        {picking ? (
          <div className="video-prep-player-picker absolute inset-0 z-20 flex min-h-0 items-center justify-center px-4">
            <PlayerCountPicker
              video={video}
              playReady={playReady}
              onBackToSongs={onBackToSongs}
            />
          </div>
        ) : null}
        {counting ? (
          <div className="video-prep-countdown pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
            <p className="text-6xl font-black tracking-tight text-white tabular-nums drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] md:text-8xl">
              {videoSync.remainingSeconds}
            </p>
          </div>
        ) : null}
        {playing && !showResults ? (
          <>
            {process.env.NODE_ENV === "development" ? (
              <FrameSyncHud hud={frameSync.hud} />
            ) : null}
            <LiveScoreOverlay
              liveScore={liveScore}
              linkedPlayerDisplayName={linkedPlayerDisplayName}
              linkedPlayerAvatarUrl={linkedPlayerAvatarUrl}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-8 z-[55] flex justify-center px-6">
              <BackToListButton
                playing
                onClick={onBackToSongs}
                className="pointer-events-auto"
              />
            </div>
          </>
        ) : null}
        <DanceResultOverlay
          danceResult={danceResult}
          linkedPlayerDisplayName={linkedPlayerDisplayName}
          linkedPlayerAvatarUrl={linkedPlayerAvatarUrl}
        />
      </div>
      {playing || showResults || picking || counting ? null : (
        <div className="video-prep-footer shrink-0 px-5 pt-5 pb-10 text-center">
          <p className="video-prep-footer__title">{video.title}</p>
          <PrepFooter
            preloadStatus={status}
            preloadProgress={progress}
            bufferedSeconds={bufferedSeconds}
            requiredBufferSeconds={requiredBufferSeconds}
            preloadError={errorMessage}
            playReady={playReady}
            videoSync={videoSync}
          />
          {showPrepBack ? (
            <BackToListButton
              onClick={onBackToSongs}
              className="mt-4"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function BackToListButton({
  onClick,
  className = "",
  buttonRef,
  onKeyDown,
  playing = false,
}: {
  onClick: () => void;
  className?: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  playing?: boolean;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      onKeyDown={onKeyDown}
      onClick={onClick}
      aria-label={playing ? "بازگشت به فهرست" : undefined}
      className={`player-count-back-btn ${className}`.trim()}
    >
      {playing ? (
        <IoExitOutline
          className="size-7"
          aria-hidden
        />
      ) : (
        "بازگشت به فهرست"
      )}
    </button>
  );
}

function formatHudSeconds(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(3);
}

function FrameSyncHud({ hud }: { hud: UseFrameSyncState["hud"] }) {
  const driftMs = Math.round(hud.videoDriftMs);
  const driftLabel = `${driftMs >= 0 ? "+" : ""}${driftMs}ms`;

  return (
    <div
      className="pointer-events-none absolute end-4 top-4 rounded-lg bg-black/60 px-3 py-2 text-[11px] leading-5 text-white/80"
      dir="ltr"
    >
      <p>
        ref {formatHudSeconds(hud.referenceTimeSeconds)} · vid{" "}
        {formatHudSeconds(hud.videoTimeSeconds)}
      </p>
      <p>
        drift {driftLabel} · rate {hud.playbackRate.toFixed(3)}
      </p>
      <p>
        seq {hud.lastSequence} · frame {hud.displayFrameIndex}
        {hud.hasServerPacket ? "" : " · waiting"}
      </p>
      {hud.timelineEndReached ? <p>timeline end</p> : null}
    </div>
  );
}

function PrepFooter({
  preloadStatus,
  preloadProgress,
  bufferedSeconds,
  requiredBufferSeconds,
  preloadError,
  playReady,
  videoSync,
}: {
  preloadStatus: UseVideoPreloadState["status"];
  preloadProgress: number;
  bufferedSeconds: number;
  requiredBufferSeconds: number;
  preloadError: string | null;
  playReady: UsePlayReadyState;
  videoSync: UseVideoSyncStartState;
}) {
  if (preloadStatus === "loading") {
    return (
      <>
        <p className="video-prep-footer__text mt-1">
          {bufferedSeconds > 0
            ? `در حال آماده‌سازی… ${Math.min(bufferedSeconds, requiredBufferSeconds).toFixed(1)} از ${requiredBufferSeconds.toFixed(1)} ثانیه`
            : "در حال آماده‌سازی ویدیو…"}
        </p>
        <div className="video-prep-footer__progress-track mx-auto mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full">
          <div
            className="video-prep-footer__progress-fill h-full transition-[width]"
            style={{ width: `${preloadProgress}%` }}
          />
        </div>
      </>
    );
  }

  if (preloadStatus === "error") {
    return (
      <p className="video-prep-footer__status video-prep-footer__status--error mt-1">
        {preloadError ?? "بارگذاری ناموفق بود"}
      </p>
    );
  }

  if (videoSync.phase === "pending" || videoSync.phase === "reconciling") {
    return (
      <p className="video-prep-footer__status video-prep-footer__status--accent mt-1">
        {videoSync.phase === "pending"
          ? "فرمان شروع رسید — کمی صبر کنید تا ویدیو آماده شود."
          : "در حال هماهنگ‌کردن زمان شروع…"}
      </p>
    );
  }

  if (videoSync.phase === "countdown") {
    return (
      <p className="video-prep-footer__status video-prep-footer__status--accent mt-1">
        شروع تا {videoSync.remainingSeconds} ثانیه
      </p>
    );
  }

  if (videoSync.phase === "aborted") {
    return (
      <p className="video-prep-footer__status video-prep-footer__status--error mt-1">
        {videoSync.errorMessage ??
          "شروع هم‌زمان دریافت نشد. به فهرست برگردید و دوباره انتخاب کنید."}
      </p>
    );
  }

  if (playReady.phase === "announcing" || playReady.phase === "confirming") {
    return (
      <p className="video-prep-footer__text mt-1">
        {playReady.phase === "confirming"
          ? "در حال ارسال تعداد بازیکن…"
          : "ویدیو آماده است — اعلام آمادگی به گوشی…"}
      </p>
    );
  }

  if (playReady.phase === "picking") {
    return null;
  }

  if (playReady.phase === "aborted") {
    return (
      <p className="video-prep-footer__status video-prep-footer__status--error mt-1">
        {playReady.errorMessage ??
          "گوشی پاسخ نداد. به فهرست برگردید و دوباره تلاش کنید."}
      </p>
    );
  }

  if (playReady.phase === "unityReady") {
    return (
      <p className="video-prep-footer__status video-prep-footer__status--accent mt-1">
        گوشی آماده است — منتظر فرمان شروع از سرور…
      </p>
    );
  }

  if (playReady.phase === "waiting") {
    const countLabel =
      playReady.playerCount === 2 ? "دو نفر انتخاب شد" : "یک نفر انتخاب شد";
    return (
      <div className="mt-2">
        <p className="video-prep-footer__status video-prep-footer__status--accent video-prep-footer__status--emphasis">
          {countLabel}
        </p>
        <p className="video-prep-footer__text mt-1">
          حدود ۴ قدم از صفحه فاصله بگیرید تا بدن دیده شود.
        </p>
        <p className="video-prep-footer__muted mt-1">منتظر گوشی…</p>
      </div>
    );
  }

  return (
    <p className="video-prep-footer__status video-prep-footer__status--accent mt-1">
      ویدیو آماده است — پخش هنوز شروع نشده.
    </p>
  );
}

const DIFFICALITY_FILL_COUNT: Record<VideoDifficality, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  extreme: 4,
};

const DIFFICALITY_LABEL: Record<VideoDifficality, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "سخت",
  extreme: "فوق‌العاده",
};

function DifficalityBars({ level }: { level: VideoDifficality }) {
  const filled = DIFFICALITY_FILL_COUNT[level];
  const label = DIFFICALITY_LABEL[level];

  return (
    <div
      className="difficality-bars"
      data-level={level}
      role="img"
      aria-label={`سختی: ${label}`}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={index}
          className={
            index < filled
              ? "difficality-bars__bar is-filled"
              : "difficality-bars__bar"
          }
        />
      ))}
    </div>
  );
}

function PlayerCountPicker({
  video,
  playReady,
  onBackToSongs,
}: {
  video: VideoCatalogEntry;
  playReady: UsePlayReadyState;
  onBackToSongs: () => void;
}) {
  const tvFocusAnchorRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onArrowKeyDown = useArrowFocusNavigation(buttonRefs);

  const focusFirstPlayerCard = useCallback(() => {
    const button = buttonRefs.current[0];
    if (!button) return false;
    button.focus();
    return true;
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      tvFocusAnchorRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleTvFocusAnchorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isTvArrowKey(event.key)) return;
      event.preventDefault();
      focusFirstPlayerCard();
    },
    [focusFirstPlayerCard],
  );

  const categoryLabel = video.category.trim() || "—";
  const singerLabel = video.singerName.trim() || "—";

  return (
    <div className="player-count-picker-panel">
      <div className="player-count-picker-panel__layout">
        <aside className="player-count-picker-panel__song">
          <div className="player-count-picker-panel__cover">
            <CatalogCoverImage
              coverUrl={video.cover}
              loading="eager"
              fetchPriority="high"
              alt=""
              className="player-count-picker-panel__cover-img"
            />
          </div>
          <div className="player-count-picker-panel__song-info">
            <h2 className="player-count-picker-panel__title">{video.title}</h2>
            <p className="player-count-picker-panel__meta-line">
              <span className="player-count-picker-panel__meta-key">
                دسته‌بندی :{" "}
              </span>
              <span className="player-count-picker-panel__meta-val">
                {categoryLabel}
              </span>
            </p>
            <p className="player-count-picker-panel__meta-line">
              <span className="player-count-picker-panel__meta-key">
                خواننده :{" "}
              </span>
              <span className="player-count-picker-panel__meta-val">
                {singerLabel}
              </span>
            </p>
            <div className="player-count-picker-panel__meter">
              <span className="player-count-picker-panel__meta-key">
                درجه سختی :{" "}
              </span>
              <div className="player-count-picker-panel__meter-body">
                <DifficalityBars level={video.difficality} />
                <span className="player-count-picker-panel__meter-label">
                  {DIFFICALITY_LABEL[video.difficality]}
                </span>
              </div>
            </div>
          </div>
        </aside>

        <section className="player-count-picker-panel__choose">
          <div
            ref={tvFocusAnchorRef}
            tabIndex={-1}
            className="tv-focus-anchor player-count-picker-panel__choose-head outline-none"
            aria-label="انتخاب تعداد بازیکن"
            onKeyDown={handleTvFocusAnchorKeyDown}
          >
            <p className="player-count-picker-panel__prompt">
              چند نفر می‌رقصند؟
            </p>
            <p className="player-count-picker-panel__hint">
              یک یا دو بازیکن را انتخاب کنید
            </p>
          </div>
          {playReady.errorMessage ? (
            <p className="player-count-picker-panel__error">
              {playReady.errorMessage}
            </p>
          ) : null}
          <div className="player-count-picker-panel__cards">
            <button
              type="button"
              ref={(element) => {
                buttonRefs.current[0] = element;
              }}
              onKeyDown={onArrowKeyDown}
              onClick={() => playReady.confirm(1)}
              className="player-count-card player-count-card--solo group"
            >
              <span className="player-count-card__art">
                <DancePoseIcon className="player-card-icon player-count-card__icon" />
              </span>
              <span className="player-count-card__label">۱ نفره</span>
            </button>

            <button
              type="button"
              ref={(element) => {
                buttonRefs.current[1] = element;
              }}
              onKeyDown={onArrowKeyDown}
              onClick={() => playReady.confirm(2)}
              className="player-count-card player-count-card--duo group"
            >
              <span className="player-count-card__art">
                <DancingDuoIcon className="player-card-icon player-count-card__icon" />
              </span>
              <span className="player-count-card__label">۲ نفره</span>
            </button>
          </div>
          <BackToListButton
            onClick={onBackToSongs}
            className="player-count-picker-panel__back player-count-back-btn--outline"
            buttonRef={(element) => {
              buttonRefs.current[2] = element;
            }}
            onKeyDown={onArrowKeyDown}
          />
        </section>
      </div>
    </div>
  );
}

function DancePoseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 519 560"
      className={className}
      aria-hidden
    >
      <g fill="currentColor">
        <path d="M 465 119 L 460 120 L 458 115 L 453 120 L 449 119 L 427 136 L 419 138 L 420 154 L 443 158 L 453 163 L 452 157 L 443 150 L 443 146 L 451 135 L 462 131 L 462 129 L 454 129 L 463 123 Z" />
        <path d="M 92 52 L 89 66 L 95 68 L 119 87 L 140 99 L 185 144 L 175 156 L 166 180 L 154 192 L 156 193 L 119 213 L 120 225 L 128 249 L 137 267 L 148 281 L 151 264 L 157 251 L 180 257 L 179 283 L 183 294 L 179 297 L 171 314 L 177 316 L 168 342 L 162 397 L 192 449 L 194 471 L 208 478 L 210 488 L 207 490 L 206 487 L 204 489 L 205 493 L 194 505 L 176 516 L 175 526 L 203 528 L 213 525 L 221 518 L 234 520 L 244 517 L 244 508 L 207 525 L 194 525 L 175 520 L 203 521 L 224 510 L 243 505 L 241 488 L 238 485 L 236 491 L 230 496 L 215 489 L 217 487 L 228 489 L 235 486 L 236 482 L 233 472 L 230 472 L 239 461 L 240 450 L 231 445 L 223 435 L 221 401 L 210 389 L 237 350 L 249 338 L 293 347 L 369 375 L 400 383 L 404 391 L 410 396 L 433 394 L 439 403 L 449 412 L 455 414 L 478 437 L 488 440 L 496 435 L 498 427 L 494 418 L 496 428 L 491 435 L 482 437 L 470 431 L 488 434 L 493 429 L 493 420 L 488 410 L 455 382 L 450 380 L 452 390 L 444 397 L 437 396 L 445 393 L 447 382 L 440 373 L 436 358 L 421 357 L 394 335 L 385 331 L 374 330 L 369 319 L 364 315 L 347 314 L 310 280 L 311 277 L 312 279 L 311 276 L 295 272 L 279 272 L 287 269 L 298 270 L 295 266 L 286 263 L 286 240 L 288 232 L 301 210 L 304 195 L 310 187 L 332 180 L 345 172 L 358 174 L 372 167 L 416 156 L 415 137 L 358 139 L 338 146 L 328 143 L 327 146 L 319 144 L 318 147 L 312 139 L 307 143 L 301 139 L 291 152 L 287 152 L 293 167 L 282 187 L 281 183 L 289 165 L 284 158 L 284 151 L 280 149 L 290 149 L 311 120 L 320 123 L 330 122 L 318 116 L 290 110 L 305 110 L 320 114 L 320 94 L 316 84 L 301 69 L 296 71 L 283 70 L 277 73 L 266 87 L 264 95 L 259 101 L 260 114 L 250 118 L 230 132 L 235 140 L 225 147 L 221 181 L 222 143 L 229 140 L 226 131 L 249 116 L 216 96 L 199 99 L 190 93 L 178 89 L 157 74 L 116 60 L 97 50 Z" />
        <path d="M 58 25 L 64 38 L 42 32 L 56 41 L 52 43 L 33 43 L 54 48 L 55 50 L 44 52 L 34 50 L 34 52 L 41 55 L 59 57 L 66 61 L 70 66 L 63 79 L 66 84 L 75 73 L 85 67 L 86 57 L 91 48 L 79 44 Z" />
      </g>
    </svg>
  );
}

function DancingDuoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1254 1254"
      className={className}
      aria-hidden
    >
      <g fill="currentColor">
        <path d="M496,978L492,999L531,1071L555,1094L585,1100L590,1093L565,1091L536,1068Z" />
        <path d="M531,948L503,985L546,1070L589,1091L580,1006L594,1002L581,998L587,982L537,983Z" />
        <path d="M976,791L950,811L905,812L902,907L913,941L897,902L904,809L891,815L893,913L908,944L926,939L939,895L971,863L966,853L946,861L934,827L942,820L947,845L961,853L997,826Z" />
        <path d="M995,487L913,494L867,530L981,584L858,533L794,605L785,685L804,633L775,802L800,782L755,831L748,867L821,803L748,875L723,941L746,985L740,1019L693,1098L709,1111L691,1110L697,1120L745,1115L786,1075L785,1064L755,1088L784,1060L779,992L766,991L787,989L822,955L821,910L903,708L919,693L913,701L1028,737L992,752L977,783L992,819L1022,833L1074,810L1148,749L1151,721L1129,693L1068,650L1007,627L999,607L981,601Z" />
        <path d="M942,361L953,393L923,415L863,394L875,423L864,479L878,506L952,476L1002,486L1003,423Z" />
        <path d="M857,394L818,409L762,513L682,531L670,495L645,490L627,506L623,534L584,544L594,535L575,528L587,528L587,515L570,495L568,436L546,411L516,421L486,471L509,594L488,527L484,463L505,426L547,401L539,381L526,388L506,373L491,431L495,407L473,404L500,388L461,390L435,343L430,368L426,355L336,450L343,526L325,488L310,610L299,611L292,638L325,627L275,663L275,677L325,684L262,690L201,817L215,814L180,835L151,948L234,901L130,965L135,1007L149,1020L126,1020L80,1094L104,1102L79,1110L130,1113L185,1084L184,1069L137,1105L103,1103L135,1098L182,1066L175,1024L186,1011L176,1009L214,1000L274,889L359,791L424,745L408,739L444,744L541,795L557,794L574,769L529,757L590,762L545,806L546,870L527,895L543,896L522,908L538,961L557,972L583,962L586,950L574,947L614,933L612,895L636,852L645,735L577,674L515,638L465,650L505,632L492,613L330,623L386,605L363,597L465,603L429,593L470,591L409,576L414,583L365,550L442,568L387,495L460,564L435,523L455,527L445,512L470,509L460,502L480,494L484,516L461,541L467,569L509,633L542,650L519,548L535,496L524,544L543,583L568,603L615,596L668,552L775,549L845,460L862,472L868,418Z" />
        <path d="M97,153L140,166L106,188L142,179L136,204L150,188L184,192L199,170L189,192L172,195L201,258L300,363L296,340L311,383L329,349L276,459L299,449L211,513L197,589L204,606L227,575L300,598L322,458L305,467L385,402L439,319L451,327L451,367L481,387L505,368L534,384L565,357L566,338L614,344L582,316L590,277L557,234L518,231L487,247L469,277L471,327L459,324L469,312L423,291L393,303L405,349L395,376L390,307L289,260L227,194L227,220L222,184L200,167L194,175L180,139L171,152L125,115L147,152Z" />
        <path d="M1166,102L1082,139L1024,253L952,329L991,293L981,288L995,286L978,268L1001,258L981,264L947,237L918,233L958,235L928,225L901,235L891,255L859,237L818,238L787,267L789,313L758,345L781,350L802,333L806,356L838,381L864,363L860,386L887,408L937,404L951,384L899,328L915,330L902,322L910,304L896,288L899,267L926,314L952,329L935,350L995,405L997,358L1020,376L1016,399L1019,364L1044,414L1040,353L1059,391L1053,337L1032,325L1057,334L1067,357L1061,333L1030,316L1001,352L1061,258L1097,153L1139,166L1123,144L1138,138L1161,155L1156,141L1170,139L1142,125Z" />
      </g>
    </svg>
  );
}
