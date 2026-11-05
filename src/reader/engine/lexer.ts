/**
 * Sequential tokenizer for the reader.
 *
 * The generic scanner handles C-like, hash-comment, shell, SQL and Lisp
 * families from their {@link LanguageSpec}; dedicated line scanners handle
 * JSON, YAML, TOML, INI, CSS, markup, diff, log, HTTP and TeX. Every token is
 * contiguous with its neighbours, so a line's token texts concatenate back to
 * the line and `start` is the exact source column.
 */
import type { BlockCommentRule, DeclKind, LanguageSpec, StringRule } from './languages.ts'
import type { Token, TokenKind } from './types.ts'

const TAB_WIDTH = 4
const NUMBER_SOURCE =
  '0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\\d[\\d_]*(?:\\.[\\d_]*)?|\\.\\d[\\d_]*)(?:[eE][+-]?\\d+)?[a-zA-Z_]*'
const IDENT_START = /[A-Za-z_$\u0080-\uFFFF]/
const IDENT_PART = /[A-Za-z0-9_$\u0080-\uFFFF]/
const WORD_SPLIT = /[\s()[\]{};,.:?!+\-*/%=<>|&^~"'`@#]/

/** Strip CR so the engine sees only `\n` line breaks. */
export function normalizeText(text: string): string {
  return text.indexOf('\r') === -1 ? text : text.replace(/\r\n?/g, '\n')
}

/** Split normalized text into lines, preserving a trailing empty line. */
export function splitLines(text: string): string[] {
  return text.split('\n')
}

/** Visual column width of one code point: tabs to the next 4-column stop, CJK double. */
export function charWidth(code: number): number {
  if (code === 9) return TAB_WIDTH
  if (code >= 0x1100 && (code <= 0x115f || code === 0x2329 || code === 0x232a || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x1f300 && code <= 0x1f64f) || (code >= 0x1f900 && code <= 0x1f9ff) || (code >= 0x20000 && code <= 0x3fffd))) {
    return 2
  }
  return 1
}

/** Width of a whole string in visual columns. */
export function visualWidth(text: string): number {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    width += code === 9 ? TAB_WIDTH - (width % TAB_WIDTH) : charWidth(code)
  }
  return width
}

/** Map a column to its visual x offset. */
export function xOfColumn(text: string, column: number): number {
  let width = 0
  const end = Math.min(column, text.length)
  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i)
    width += code === 9 ? TAB_WIDTH - (width % TAB_WIDTH) : charWidth(code)
  }
  return width
}

/** Map a visual x offset to the nearest column. */
export function columnOfX(text: string, x: number): number {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const next = width + (code === 9 ? TAB_WIDTH - (width % TAB_WIDTH) : charWidth(code))
    if (next > x) return i
    width = next
  }
  return text.length
}

/** `{`/`[`/`(` and their closing counterparts. */
const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])

/** Builder that turns a stream of spans into per-line token arrays. */
class LineBuilder {
  readonly lines: Token[][] = []
  private current: Token[] = []
  private lineStart = 0
  private readonly text: string

  constructor(text: string) {
    this.text = text
  }

  /** Append a token that fits on one line (no newline inside `[start, end)`). */
  token(kind: TokenKind, start: number, end: number, depth?: number): void {
    if (end <= start) return
    const last = this.current[this.current.length - 1]
    const text = this.text.slice(start, end)
    if (last !== undefined && last.kind === kind && last.start + last.text.length === start - this.lineStart && last.depth === depth) {
      this.current[this.current.length - 1] = { text: last.text + text, kind, start: last.start, ...(depth === undefined ? {} : { depth }) }
      return
    }
    this.current.push({ text, kind, start: start - this.lineStart, ...(depth === undefined ? {} : { depth }) })
  }

  /** Append a span that may cross line breaks, splitting it per line. */
  span(kind: TokenKind, start: number, end: number, depth?: number): void {
    let segment = start
    while (segment <= end) {
      const newline = this.text.indexOf('\n', segment)
      const segmentEnd = newline === -1 || newline >= end ? end : newline
      this.token(kind, segment, segmentEnd, depth)
      if (newline === -1 || newline >= end) break
      this.lines.push(this.current)
      this.current = []
      this.lineStart = newline + 1
      segment = newline + 1
    }
  }

  /** Close the line at absolute offset `at`. */
  newline(at: number): void {
    this.lines.push(this.current)
    this.current = []
    this.lineStart = at + 1
  }

  /** Push the final line. */
  finish(): Token[][] {
    this.lines.push(this.current)
    return this.lines
  }
}

