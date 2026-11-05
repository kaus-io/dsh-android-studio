/** In-file search and word-usage matching. */
import type { SearchMatch, SearchResult } from './types.ts'

/** Options for one find query. */
export interface SearchOptions {
  readonly caseSensitive?: boolean
  readonly regex?: boolean
  readonly wholeWord?: boolean
  readonly limit?: number
}

const DEFAULT_LIMIT = 20_000
const IDENT_PART = /[A-Za-z0-9_$]/

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function boundaryBefore(text: string, index: number): boolean {
  return index <= 0 || !IDENT_PART.test(text[index - 1] ?? '')
}

function boundaryAfter(text: string, index: number): boolean {
  return index >= text.length || !IDENT_PART.test(text[index] ?? '')
}

/** Convert absolute offsets into line/column matches. */
function toMatches(text: string, starts: readonly { start: number; end: number }[]): SearchMatch[] {
  const matches: SearchMatch[] = []
  let scan = 0
  let line = 0
  for (const { start, end } of starts) {
    for (;;) {
      const newline = text.indexOf('\n', scan)
      if (newline === -1 || newline >= start) break
      line += 1
      scan = newline + 1
    }
    matches.push({ line, start: start - scan, end: end - scan })
  }
  return matches
}

/** Run a find query over the whole text. */
export function findInText(text: string, query: string, options: SearchOptions = {}): SearchResult {
  if (query === '') return { matches: [], truncated: false }
  const limit = options.limit ?? DEFAULT_LIMIT
  const flags = options.caseSensitive === true ? 'g' : 'gi'
  let pattern: RegExp
  try {
    const body = options.regex === true ? query : escapeRegex(query)
    pattern = new RegExp(options.wholeWord === true ? `(?<![A-Za-z0-9_$])(?:${body})(?![A-Za-z0-9_$])` : body, flags)
  } catch (error) {
    return { matches: [], truncated: false, error: error instanceof Error ? error.message : String(error) }
  }
  const spans: { start: number; end: number }[] = []
  let truncated = false
  if (options.wholeWord === true && options.regex !== true) {
    // Plain whole-word search stays on indexOf: no regex padding to strip.
    let from = 0
    for (;;) {
      const index = text.indexOf(query, from)
      if (index === -1) break
      if (boundaryBefore(text, index) && boundaryAfter(text, index + query.length)) {
        spans.push({ start: index, end: index + query.length })
        if (spans.length >= limit) {
          truncated = true
          break
        }
      }
      from = index + Math.max(1, query.length)
    }
    return { matches: toMatches(text, spans), truncated }
  }
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const value = match[0]
    if (value === '') {
      pattern.lastIndex += 1
      continue
    }
    spans.push({ start: match.index, end: match.index + value.length })
    if (spans.length >= limit) {
      truncated = true
      break
    }
  }
  return { matches: toMatches(text, spans), truncated }
}

/** Occurrences of one identifier, for caret usage highlighting. */
export function findUsages(text: string, word: string): readonly SearchMatch[] {
  if (word === '') return []
  return findInText(text, word, { caseSensitive: true, wholeWord: true, limit: 5000 }).matches
}
