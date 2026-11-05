/**
 * IDE-style code reader body for the Sidebar document preview.
 *
 * The host owns the file read, paging, reload and scroll persistence; this
 * component owns the reading surface: syntax colours, a virtualized line list,
 * folding, breadcrumbs, the structure outline, in-file find, go-to-line, usage
 * highlighting and bracket matching. Everything is derived from the accumulated
 * text and stays inside this tab.
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
  RefObject,
} from 'react'

import { parseFileAddress, fileNameOf } from '../engine/address.ts'
import { analyzeText } from '../engine/analysis.ts'
import { bracketAt, bracketNear } from '../engine/brackets.ts'
import { foldStarts } from '../engine/folds.ts'
import { buildLayout, foldsHidingLine, LINE_HEIGHT, rowAtOffset, topOfLine, windowFor } from '../engine/layout.ts'
import { columnOfX, firstNonSpace, normalizeText, splitLines, wordAt } from '../engine/lexer.ts'
import { languageForPath, labelForLanguage } from '../engine/languages.ts'
import { symbolChain } from '../engine/outline.ts'
import { findInText, findUsages } from '../engine/search.ts'
import type {
  BracketPair,
  Caret,
  DocumentLayout,
  FoldRegion,
  SearchMatch,
  SearchResult,
  SymbolInfo,
  Token,
  TokenKind,
} from '../engine/types.ts'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  CloseIcon,
  OutlineIcon,
  SearchIcon,
} from './icons.tsx'

/* ------------------------------------------------------------------ types */

/** Localized translate seat from the Client locale service. */
type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

interface TextContent {
  readonly kind: 'text'
  readonly text: string
  readonly pages: readonly unknown[]
  readonly eof: boolean
}

interface OtherContent {
  readonly kind: 'bytes' | 'renderer'
}

type Content = TextContent | OtherContent

interface TabNavigation {
  readonly params?: Readonly<Record<string, unknown>> | undefined
  readonly revision: number
}

interface TabInfoShape {
  readonly tab: {
    readonly id: string
    readonly contentId: string
    readonly title: string
    readonly navigation: TabNavigation
    readonly signal?: AbortSignal
  }
}

/** Props the document body receives from the preview owner. */
export interface CodeReaderProps {
  readonly resourceAddress: string
  readonly content?: Content
  readonly wrap?: boolean
  readonly scrollportRef?: (element: HTMLElement | null) => void
  readonly useTabInfo?: () => TabInfoShape
  readonly t?: Translate
}

const EMPTY_TAB_INFO: TabInfoShape = {
  tab: { id: '', contentId: '', title: '', navigation: { params: undefined, revision: 0 } },
}
const useNoTabInfo = (): TabInfoShape => EMPTY_TAB_INFO
const identity: Translate = (key) => key

const CODE_PAD = 12
const FOLD_WIDTH = 15
const OVERSCAN = 20
const EMPTY_ROW: readonly Token[] = []
const EMPTY_TOKENS: readonly Token[][] = []
const EMPTY_FOLDS: readonly FoldRegion[] = []
const EMPTY_SYMBOLS: readonly SymbolInfo[] = []
const EMPTY_MATCHES: readonly SearchMatch[] = []
const EMPTY_COLUMNS: readonly number[] = []
const EMPTY_SEARCH: SearchResult = { matches: EMPTY_MATCHES, truncated: false }

const KIND_CLASS: Readonly<Record<TokenKind, string>> = {
  plain: '',
  keyword: 'dcr_kw',
  type: 'dcr_ty',
  function: 'dcr_fn',
  string: 'dcr_str',
  number: 'dcr_num',
  comment: 'dcr_com',
  constant: 'dcr_const',
  annotation: 'dcr_ann',
  operator: 'dcr_op',
  punct: 'dcr_punc',
  tag: 'dcr_tag',
  attr: 'dcr_attr',
  key: 'dcr_key',
  variable: 'dcr_var',
  meta: 'dcr_meta',
  inserted: 'dcr_ins',
  deleted: 'dcr_del',
  invalid: 'dcr_inv',
}

/** Folding is remembered per file address for the page lifetime. */
const foldMemory = new Map<string, Set<number>>()
const FOLD_MEMORY_LIMIT = 48

function rememberFolds(address: string, folded: ReadonlySet<number>): void {
  if (folded.size === 0) {
    foldMemory.delete(address)
    return
  }
  foldMemory.delete(address)
  foldMemory.set(address, new Set(folded))
  while (foldMemory.size > FOLD_MEMORY_LIMIT) {
    const oldest = foldMemory.keys().next().value
    if (oldest === undefined) break
    foldMemory.delete(oldest)
  }
}

/* ------------------------------------------------------------- decoration */

type Flag = 'match' | 'current' | 'usage' | 'bracket'

interface Segment {
  readonly text: string
  readonly kind: TokenKind
  readonly depth?: number
  readonly flag?: Flag
}

function covers(ranges: readonly SearchMatch[], start: number, end: number): boolean {
  for (const range of ranges) {
    if (range.start <= start && range.end >= end) return true
  }
  return false
}

