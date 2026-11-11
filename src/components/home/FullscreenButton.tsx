"use client";

import { forwardRef, type KeyboardEvent, type Ref } from "react";
import { useFullscreen } from "@/hooks/useFullscreen";

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function IconCompress() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

type FullscreenButtonProps = {
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export const FullscreenButton = forwardRef(function FullscreenButton(
  { className = "", onKeyDown }: FullscreenButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const { active, supported, toggle } = useFullscreen();

  if (!supported) return null;

  return (
    <button
      type="button"
      ref={ref}
      onKeyDown={onKeyDown}
      onClick={() => { void toggle(); }}
      className={`fullscreen-button flex items-center justify-center rounded-lg border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition hover:bg-white/20 ${className}`}
      aria-pressed={active}
      aria-label={active ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
      title={active ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
    >
      {active ? <IconCompress /> : <IconExpand />}
    </button>
  );
});
