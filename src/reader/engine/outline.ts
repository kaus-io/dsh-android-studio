/** Heuristic structure extraction for the breadcrumb row and the outline panel. */
import { bracketAt, type BracketIndex } from './brackets.ts'
import { indentOf } from './folds.ts'
import type { LanguageSpec } from './languages.ts'
import type { SymbolInfo, Token } from './types.ts'

const MAX_SYMBOLS = 5000

const CONTROL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'when', 'return', 'throw', 'new', 'typeof', 'await', 'yield',
  'else', 'do', 'try', 'finally', 'case', 'match', 'with', 'delete', 'void', 'sizeof', 'print', 'println',
  'assert', 'super', 'this', 'function', 'constructor',
])

const TYPE_KEYWORD = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:public\s+|private\s+|protected\s+|internal\s+|sealed\s+|data\s+|open\s+|final\s+|partial\s+|static\s+|enum\s+|annotation\s+|companion\s+|value\s+|inline\s+|expect\s+|actual\s+|const\s+|readonly\s+|abstract\s+|export\s+|default\s+|unsafe\s+|extern\s+)*(class|interface|enum|record|struct|union|trait|object|protocol|extension|namespace|module|message|service|impl|type)\s+(?:<[^>]*>\s*)?([A-Za-z_$][\w$]*)/

const FUNCTION_KEYWORD = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|final\s+|open\s+|override\s+|suspend\s+|inline\s+|virtual\s+|abstract\s+|extern\s+|unsafe\s+|const\s+)*(fun|fn|func|function|def|sub|procedure|proc|rpc)\s+(?:<[^>]*>\s*)?\(?\s*(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/

const PYTHON_SYMBOL = /^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/u
const GO_SYMBOL = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/
const GO_TYPE = /^type\s+([A-Za-z_]\w*)\s+(struct|interface|func|map|\[|$)/
const RUST_IMPL = /^impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?([A-Za-z_]\w*)/
const RUBY_SYMBOL = /^(?:def|class|module)\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/
const SHELL_FUNCTION = /^(?:function\s+)?([A-Za-z_]\w*)\s*\(\s*\)/
const SQL_CREATE = /^CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|INDEX|TRIGGER|TYPE)\s+([\w.$"]+)/i
const YAML_KEY = /^(\s*)(?:"([^"]+)"|'([^']+)'|([^:\s][^:]*?))(\s*):(?=\s|$)/
const JSON_KEY = /^"((?:[^"\\]|\\.)*)"\s*:/
const CSS_SELECTOR = /^([^@{}/][^{}]*?)\s*\{/
const JAVA_FIELD = /^(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|final\s+|readonly\s+|volatile\s+|transient\s+|lateinit\s+|override\s+|const\s+)+(?:(?:val|var|let)\s+)?(?:[\w$<>\[\],.?]+\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]*|=[^=]|;)(?!\s*\()/
const PY_MODULE_BINDING = /^([A-Za-z_]\w*)\s*=(?!=)/
const BARE_FIELD = /^(?:val|var|let)\s+(?:[\w$<>\[\],.?]+\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]*|=[^=])/

interface Candidate {
  readonly line: number
  readonly name: string
  readonly kind: SymbolInfo['kind']
  readonly depth: number
}

function firstTokenKind(tokens: readonly Token[][], line: number, col: number): string | undefined {
  const row = tokens[line]
  if (row === undefined) return undefined
  for (const token of row) {
    if (col >= token.start && col < token.start + token.text.length) return token.kind
  }
  return undefined
}

