/** Shared value types for the code-reader engine (no DOM, no React). */

/** Token classes the highlighter emits; each maps to one CSS colour slot. */
export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'type'
  | 'function'
  | 'string'
  | 'number'
  | 'comment'
  | 'constant'
  | 'annotation'
  | 'operator'
  | 'punct'
  | 'tag'
  | 'attr'
  | 'key'
  | 'variable'
  | 'meta'
  | 'inserted'
  | 'deleted'
  | 'invalid'

/** One piece of one source line. `start` is the 0-based column. */
export interface Token {
  readonly text: string
  readonly kind: TokenKind
  readonly start: number
  /** Bracket-pair depth, set only on bracket punctuation. */
  readonly depth?: number
}

/** A foldable line range. Collapsing hides `start + 1 .. end` inclusive. */
export interface FoldRegion {
  readonly start: number
  readonly end: number
  readonly kind: 'block' | 'comment' | 'imports' | 'region' | 'indent'
  readonly label?: string
}

/** One member of the structure outline. */
export interface SymbolInfo {
  readonly name: string
  readonly kind: 'class' | 'interface' | 'enum' | 'object' | 'function' | 'method' | 'field' | 'variable' | 'namespace' | 'type'
  readonly line: number
  readonly endLine: number
  readonly depth: number
  readonly parent: number
  readonly signature: string
}

/** One in-file search hit, in source coordinates. */
export interface SearchMatch {
  readonly line: number
  readonly start: number
  readonly end: number
}

/** A caret position in source coordinates. */
export interface Caret {
  readonly line: number
  readonly col: number
}

/** Result of a find query. */
export interface SearchResult {
  readonly matches: readonly SearchMatch[]
  readonly truncated: boolean
  readonly error?: string
}

/** One visual row of the virtualized document. */
export interface VisualRow {
  /** Source line index. */
  readonly line: number
  /** Rendered height in CSS pixels. */
  readonly height: number
}

/** Layout of the whole document after folding and wrapping. */
export interface DocumentLayout {
  readonly rows: readonly VisualRow[]
  /** `offsets[i]` is the top of row `i`; the last entry is the total height. */
  readonly offsets: readonly number[]
  readonly total: number
  /** Source line -> visual row index (folded lines map to the fold start). */
  readonly rowOfLine: readonly number[]
  /** Fold start -> number of hidden source lines. */
  readonly hiddenByStart: ReadonlyMap<number, number>
  /** Widest source line in visual columns. */
  readonly maxColumns: number
}

/** A visible slice of the document for one paint. */
export interface VisibleWindow {
  readonly start: number
  readonly end: number
  readonly top: number
}

/** Bracket pair in absolute source coordinates. */
export interface BracketPair {
  readonly openLine: number
  readonly openCol: number
  readonly closeLine: number
  readonly closeCol: number
}
