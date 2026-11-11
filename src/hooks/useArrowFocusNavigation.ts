"use client";

import { useCallback, type KeyboardEvent, type RefObject } from "react";

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const ROW_TOLERANCE_PX = 8;

function directionVector(key: string): { dx: number; dy: number } {
  switch (key) {
    case "ArrowUp":
      return { dx: 0, dy: -1 };
    case "ArrowDown":
      return { dx: 0, dy: 1 };
    case "ArrowLeft":
      return { dx: -1, dy: 0 };
    default:
      return { dx: 1, dy: 0 };
  }
}

export function findFocusNeighbor(
  items: HTMLElement[],
  current: HTMLElement,
  key: string,
  { sameRowOnly = false }: { sameRowOnly?: boolean } = {},
): HTMLElement | null {
  const { dx, dy } = directionVector(key);
  const vertical = dy !== 0;
  const currentRect = current.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  const candidates: {
    item: HTMLElement;
    gap: number;
    lateral: number;
    forward: number;
  }[] = [];

  for (const item of items) {
    if (item === current) continue;

    const rect = item.getBoundingClientRect();
    const sameRow = !(
      rect.bottom <= currentRect.top || rect.top >= currentRect.bottom
    );
    // Up/Down should change rows; side-by-side items (e.g. 1p/2p cards) must not
    // win just because one card is slightly taller (gap ≈ 0 vs. the row below).
    if (vertical && sameRow) continue;
    const vx = rect.left + rect.width / 2 - cx;
    const vy = rect.top + rect.height / 2 - cy;
    const forward = vx * dx + vy * dy;
    if (forward <= 1) continue;
    if (sameRowOnly && !vertical && !sameRow) {
      continue;
    }

    const gap = Math.max(
      0,
      dy < 0 ? currentRect.top - rect.bottom : rect.top - currentRect.bottom,
    );
    const lateral = Math.abs(vx * dy - vy * dx);
    candidates.push({ item, gap, lateral, forward });
  }

  if (candidates.length === 0) return null;

  if (vertical) {
    const section = current.closest("[data-focus-section]");
    const inSection = section
      ? candidates.filter((c) => section.contains(c.item))
      : [];
    const pool = inSection.length > 0 ? inSection : candidates;
    const nearestGap = Math.min(...pool.map((c) => c.gap));
    return pool
      .filter((c) => c.gap <= nearestGap + ROW_TOLERANCE_PX)
      .reduce((best, c) => (c.lateral < best.lateral ? c : best)).item;
  }

  return candidates.reduce((best, c) =>
    c.lateral * 100 + c.forward < best.lateral * 100 + best.forward ? c : best,
  ).item;
}

export function useArrowFocusNavigation(
  itemRefs: RefObject<(HTMLButtonElement | null)[]>,
) {
  return useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!ARROW_KEYS.has(event.key)) return;

      const items = itemRefs.current.filter(
        (item): item is HTMLButtonElement => item != null && !item.disabled,
      );
      if (items.length === 0) return;

      const current = event.currentTarget;
      if (!items.includes(current)) return;

      const horizontal =
        event.key === "ArrowLeft" || event.key === "ArrowRight";
      const next = findFocusNeighbor(items, current, event.key, {
        sameRowOnly: horizontal,
      });
      if (!next) return;

      event.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [itemRefs],
  );
}