function classifyWord(
  word: string,
  spec: LanguageSpec,
  nextChar: string,
): TokenKind {
  const key = spec.caseInsensitive === true ? word.toLowerCase() : word
  if (spec.keywords.has(key)) return 'keyword'
  if (spec.constants?.has(key) === true) return 'constant'
  if (spec.types?.has(key) === true) return 'type'
  if (spec.capitalizedTypes !== false && /^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) return 'constant'
  if (spec.capitalizedTypes !== false && /^[A-Z]/.test(word) && word.length > 1) return 'type'
  if (spec.functionByCall !== false && nextChar === '(') return 'function'
  return 'plain'
}

function scanBlockComment(text: string, start: number, rule: BlockCommentRule): number {
  let cursor = start + rule.open.length
  let depth = 1
  while (cursor <= text.length) {
    const close = text.indexOf(rule.close, cursor)
    if (close === -1) return text.length
    if (rule.nested === true) {
      const open = text.indexOf(rule.open, cursor)
      if (open !== -1 && open < close) {
        depth += 1
        cursor = open + rule.open.length
        continue
      }
    }
    depth -= 1
    cursor = close + rule.close.length
    if (depth === 0) return cursor
  }
  return text.length
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'return', 'case', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'yield', 'await', 'else', 'do', 'throw',
])

/** Whether a `/` at this position starts a regex literal rather than division. */
function regexAllowed(text: string, index: number): boolean {
  let cursor = index - 1
  while (cursor >= 0 && (text[cursor] === ' ' || text[cursor] === '\t')) cursor -= 1
  if (cursor < 0 || text[cursor] === '\n') return true
  const char = text[cursor] ?? ''
  if ('([{,;:=!&|?+-*%^~<>'.includes(char)) return true
  if (!/[A-Za-z0-9_$]/.test(char)) return false
  let wordStart = cursor
  while (wordStart >= 0 && /[A-Za-z0-9_$]/.test(text[wordStart] ?? '')) wordStart -= 1
  return REGEX_PREFIX_KEYWORDS.has(text.slice(wordStart + 1, cursor + 1))
}

/** Scan `/pattern/flags` on one line; null when the literal does not close. */
function scanRegexLiteral(text: string, start: number): number | null {
  let cursor = start + 1
  let inClass = false
  while (cursor < text.length) {
    const char = text[cursor] ?? ''
    if (char === '\n') return null
    if (char === '\\') {
      cursor += 2
      continue
    }
    if (char === '[') inClass = true
    else if (char === ']') inClass = false
    else if (char === '/' && !inClass) {
      cursor += 1
      while (cursor < text.length && /[a-z]/i.test(text[cursor] ?? '')) cursor += 1
      return cursor
    }
    cursor += 1
  }
  return null
}

function scanString(text: string, start: number, rule: StringRule): number | null {
  let cursor = start + rule.open.length
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor)
    if (code === 10) {
      if (rule.multiline !== true) return null
      cursor += 1
      continue
    }
    if (rule.escape !== false && code === 92) {
      cursor += 2
      continue
    }
    if (text.startsWith(rule.close, cursor)) return cursor + rule.close.length
    cursor += 1
  }
  return rule.multiline === true ? text.length : null
}

