/**
 * Engine tests: pure token/fold/outline/layout behavior, runnable without a
 * browser. The test sources import the TypeScript engine directly; `build:tools`
 * compiles them to `.mjs` before Node runs them.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseFileAddress, fileNameOf } from '../src/reader/engine/address.ts'
import { analyzeText } from '../src/reader/engine/analysis.ts'
import { buildBracketIndex, bracketAt } from '../src/reader/engine/brackets.ts'
import { detectFolds, foldStarts, indentOf } from '../src/reader/engine/folds.ts'
import { buildLayout, rowsForLine, topOfLine, windowFor } from '../src/reader/engine/layout.ts'
import { splitLines, tokenize, visualWidth, wordAt, xOfColumn, columnOfX } from '../src/reader/engine/lexer.ts'
import { languageForPath, specById, REGISTERED_EXTENSIONS } from '../src/reader/engine/languages.ts'
import { extractOutline, symbolChain } from '../src/reader/engine/outline.ts'
import { findInText, findUsages } from '../src/reader/engine/search.ts'

type Tokens = ReturnType<typeof analyzeText>['tokens']

const analyze = (text: string, lang: string) => analyzeText(text, lang)

const kinds = (tokens: ReturnType<typeof tokenize>, line: number) => (tokens[line] ?? []).map((token) => `${token.kind}:${token.text}`)

const reconstruct = (lines: readonly string[], tokens: Tokens) => {
  for (let line = 0; line < lines.length; line++) {
    const joined = (tokens[line] ?? []).map((token) => token.text).join('')
    assert.equal(joined, lines[line], `line ${line} tokens must concatenate back`)
  }
}

test('address parsing handles session paths and rejects other schemes', () => {
  assert.deepEqual(parseFileAddress('dsh-resource://file/session/s1/src/main/App.kt'), {
    sessionId: 's1',
    path: 'src/main/App.kt',
  })
  assert.equal(parseFileAddress('dsh-resource://browser/x'), null)
  assert.equal(fileNameOf('/a/b/App.kt'), 'App.kt')
})

test('extension routing shares the host table and keeps specialised viewers out', () => {
  assert.equal(languageForPath('src/App.kt'), 'kotlin')
  assert.equal(languageForPath('Main.JAVA'), 'java')
  assert.ok(REGISTERED_EXTENSIONS.includes('kt'))
  assert.ok(!REGISTERED_EXTENSIONS.includes('md'))
  assert.ok(!REGISTERED_EXTENSIONS.includes('svg'))
  assert.ok(!REGISTERED_EXTENSIONS.includes('csv'))
})

test('Kotlin tokens cover the line, with keywords, types and comments', () => {
  const text = [
    'package com.example',
    '',
    '@Composable',
    'fun main(args: Array<String>) {',
    '    val name = "world" // greet',
    '    println(name)',
    '}',
  ].join('\n')
  const spec = specById('kotlin')
  const lines = splitLines(text)
  const tokens = tokenize(text, spec)
  reconstruct(lines, tokens)
  const flat = tokens.flat()
  assert.ok(flat.some((token) => token.kind === 'keyword' && token.text === 'fun'))
  assert.ok(flat.some((token) => token.kind === 'annotation' && token.text === '@Composable'))
  assert.ok(flat.some((token) => token.kind === 'string' && token.text === '"world"'))
  assert.ok(flat.some((token) => token.kind === 'comment' && token.text === '// greet'))
  assert.ok(flat.some((token) => token.kind === 'type' && token.text === 'Array'))
  assert.ok(flat.some((token) => token.kind === 'function' && token.text === 'main'))
})

test('multi-line block comments stay one comment across lines', () => {
  const text = '/* hello\n * world\n */\nval x = 1'
  const tokens = tokenize(text, specById('kotlin'))
  assert.deepEqual(tokens[0].map((token) => token.kind), ['comment'])
  assert.deepEqual(tokens[2].map((token) => token.kind), ['comment'])
  assert.equal(tokens[2][0].text, ' */')
  assert.ok(tokens[3].some((token) => token.text === 'val' && token.kind === 'keyword'))
})

test('Python triple-quoted strings and decorators tokenize', () => {
  const text = '@staticmethod\ndef f():\n    """doc\n    more\n    """\n    return 1'
  const tokens = tokenize(text, specById('python'))
  reconstruct(splitLines(text), tokens)
  assert.equal(tokens[0][0].kind, 'annotation')
  assert.equal(tokens[0][0].text, '@staticmethod')
  assert.equal(tokens[1].find((token) => token.text === 'def')?.kind, 'keyword')
  assert.equal(tokens[1].find((token) => token.text === 'f')?.kind, 'function')
  assert.equal(tokens[2].find((token) => token.text.startsWith('"""'))?.kind, 'string')
})

