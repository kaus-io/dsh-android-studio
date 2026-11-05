/** Folding-aware, wrap-aware document layout used by the virtualized viewport. */
import { visualWidth } from './lexer.ts'
import type { DocumentLayout, FoldRegion, VisibleWindow, VisualRow } from './types.ts'

/** Fixed row height used by the reader. */
export const LINE_HEIGHT = 20

/** Horizontal columns a wrapped line spans, given the viewport width in characters. */
export function rowsForLine(text: string, columns: number): number {
  if (columns <= 0) return 1
  const width = visualWidth(text)
  if (width <= columns) return 1
  return Math.min(400, Math.ceil(width / columns))
}

/** Widest line in visual columns, capped so absurd minified files stay scrollable. */
export function widestLine(lines: readonly string[], cap = 6000): number {
  let widest = 0
  for (const line of lines) {
    const width = visualWidth(line)
    if (width > widest) {
      widest = width
      if (widest >= cap) return cap
    }
  }
  return widest
}

/** Build the row model for one file at one fold/wrap/width state. */
export function buildLayout(
  lines: readonly string[],
  folds: readonly FoldRegion[],
  folded: ReadonlySet<number>,
  wrap: boolean,
  columns: number,
  lineHeight: number = LINE_HEIGHT,
): DocumentLayout {
  const sorted = [...folds].sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start))
  const rows: VisualRow[] = []
  const offsets: number[] = [0]
  const rowOfLine = new Array<number>(lines.length).fill(0)
  const hiddenByStart = new Map<number, number>()
  const active: FoldRegion[] = []
  let foldIndex = 0

  for (let line = 0; line < lines.length; line++) {
    while (foldIndex < sorted.length && (sorted[foldIndex]?.start ?? Infinity) <= line) {
      const region = sorted[foldIndex]
      foldIndex += 1
      if (region === undefined) continue
      if (folded.has(region.start) && region.end > region.start) {
        active.push(region)
        hiddenByStart.set(region.start, region.end - region.start)
      }
    }
    while (active.length > 0 && (active[active.length - 1]?.end ?? -1) < line) active.pop()
    const top = active[active.length - 1]
    if (top !== undefined && line > top.start) {
      rowOfLine[line] = Math.max(0, rows.length - 1)
      continue
    }
    rowOfLine[line] = rows.length
    const height = wrap ? rowsForLine(lines[line] ?? '', columns) * lineHeight : lineHeight
    rows.push({ line, height })
    offsets.push((offsets[offsets.length - 1] ?? 0) + height)
  }

  return {
    rows,
    offsets,
    total: offsets[offsets.length - 1] ?? 0,
    rowOfLine,
    hiddenByStart,
    maxColumns: wrap ? columns : widestLine(lines),
  }
}

/** Largest index `i` with `offsets[i] <= value`, clamped to a valid row. */
function rowOfOffset(offsets: readonly number[], value: number): number {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if ((offsets[mid] ?? 0) <= value) low = mid
    else high = mid - 1
  }
  return Math.max(0, Math.min(offsets.length - 2, low))
}

/** Visible rows for one scroll position. */
export function windowFor(
  layout: DocumentLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 24,
): VisibleWindow {
  if (layout.rows.length === 0) return { start: 0, end: 0, top: 0 }
  const first = rowOfOffset(layout.offsets, Math.max(0, scrollTop))
  let end = first
  const bottom = scrollTop + Math.max(1, viewportHeight)
  while (end < layout.rows.length && (layout.offsets[end] ?? 0) < bottom) end += 1
  const start = Math.max(0, first - overscan)
  return {
    start,
    end: Math.min(layout.rows.length, end + overscan),
    top: layout.offsets[start] ?? 0,
  }
}

/** Row index containing a vertical offset. */
export function rowAtOffset(layout: DocumentLayout, offset: number): number {
  return rowOfOffset(layout.offsets, offset)
}

/** Top offset of the visual row that shows a source line. */
export function topOfLine(layout: DocumentLayout, line: number): number {
  if (layout.rows.length === 0) return 0
  const row = layout.rowOfLine[line] ?? 0
  return layout.offsets[Math.max(0, Math.min(row, layout.rows.length - 1))] ?? 0
}

/** Fold starts that must be expanded to reveal a source line. */
export function foldsHidingLine(folds: readonly FoldRegion[], line: number): FoldRegion[] {
  const hiding: FoldRegion[] = []
  for (const region of folds) {
    if (region.start >= line) break
    if (line <= region.end) hiding.push(region)
  }
  return hiding
}