/** Scan the C-like family into per-line tokens. */
function tokenizeGeneric(text: string, spec: LanguageSpec): Token[][] {
  const builder = new LineBuilder(text)
  const numberRe = new RegExp(NUMBER_SOURCE, 'y')
  const length = text.length
  let index = 0
  let depth = 0
  let pending: DeclKind | null = null
  let atLineStart = true

  const pushWord = (start: number, end: number): void => {
    const word = text.slice(start, end)
    let nextChar = ''
    let cursor = end
    while (cursor < length && (text.charCodeAt(cursor) === 32 || text.charCodeAt(cursor) === 9)) cursor += 1
    nextChar = cursor < length ? text[cursor] ?? '' : ''
    let kind = classifyWord(word, spec, nextChar)
    if (pending !== null) {
      kind = pending
      pending = null
    }
    builder.token(kind, start, end)
  }

  while (index < length) {
    const code = text.charCodeAt(index)
    if (code === 10) {
      builder.newline(index)
      index += 1
      atLineStart = true
      pending = null
      continue
    }
    if (code === 32 || code === 9 || code === 13) {
      let cursor = index + 1
      while (cursor < length) {
        const next = text.charCodeAt(cursor)
        if (next !== 32 && next !== 9 && next !== 13) break
        cursor += 1
      }
      builder.token('plain', index, cursor)
      index = cursor
      continue
    }
    if (spec.preprocessor === true && atLineStart && code === 35) {
      const end = text.indexOf('\n', index)
      const stop = end === -1 ? length : end
      builder.token('meta', index, stop)
      index = stop
      atLineStart = false
      continue
    }
    atLineStart = false

    let matchedComment = false
    for (const rule of spec.blockComments ?? []) {
      if (!text.startsWith(rule.open, index)) continue
      const end = scanBlockComment(text, index, rule)
      builder.span('comment', index, end)
      index = end
      matchedComment = true
      break
    }
    if (matchedComment) continue

    for (const marker of spec.lineComments ?? []) {
      if (!text.startsWith(marker, index)) continue
      const end = text.indexOf('\n', index)
      const stop = end === -1 ? length : end
      builder.token('comment', index, stop)
      index = stop
      matchedComment = true
      break
    }
    if (matchedComment) continue

    if (spec.variables === true && (code === 36 || code === 64 || code === 37)) {
      if (code === 64 && spec.annotation === true) {
        let cursor = index + 1
        while (cursor < length && /[A-Za-z0-9_.]/.test(text[cursor] ?? '')) cursor += 1
        if (cursor > index + 1) {
          builder.token('annotation', index, cursor)
          index = cursor
          continue
        }
      }
      if (code === 36 && text[index + 1] === '{') {
        const close = text.indexOf('}', index + 2)
        const stop = close === -1 ? index + 2 : close + 1
        builder.token('variable', index, stop)
        index = stop
        continue
      }
      if (text[index + 1] !== undefined && /[A-Za-z0-9_@?$!#*%]/.test(text[index + 1] ?? '')) {
        let cursor = index + 1
        while (cursor < length && /[A-Za-z0-9_@]/.test(text[cursor] ?? '')) cursor += 1
        builder.token('variable', index, cursor)
        index = cursor
        continue
      }
    }

    if (code === 64 && spec.annotation === true) {
      let cursor = index + 1
      while (cursor < length && /[A-Za-z0-9_.]/.test(text[cursor] ?? '')) cursor += 1
      if (cursor > index + 1) {
        builder.token('annotation', index, cursor)
        index = cursor
        continue
      }
    }

    if (spec.regexLiterals === true && code === 47) {
      if (regexAllowed(text, index)) {
        const end = scanRegexLiteral(text, index)
        if (end !== null) {
          builder.token('string', index, end)
          index = end
          continue
        }
      }
    }

    let matchedString = false
    for (const rule of spec.strings ?? []) {
      if (!text.startsWith(rule.open, index)) continue
      const end = scanString(text, index, rule)
      if (end === null) {
        builder.token('punct', index, index + 1)
        index += 1
      } else {
        builder.span('string', index, end)
        index = end
      }
      matchedString = true
      break
    }
    if (matchedString) continue

    if (code >= 48 && code <= 57) {
      numberRe.lastIndex = index
      const match = numberRe.exec(text)
      if (match !== null && match[0].length > 0) {
        const end = index + match[0].length
        builder.token('number', index, end)
        index = end
        continue
      }
    }

    if (IDENT_START.test(text[index] ?? '')) {
      let cursor = index + 1
      while (cursor < length && IDENT_PART.test(text[cursor] ?? '')) cursor += 1
      pushWord(index, cursor)
      const key = spec.caseInsensitive === true ? text.slice(index, cursor).toLowerCase() : text.slice(index, cursor)
      const decl = spec.decl?.[key]
      if (decl !== undefined) pending = decl
      index = cursor
      continue
    }

    const char = text[index] ?? ''
    if (OPENERS.has(char)) {
      builder.token('punct', index, index + 1, depth)
      depth += 1
      index += 1
      continue
    }
    if (CLOSERS.has(char)) {
      depth = Math.max(0, depth - 1)
      builder.token('punct', index, index + 1, depth)
      index += 1
      continue
    }
    if (char === ';' || char === ',' || char === '.' || char === ':') {
      builder.token('punct', index, index + 1)
      index += 1
      continue
    }
    if (/[+\-*/%=<>!&|^~?]/.test(char)) {
      let cursor = index + 1
      while (cursor < length && /[+\-*/%=<>!&|^~?]/.test(text[cursor] ?? '')) {
        if (startsComment(text, cursor, spec)) break
        cursor += 1
      }
      builder.token('operator', index, cursor)
      index = cursor
      continue
    }
    builder.token('plain', index, index + 1)
    index += 1
  }
  return builder.finish()
}

function startsComment(text: string, index: number, spec: LanguageSpec): boolean {
  for (const rule of spec.blockComments ?? []) if (text.startsWith(rule.open, index)) return true
  for (const marker of spec.lineComments ?? []) if (text.startsWith(marker, index)) return true
  return false
}

/** Turn a string token followed by `:` into a property key (JSON, maps). */
function markKeys(tokens: Token[][]): void {
  for (const line of tokens) {
    for (let i = 0; i < line.length; i++) {
      const token = line[i]
      if (token === undefined || token.kind !== 'string') continue
      let j = i + 1
      while (j < line.length && (line[j]?.text.trim() === '')) j += 1
      if (line[j]?.text === ':') line[i] = { ...token, kind: 'key' }
    }
  }
}

/** JSON/JSONC: the generic scanner plus key classification. */
function tokenizeJson(text: string): Token[][] {
  const spec = JSON_SPEC
  const tokens = tokenizeGeneric(text, spec)
  markKeys(tokens)
  return tokens
}

const JSON_SPEC: LanguageSpec = {
  id: 'json',
  label: 'JSON',
  family: 'generic',
  keywords: new Set([]),
  constants: new Set(['true', 'false', 'null']),
  lineComments: ['//'],
  blockComments: [{ open: '/*', close: '*/' }],
  strings: [{ open: '"', close: '"', escape: true }],
  capitalizedTypes: false,
  functionByCall: false,
}

/** Stateful per-line scanners for the structured families. */
interface LineState {
  inTag?: boolean
  inCssBlock?: boolean
  inComment?: boolean
  quote?: string | null
}

function pushPlain(tokens: Token[], text: string, start: number, end: number): void {
  if (end <= start) return
  const last = tokens[tokens.length - 1]
  const piece = text.slice(start, end)
  if (last !== undefined && last.kind === 'plain' && last.start + last.text.length === start) {
    tokens[tokens.length - 1] = { text: last.text + piece, kind: 'plain', start: last.start }
  } else {
    tokens.push({ text: piece, kind: 'plain', start })
  }
}

function push(tokens: Token[], kind: TokenKind, text: string, start: number): void {
  const last = tokens[tokens.length - 1]
  if (last !== undefined && last.kind === kind && last.start + last.text.length === start) {
    tokens[tokens.length - 1] = { text: last.text + text, kind, start: last.start }
  } else {
    tokens.push({ text, kind, start })
  }
}

function scanSimpleString(line: string, start: number, quote: string, escape: boolean): number {
  let cursor = start + quote.length
  while (cursor < line.length) {
    if (escape && line[cursor] === '\\') {
      cursor += 2
      continue
    }
    if (line.startsWith(quote, cursor)) return cursor + quote.length
    cursor += 1
  }
  return -1
}

/** YAML: comments, document markers, keys, scalars, anchors and tags. */
function tokenizeYaml(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    const tokens: Token[] = []
    let index = 0
    const trimmed = line.trimStart()
    if (trimmed.startsWith('#')) {
      tokens.push({ text: line, kind: 'comment', start: 0 })
      return tokens
    }
    if (/^(---|\.\.\.)\s*$/.test(trimmed)) {
      tokens.push({ text: line, kind: 'meta', start: 0 })
      return tokens
    }
    const lead = line.length - trimmed.length
    pushPlain(tokens, line, 0, lead)
    index = lead
    const list = /^-\s+/.exec(line.slice(index))
    if (list !== null) {
      push(tokens, 'punct', '-', index)
      pushPlain(tokens, line, index + 1, index + list[0].length)
      index += list[0].length
    }
    const key = /^("[^"]*"|'[^']*'|[^\s:#][^:#]*?)(\s*):(?=\s|$)/.exec(line.slice(index))
    if (key !== null) {
      push(tokens, 'key', key[1] ?? '', index)
      const keyEnd = index + (key[1]?.length ?? 0)
      const colon = keyEnd + (key[2]?.length ?? 0)
      push(tokens, 'punct', ':', colon)
      index = colon + 1
      while (index < line.length && line[index] === ' ') {
        pushPlain(tokens, line, index, index + 1)
        index += 1
      }
    }
    while (index < line.length) {
      const char = line[index] ?? ''
      if (char === '#') {
        const before = line[index - 1]
        if (index === 0 || before === ' ' || before === '\t') {
          push(tokens, 'comment', line.slice(index), index)
          break
        }
      }
      if (char === '"' || char === "'") {
        const end = scanSimpleString(line, index, char, char === '"')
        if (end > 0) {
          push(tokens, 'string', line.slice(index, end), index)
          index = end
          continue
        }
      }
      if (char === '&' || char === '*') {
        const match = /^[&*][\w.-]+/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'variable', match[0], index)
          index += match[0].length
          continue
        }
      }
      if (char === '!') {
        const match = /^![\w!.-]*/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'annotation', match[0], index)
          index += match[0].length
          continue
        }
      }
      if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(line[index + 1] ?? ''))) {
        const match = /^-?(?:\d[\d_]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'number', match[0], index)
          index += match[0].length
          continue
        }
      }
      if (/^[A-Za-z_]/.test(char)) {
        const match = /^[A-Za-z_][\w-]*/.exec(line.slice(index))
        const word = match?.[0] ?? char
        const key = word.toLowerCase()
        const kind: TokenKind = key === 'true' || key === 'false' || key === 'null' || key === 'yes' || key === 'no' || key === 'on' || key === 'off' ? 'constant' : 'plain'
        push(tokens, kind, word, index)
        index += word.length
        continue
      }
      if ('[]{},'.includes(char)) {
        push(tokens, 'punct', char, index)
        index += 1
        continue
      }
      if ('|-<>'.includes(char)) {
        push(tokens, 'operator', char, index)
        index += 1
        continue
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** TOML: tables, keys, scalars and comments. */
function tokenizeToml(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    const tokens: Token[] = []
    const trimmed = line.trimStart()
    if (trimmed.startsWith('#')) {
      tokens.push({ text: line, kind: 'comment', start: 0 })
      return tokens
    }
    const lead = line.length - trimmed.length
    pushPlain(tokens, line, 0, lead)
    let index = lead
    if (line[index] === '[') {
      const close = line.indexOf(']', index)
      const end = close === -1 ? line.length : close + 1
      push(tokens, 'type', line.slice(index, end), index)
      index = end
    } else {
      const key = /^[A-Za-z0-9_.-]+\s*=/.exec(line.slice(index))
      if (key !== null) {
        const keyText = key[0].slice(0, key[0].lastIndexOf('=')).trimEnd()
        push(tokens, 'key', keyText, index)
        index += keyText.length
        while (index < line.length && line[index] === ' ') {
          pushPlain(tokens, line, index, index + 1)
          index += 1
        }
        if (line[index] === '=') {
          push(tokens, 'punct', '=', index)
          index += 1
        }
      }
    }
    while (index < line.length) {
      const char = line[index] ?? ''
      if (char === '#') {
        push(tokens, 'comment', line.slice(index), index)
        break
      }
      if (char === '"' || char === "'") {
        const triple = line.startsWith(char.repeat(3), index)
        const quote = triple ? char.repeat(3) : char
        const end = scanSimpleString(line, index, quote, char === '"')
        if (end > 0) {
          push(tokens, 'string', line.slice(index, end), index)
          index = end
          continue
        }
      }
      const date = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/.exec(line.slice(index))
      if (date !== null) {
        push(tokens, 'meta', date[0], index)
        index += date[0].length
        continue
      }
      const number = /^-?(?:\d[\d_]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(line.slice(index))
      if (number !== null) {
        push(tokens, 'number', number[0], index)
        index += number[0].length
        continue
      }
      const word = /^(?:true|false)\b/.exec(line.slice(index))
      if (word !== null) {
        push(tokens, 'constant', word[0], index)
        index += word[0].length
        continue
      }
      const ident = /^[A-Za-z_][\w-]*/.exec(line.slice(index))
      if (ident !== null) {
        push(tokens, 'plain', ident[0], index)
        index += ident[0].length
        continue
      }
      if ('[]{},.'.includes(char)) {
        push(tokens, 'punct', char, index)
        index += 1
        continue
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** INI / properties / dotenv: sections, keys, values and comments. */
function tokenizeIni(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    const tokens: Token[] = []
    const trimmed = line.trimStart()
    if (trimmed.startsWith(';') || trimmed.startsWith('#')) {
      tokens.push({ text: line, kind: 'comment', start: 0 })
      return tokens
    }
    const lead = line.length - trimmed.length
    pushPlain(tokens, line, 0, lead)
    let index = lead
    if (line[index] === '[') {
      const close = line.indexOf(']', index)
      const end = close === -1 ? line.length : close + 1
      push(tokens, 'type', line.slice(index, end), index)
      index = end
    } else {
      const match = /^([^=:#\s][^=:]*?)(\s*)([=:])(.*)$/.exec(line.slice(index))
      if (match !== null) {
        push(tokens, 'key', match[1] ?? '', index)
        index += match[1]?.length ?? 0
        if ((match[2]?.length ?? 0) > 0) {
          pushPlain(tokens, line, index, index + (match[2]?.length ?? 0))
          index += match[2]?.length ?? 0
        }
        push(tokens, 'punct', match[3] ?? '=', index)
        index += 1
        const value = line.slice(index)
        if (value.trim() !== '') {
          const valueStart = index + (value.length - value.trimStart().length)
          pushPlain(tokens, line, index, valueStart)
          const literal = /^(".*?"|'.*?')/.exec(line.slice(valueStart))
          if (literal !== null) {
            push(tokens, 'string', literal[0], valueStart)
            index = valueStart + literal[0].length
          } else {
            const bool = /^(true|false|null|yes|no|on|off)\b/i.exec(line.slice(valueStart))
            if (bool !== null) {
              push(tokens, 'constant', bool[0], valueStart)
              index = valueStart + bool[0].length
            } else {
              push(tokens, 'plain', line.slice(valueStart), valueStart)
              index = line.length
            }
          }
        }
        if (index < line.length) pushPlain(tokens, line, index, line.length)
        return tokens
      }
    }
    while (index < line.length) {
      const char = line[index] ?? ''
      if (char === ';' || char === '#') {
        push(tokens, 'comment', line.slice(index), index)
        break
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** CSS / SCSS / Less. */
function tokenizeCss(lines: readonly string[]): Token[][] {
  const state: LineState = { inCssBlock: false }
  return lines.map((line) => {
    const tokens: Token[] = []
    let index = 0
    while (index < line.length) {
      const char = line[index] ?? ''
      if (char === '/' && line[index + 1] === '*') {
        const close = line.indexOf('*/', index + 2)
        const end = close === -1 ? line.length : close + 2
        push(tokens, 'comment', line.slice(index, end), index)
        index = end
        continue
      }
      if (char === '"' || char === "'") {
        const end = scanSimpleString(line, index, char, char === '"')
        const stop = end > 0 ? end : index + 1
        push(tokens, 'string', line.slice(index, stop), index)
        index = stop
        continue
      }
      if (char === '@') {
        const match = /^@[\w-]+/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'annotation', match[0], index)
          index += match[0].length
          continue
        }
      }
      if (char === '#' && /^#[\da-fA-F]{3,8}\b/.test(line.slice(index))) {
        const match = /^#[\da-fA-F]{3,8}\b/.exec(line.slice(index))
        push(tokens, 'constant', match?.[0] ?? char, index)
        index += match?.[0].length ?? 1
        continue
      }
      if (char === '$' && line[index + 1] !== undefined) {
        const match = /^\$[\w-]+/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'variable', match[0], index)
          index += match[0].length
          continue
        }
      }
      if ('{}'.includes(char)) {
        state.inCssBlock = char === '{'
        push(tokens, 'punct', char, index)
        index += 1
        continue
      }
      if (char === ':' || char === ';' || char === ',' || char === '(' || char === ')' || char === '[' || char === ']') {
        push(tokens, 'punct', char, index)
        index += 1
        continue
      }
      const number = /^-?(?:\d*\.\d+|\d+)(?:px|em|rem|vh|vw|%|s|ms|deg|fr|pt)?/.exec(line.slice(index))
      if (number !== null) {
        push(tokens, 'number', number[0], index)
        index += number[0].length
        continue
      }
      const ident = /^[A-Za-z_][\w-]*/.exec(line.slice(index))
      if (ident !== null) {
        const word = ident[0]
        let cursor = index + word.length
        while (cursor < line.length && line[cursor] === ' ') cursor += 1
        let kind: TokenKind
        if (line[cursor] === ':' && state.inCssBlock === true) kind = 'key'
        else if (line[cursor] === '(') kind = 'function'
        else if (/important|inherit|initial|unset|revert|auto/.test(word)) kind = 'keyword'
        else if (state.inCssBlock === false) kind = 'tag'
        else kind = 'plain'
        push(tokens, kind, word, index)
        index += word.length
        continue
      }
      if (/[.#]/.test(char)) {
        const match = /^[.#][\w-]+/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'type', match[0], index)
          index += match[0].length
          continue
        }
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** HTML / XML tags, attributes, comments and entities. */
function tokenizeMarkup(lines: readonly string[]): Token[][] {
  const state: LineState = { inTag: false }
  return lines.map((line) => {
    const tokens: Token[] = []
    let index = 0
    while (index < line.length) {
      if (state.inComment === true) {
        const close = line.indexOf('-->', index)
        const end = close === -1 ? line.length : close + 3
        push(tokens, 'comment', line.slice(index, end), index)
        index = end
        if (close !== -1) state.inComment = false
        continue
      }
      if (line.startsWith('<!--', index)) {
        const close = line.indexOf('-->', index + 4)
        const end = close === -1 ? line.length : close + 3
        push(tokens, 'comment', line.slice(index, end), index)
        index = end
        state.inComment = close === -1
        continue
      }
      if (line.startsWith('<![CDATA[', index)) {
        const close = line.indexOf(']]>', index + 9)
        const end = close === -1 ? line.length : close + 3
        push(tokens, 'meta', line.slice(index, end), index)
        index = end
        continue
      }
      if (line.startsWith('<!DOCTYPE', index) || line.startsWith('<?xml', index)) {
        const close = line.indexOf('>', index)
        const end = close === -1 ? line.length : close + 1
        push(tokens, 'meta', line.slice(index, end), index)
        index = end
        continue
      }
      if (state.inTag === true) {
        const char = line[index] ?? ''
        if (char === '>') {
          push(tokens, 'punct', '>', index)
          state.inTag = false
          index += 1
          continue
        }
        if (char === '/' && line[index + 1] === '>') {
          push(tokens, 'punct', '/>', index)
          state.inTag = false
          index += 2
          continue
        }
        if (char === '"' || char === "'") {
          const end = scanSimpleString(line, index, char, false)
          const stop = end > 0 ? end : index + 1
          push(tokens, 'string', line.slice(index, stop), index)
          index = stop
          continue
        }
        if (char === '=') {
          push(tokens, 'punct', '=', index)
          index += 1
          continue
        }
        const attr = /^[^\s=/>"']+/.exec(line.slice(index))
        if (attr !== null) {
          push(tokens, 'attr', attr[0], index)
          index += attr[0].length
          continue
        }
        pushPlain(tokens, line, index, index + 1)
        index += 1
        continue
      }
      if (line.startsWith('</', index)) {
        const close = line.indexOf('>', index)
        const end = close === -1 ? line.length : close + 1
        push(tokens, 'tag', line.slice(index, end), index)
        index = end
        continue
      }
      if (line[index] === '<') {
        const name = /^<[A-Za-z][\w:-]*/.exec(line.slice(index))
        if (name !== null) {
          push(tokens, 'tag', name[0], index)
          index += name[0].length
          state.inTag = true
          continue
        }
      }
      if (line[index] === '&') {
        const entity = /^&[#\w]+;/.exec(line.slice(index))
        if (entity !== null) {
          push(tokens, 'constant', entity[0], index)
          index += entity[0].length
          continue
        }
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** Unified diff bodies. */
function tokenizeDiff(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    let kind: TokenKind = 'plain'
    if (/^(?:diff |index |--- |\+\+\+ |@@ |new file|deleted file|similarity|rename )/.test(line)) kind = 'meta'
    else if (line.startsWith('@@')) kind = 'meta'
    else if (line.startsWith('+')) kind = 'inserted'
    else if (line.startsWith('-')) kind = 'deleted'
    else if (line.startsWith('\\ No newline')) kind = 'comment'
    return [{ text: line, kind, start: 0 }]
  })
}

/** Log files: timestamps and severity names. */
function tokenizeLog(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    const tokens: Token[] = []
    let index = 0
    const stamp = /^\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/.exec(line)
    if (stamp !== null) {
      push(tokens, 'meta', stamp[0], 0)
      index = stamp[0].length
    }
    while (index < line.length) {
      const rest = line.slice(index)
      const level = /^(?:\[)?(ERROR|FATAL|WARN|WARNING|INFO|NOTICE|DEBUG|TRACE)(?:\])?/.exec(rest)
      if (level !== null) {
        const word = level[1] ?? ''
        const kind: TokenKind = word === 'ERROR' || word === 'FATAL' ? 'invalid' : word.startsWith('WARN') ? 'annotation' : word === 'INFO' || word === 'NOTICE' ? 'keyword' : 'comment'
        push(tokens, kind, level[0], index)
        index += level[0].length
        continue
      }
      if (/^\d+(?:\.\d+)?/.test(rest)) {
        const number = /^\d+(?:\.\d+)?/.exec(rest)
        push(tokens, 'number', number?.[0] ?? '', index)
        index += number?.[0].length ?? 0
        continue
      }
      if (rest[0] === '"' || rest[0] === "'") {
        const end = scanSimpleString(line, index, rest[0], true)
        const stop = end > 0 ? end : index + 1
        push(tokens, 'string', line.slice(index, stop), index)
        index = stop
        continue
      }
      const word = /^[A-Za-z_][\w.-]*/.exec(rest)
      if (word !== null) {
        push(tokens, 'plain', word[0], index)
        index += word[0].length
        continue
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** HTTP request/response text. */
function tokenizeHttp(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    const tokens: Token[] = []
    const request = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|HTTP\/[\d.]+)\s+(\S*)\s*(HTTP\/[\d.]+)?/.exec(line)
    if (request !== null) {
      push(tokens, 'keyword', request[1] ?? '', 0)
      let index = (request[1] ?? '').length
      const space = /^\s+/.exec(line.slice(index))
      if (space !== null) {
        pushPlain(tokens, line, index, index + space[0].length)
        index += space[0].length
      }
      if ((request[2] ?? '') !== '') {
        push(tokens, 'string', request[2] ?? '', index)
        index += (request[2] ?? '').length
      }
      const space2 = /^\s+/.exec(line.slice(index))
      if (space2 !== null) {
        pushPlain(tokens, line, index, index + space2[0].length)
        index += space2[0].length
      }
      if ((request[3] ?? '') !== '') {
        push(tokens, 'meta', request[3] ?? '', index)
        index += (request[3] ?? '').length
      }
      if (index < line.length) pushPlain(tokens, line, index, line.length)
      return tokens
    }
    const header = /^([\w-]+)(\s*):(\s*)(.*)$/.exec(line)
    if (header !== null) {
      push(tokens, 'key', header[1] ?? '', 0)
      let index = (header[1] ?? '').length
      push(tokens, 'punct', ':', index)
      index += 1
      const value = header[4] ?? ''
      if (value !== '') {
        const start = line.length - value.length
        pushPlain(tokens, line, index, start)
        push(tokens, 'string', value, start)
      }
      return tokens
    }
    if (line.trim() === '') return []
    pushPlain(tokens, line, 0, line.length)
    return tokens
  })
}

/** TeX-ish sources. */
function tokenizeTex(lines: readonly string[]): Token[][] {
  return lines.map((line) => {
    const tokens: Token[] = []
    let index = 0
    while (index < line.length) {
      const char = line[index] ?? ''
      if (char === '%') {
        push(tokens, 'comment', line.slice(index), index)
        break
      }
      if (char === '\\') {
        const match = /^\\[A-Za-z@]+/.exec(line.slice(index))
        if (match !== null) {
          push(tokens, 'keyword', match[0], index)
          index += match[0].length
          continue
        }
      }
      if (char === '$') {
        const close = line.indexOf('$', index + 1)
        const end = close === -1 ? index + 1 : close + 1
        push(tokens, 'string', line.slice(index, end), index)
        index = end
        continue
      }
      if ('{}[]()'.includes(char)) {
        push(tokens, 'punct', char, index)
        index += 1
        continue
      }
      const number = /^\d+(?:\.\d+)?/.exec(line.slice(index))
      if (number !== null) {
        push(tokens, 'number', number[0], index)
        index += number[0].length
        continue
      }
      pushPlain(tokens, line, index, index + 1)
      index += 1
    }
    return tokens
  })
}

/** Tokenize one file for one language spec. */
export function tokenize(text: string, spec: LanguageSpec): Token[][] {
  const lines = splitLines(text)
  switch (spec.family) {
    case 'plain':
      return lines.map((line) => (line === '' ? [] : [{ text: line, kind: 'plain', start: 0 }]))
    case 'json':
      return tokenizeJson(text)
    case 'yaml':
      return tokenizeYaml(lines)
    case 'toml':
      return tokenizeToml(lines)
    case 'ini':
      return tokenizeIni(lines)
    case 'css':
      return tokenizeCss(lines)
    case 'markup':
      return tokenizeMarkup(lines)
    case 'diff':
      return tokenizeDiff(lines)
    case 'log':
      return tokenizeLog(lines)
    case 'http':
      return tokenizeHttp(lines)
    case 'tex':
      return tokenizeTex(lines)
    default:
      return tokenizeGeneric(text, spec)
  }
}

/** Word around a column, or the empty string. */
export function wordAt(line: string, column: number): string {
  if (line === '') return ''
  let start = Math.min(column, line.length)
  if (start >= line.length || WORD_SPLIT.test(line[start] ?? '')) start -= 1
  if (start < 0) return ''
  if (WORD_SPLIT.test(line[start] ?? '')) return ''
  let left = start
  while (left > 0 && !WORD_SPLIT.test(line[left - 1] ?? '')) left -= 1
  let right = start + 1
  while (right < line.length && !WORD_SPLIT.test(line[right] ?? '')) right += 1
  return line.slice(left, right)
}

/** Column span of a word at `column`. */
export function wordSpan(line: string, column: number): { start: number; end: number } | null {
  const word = wordAt(line, column)
  if (word === '') return null
  let start = Math.min(column, line.length)
  if (start >= line.length || WORD_SPLIT.test(line[start] ?? '')) start -= 1
  let left = start
  while (left > 0 && !WORD_SPLIT.test(line[left - 1] ?? '')) left -= 1
  return { start: left, end: left + word.length }
}

/** First non-space column, or 0 for a blank line. */
export function firstNonSpace(line: string): number {
  const match = /^\s*/.exec(line)
  return match === null ? 0 : match[0].length
}

/** Whether a line holds only whitespace. */
export function isBlank(line: string): boolean {
  return line.trim() === ''
}

/** Width of a line in visual columns (tabs to 4). */
export function lineWidth(line: string): number {
  return visualWidth(line)
}