/** Split one line's tokens at search/usage/bracket boundaries. */
function buildSegments(
  tokens: readonly Token[],
  findMatches: readonly SearchMatch[],
  usageMatches: readonly SearchMatch[],
  bracketCols: readonly number[],
  currentStart: number,
  currentEnd: number,
): readonly Segment[] {
  const decorations: { start: number; end: number }[] = []
  for (const match of findMatches) decorations.push(match)
  for (const match of usageMatches) decorations.push(match)
  const out: Segment[] = []
  for (const token of tokens) {
    const start = token.start
    const end = start + token.text.length
    if (token.text === '') continue
    if (decorations.length === 0 && bracketCols.length === 0) {
      out.push({ text: token.text, kind: token.kind, ...(token.depth === undefined ? {} : { depth: token.depth }) })
      continue
    }
    const points: number[] = [start, end]
    for (const range of decorations) {
      if (range.start > start && range.start < end) points.push(range.start)
      if (range.end > start && range.end < end) points.push(range.end)
    }
    points.sort((a, b) => a - b)
    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index] ?? start
      const to = points[index + 1] ?? end
      if (to <= from) continue
      const isCurrent = currentStart >= 0 && currentStart <= from && currentEnd >= to
      const isMatch = !isCurrent && covers(findMatches, from, to)
      const isUsage = !isCurrent && !isMatch && covers(usageMatches, from, to)
      const isBracket = bracketCols.includes(from)
      const flag: Flag | undefined = isCurrent ? 'current' : isMatch ? 'match' : isUsage ? 'usage' : isBracket ? 'bracket' : undefined
      out.push({
        text: token.text.slice(from - start, to - start),
        kind: token.kind,
        ...(token.depth === undefined ? {} : { depth: token.depth }),
        ...(flag === undefined ? {} : { flag }),
      })
    }
  }
  return out
}

/* ------------------------------------------------------------------ row */

interface LineRowProps {
  readonly line: number
  readonly text: string
  readonly tokens: readonly Token[]
  readonly height: number
  readonly active: boolean
  readonly flash: boolean
  readonly fold: FoldRegion | undefined
  readonly folded: boolean
  readonly hidden: number
  readonly foldLabel: string
  readonly expandLabel: string
  readonly collapseLabel: string
  readonly gutterWidth: number
  readonly findMatches: readonly SearchMatch[]
  readonly usageMatches: readonly SearchMatch[]
  readonly bracketCols: readonly number[]
  readonly currentStart: number
  readonly currentEnd: number
  readonly onToggleFold: (line: number) => void
}

const LineRow = memo(function LineRow(props: LineRowProps): ReactElement {
  const {
    line, text, tokens, height, active, flash, fold, folded, hidden, foldLabel,
    expandLabel, collapseLabel, gutterWidth, findMatches, usageMatches,
    bracketCols, currentStart, currentEnd, onToggleFold,
  } = props
  const segments = useMemo(
    () =>
      buildSegments(
        tokens.length === 0 ? [{ text, kind: 'plain', start: 0 }] : tokens,
        findMatches,
        usageMatches,
        bracketCols,
        currentStart,
        currentEnd,
      ),
    [tokens, text, findMatches, usageMatches, bracketCols, currentStart, currentEnd],
  )
  return (
    <div
      className="dcr_row"
      data-line={line}
      data-active={active ? 'true' : undefined}
      data-flash={flash ? 'true' : undefined}
      style={{ height }}
    >
      <div className="dcr_gutter" style={{ width: gutterWidth }}>
        {fold === undefined ? null : (
          <button
            type="button"
            className="dcr_fold"
            data-folded={folded ? 'true' : undefined}
            aria-label={folded ? expandLabel : collapseLabel}
            title={folded ? expandLabel : collapseLabel}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFold(line)
            }}
          >
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3.8 6.2 4.2 4.2 4.2-4.2" />
            </svg>
          </button>
        )}
        <span className="dcr_ln">{line + 1}</span>
      </div>
      <div className="dcr_code">
        {segments.map((segment, index) => {
          const classes = ['dcr_tok']
          const kindClass = KIND_CLASS[segment.kind]
          if (kindClass !== '') classes.push(kindClass)
          if (segment.flag === 'match' || segment.flag === 'current') classes.push('dcr_match')
          if (segment.flag === 'usage') classes.push('dcr_usage')
          if (segment.flag === 'bracket') classes.push('dcr_bracketMatch')
          return (
            <span key={index} className={classes.join(' ')} data-current={segment.flag === 'current' ? 'true' : undefined}>
              {segment.text}
            </span>
          )
        })}
        {folded && hidden > 0 ? (
          <button type="button" className="dcr_foldChip" onMouseDown={(event) => event.stopPropagation()} onClick={() => onToggleFold(line)}>
            ⋯ {foldLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
})

/* ------------------------------------------------------------ subviews */

interface FindBarProps {
  readonly t: Translate
  readonly value: string
  readonly caseSensitive: boolean
  readonly regex: boolean
  readonly wholeWord: boolean
  readonly index: number
  readonly total: number
  readonly error: string | undefined
  readonly partial: boolean
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly onChange: (value: string) => void
  readonly onToggleCase: () => void
  readonly onToggleRegex: () => void
  readonly onToggleWord: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onClose: () => void
}

function FindBar(props: FindBarProps): ReactElement {
  const { t } = props
  const hasResults = props.total > 0
  const count =
    props.error !== undefined
      ? t('find.regexError')
      : hasResults
        ? t('find.count', { index: props.index + 1, total: props.total })
        : t('find.none')
  return (
    <div
      className="dcr_popover dcr_find"
      data-dcr-popover=""
      role="search"
      aria-label={t('bar.find')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          props.onClose()
          return
        }
        if (event.key === 'F3') {
          event.preventDefault()
          if (event.shiftKey) props.onPrev()
          else props.onNext()
        }
      }}
    >
      <input
        ref={props.inputRef}
        className="dcr_input dcr_findInput"
        value={props.value}
        placeholder={t('find.placeholder')}
        aria-label={t('find.placeholder')}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) props.onPrev()
            else props.onNext()
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
          }
        }}
      />
      <button
        type="button"
        className="dcr_toggle"
        data-on={props.caseSensitive ? 'true' : undefined}
        aria-pressed={props.caseSensitive}
        aria-label={t('find.case')}
        title={t('find.case')}
        onClick={props.onToggleCase}
      >
        Aa
      </button>
      <button
        type="button"
        className="dcr_toggle"
        data-on={props.wholeWord ? 'true' : undefined}
        aria-pressed={props.wholeWord}
        aria-label={t('find.word')}
        title={t('find.word')}
        onClick={props.onToggleWord}
      >
        W
      </button>
      <button
        type="button"
        className="dcr_toggle"
        data-on={props.regex ? 'true' : undefined}
        aria-pressed={props.regex}
        aria-label={t('find.regex')}
        title={t('find.regex')}
        onClick={props.onToggleRegex}
      >
        .*
      </button>
      <span className={`dcr_count${props.error !== undefined ? ' dcr_countError' : ''}`} aria-live="polite">
        {count}
      </span>
      <button type="button" className="dcr_toggle" aria-label={t('find.prev')} title={t('find.prev')} onClick={props.onPrev} disabled={!hasResults}>
        <ArrowUpIcon size={13} />
      </button>
      <button type="button" className="dcr_toggle" aria-label={t('find.next')} title={t('find.next')} onClick={props.onNext} disabled={!hasResults}>
        <ArrowDownIcon size={13} />
      </button>
      <button type="button" className="dcr_toggle" aria-label={t('find.close')} title={t('find.close')} onClick={props.onClose}>
        <CloseIcon size={13} />
      </button>
      {props.partial ? <span className="dcr_noticeInline">{t('find.partial')}</span> : null}
    </div>
  )
}