test('JSON strings before colons become keys', () => {
  const tokens = tokenize('{"ok": true, "list": [1, 2.5, null]}', specById('json'))
  const keys = tokens.flat().filter((token) => token.kind === 'key').map((token) => token.text)
  assert.deepEqual(keys, ['"ok"', '"list"'])
  assert.ok(tokens.flat().some((token) => token.kind === 'constant' && token.text === 'true'))
})

test('YAML keys, comments and anchors are distinguished', () => {
  const text = 'name: "demo" # trailing\nlist:\n  - &anchor value\n  - *anchor'
  const tokens = tokenize(text, specById('yaml'))
  reconstruct(splitLines(text), tokens)
  assert.equal(tokens[0][0].kind, 'key')
  assert.equal(tokens[0][0].text, 'name')
  assert.ok(tokens[0].some((token) => token.kind === 'comment'))
  assert.ok(tokens.flat().some((token) => token.kind === 'variable' && token.text === '&anchor'))
  assert.ok(tokens.flat().some((token) => token.kind === 'variable' && token.text === '*anchor'))
})

test('markup tags, attributes and comments tokenize', () => {
  const text = '<LinearLayout android:id="@+id/root">\n  <!-- note -->\n  <TextView text="hi" />\n</LinearLayout>'
  const tokens = tokenize(text, specById('xml'))
  reconstruct(splitLines(text), tokens)
  assert.ok(tokens[0].some((token) => token.kind === 'tag' && token.text === '<LinearLayout'))
  assert.ok(tokens[0].some((token) => token.kind === 'attr' && token.text === 'android:id'))
  assert.equal(tokens[1].find((token) => token.kind === 'comment')?.text, '<!-- note -->')
})

test('diff lines carry inserted/deleted kinds', () => {
  const tokens = tokenize('@@ -1 +1 @@\n-old\n+new\n same', specById('diff'))
  assert.equal(tokens[0][0].kind, 'meta')
  assert.equal(tokens[1][0].kind, 'deleted')
  assert.equal(tokens[2][0].kind, 'inserted')
  assert.equal(tokens[3][0].kind, 'plain')
})

test('bracket index pairs braces and records brace depth', () => {
  const text = 'class A {\n  fun f() {\n    if (x) { y() }\n  }\n}'
  const lines = splitLines(text)
  const tokens = tokenize(text, specById('kotlin'))
  const index = buildBracketIndex(tokens, lines.length)
  const firstOpen = tokens[0].find((token) => token.text === '{')
  assert.ok(firstOpen)
  const pair = bracketAt(index, 0, firstOpen.start)
  assert.equal(pair?.openLine, 0)
  assert.equal(pair?.closeLine, 4)
  assert.deepEqual(index.braceDepth, [0, 1, 2, 2, 1])
})

test('folds cover braces, imports, regions and indentation', () => {
  const kotlin = [
    'import a.b.C',
    'import a.b.D',
    'import a.b.E',
    '',
    '// region helpers',
    'class A {',
    '  fun f() {',
    '    println(1)',
    '  }',
    '}',
    '// endregion',
  ].join('\n')
  const analysis = analyze(kotlin, 'kotlin')
  const folds = analysis.folds
  assert.ok(folds.some((fold) => fold.kind === 'imports' && fold.start === 0 && fold.end === 2), 'import block folds')
  assert.ok(folds.some((fold) => fold.kind === 'block' && fold.start === 5 && fold.end === 9), 'class block folds')
  assert.ok(folds.some((fold) => fold.kind === 'region' && fold.start === 4 && fold.end === 10), 'region markers fold')
  const starts = foldStarts(folds)
  assert.ok(starts.get(5)?.end === 9)

  const python = 'class A:\n    def f(self):\n        pass\n    def g(self):\n        pass\n'
  const pyFolds = analyze(python, 'python').folds
  assert.ok(pyFolds.some((fold) => fold.kind === 'indent' && fold.start === 1 && fold.end === 2))
})

test('indentation helpers expand tabs', () => {
  assert.equal(indentOf('\tfoo'), 4)
  assert.equal(indentOf('  \tfoo'), 4)
  assert.equal(indentOf('        foo'), 8)
})

test('outline finds classes, methods and fields with parents', () => {
  const text = [
    'package com.example',
    '',
    'class Repository(private val api: Api) {',
    '    private val cache = mutableMapOf<String, Int>()',
    '',
    '    fun load(id: String): Int {',
    '        return cache[id] ?: 0',
    '    }',
    '}',
  ].join('\n')
  const analysis = analyze(text, 'kotlin')
  const names = analysis.outline.map((symbol) => `${symbol.kind}:${symbol.name}@${symbol.line}`)
  assert.ok(names.includes('class:Repository@2'), names.join(', '))
  assert.ok(names.includes('method:load@5'), names.join(', '))
  const load = analysis.outline.find((symbol) => symbol.name === 'load')
  assert.ok(load && load.parent >= 0, 'method belongs to the class')
  assert.equal(load?.endLine, 7)
  const chain = symbolChain(analysis.outline, 6)
  assert.deepEqual(chain.map((symbol) => symbol.name), ['Repository', 'load'])
})

