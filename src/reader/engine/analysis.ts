/** One-shot analysis pipeline: text -> lines, tokens, brackets, folds and outline. */
import { buildBracketIndex, type BracketIndex } from './brackets.ts'
import { detectFolds } from './folds.ts'
import { normalizeText, splitLines, tokenize } from './lexer.ts'
import { specById } from './languages.ts'
import { extractOutline } from './outline.ts'
import type { FoldRegion, SymbolInfo, Token } from './types.ts'

/** Above this size the reader keeps navigation but drops syntax analysis. */
export const MAX_ANALYZE_CHARS = 1_600_000

/** Everything derived from one file version. */
export interface FileAnalysis {
  readonly text: string
  readonly lines: readonly string[]
  readonly tokens: readonly Token[][]
  readonly brackets: BracketIndex
  readonly folds: readonly FoldRegion[]
  readonly outline: readonly SymbolInfo[]
  readonly language: string | undefined
  /** True when the file was too large for syntax analysis. */
  readonly degraded: boolean
}

const NO_BRACKETS: BracketIndex = {
  byPosition: new Map(),
  pairs: [],
  braceDepth: [],
  overflow: false,
}

/** Analyze raw file text for a language id. */
export function analyzeText(raw: string, language: string | undefined): FileAnalysis {
  const text = normalizeText(raw)
  const lines = splitLines(text)
  const spec = specById(language)
  if (text.length > MAX_ANALYZE_CHARS) {
    const tokens = lines.map((line) => (line === '' ? [] : [{ text: line, kind: 'plain' as const, start: 0 }]))
    return {
      text,
      lines,
      tokens,
      brackets: { ...NO_BRACKETS, braceDepth: new Array<number>(lines.length).fill(0) },
      folds: [],
      outline: [],
      language,
      degraded: true,
    }
  }
  const tokens = tokenize(text, spec)
  const brackets = buildBracketIndex(tokens, lines.length)
  const folds = detectFolds(lines, tokens, spec, brackets)
  const outline = extractOutline(lines, tokens, spec, brackets)
  return { text, lines, tokens, brackets, folds, outline, language, degraded: false }
}