interface OutlinePanelProps {
  readonly t: Translate
  readonly symbols: readonly SymbolInfo[]
  readonly chain: readonly SymbolInfo[]
  readonly filter: string
  readonly active: number
  readonly filterRef: RefObject<HTMLInputElement | null>
  readonly listRef: RefObject<HTMLDivElement | null>
  readonly onFilter: (value: string) => void
  readonly onPick: (symbol: SymbolInfo) => void
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  readonly onClose: () => void
}

function OutlinePanel(props: OutlinePanelProps): ReactElement {
  const { t, symbols, chain, active } = props
  const current = new Set(chain.map((symbol) => symbol.line))
  return (
    <div className="dcr_popover dcr_outline" data-dcr-popover="" role="dialog" aria-label={t('outline.title')}>
      <div className="dcr_panelHead">
        <input
          ref={props.filterRef}
          className="dcr_input"
          value={props.filter}
          placeholder={t('outline.filter')}
          aria-label={t('outline.filter')}
          spellCheck={false}
          onChange={(event) => props.onFilter(event.target.value)}
          onKeyDown={props.onKeyDown}
        />
        <button type="button" className="dcr_icon" aria-label={t('find.close')} title={t('find.close')} onClick={props.onClose}>
          <CloseIcon size={13} />
        </button>
      </div>
      <div className="dcr_list" ref={props.listRef} role="listbox" aria-label={t('outline.title')}>
        {symbols.length === 0 ? (
          <div className="dcr_emptyList">{t('outline.empty')}</div>
        ) : (
          symbols.map((symbol, index) => (
            <button
              key={`${symbol.line}:${symbol.name}:${index}`}
              type="button"
              className="dcr_item"
              role="option"
              aria-selected={index === active}
              data-index={index}
              data-active={index === active ? 'true' : undefined}
              data-current={current.has(symbol.line) ? 'true' : undefined}
              style={{ paddingLeft: `${6 + Math.min(12, symbol.depth) * 12}px` }}
              onClick={() => props.onPick(symbol)}
            >
              <span className="dcr_itemMark" aria-hidden="true">
                {symbol.kind === 'class' || symbol.kind === 'interface' || symbol.kind === 'enum' || symbol.kind === 'object' || symbol.kind === 'namespace'
                  ? 'C'
                  : symbol.kind === 'function' || symbol.kind === 'method'
                    ? 'M'
                    : 'F'}
              </span>
              <span className="dcr_itemName">{symbol.name}</span>
              <span className="dcr_itemLine">{symbol.line + 1}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

interface GotoPopoverProps {
  readonly t: Translate
  readonly value: string
  readonly invalid: boolean
  readonly lineCount: number
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly onChange: (value: string) => void
  readonly onSubmit: () => void
  readonly onClose: () => void
}

function GotoPopover(props: GotoPopoverProps): ReactElement {
  return (
    <div className="dcr_popover dcr_goto" data-dcr-popover="" role="dialog" aria-label={props.t('goto.title')}>
      <div className="dcr_gotoHint">{props.t('goto.title')}</div>
      <div className="dcr_gotoRow">
        <input
          ref={props.inputRef}
          className="dcr_input dcr_gotoInput"
          value={props.value}
          inputMode="numeric"
          placeholder={props.t('goto.placeholder', { count: props.lineCount })}
          aria-label={props.t('goto.title')}
          aria-invalid={props.invalid}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              props.onSubmit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              props.onClose()
            }
          }}
        />
        <button type="button" className="dcr_btn dcr_btnPrimary" onClick={props.onSubmit}>
          {props.t('goto.go')}
        </button>
      </div>
      {props.invalid ? <div className="dcr_gotoError">{props.t('goto.invalid')}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ main */

export function CodeReader(props: CodeReaderProps): ReactNode {
  const content = props.content
  const rawText = content !== undefined && content.kind === 'text' ? content.text : ''
  const text = useMemo(() => normalizeText(rawText), [rawText])
  const eof = content !== undefined && content.kind === 'text' ? content.eof : true
  const wrap = props.wrap === true
  const t = props.t ?? identity
  const useTabInfo = props.useTabInfo ?? useNoTabInfo
  const tabInfo = useTabInfo()
  const tab = tabInfo.tab

  const address = props.resourceAddress
  const file = useMemo(() => parseFileAddress(address), [address])
  const path = file?.path ?? ''
  const language = useMemo(() => languageForPath(path), [path])
  const fileName = useMemo(() => fileNameOf(path), [path])
  const languageLabel = labelForLanguage(language)

  const lines = useMemo(() => splitLines(text), [text])
  const deferredText = useDeferredValue(text)
  const analysis = useMemo(() => analyzeText(deferredText, language), [deferredText, language])
  const ready = analysis.text === text
  /* A paged load appends text; the previous analysis is still a valid prefix. */
  const prefix = !ready && text.startsWith(analysis.text)
  const tokens = ready || prefix ? analysis.tokens : EMPTY_TOKENS
  const folds = ready || prefix ? analysis.folds : EMPTY_FOLDS
  const outline = ready || prefix ? analysis.outline : EMPTY_SYMBOLS
  const foldStartsMap = useMemo(() => foldStarts(folds), [folds])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const outlineFilterRef = useRef<HTMLInputElement | null>(null)
  const outlineListRef = useRef<HTMLDivElement | null>(null)
  const gotoInputRef = useRef<HTMLInputElement | null>(null)
  const rafRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [folded, setFolded] = useState<Set<number>>(() => new Set(foldMemory.get(address) ?? []))
  const [caret, setCaret] = useState<Caret>({ line: 0, col: 0 })
  const [usageWord, setUsageWord] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [metrics, setMetrics] = useState({ width: 640, height: 400, charWidth: 7.8 })
  const [flashLine, setFlashLine] = useState(-1)
  const [reveal, setReveal] = useState<{ line: number; column?: number; flash: boolean; nonce: number } | null>(null)
  const revealSeq = useRef(0)

  const [find, setFind] = useState({
    open: false,
    query: '',
    caseSensitive: false,
    regex: false,
    wholeWord: false,
    index: 0,
  })
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [outlineFilter, setOutlineFilter] = useState('')
  const [outlineActive, setOutlineActive] = useState(0)
  const [gotoOpen, setGotoOpen] = useState(false)
  const [gotoValue, setGotoValue] = useState('')
  const [gotoInvalid, setGotoInvalid] = useState(false)

  const setScrollport = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element
      props.scrollportRef?.(element)
    },
    [props.scrollportRef],
  )

  /* ---------------------------------------------------------- measurement */

  useEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    let frame = 0
    const measure = (): void => {
      const probe = document.createElement('span')
      probe.textContent = '0'.repeat(20)
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre;font-family:inherit;font-size:inherit;letter-spacing:inherit;line-height:inherit;pointer-events:none'
      element.appendChild(probe)
      const width = probe.getBoundingClientRect().width / 20
      probe.remove()
      setMetrics((current) => {
        const charWidth = width > 0 ? width : current.charWidth
        if (current.width === element.clientWidth && current.height === element.clientHeight && Math.abs(current.charWidth - charWidth) < 0.01) return current
        return { width: element.clientWidth, height: element.clientHeight, charWidth }
      })
    }
    frame = requestAnimationFrame(measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    if (typeof document.fonts !== 'undefined') {
      void document.fonts.ready.then(() => measure()).catch(() => {})
    }
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [])

  /* --------------------------------------------------------------- fold */

  useEffect(() => {
    rememberFolds(address, folded)
  }, [address, folded])

  const lineDigits = String(Math.max(1, lines.length)).length
  const gutterWidth = FOLD_WIDTH + 12 + Math.max(3, lineDigits) * metrics.charWidth
  const columns = Math.max(8, Math.floor((metrics.width - gutterWidth - CODE_PAD * 2) / Math.max(1, metrics.charWidth)))

  const layout = useMemo(
    () => buildLayout(lines, folds, folded, wrap, columns, LINE_HEIGHT),
    [lines, folds, folded, wrap, columns],
  )

  const toggleFold = useCallback((line: number) => {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }, [])

  /* ------------------------------------------------------------- search */

  const search = useMemo(() => {
    if (!find.open || find.query === '') return EMPTY_SEARCH
    return findInText(text, find.query, {
      caseSensitive: find.caseSensitive,
      regex: find.regex,
      wholeWord: find.wholeWord,
      limit: 20_000,
    })
  }, [text, find.open, find.query, find.caseSensitive, find.regex, find.wholeWord])

  const matchCount = search.matches.length
  const activeIndex = matchCount === 0 ? -1 : Math.min(Math.max(0, find.index), matchCount - 1)
  const activeMatch = activeIndex >= 0 ? search.matches[activeIndex] : undefined

  const findByLine = useMemo(() => groupMatches(search.matches), [search.matches])
  const usageMatches = useMemo(() => (usageWord === null ? EMPTY_MATCHES : findUsages(text, usageWord)), [text, usageWord])
  const usageByLine = useMemo(() => groupMatches(usageMatches), [usageMatches])

  const bracketPair = useMemo<BracketPair | null>(() => {
    if (!ready) return null
    const near = bracketNear(lines, caret.line, caret.col)
    if (near === null) return null
    return bracketAt(analysis.brackets, near.line, near.col) ?? null
  }, [ready, analysis.brackets, caret.line, caret.col, lines])

  const bracketByLine = useMemo(() => {
    const map = new Map<number, number[]>()
    if (bracketPair === null) return map
    addColumn(map, bracketPair.openLine, bracketPair.openCol)
    addColumn(map, bracketPair.closeLine, bracketPair.closeCol)
    return map
  }, [bracketPair])

  const chain = useMemo(() => (ready ? symbolChain(outline, caret.line) : EMPTY_SYMBOLS), [ready, outline, caret.line])

  /* --------------------------------------------------------- reveal */

  const requestReveal = useCallback((line: number, flash: boolean, column?: number) => {
    revealSeq.current += 1
    setReveal({ line, flash, nonce: revealSeq.current, ...(column === undefined ? {} : { column }) })
  }, [])

  useLayoutEffect(() => {
    if (reveal === null) return
    const element = scrollRef.current
    let line = Math.min(reveal.line, Math.max(0, lines.length - 1))
    if (reveal.line > lines.length - 1) {
      if (!eof) {
        if (element !== null) element.scrollTop = element.scrollHeight
        return
      }
      line = Math.max(0, lines.length - 1)
    }
    const hiding = foldsHidingLine(folds, line)
    if (hiding.length > 0) {
      setFolded((current) => {
        const next = new Set(current)
        for (const region of hiding) next.delete(region.start)
        return next
      })
      return
    }
    if (element !== null) {
      const top = topOfLine(layout, line)
      const row = layout.rowOfLine[line] ?? 0
      const height = layout.rows[row]?.height ?? LINE_HEIGHT
      if (top < element.scrollTop || top + height > element.scrollTop + element.clientHeight - 1) {
        element.scrollTop = Math.max(0, top - Math.floor(element.clientHeight / 2) + Math.floor(height / 2))
      }
    }
    const column = reveal.column ?? firstNonSpace(lines[line] ?? '')
    setCaret((current) => (current.line === line && current.col === column ? current : { line, col: column }))
    if (reveal.flash) {
      setFlashLine(line)
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => {
        flashTimerRef.current = null
        setFlashLine(-1)
      }, 1200)
    }
    setReveal(null)
  }, [reveal, folds, layout, lines, eof])

  /* ---------------------------------------------------- navigation intent */

  const navLine = useMemo(() => {
    const params = tab.navigation.params
    if (params === undefined) return undefined
    const line = params['line']
    return typeof line === 'number' && Number.isFinite(line) ? line : undefined
  }, [tab.navigation.params])
  const lastNav = useRef(-1)
  useEffect(() => {
    if (tab.navigation.revision === lastNav.current) return
    if (navLine === undefined) {
      lastNav.current = tab.navigation.revision
      return
    }
    if (navLine > lines.length && !eof) {
      const element = scrollRef.current
      if (element !== null) element.scrollTop = element.scrollHeight
      return
    }
    lastNav.current = tab.navigation.revision
    requestReveal(Math.max(0, navLine - 1), true)
  }, [tab.navigation.revision, navLine, lines.length, eof, requestReveal])

  /* --------------------------------------------------------- find reveal */

  const lastFindKey = useRef('')
  useEffect(() => {
    if (!find.open || find.query === '' || activeMatch === undefined) return
    const key = `${find.open ? 1 : 0}${find.caseSensitive ? 1 : 0}${find.regex ? 1 : 0}${find.wholeWord ? 1 : 0}:${find.index}:${find.query}`
    if (key === lastFindKey.current) return
    lastFindKey.current = key
    requestReveal(activeMatch.line, false, activeMatch.start)
  }, [find.open, find.query, find.caseSensitive, find.regex, find.wholeWord, find.index, activeMatch, requestReveal])

  /* --------------------------------------------------------- caret moves */

  const ensureLineVisible = useCallback(
    (line: number) => {
      const element = scrollRef.current
      if (element === null) return
      const top = topOfLine(layout, line)
      const row = layout.rowOfLine[line] ?? 0
      const height = layout.rows[row]?.height ?? LINE_HEIGHT
      if (top < element.scrollTop) element.scrollTop = top
      else if (top + height > element.scrollTop + element.clientHeight) element.scrollTop = top + height - element.clientHeight
    },
    [layout],
  )

  const moveCaret = useCallback(
    (line: number, col: number) => {
      const targetLine = Math.max(0, Math.min(line, lines.length - 1))
      const lineText = lines[targetLine] ?? ''
      const targetCol = Math.max(0, Math.min(col, lineText.length))
      setCaret({ line: targetLine, col: targetCol })
      ensureLineVisible(targetLine)
    },
    [lines, ensureLineVisible],
  )

  const positionFromEvent = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): Caret => {
      const element = scrollRef.current
      if (element === null) return caret
      const rect = element.getBoundingClientRect()
      const y = event.clientY - rect.top + element.scrollTop
      const row = rowAtOffset(layout, y)
      const line = layout.rows[row]?.line ?? 0
      const x = event.clientX - rect.left + element.scrollLeft - gutterWidth - CODE_PAD
      const col = columnOfX(lines[line] ?? '', Math.max(0, x / Math.max(1, metrics.charWidth)))
      return { line, col }
    },
    [layout, lines, gutterWidth, metrics.charWidth, caret],
  )

  /* ------------------------------------------------------------ cleanup */

  useEffect(
    () => () => {
      if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current)
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    },
    [],
  )

  /* ------------------------------------------------------------ find ops */

  const openFind = useCallback(() => {
    const selection = typeof window === 'undefined' ? '' : window.getSelection()?.toString() ?? ''
    const fromSelection = selection !== '' && !selection.includes('\n') && selection.length <= 120 ? selection : ''
    const initial = fromSelection !== '' ? fromSelection : usageWord ?? wordAt(lines[caret.line] ?? '', caret.col)
    setFind((current) => ({ ...current, open: true, query: initial, index: 0 }))
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }, [usageWord, lines, caret])

  const closeFind = useCallback(() => {
    setFind((current) => ({ ...current, open: false }))
    scrollRef.current?.focus()
  }, [])

  const stepMatch = useCallback(
    (delta: number) => {
      if (matchCount === 0) return
      setFind((current) => {
        const base = activeIndex >= 0 ? activeIndex : delta > 0 ? -1 : 0
        return { ...current, index: (base + delta + matchCount) % matchCount }
      })
    },
    [matchCount, activeIndex],
  )

  /* ---------------------------------------------------------- outline ops */

  const filteredSymbols = useMemo(() => {
    const query = outlineFilter.trim().toLowerCase()
    if (query === '') return outline
    return outline.filter((symbol) => symbol.name.toLowerCase().includes(query) || symbol.signature.toLowerCase().includes(query))
  }, [outline, outlineFilter])

  useEffect(() => {
    setOutlineActive(0)
  }, [outlineFilter, outlineOpen])

  useEffect(() => {
    if (!outlineOpen || outlineListRef.current === null) return
    const element = outlineListRef.current.querySelector(`[data-index="${outlineActive}"]`)
    if (element instanceof HTMLElement) element.scrollIntoView({ block: 'nearest' })
  }, [outlineActive, outlineOpen])

  const openOutline = useCallback(() => {
    setOutlineOpen(true)
    setGotoOpen(false)
    requestAnimationFrame(() => outlineFilterRef.current?.focus())
  }, [])

  const pickSymbol = useCallback(
    (symbol: SymbolInfo) => {
      requestReveal(symbol.line, true)
      setOutlineOpen(false)
      requestAnimationFrame(() => scrollRef.current?.focus())
    },
    [requestReveal],
  )

  /* ------------------------------------------------------------- goto ops */

  const openGoto = useCallback(() => {
    setGotoOpen(true)
    setGotoValue(String(caret.line + 1))
    setGotoInvalid(false)
    setOutlineOpen(false)
    requestAnimationFrame(() => {
      gotoInputRef.current?.focus()
      gotoInputRef.current?.select()
    })
  }, [caret.line])

  const submitGoto = useCallback(() => {
    const value = Number.parseInt(gotoValue.trim(), 10)
    if (!Number.isFinite(value) || value < 1) {
      setGotoInvalid(true)
      return
    }
    setGotoOpen(false)
    setGotoInvalid(false)
    requestReveal(value - 1, true)
  }, [gotoValue, requestReveal])

  /* ------------------------------------------------------- outside click */

  useEffect(() => {
    if (!outlineOpen && !gotoOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOutlineOpen(false)
        setGotoOpen(false)
      scrollRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    const onDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-dcr-popover]') !== null) return
      if (target instanceof Element && target.closest('[data-dcr-anchor]') !== null) return
      setOutlineOpen(false)
        setGotoOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [outlineOpen, gotoOpen])

  /* --------------------------------------------------------- interactions */

  const onEditorMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const element = scrollRef.current
      if (element !== null) {
        const rect = element.getBoundingClientRect()
        /* Clicks on the scrollbars belong to the browser, not to a text line. */
        if (event.clientX - rect.left >= element.clientWidth || event.clientY - rect.top >= element.clientHeight) return
      }
      const position = positionFromEvent(event)
      setCaret(position)
      setUsageWord(null)
    },
    [positionFromEvent],
  )

  const onEditorDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const position = positionFromEvent(event)
      const word = wordAt(lines[position.line] ?? '', position.col)
      setCaret(position)
      setUsageWord(word === '' ? null : word)
    },
    [positionFromEvent, lines],
  )

  const onEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input,textarea,button') !== null) return
      const meta = event.metaKey || event.ctrlKey
      const key = event.key
      const pageRows = Math.max(1, Math.floor(metrics.height / LINE_HEIGHT))
      const lineText = lines[caret.line] ?? ''
      if (meta && (key === 'f' || key === 'F')) {
        event.preventDefault()
        openFind()
        return
      }
      if (meta && (key === 'g' || key === 'G')) {
        event.preventDefault()
        openGoto()
        return
      }
      if (key === 'F3') {
        event.preventDefault()
        if (find.open && matchCount > 0) stepMatch(event.shiftKey ? -1 : 1)
        else openFind()
        return
      }
      if (key === 'Escape') {
        if (outlineOpen || gotoOpen || find.open) {
          setOutlineOpen(false)
                setGotoOpen(false)
          closeFind()
        } else if (usageWord !== null) {
          setUsageWord(null)
        }
        return
      }
      if (key === 'ArrowDown') {
        event.preventDefault()
        moveCaret(caret.line + (meta ? lines.length : 1), caret.col)
        return
      }
      if (key === 'ArrowUp') {
        event.preventDefault()
        moveCaret(caret.line - (meta ? lines.length : 1), caret.col)
        return
      }
      if (key === 'ArrowRight') {
        event.preventDefault()
        if (caret.col < lineText.length) moveCaret(caret.line, caret.col + 1)
        else if (caret.line < lines.length - 1) moveCaret(caret.line + 1, 0)
        return
      }
      if (key === 'ArrowLeft') {
        event.preventDefault()
        if (caret.col > 0) moveCaret(caret.line, caret.col - 1)
        else if (caret.line > 0) moveCaret(caret.line - 1, (lines[caret.line - 1] ?? '').length)
        return
      }
      if (key === 'Home') {
        event.preventDefault()
        if (meta) moveCaret(0, 0)
        else {
          const first = firstNonSpace(lineText)
          moveCaret(caret.line, caret.col === first ? 0 : first)
        }
        return
      }
      if (key === 'End') {
        event.preventDefault()
        moveCaret(meta ? lines.length - 1 : caret.line, meta ? (lines[lines.length - 1] ?? '').length : lineText.length)
        return
      }
      if (key === 'PageDown') {
        event.preventDefault()
        moveCaret(caret.line + pageRows, caret.col)
        return
      }
      if (key === 'PageUp') {
        event.preventDefault()
        moveCaret(caret.line - pageRows, caret.col)
      }
    },
    [metrics.height, lines, caret, openFind, openGoto, find.open, matchCount, stepMatch, outlineOpen, gotoOpen, closeFind, usageWord, moveCaret],
  )

  const onEditorScroll = useCallback(() => {
    if (rafRef.current !== 0) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const element = scrollRef.current
      if (element !== null) setScrollTop(element.scrollTop)
    })
  }, [])

  const onOutlineKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setOutlineActive((current) => Math.min(filteredSymbols.length - 1, current + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setOutlineActive((current) => Math.max(0, current - 1))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const symbol = filteredSymbols[outlineActive]
        if (symbol !== undefined) pickSymbol(symbol)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setOutlineOpen(false)
        scrollRef.current?.focus()
      }
    },
    [filteredSymbols, outlineActive, pickSymbol],
  )

  /* ------------------------------------------------------------- render */

  if (content === undefined || content.kind !== 'text') return null

  const visible = windowFor(layout, scrollTop, metrics.height, OVERSCAN)
  const renderedRows = layout.rows.slice(visible.start, visible.end)
  const canvasWidth = wrap
    ? undefined
    : Math.max(metrics.width, gutterWidth + CODE_PAD * 2 + layout.maxColumns * metrics.charWidth + 32)

  return (
    <div className="dcr_root" data-wrap={wrap ? 'true' : undefined} data-code-reader="">
      <div className="dcr_bar">
        <div className="dcr_crumbs">
          <span className="dcr_fileName" title={path}>{fileName === '' ? languageLabel : fileName}</span>
          {chain.map((symbol) => (
            <span key={`${symbol.line}:${symbol.name}`} className="dcr_crumbGroup" style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
              <span className="dcr_sep" aria-hidden="true">
                <ChevronRightIcon size={10} />
              </span>
              <button type="button" className="dcr_crumb" title={symbol.signature} onClick={() => requestReveal(symbol.line, true)}>
                {symbol.name}
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="dcr_icon"
          data-dcr-anchor=""
          data-active={outlineOpen ? 'true' : undefined}
          aria-label={t('bar.outline')}
          aria-haspopup="dialog"
          aria-expanded={outlineOpen}
          title={t('bar.outline')}
          onClick={() => (outlineOpen ? setOutlineOpen(false) : openOutline())}
        >
          <OutlineIcon />
        </button>
        <button
          type="button"
          className="dcr_icon"
          data-dcr-anchor=""
          data-active={find.open ? 'true' : undefined}
          aria-label={t('bar.find')}
          aria-haspopup="dialog"
          aria-expanded={find.open}
          title={`${t('bar.find')} (Ctrl+F)`}
          onClick={() => (find.open ? closeFind() : openFind())}
        >
          <SearchIcon />
        </button>
      </div>

      {text === '' ? (
        <div className="dcr_empty">
          <div className="dcr_emptyTitle">{t('empty.title')}</div>
          <div>{t('empty.hint')}</div>
        </div>
      ) : (
        <div
          ref={setScrollport}
          className="dcr_editor"
          tabIndex={0}
          role="region"
          aria-label={`${t('a11y.editor')} — ${languageLabel}, ${t('a11y.readonly')}`}
          onScroll={onEditorScroll}
          onMouseDown={onEditorMouseDown}
          onDoubleClick={onEditorDoubleClick}
          onKeyDown={onEditorKeyDown}
        >
          <div
            className="dcr_canvas"
            style={{ height: layout.total, ...(canvasWidth === undefined ? {} : { width: canvasWidth }) }}
          >
            <div className="dcr_window" style={{ transform: `translateY(${visible.top}px)` }}>
              {renderedRows.map((row) => {
                const line = row.line
                const fold = foldStartsMap.get(line)
                const isFolded = fold !== undefined && folded.has(fold.start)
                const hidden = layout.hiddenByStart.get(line) ?? 0
                const bracketCols = bracketByLine.get(line) ?? EMPTY_COLUMNS
                const current = activeMatch !== undefined && activeMatch.line === line ? activeMatch : undefined
                return (
                  <LineRow
                    key={line}
                    line={line}
                    text={lines[line] ?? ''}
                    tokens={tokens[line] ?? EMPTY_ROW}
                    height={row.height}
                    active={line === caret.line}
                    flash={line === flashLine}
                    fold={fold}
                    folded={isFolded}
                    hidden={hidden}
                    foldLabel={hidden > 0 ? t('fold.hidden', { count: hidden }) : ''}
                    expandLabel={t('fold.expand')}
                    collapseLabel={t('fold.collapse')}
                    gutterWidth={gutterWidth}
                    findMatches={findByLine.get(line) ?? EMPTY_MATCHES}
                    usageMatches={usageByLine.get(line) ?? EMPTY_MATCHES}
                    bracketCols={bracketCols}
                    currentStart={current?.start ?? -1}
                    currentEnd={current?.end ?? -1}
                    onToggleFold={toggleFold}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {find.open ? (
        <FindBar
          t={t}
          value={find.query}
          caseSensitive={find.caseSensitive}
          regex={find.regex}
          wholeWord={find.wholeWord}
          index={activeIndex}
          total={matchCount}
          error={search.error}
          partial={!eof}
          inputRef={findInputRef}
          onChange={(value) => setFind((current) => ({ ...current, query: value, index: 0 }))}
          onToggleCase={() => setFind((current) => ({ ...current, caseSensitive: !current.caseSensitive, index: 0 }))}
          onToggleWord={() => setFind((current) => ({ ...current, wholeWord: !current.wholeWord, index: 0 }))}
          onToggleRegex={() => setFind((current) => ({ ...current, regex: !current.regex, index: 0 }))}
          onPrev={() => stepMatch(-1)}
          onNext={() => stepMatch(1)}
          onClose={closeFind}
        />
      ) : null}

      {outlineOpen ? (
        <OutlinePanel
          t={t}
          symbols={filteredSymbols}
          chain={chain}
          filter={outlineFilter}
          active={outlineActive}
          filterRef={outlineFilterRef}
          listRef={outlineListRef}
          onFilter={setOutlineFilter}
          onPick={pickSymbol}
          onKeyDown={onOutlineKeyDown}
          onClose={() => {
            setOutlineOpen(false)
            scrollRef.current?.focus()
          }}
        />
      ) : null}

      {gotoOpen ? (
        <GotoPopover
          t={t}
          value={gotoValue}
          invalid={gotoInvalid}
          lineCount={lines.length}
          inputRef={gotoInputRef}
          onChange={(value) => {
            setGotoValue(value)
            setGotoInvalid(false)
          }}
          onSubmit={submitGoto}
          onClose={() => {
            setGotoOpen(false)
            scrollRef.current?.focus()
          }}
        />
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- helpers */

function groupMatches(matches: readonly SearchMatch[]): Map<number, SearchMatch[]> {
  const map = new Map<number, SearchMatch[]>()
  for (const match of matches) {
    const list = map.get(match.line)
    if (list === undefined) map.set(match.line, [match])
    else list.push(match)
  }
  return map
}

function addColumn(map: Map<number, number[]>, line: number, col: number): void {
  const list = map.get(line)
  if (list === undefined) map.set(line, [col])
  else list.push(col)
}