test('expression bodies and fields end at their siblings, not at EOF', () => {
  const text = [
    'class A {',
    '    val x = 1',
    '    fun f() = 2',
    '    val y = 3',
    '}',
  ].join('\n')
  const analysis = analyze(text, 'kotlin')
  const byName = new Map(analysis.outline.map((symbol) => [symbol.name, symbol]))
  assert.equal(byName.get('x')?.endLine, 1)
  assert.equal(byName.get('f')?.endLine, 2)
  assert.equal(byName.get('y')?.endLine, 3)
  const chain = symbolChain(analysis.outline, 3)
  assert.deepEqual(chain.map((symbol) => symbol.name), ['A', 'y'])
  assert.deepEqual(symbolChain(analysis.outline, 4).map((symbol) => symbol.name), ['A'])
})

test('Python outline uses indentation parents and module bindings', () => {
  const text = 'NAME = "x"\n\nclass A:\n    def f(self):\n        return 1\n'
  const analysis = analyze(text, 'python')
  const names = analysis.outline.map((symbol) => symbol.name)
  assert.ok(names.includes('NAME'))
  assert.ok(names.includes('A'))
  assert.ok(names.includes('f'))
  const chain = symbolChain(analysis.outline, 4)
  assert.deepEqual(chain.map((symbol) => symbol.name), ['A', 'f'])
})

test('search reports line/column matches, case and regex options', () => {
  const text = 'const name = "demo"\n// demo demo\nconst other = name\n'
  const plain = findInText(text, 'demo')
  assert.equal(plain.matches.length, 3)
  assert.deepEqual(plain.matches[1], { line: 1, start: 3, end: 7 })
  const sensitive = findInText(text, 'Demo', { caseSensitive: true })
  assert.equal(sensitive.matches.length, 0)
  const whole = findInText(text, 'name', { wholeWord: true })
  assert.equal(whole.matches.length, 2)
  const regex = findInText(text, 'const\\s+\\w+', { regex: true })
  assert.equal(regex.matches.length, 2)
  const broken = findInText(text, '(', { regex: true })
  assert.ok(broken.error)
  assert.equal(findUsages(text, 'name').length, 2)
})

test('layout hides folded lines and maps them back to the fold start row', () => {
  const lines = ['a', 'b', 'c', 'd', 'e']
  const folds = [{ start: 1, end: 3, kind: 'block' as const }]
  const layout = buildLayout(lines, folds, new Set([1]), false, 80)
  assert.deepEqual(layout.rows.map((row) => row.line), [0, 1, 4])
  assert.equal(layout.hiddenByStart.get(1), 2)
  assert.equal(layout.rowOfLine[2], 1)
  assert.equal(topOfLine(layout, 4), 40)
  const window = windowFor(layout, 0, 20, 0)
  assert.deepEqual([window.start, window.end], [0, 1])
})

test('wrapped layout accounts for wide characters and tabs', () => {
  assert.equal(visualWidth('\tX'), 5)
  assert.equal(visualWidth('中文'), 4)
  assert.equal(rowsForLine('a'.repeat(10), 4), 3)
  const layout = buildLayout(['a'.repeat(10)], [], new Set(), true, 4)
  assert.equal(layout.total, 60)
})

test('column/x mapping round-trips with tabs and CJK', () => {
  const line = '\tfoo中文'
  const x = xOfColumn(line, 6)
  assert.equal(columnOfX(line, x), 6)
  assert.equal(wordAt('  const value = 1', 9), 'value')
  assert.equal(wordAt('  const value = 1', 2), 'const')
})

test('analysis degrades above the size cap instead of freezing', () => {
  const huge = 'x'.repeat(1_700_000)
  const analysis = analyze(huge, 'java')
  assert.equal(analysis.degraded, true)
  assert.equal(analysis.folds.length, 0)
  assert.equal(analysis.lines.length, 1)
})

test('analysis of a realistic Kotlin file stays self-consistent', () => {
  const text = [
    'package demo',
    '',
    'import kotlin.math.max',
    '',
    '/** Docs */',
    'data class Point(val x: Int, val y: Int) {',
    '    fun distance(other: Point): Int {',
    '        val dx = x - other.x',
    '        val dy = y - other.y',
    '        return max(dx * dx, dy * dy)',
    '    }',
    '}',
  ].join('\n')
  const analysis = analyze(text, 'kotlin')
  reconstruct(analysis.lines, analysis.tokens)
  assert.ok(analysis.folds.length >= 1)
  assert.ok(analysis.outline.some((symbol) => symbol.name === 'Point'))
  assert.ok(analysis.outline.some((symbol) => symbol.name === 'distance'))
  const pointFold = analysis.folds.find((fold) => fold.start === 5)
  assert.equal(pointFold?.end, 11)
})
