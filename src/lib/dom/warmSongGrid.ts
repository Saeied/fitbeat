import { getGridColumnCount } from "@/lib/dom/getGridColumnCount";

const ROW_DECODE_TIMEOUT_MS = 1500;

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function songItems(list: HTMLUListElement): HTMLElement[] {
  const items: HTMLElement[] = [];
  for (const child of list.children) {
    if (
      child instanceof HTMLElement &&
      child.classList.contains("song-card-list-item")
    ) {
      items.push(child);
    }
  }
  return items;
}

function coverImage(item: HTMLElement): HTMLImageElement | null {
  const image = item.querySelector("img");
  return image instanceof HTMLImageElement ? image : null;
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
}

function isInView(item: HTMLElement, scroller: HTMLElement): boolean {
  const itemBox = item.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return itemBox.bottom > view.top && itemBox.top < view.bottom;
}

function imageReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

/**
 * Off-screen cards use a fixed height. Measure the real card, ignoring the
 * optional status line so one active row does not stretch every placeholder.
 */
function applyCardIntrinsicHeight(list: HTMLUListElement): boolean {
  const item = songItems(list)[0];
  const card = item?.querySelector<HTMLElement>(".song-card");
  if (!item || !card) return false;

  const previous = item.style.contentVisibility;
  item.style.setProperty("content-visibility", "visible");

  let extra = 0;
  for (const child of card.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains("song-card__button")) continue;
    const style = getComputedStyle(child);
    if (style.display === "none") continue;
    if (style.position === "absolute" || style.position === "fixed") continue;
    extra +=
      child.getBoundingClientRect().height +
      px(style.marginTop) +
      px(style.marginBottom);
  }

  const height = item.getBoundingClientRect().height - extra;
  if (height >= 1) {
    list.style.setProperty("--song-card-intrinsic", `${Math.round(height)}px`);
  }

  if (previous) item.style.contentVisibility = previous;
  else item.style.removeProperty("content-visibility");

  return height >= 1;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timeoutId = setTimeout(finish, ms);
    signal.addEventListener("abort", finish);
  });
}

/** Resolves after a paint so the revealed row is in the content-visibility cache. */
function afterPaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    let settled = false;
    let frame = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(frame);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    frame = requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
    signal.addEventListener("abort", finish);
  });
}

async function decodeCover(
  image: HTMLImageElement,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted || imageReady(image)) return;
  image.loading = "eager";
  try {
    if (typeof image.decode === "function") {
      await image.decode();
      return;
    }
  } catch {
    // A missing WebP swaps the src; wait for that load below.
  }
  if (signal.aborted || image.complete) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    image.addEventListener("load", finish);
    image.addEventListener("error", finish);
    signal.addEventListener("abort", finish);
  });
}

async function warmRow(
  items: HTMLElement[],
  scroller: HTMLElement | null,
  signal: AbortSignal,
): Promise<boolean> {
  const revealed: HTMLElement[] = [];
  const pending: HTMLImageElement[] = [];

  for (const item of items) {
    if (signal.aborted) return false;
    const image = coverImage(item);
    if (!image || imageReady(image)) continue;
    pending.push(image);
    if (scroller && isInView(item, scroller)) continue;
    item.style.setProperty("content-visibility", "visible");
    revealed.push(item);
  }

  if (pending.length === 0) return false;

  await Promise.race([
    Promise.all(pending.map((image) => decodeCover(image, signal))),
    wait(ROW_DECODE_TIMEOUT_MS, signal),
  ]);
  if (signal.aborted) return false;

  await afterPaint(signal);
  if (signal.aborted) return false;

  for (const item of revealed) {
    const image = coverImage(item);
    if (!image || image.complete) {
      item.style.removeProperty("content-visibility");
    }
  }
  return true;
}

/**
 * First scroll used to layout and decode every off-screen card as it arrived.
 * `content-visibility: auto` keeps that result, so the next pass is smooth.
 * Do the same work in row-sized slices before the remote gets there.
 */
export async function warmSongGrid(
  list: HTMLUListElement,
  signal: AbortSignal,
): Promise<void> {
  if (!applyCardIntrinsicHeight(list) || signal.aborted) return;

  const scroller = scrollParent(list);
  if (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) {
    return;
  }

  await afterPaint(signal);
  if (signal.aborted || !list.isConnected) return;

  const items = songItems(list);
  const batchSize = Math.max(1, getGridColumnCount(list));

  for (let index = 0; index < items.length; index += batchSize) {
    if (signal.aborted || !list.isConnected) return;
    const warmed = await warmRow(
      items.slice(index, index + batchSize),
      scroller,
      signal,
    );
    if (signal.aborted) return;
    if (warmed) await afterPaint(signal);
  }
}
