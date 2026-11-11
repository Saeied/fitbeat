/** Number of grid columns from computed `grid-template-columns`. */
export function getGridColumnCount(grid: HTMLElement): number {
  const columns = getComputedStyle(grid).gridTemplateColumns
    .split(" ")
    .filter(Boolean);
  return Math.max(1, columns.length);
}
