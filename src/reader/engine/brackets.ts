/** Bracket pairing and brace-depth helpers over tokenized lines. */
import type { BracketPair, Token } from './types.ts'

/** Upper bound on remembered pairs; larger files degrade to no matching. */
const MAX_PAIRS = 400_000

const PAIR_KEY_SCALE = 1_000_000

/** Stable key for one source position. */
export function bracketKey(line: number, col: number): number {
  return line * PAIR_KEY_SCALE + col
}

/** Index shared by folds, outline and the view. */
export interface BracketIndex {
  /** Position key -> the pair it belongs to, for both ends. */
  readonly byPosition: ReadonlyMap<number, BracketPair>
  readonly pairs: readonly BracketPair[]
  /** Brace-only depth at the start of each line. */
  readonly braceDepth: readonly number[]
  readonly overflow: boolean
}

const OPEN_TO_CLOSE: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' }

/** Build bracket pairs and per-line brace depth from tokenized lines. */
export function buildBracketIndex(lines: readonly Token[][], lineCount: number): BracketIndex {
  interface Open {
    readonly ch: string
    readonly line: number
    readonly col: number
  }
  const stack: Open[] = []
  const pairs: BracketPair[] = []
  const byPosition = new Map<number, BracketPair>()
  const braceDepth: number[] = new Array(lineCount).fill(0)
  let depth = 0
  let overflow = false

  for (let line = 0; line < lineCount; line++) {
    braceDepth[line] = depth
    if (overflow) continue
    for (const token of lines[line] ?? []) {
      if (token.kind !== 'punct' || token.text.length !== 1) continue
      const char = token.text
      if (OPEN_TO_CLOSE[char] !== undefined) {
        stack.push({ ch: char, line, col: token.start })
        if (char === '{') depth += 1
        continue
      }
      if (char !== ')' && char !== ']' && char !== '}') continue
      if (char === '}') depth = Math.max(0, depth - 1)
      const top = stack[stack.length - 1]
      if (top === undefined) continue
      const expected = OPEN_TO_CLOSE[top.ch]
      if (expected !== char) {
        // A malformed closer: drop the unmatched opener rather than pairing across it.
        stack.pop()
        continue
      }
      stack.pop()
      const pair: BracketPair = {
        openLine: top.line,
        openCol: top.col,
        closeLine: line,
        closeCol: token.start,
      }
      pairs.push(pair)
      byPosition.set(bracketKey(pair.openLine, pair.openCol), pair)
      byPosition.set(bracketKey(pair.closeLine, pair.closeCol), pair)
      if (pairs.length > MAX_PAIRS) {
        overflow = true
        break
      }
    }
  }
  return { byPosition, pairs, braceDepth, overflow }
}

/** Pair for the bracket at one position, if any. */
export function bracketAt(index: BracketIndex, line: number, col: number): BracketPair | undefined {
  return index.byPosition.get(bracketKey(line, col))
}

/** Token that starts at `col` on `line`. */
export function tokenAt(tokens: readonly Token[][], line: number, col: number): Token | undefined {
  const row = tokens[line]
  if (row === undefined) return undefined
  for (const token of row) {
    if (col >= token.start && col < token.start + token.text.length) return token
  }
  return undefined
}

/** Octet of the bracket at a position, or the empty string. */
export function bracketCharAt(lines: readonly string[], line: number, col: number): string {
  return (lines[line] ?? '')[col] ?? ''
}

/** Nearest bracket at or just before the caret, useful for click positions. */
export function bracketNear(lines: readonly string[], line: number, col: number): { line: number; col: number } | null {
  const text = lines[line] ?? ''
  if (text[col] !== undefined && /[()[\]{}]/.test(text[col] ?? '')) return { line, col }
  if (col > 0 && /[()[\]{}]/.test(text[col - 1] ?? '')) return { line, col: col - 1 }
  return null
}

/** Whether the position is an opening bracket. */
export function isOpening(char: string): boolean {
  return char === '(' || char === '[' || char === '{'
}
