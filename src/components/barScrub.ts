/** Map a pointer X inside a bar track to a bucket index. */
export function barIndexAt(x: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)))
}
