export const TV_ARROW_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function isTvArrowKey(key: string): boolean {
  return TV_ARROW_KEYS.has(key);
}
