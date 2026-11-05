/** Fold-region detection: brace blocks, comments, imports, regions and indentation. */
import type { BracketIndex } from './brackets.ts'
import type { LanguageSpec } from './languages.ts'
import type { FoldRegion, Token } from './types.ts'

const MAX_FOLDS = 30_000

const REGION_START = /^\s*(?:\/\/|#|--|;|%|\*)\s*#?region\b(.*)$/i
const REGION_END = /^\s*(?:\/\/|#|--|;|%|\*)\s*#?endregion\b/i
const EDITOR_FOLD_START = /^\s*(?:\/\/|#|<!--)\s*<editor-fold\b(.*?)(?:-->)?$/i
const EDITOR_FOLD_END = /^\s*(?:\/\/|#|<!--)\s*<\/editor-fold>/i
const PRAGMA_REGION_START = /^\s*#pragma\s+region\b(.*)$/i
const PRAGMA_REGION_END = /^\s*#pragma\s+endregion/i
const IMPORT_LINE = /^\s*(?:import|from|using|require|#include|use|package)\b/

/** Visual indent of a line, expanding tabs to 4-column stops. */
export function indentOf(line: string): number {
  let width = 0
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i)
    if (code === 32) width += 1
    else if (code === 9) width += 4 - (width % 4)
    else break
  }
  return width
}

function isBlankOrComment(line: string, tokens: readonly Token[] | undefined): boolean {
  if (line.trim() === '') return true
  return tokens !== undefined && tokens.length > 0 && tokens.every((token) => token.kind === 'comment')
}

function addRegion(regions: FoldRegion[], start: number, end: number, kind: FoldRegion['kind'], label?: string): void {
  if (end <= start) return
  regions.push(label === undefined ? { start, end, kind } : { start, end, kind, label })
}

/** Multiline block comments, located through the token kinds so strings never count. */
function commentRegions(lines: readonly string[], tokens: readonly Token[][], spec: LanguageSpec, regions: FoldRegion[]): void {
  const rules = spec.blockComments ?? []
  if (rules.length === 0) return
  for (let line = 0; line < lines.length; line++) {
    const row = tokens[line]
    if (row === undefined) continue
    for (const token of row) {
      if (token.kind !== 'comment') continue
      const rule = rules.find((candidate) => token.text.startsWith(candidate.open) && !token.text.includes(candidate.close))
      if (rule === undefined) continue
      for (let cursor = line + 1; cursor < lines.length; cursor++) {
        const closing = (tokens[cursor] ?? []).find((candidate) => candidate.kind === 'comment' && candidate.text.includes(rule.close))
        if (closing !== undefined) {
          addRegion(regions, line, cursor, 'comment')
          break
        }
        const last = (tokens[cursor] ?? [])[(tokens[cursor] ?? []).length - 1]
        if (last !== undefined && last.kind !== 'comment') break
      }
    }
  }
}

/** `// region`, editor folds and `#pragma region` blocks. */
function markerRegions(lines: readonly string[], regions: FoldRegion[]): void {
  const stacks: { start: number; label?: string }[] = []
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line] ?? ''
    if (EDITOR_FOLD_END.test(text) || REGION_END.test(text) || PRAGMA_REGION_END.test(text)) {
      const start = stacks.pop()
      if (start !== undefined) addRegion(regions, start.start, line, 'region', start.label)
      continue
    }
    const start = PRAGMA_REGION_START.exec(text) ?? REGION_START.exec(text) ?? EDITOR_FOLD_START.exec(text)
    if (start !== null) {
      const label = (start[1] ?? '').trim().replace(/^[-:=\s]+/, '').slice(0, 80)
      stacks.push(label === '' ? { start: line } : { start: line, label })
    }
  }
}

/** Consecutive import-ish lines become one fold. */
function importRegions(lines: readonly string[], regions: FoldRegion[]): void {
  let start = -1
  for (let line = 0; line <= lines.length; line++) {
    const matches = line < lines.length && IMPORT_LINE.test(lines[line] ?? '')
    if (matches && start === -1) start = line
    if (!matches && start !== -1) {
      if (line - start >= 3) addRegion(regions, start, line - 1, 'imports')
      start = -1
    }
  }
}

/** Indentation blocks for Python and YAML. */
function indentRegions(lines: readonly string[], tokens: readonly Token[][], spec: LanguageSpec, regions: FoldRegion[]): void {
  const yamlLike = spec.family === 'yaml'
  if (spec.indentFolding !== true && !yamlLike) return
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line] ?? ''
    if (isBlankOrComment(text, tokens[line])) continue
    const trimmed = text.trimEnd()
    const qualifies = yamlLike ? /:\s*(?:#.*)?$/.test(trimmed) || /^-\s+\S/.test(text.trimStart()) : /:\s*(?:#.*)?$/.test(trimmed)
    if (!qualifies) continue
    const base = indentOf(text)
    let last = line
    for (let cursor = line + 1; cursor < lines.length; cursor++) {
      const candidate = lines[cursor] ?? ''
      if (candidate.trim() === '') continue
      const indent = indentOf(candidate)
      if (indent <= base) break
      last = cursor
    }
    if (last > line) addRegion(regions, line, last, 'indent')
  }
}

/** Sort by start ascending, then widest first; drop exact duplicates; cap. */
export function normalizeFolds(regions: readonly FoldRegion[]): FoldRegion[] {
  const seen = new Set<string>()
  const unique: FoldRegion[] = []
  for (const region of regions) {
    const key = `${region.start}:${region.end}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(region)
  }
  unique.sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start))
  return unique.length > MAX_FOLDS ? unique.slice(0, MAX_FOLDS) : unique
}

/** Detect every foldable range in one file. */
export function detectFolds(
  lines: readonly string[],
  tokens: readonly Token[][],
  spec: LanguageSpec,
  brackets: BracketIndex,
): FoldRegion[] {
  const regions: FoldRegion[] = []
  for (const pair of brackets.pairs) {
    if (pair.closeLine <= pair.openLine) continue
    const char = (lines[pair.openLine] ?? '')[pair.openCol] ?? ''
    if (char === '{' || char === '[') addRegion(regions, pair.openLine, pair.closeLine, 'block')
    else if (char === '(' && pair.closeLine - pair.openLine >= 3) addRegion(regions, pair.openLine, pair.closeLine, 'block')
  }
  commentRegions(lines, tokens, spec, regions)
  markerRegions(lines, regions)
  importRegions(lines, regions)
  indentRegions(lines, tokens, spec, regions)
  return normalizeFolds(regions)
}

/** Fold region covering a line (the innermost one), if any. */
export function foldCovering(folds: readonly FoldRegion[], line: number): FoldRegion | undefined {
  let best: FoldRegion | undefined
  for (const region of folds) {
    if (region.start > line) break
    if (line > region.start && line <= region.end && (best === undefined || region.start >= best.start)) best = region
  }
  return best
}

/** Every fold start line, mapped to its widest region. */
export function foldStarts(folds: readonly FoldRegion[]): Map<number, FoldRegion> {
  const map = new Map<number, FoldRegion>()
  for (const region of folds) {
    const current = map.get(region.start)
    if (current === undefined || region.end > current.end) map.set(region.start, region)
  }
  return map
}
