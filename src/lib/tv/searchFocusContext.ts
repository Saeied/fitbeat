export type TvSearchFocusSource =
  | { from: "banner-next" }
  | { from: "song"; index: number };

export type SearchReturnTarget =
  | { kind: "banner-next" }
  | { kind: "song"; index: number };

export function searchReturnFromSource(
  source: TvSearchFocusSource,
): SearchReturnTarget {
  return source.from === "banner-next"
    ? { kind: "banner-next" }
    : { kind: "song", index: source.index };
}
