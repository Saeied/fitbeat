"use client";

import { useCallback, useEffect, useState } from "react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function useFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof document.documentElement.requestFullscreen === "function" ||
        typeof (document.documentElement as FullscreenElement)
          .webkitRequestFullscreen === "function",
    );

    const sync = () => {
      const next = Boolean(getFullscreenElement());
      document.documentElement.classList.toggle("is-fullscreen", next);
      setActive(next);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const enter = useCallback(async () => {
    const root = document.documentElement as FullscreenElement;
    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return;
    }
    await root.webkitRequestFullscreen?.();
  }, []);

  const exit = useCallback(async () => {
    const doc = document as FullscreenDocument;
    if (doc.fullscreenElement) {
      await doc.exitFullscreen();
      return;
    }
    await doc.webkitExitFullscreen?.();
  }, []);

  const toggle = useCallback(async () => {
    if (getFullscreenElement()) {
      await exit();
      return;
    }
    await enter();
  }, [enter, exit]);

  return { active, supported, enter, exit, toggle };
}