function stripTrailingBrace(text: string): string {
  return text.replace(/\s*\{\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

/** The last identifier of the declarator before the first `(` on a method-looking line. */
function methodName(trimmed: string): string | null {
  const paren = trimmed.indexOf('(')
  if (paren <= 0) return null
  const head = trimmed.slice(0, paren).trim()
  const match = /([A-Za-z_$][\w$]*)$/.exec(head)
  if (match === null) return null
  const name = match[1] ?? ''
  if (name === '' || CONTROL.has(name)) return null
  const first = (/^[A-Za-z_$][\w$]*/.exec(trimmed)?.[0] ?? '')
  if (CONTROL.has(first) && first !== 'void') return null
  const rest = trimmed.slice(paren)
  const close = closingParen(rest, 0)
  if (close === -1) return null
  const tail = rest.slice(close + 1).trim()
  if (tail === '' || tail.startsWith('=>') || tail.startsWith('{') || tail.startsWith(':') || tail.startsWith('=')) {
    if (head.includes('=') && !head.trimEnd().endsWith('=')) return null
    return name
  }
  return null
}

function closingParen(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** Compute the indentation-depth stack for one file. */
function indentDepths(lines: readonly string[]): number[] {
  const depths = new Array<number>(lines.length).fill(0)
  const stack: number[] = []
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line] ?? ''
    if (text.trim() === '') {
      depths[line] = stack.length
      continue
    }
    const indent = indentOf(text)
    while (stack.length > 0 && (stack[stack.length - 1] ?? 0) >= indent) stack.pop()
    depths[line] = stack.length
    stack.push(indent)
  }
  return depths
}

/** Compute symbol candidates before structural post-processing. */
function collectCandidates(
  lines: readonly string[],
  tokens: readonly Token[][],
  spec: LanguageSpec,
  brackets: BracketIndex,
): Candidate[] {
  const candidates: Candidate[] = []
  const indented = spec.indentFolding === true || spec.family === 'yaml'
  const depths = indented ? indentDepths(lines) : brackets.braceDepth

  for (let line = 0; line < lines.length; line++) {
    const text = lines[line] ?? ''
    const trimmed = text.trim()
    if (trimmed === '') continue
    const lead = text.length - text.trimStart().length
    const kindAtLead = firstTokenKind(tokens, line, lead)
    if (kindAtLead === 'comment' || kindAtLead === 'string') continue
    const depth = depths[line] ?? 0

    if (spec.family === 'json') {
      if (depth > 3) continue
      const key = JSON_KEY.exec(trimmed)
      if (key !== null) candidates.push({ line, name: key[1] ?? '', kind: 'field', depth })
      continue
    }
    if (spec.family === 'yaml') {
      const key = YAML_KEY.exec(text)
      if (key === null) continue
      const name = key[2] ?? key[3] ?? key[4] ?? ''
      if (name === '' || name.startsWith('#')) continue
      candidates.push({ line, name: name.trim(), kind: 'field', depth: Math.min(12, Math.floor((key[1]?.length ?? 0) / 2)) })
      continue
    }
    if (spec.id === 'css' || spec.id === 'scss' || spec.id === 'less') {
      const selector = CSS_SELECTOR.exec(trimmed)
      if (selector !== null) candidates.push({ line, name: (selector[1] ?? '').trim().slice(0, 60), kind: 'class', depth })
      continue
    }
    if (spec.family === 'markup' || spec.family === 'diff' || spec.family === 'log' || spec.family === 'http' || spec.family === 'tex') continue

    const declaration = FUNCTION_KEYWORD.exec(trimmed) ?? TYPE_KEYWORD.exec(trimmed)
    if (declaration !== null) {
      const keyword = declaration[1] ?? ''
      const name = declaration[2] ?? ''
      const typeKeywords = new Set(['class', 'interface', 'enum', 'record', 'struct', 'union', 'trait', 'object', 'protocol', 'extension', 'namespace', 'module', 'message', 'service', 'impl', 'type'])
      candidates.push({ line, name, kind: typeKeywords.has(keyword) ? 'class' : depth > 0 ? 'method' : 'function', depth })
      continue
    }
    if (spec.id === 'python') {
      const match = PYTHON_SYMBOL.exec(trimmed)
      if (match !== null) {
        candidates.push({ line, name: match[2] ?? '', kind: match[1] === 'class' ? 'class' : 'function', depth })
        continue
      }
      if (depth === 0) {
        const binding = PY_MODULE_BINDING.exec(trimmed)
        if (binding !== null) candidates.push({ line, name: binding[1] ?? '', kind: 'variable', depth })
      }
      continue
    }
    if (spec.id === 'go') {
      const fn = GO_SYMBOL.exec(trimmed)
      if (fn !== null) {
        candidates.push({ line, name: fn[1] ?? '', kind: 'function', depth })
        continue
      }
      const type = GO_TYPE.exec(trimmed)
      if (type !== null) {
        candidates.push({ line, name: type[1] ?? '', kind: 'class', depth })
        continue
      }
    }
    if (spec.id === 'rust') {
      const impl = RUST_IMPL.exec(trimmed)
      if (impl !== null) {
        candidates.push({ line, name: impl[1] ?? '', kind: 'object', depth })
        continue
      }
    }
    if (spec.id === 'ruby') {
      const match = RUBY_SYMBOL.exec(trimmed)
      if (match !== null) {
        candidates.push({ line, name: match[1] ?? '', kind: trimmed.startsWith('def') ? 'function' : 'class', depth })
        continue
      }
    }
    if (spec.id === 'shellscript' || spec.id === 'fish') {
      const fn = SHELL_FUNCTION.exec(trimmed)
      if (fn !== null) candidates.push({ line, name: fn[1] ?? '', kind: 'function', depth })
    }
    if (spec.id === 'sql') {
      const create = SQL_CREATE.exec(trimmed)
      if (create !== null) candidates.push({ line, name: create[2] ?? '', kind: create[1] === 'FUNCTION' || create[1] === 'PROCEDURE' ? 'function' : 'class', depth })
      continue
    }

    const method = methodName(trimmed)
    if (method !== null) {
      candidates.push({ line, name: method, kind: 'method', depth })
      continue
    }
    const field = JAVA_FIELD.exec(trimmed)
    if (field !== null && !CONTROL.has(field[1] ?? '') && depth <= 1) {
      candidates.push({ line, name: field[1] ?? '', kind: 'field', depth })
      continue
    }
    const bare = BARE_FIELD.exec(trimmed)
    if (bare !== null && !CONTROL.has(bare[1] ?? '') && depth <= 1) {
      candidates.push({ line, name: bare[1] ?? '', kind: 'field', depth })
    }
  }
  return candidates
}

/** End line for a candidate from its own body, or null when the body must be inferred. */
function resolveEnd(
  candidate: Candidate,
  lines: readonly string[],
  tokens: readonly Token[][],
  spec: LanguageSpec,
  brackets: BracketIndex,
): number | null {
  const indented = spec.indentFolding === true || spec.family === 'yaml'
  if (indented) {
    const base = indentOf(lines[candidate.line] ?? '')
    let last = candidate.line
    for (let line = candidate.line + 1; line < lines.length; line++) {
      const text = lines[line] ?? ''
      if (text.trim() === '') continue
      if (indentOf(text) <= base) break
      last = line
    }
    return last > candidate.line ? last : null
  }
  /* Only the declaration line and an Allman-style next line may open the body. */
  for (let line = candidate.line; line <= Math.min(lines.length - 1, candidate.line + 1); line++) {
    if (line > candidate.line && !(lines[line] ?? '').trimStart().startsWith('{')) break
    const row = tokens[line] ?? []
    for (const token of row) {
      if (token.text !== '{' || token.kind !== 'punct') continue
      if (line === candidate.line) {
        const before = (lines[line] ?? '').slice(0, token.start)
        if (before.includes(';')) return null
        const close = before.lastIndexOf(')')
        if (candidate.kind === 'method' || candidate.kind === 'function') {
          if (close === -1) continue
          /* Expression-body functions (`fun f() = expr`) do not own a brace body. */
          if (before.slice(close + 1).includes('=')) continue
        }
        if (candidate.kind === 'class' || candidate.kind === 'object' || candidate.kind === 'interface') {
          const paren = before.lastIndexOf(')')
          if (paren !== -1 && before.slice(paren + 1).includes('=')) continue
        }
      }
      const pair = bracketAt(brackets, line, token.start)
      if (pair !== undefined) return Math.max(pair.closeLine, candidate.line)
    }
  }
  return null
}

/** Extract the outline for one file. */
export function extractOutline(
  lines: readonly string[],
  tokens: readonly Token[][],
  spec: LanguageSpec,
  brackets: BracketIndex,
): SymbolInfo[] {
  const candidates = collectCandidates(lines, tokens, spec, brackets)
  if (candidates.length === 0) return []
  candidates.sort((a, b) => (a.line === b.line ? a.depth - b.depth : a.line - b.line))

  const symbols: SymbolInfo[] = []
  const stack: number[] = []
  for (const candidate of candidates) {
    if (candidate.name === '') continue
    while (stack.length > 0) {
      const parent = symbols[stack[stack.length - 1] ?? 0]
      if (parent === undefined || parent.depth < candidate.depth) break
      stack.pop()
    }
    const parentIndex = stack.length > 0 ? (stack[stack.length - 1] ?? -1) : -1
    const endLine = resolveEnd(candidate, lines, tokens, spec, brackets)
    const index = symbols.length
    symbols.push({
      name: candidate.name,
      kind: candidate.kind,
      line: candidate.line,
      endLine: endLine ?? candidate.line,
      depth: candidate.depth,
      parent: parentIndex,
      signature: stripTrailingBrace(lines[candidate.line] ?? ''),
    })
    stack.push(index)
    if (symbols.length >= MAX_SYMBOLS) break
  }

  /* A declaration without a body ends before the next sibling; the last one runs to EOF. */
  for (let index = 0; index < symbols.length; index++) {
    const symbol = symbols[index]
    if (symbol === undefined) continue
    if (symbol.endLine > symbol.line) continue
    const parent = symbol.parent >= 0 ? symbols[symbol.parent] : undefined
    let end = parent !== undefined && parent.endLine > parent.line ? parent.endLine - 1 : lines.length - 1
    for (let next = index + 1; next < symbols.length; next++) {
      const candidate = symbols[next]
      if (candidate === undefined) continue
      if (candidate.depth <= symbol.depth) {
        end = Math.max(symbol.line, Math.min(end, candidate.line - 1))
        break
      }
    }
    symbols[index] = { ...symbol, endLine: Math.max(symbol.line, end) }
  }
  return symbols
}

/** Enclosing symbol chain for a line, outermost first. */
export function symbolChain(symbols: readonly SymbolInfo[], line: number): SymbolInfo[] {
  const chain: SymbolInfo[] = []
  for (const symbol of symbols) {
    if (symbol.line <= line && line <= symbol.endLine) chain.push(symbol)
  }
  chain.sort((a, b) => (a.depth === b.depth ? b.line - a.line : a.depth - b.depth))
  const result: SymbolInfo[] = []
  let depth = -1
  for (const symbol of chain) {
    if (symbol.depth > depth) {
      result.push(symbol)
      depth = symbol.depth
    }
  }
  return result
}

/** Symbol whose declaration is nearest at or before a line. */
export function nearestSymbol(symbols: readonly SymbolInfo[], line: number): SymbolInfo | undefined {
  let best: SymbolInfo | undefined
  for (const symbol of symbols) {
    if (symbol.line > line) break
    best = symbol
  }
  return best
}
